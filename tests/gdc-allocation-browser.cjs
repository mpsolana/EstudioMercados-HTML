const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
  await page.evaluate(()=>{
   switchSection('cartera');
   const records=[{isin:'ES0000000001',name:'Bonos EUR',category:'EUR Government Bond',manager:'Gestora RF',score:3.4,ter:.3},{isin:'ES0000000002',name:'Bolsa global',category:'Global Large-Cap Blend Equity',manager:'Gestora RV',score:3.8,ter:.4}];
   fundUniverseState={records,isinIndex:new Map(records.map(row=>[row.isin,row])),quartiles:buildFundQuartiles(records)};
   portfolioWorkflowRefresh();
   const book=XLSX.utils.book_new(),add=(name,rows)=>XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(rows),name);
   add('Carteras Modelo',[['Categoria','Subcategoria','Cartera estratégica Muy Conservador','Cartera estratégica Prudente','Cartera estratégica Equilibrado','Cartera estratégica Decidido','Cartera estratégica Muy Arriesgado'],['RF EUR','EUR Government Bond',92.5,77.5,60,37.5,12.5],['RV Global','Global Large-Cap Blend Equity',7.5,22.5,40,62.5,87.5],['Alternativos','Other',0,0,0,0,0]]);
   add('bench categ',[['ticker','name','asset class'],['BRF','Morningstar EUR Government','EUR Government Bond'],['BRV','Morningstar Global Equity','Global Large-Cap Blend Equity']]);
   const dates=Array.from({length:6},(_,i)=>new Date(Date.UTC(2025,i+1,0)));
   add('bench',[['date','BRF','BRV'],...dates.map((date,i)=>[date,100+i,100+i*2])]);
   add('prices',[['date','ES0000000001','ES0000000002'],...dates.map((date,i)=>[date,100+i*1.1,100+i*2.1])]);
   const file=new File([XLSX.write(book,{bookType:'xlsx',type:'array'})],'base-gdc.xlsx');
   const input=document.getElementById('fundPortfolioFileInput'),transfer=new DataTransfer();transfer.items.add(file);input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
  });
  await page.waitForFunction(()=>GdcModel.state.models.length===5);
  await page.locator('[data-workspace-scope="model"]').click();
  await page.locator('#gdcModels').selectOption('1');
  const initial=await page.evaluate(()=>({profile:GdcModel.state.models[1].profile,band:ModelPortfolioCore.allocation(GdcModel.state.models[1]).band,neutral:ModelPortfolioCore.allocation(GdcModel.state.models[1]).neutral,benchRv:ModelPortfolioCore.allocation(GdcModel.state.models[1]).benchmarkRv,indices:document.querySelector('#gdcBody').textContent}));
  assert.equal(initial.profile,'prudente');assert.deepEqual(initial.band,[15,30]);assert.equal(initial.neutral,22.5);assert.equal(initial.benchRv,22.5);assert.match(initial.indices,/Morningstar Global Equity/);
  await page.locator('[data-gdc-portfolio-weight="0"]').fill('75');await page.locator('[data-gdc-portfolio-weight="0"]').dispatchEvent('change');
  await page.locator('#gdcReport').click();assert.match(await page.locator('#gdcStatus').textContent(),/Normaliza los pesos/);
  await page.locator('[data-gdc-portfolio-weight="1"]').fill('25');await page.locator('[data-gdc-portfolio-weight="1"]').dispatchEvent('change');
  const weights=await page.evaluate(()=>({bench:GdcModel.state.models[1].rows.map(row=>row.weight),actual:GdcModel.state.models[1].rows.map(row=>row.portfolioWeight),rv:ModelPortfolioCore.allocation(GdcModel.state.models[1]).portfolioRv,chart:document.getElementById('gdcWeightChart').data?.map(trace=>trace.y),deviation:document.getElementById('gdcDeviationChart').data?.map(trace=>trace.y)}));
  assert.deepEqual(weights.bench,[77.5,22.5,0]);assert.deepEqual(weights.actual,[75,25,0]);assert.equal(weights.rv,25);
  assert.deepEqual(weights.chart,[[77.5,22.5],[75,25]]);assert.deepEqual(weights.deviation,[[null,2.5],[-2.5,null]]);
  assert.equal(await page.locator('#gdcProfileOverviewChart .main-svg').count()>0,true);
  assert.equal(await page.locator('#gdcCategoryOverviewChart .main-svg').count()>0,true);
  await page.evaluate(()=>{GdcModel.select(0,'ES0000000001');GdcModel.select(1,'ES0000000002');});
  await page.locator('#gdcHistoryRun').click();
  assert.equal(await page.locator('#gdcHistoryTable tbody tr').count(),2);
  assert.ok(await page.locator('#gdcHistoricalBaseChart .main-svg').count()>0);
  assert.match(await page.locator('#gdcHistoryStatus').textContent(),/2\/2 fondos comparables/);
  const historyExcel=page.waitForEvent('download');await page.locator('#gdcHistoryExcel').click();
  const historyBytes=fs.readFileSync(await(await historyExcel).path());
  const historySheets=await page.evaluate(base64=>XLSX.read(Uint8Array.from(atob(base64),char=>char.charCodeAt(0)),{type:'array'}).SheetNames,historyBytes.toString('base64'));
  assert.ok(historySheets.includes('Resumen')&&historySheets.includes('Fondo 1'));
  const historyPdf=page.waitForEvent('download',{timeout:120000});await page.locator('#gdcHistoryPdf').click();
  const historyPdfFile=await historyPdf;
  if(process.env.BROWSER_OUTPUT_DIR)await historyPdfFile.saveAs(path.join(process.env.BROWSER_OUTPUT_DIR,'gdc-history-report.pdf'));
  await page.locator('#gdcReport').click();
  await page.waitForFunction(()=>document.querySelector('#gdcReportPreview iframe')?.contentDocument?.querySelector('.gdc-allocation-pie img'));
  const report=await page.evaluate(()=>document.querySelector('#gdcReportPreview iframe').contentDocument.body.textContent);
  assert.match(report,/15–30%/);assert.match(report,/22\.50%/);assert.match(report,/25\.00%/);
  const out=process.env.BROWSER_OUTPUT_DIR;if(out){fs.mkdirSync(out,{recursive:true});await page.evaluate(()=>{const iframe=document.querySelector('#gdcReportPreview iframe');iframe.style.height=`${iframe.contentDocument.body.scrollHeight+40}px`;});await page.locator('#gdcReportPreview iframe').screenshot({path:path.join(out,'gdc-report-preview.png')});}
  const download=page.waitForEvent('download');await page.locator('#gdcExport').click();const file=await download,buffer=fs.readFileSync(await file.path());
  const workbook=await page.evaluate(base64=>{const bytes=Uint8Array.from(atob(base64),char=>char.charCodeAt(0)),book=XLSX.read(bytes,{type:'array'});return {names:book.SheetNames,summary:XLSX.utils.sheet_to_json(book.Sheets.Resumen,{header:1}),allocation:XLSX.utils.sheet_to_json(book.Sheets.Asignacion,{header:1})};},buffer.toString('base64'));
  assert.equal(workbook.names.filter(name=>name.startsWith('Cartera estratégica')).length,5);
  assert.equal(workbook.names.length>=10,true);
  assert.ok(workbook.names.includes('Resumen')&&workbook.names.includes('GDC Estado')&&workbook.names.includes('Asignacion'));
  assert.ok(workbook.summary.some(row=>row[0]==='Cartera estratégica Prudente'&&row[4]===25));
  assert.ok(workbook.summary.some(row=>row[0]==='Cartera estratégica Prudente'&&String(row[9]||'').includes('█')));
  assert.ok(workbook.allocation.some(row=>row[0]==='Cartera estratégica Prudente'&&row[1]==='RV Global'&&row[3]===25));
  await page.evaluate(()=>{GdcModel.state.models=[];GdcModel.state.selected=0;GdcModel.render();});
  await page.locator('#gdcPriorFile').setInputFiles({name:'comite.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer});
  await page.waitForFunction(()=>GdcModel.state.models[1]?.rows[1]?.portfolioWeight===25);
  assert.equal(await page.evaluate(()=>GdcModel.state.models[1].rows[1].currentPositions[0]?.isin),'ES0000000002');
  await page.locator('#gdcModels').selectOption('1');
  if(out){await page.screenshot({path:path.join(out,'gdc-allocation.png'),fullPage:true});await page.setViewportSize({width:390,height:844});await page.waitForTimeout(400);const width=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}));assert.ok(width.document<=width.viewport+2,JSON.stringify(width));await page.screenshot({path:path.join(out,'gdc-allocation-mobile.png'),fullPage:true});}
  assert.deepEqual(errors,[]);console.log(JSON.stringify({profiles:5,rv:weights.rv,sheets:workbook.names.length,errors}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
