const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{pathToFileURL}=require('node:url');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.dismiss());
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
  const setup=await page.evaluate(async()=>{
   switchSection('individual');document.querySelector('[data-individual-mode="compare"]').click();
   const dates=Array.from({length:15},(_,i)=>new Date(Date.UTC(2025,0+i+1,0))),series=base=>dates.map((date,i)=>({date,price:base+i*(base/100)}));
   window.fetchYahooData=async ticker=>ticker==='BENCH'?dates.map((date,i)=>({date,price:100+i*2+(i%3)*.5})):series(ticker==='AAA'?100:80);
   document.querySelector('[data-multi-ticker="0"]').value='AAA';document.querySelector('[data-multi-ticker="1"]').value='BBB';
   document.getElementById('multiAssetLoad').click();
   switchSection('cartera');
   const records=[{isin:'ES0000000001',name:'Fondo RF A',category:'RF Europa',manager:'GDC',score:4,ter:.6,ret5:5,risk5:4},{isin:'ES0000000002',name:'Fondo RF B',category:'RF Europa',manager:'GDC',score:3,ter:.8,ret5:4,risk5:5},{isin:'ES0000000003',name:'Fondo RF C',category:'RF Europa',manager:'Otra gestora',score:2.8,ter:.9,ret5:3,risk5:6}];
   fundUniverseState={records,isinIndex:new Map(records.map(r=>[r.isin,r])),quartiles:buildFundQuartiles(records)};
   const book=XLSX.utils.book_new(),add=(name,rows)=>XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(rows),name);
   add('Cartera scoring',[['ISIN','peso'],['ES0000000001',100]]);
   add('Carteras Modelo',[['Categoria','Subcategoria','Conservadora'],['Renta fija','RF Europa',100]]);
   add('bench categ',[['ticker','name','asset class'],['BE','Indice RF Europa','RF Europa']]);
   add('bench',[['date','BE'],...dates.map((date,i)=>[date,100+i*.5])]);
   add('prices',[['date','ES0000000001'],...dates.map((date,i)=>[date,100+i])]);
   const file=new File([XLSX.write(book,{bookType:'xlsx',type:'array'})],'modelo-prueba.xlsx',{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
   await importFundScoringPortfolioFile(file);
   const isolated=GdcModel.state.models.length===0;
   GdcModel.loadWorkbook(book,file.name);
   const loaded=GdcModel.state.models.length===1&&fundPortfolioRows.length===1;
   GdcModel.select(0,'ES0000000001');
   PortfolioWorkspace.scope='model';portfolioWorkflowRefresh();
   return {loaded,isolated,models:GdcModel.state.models.length,te:GdcModel.state.models[0].rows[0].proposedPositions[0].isin,scope:PortfolioWorkspace.scope,scoreHtml:document.querySelector('#gdcBody').innerHTML,aggregateScoreHtml:quartileValueHtml(3.5,records[0],'score',false)};
  });
  await page.waitForFunction(()=>document.querySelector('#multiAssetTableBody tr')?.cells.length===11);
  await page.evaluate(()=>{switchSection('individual');document.querySelector('[data-multi-ticker="1"]').value='';document.getElementById('multiAssetLoad').click();});
  await page.waitForFunction(()=>document.querySelectorAll('#multiAssetTableBody tr').length===1);
  await page.evaluate(()=>{
   document.querySelector('[data-multi-ticker="1"]').value='BBB';
   for(let index=2;index<10;index++){document.getElementById('multiAssetAdd').click();document.querySelector(`[data-multi-ticker="${index}"]`).value=`T${index}`;}
   document.getElementById('multiAssetLoad').click();
  });
  await page.waitForFunction(()=>document.querySelectorAll('#multiAssetTableBody tr').length===10);
  assert.equal(await page.locator('#multiAssetBaseChart .scatterlayer .trace').count(),10);
  await page.evaluate(()=>{
   document.querySelector('#multiAssetRiskFree').value='2.5';document.querySelector('#multiAssetRiskFree').dispatchEvent(new Event('input',{bubbles:true}));
   document.querySelector('#multiAssetBenchmark').value='CUSTOM';document.querySelector('#multiAssetBenchmark').dispatchEvent(new Event('change',{bubbles:true}));
   document.querySelector('#multiAssetBenchmarkCustom').value='BENCH';document.querySelector('#multiAssetLoad').click();
  });
  await page.waitForFunction(()=>document.querySelector('#multiAssetStatus').textContent.includes('Benchmark: BENCH'));
  assert.match(await page.locator('#multiAssetSharpeHead').textContent(),/2\.50%/);
  assert.equal(await page.locator('#multiAssetHorizonBody tr').count(),11);
  assert.equal(await page.locator('#multiAssetBaseChart .scatterlayer .trace').count(),11);
  assert.notEqual(await page.locator('#multiAssetTableBody tr').first().locator('td').nth(8).textContent(),'-');
  assert.notEqual(await page.locator('#multiAssetTableBody tr').first().locator('td').nth(9).textContent(),'-');
  await page.evaluate(()=>switchSection('cartera'));
  assert.equal(setup.loaded,true);assert.equal(setup.isolated,true);assert.equal(setup.models,1);assert.equal(setup.te,'ES0000000001');assert.equal(setup.scope,'model');
  assert.match(setup.scoreHtml,/quality-technical/);
  assert.match(setup.aggregateScoreHtml,/flex-col items-center/);
  const results=await page.evaluate(async()=>{
   const limit=document.getElementById('gdcMaxTe');limit.value='0.01';limit.dispatchEvent(new Event('change',{bubbles:true}));
   document.getElementById('gdcComparable').click();const breach=document.getElementById('gdcStatus').classList.contains('gdc-te-breach');
   limit.value='1';limit.dispatchEvent(new Event('change',{bubbles:true}));const within=document.getElementById('gdcStatus').classList.contains('gdc-te-ok');
   const current=document.querySelector('[data-gdc-current="0"]');current.value='ES0000000001';current.dispatchEvent(new Event('change',{bubbles:true}));
   document.querySelector('[data-gdc-add="0"]').click();
   const shares=GdcModel.state.models[0].rows[0].proposedPositions.map(item=>item.share);
   const universe=document.querySelector('[data-gdc-universe="0:1"]');universe.dispatchEvent(new Event('focusin',{bubbles:true}));
   const universeCount=universe.options.length,topCount=document.querySelector('[data-gdc-select="0:1"]').options.length;
   const weight=document.querySelector('[data-gdc-weight="0:0"]');weight.value='70';weight.dispatchEvent(new Event('change',{bubbles:true}));
   document.getElementById('gdcReport').click();
   return {comparison:document.querySelector('#multiAssetTableBody').rows.length,comparisonCharts:['multiAssetBaseChart','multiAssetDrawdownChart','multiAssetScatterChart'].every(id=>document.querySelector(`#${id} .main-svg`)),te:document.querySelector('#gdcStatus').textContent,shares,universeCount,topCount,adjusted:GdcModel.state.models[0].rows[0].proposedPositions.map(item=>item.share),breach,within};
  });
  await page.waitForFunction(()=>document.querySelector('#gdcReportPreview iframe')?.contentDocument?.body?.textContent?.includes('Media peers'));
  const firstReport=await page.evaluate(()=>({text:document.querySelector('#gdcReportPreview iframe').contentDocument.body.textContent,charts:document.querySelector('#gdcReportPreview iframe').contentDocument.querySelectorAll('.gdc-peer-report img').length}));
  assert.equal(results.comparison,10);assert.equal(results.comparisonCharts,true);assert.match(results.te,/Calidad ponderada 3\.70/);assert.match(results.te,/TER ponderado 0\.66%/);assert.deepEqual(results.shares,[50,50]);assert.equal(results.universeCount,4);assert.equal(results.topCount,4);assert.deepEqual(results.adjusted,[70,30]);assert.equal(firstReport.charts,2);assert.match(firstReport.text,/Posiciones actuales y propuesta/);assert.match(firstReport.text,/Metricas actuales frente a propuestas/);assert.match(firstReport.text,/Media peers/);assert.equal(results.breach,true);assert.equal(results.within,true);
  await page.evaluate(()=>{const other=structuredClone(GdcModel.state.models[0]);other.name='Dinamica';other.rows[0].proposedPositions=[{isin:'ES0000000003',share:100}];GdcModel.state.models.push(other);});
  const priorDownload=page.waitForEvent('download');await page.locator('#gdcExport').click();const monthly=await priorDownload;
  await page.locator('#gdcPriorFile').setInputFiles({name:'mes-anterior.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:fs.readFileSync(await monthly.path())});
  await page.waitForFunction(()=>GdcModel.state.models[0].rows[0].currentPositions.length===2);
  assert.deepEqual(await page.evaluate(()=>GdcModel.state.models[0].rows[0].currentPositions.map(item=>item.share)),[70,30]);
  assert.deepEqual(await page.evaluate(()=>GdcModel.state.models[1].rows[0].currentPositions.map(item=>item.isin)),['ES0000000003']);
  await page.locator('[data-gdc-current="0"]').fill('ES0000000001');await page.locator('[data-gdc-current="0"]').dispatchEvent('change');
  await page.locator('[data-gdc-keep="0"]').check();
  await page.locator('#gdcReport').click();
  await page.waitForFunction(()=>document.querySelector('#gdcReportPreview iframe')?.contentDocument?.body?.textContent?.includes('Sin cambio'));
  const unchanged=await page.evaluate(()=>({positions:GdcModel.state.models[0].rows[0].proposedPositions,charts:document.querySelector('#gdcReportPreview iframe').contentDocument.querySelectorAll('.gdc-peer-report img').length,ret:document.querySelector('#gdcReportPreview iframe').contentDocument.body.textContent.includes('Ret 5A: 2/2 peers con dato')}));
  assert.equal(unchanged.positions.length,1);assert.equal(unchanged.charts,1);assert.equal(unchanged.ret,true);assert.deepEqual(errors,[]);
  const out=process.env.BROWSER_OUTPUT_DIR;if(out){
   fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,'gdc-model.png'),fullPage:true});
   await page.evaluate(()=>switchSection('individual'));
   assert.equal(await page.locator('[data-individual-mode="compare"]').getAttribute('aria-pressed'),'true');
   await page.waitForTimeout(350);
   await page.screenshot({path:path.join(out,'multi-compare.png'),fullPage:true});
   await page.evaluate(()=>switchSection('cartera'));
   const excel=page.waitForEvent('download');await page.locator('#gdcExport').click();await(await excel).saveAs(path.join(out,'gdc-selection.xlsx'));
   const pdf=page.waitForEvent('download',{timeout:120000});await page.locator('#gdcPdf').click();await(await pdf).saveAs(path.join(out,'gdc-report.pdf'));
   await page.setViewportSize({width:390,height:844});await page.waitForTimeout(700);
   const widths=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,weight:document.querySelector('#gdcWeightChart').getBoundingClientRect().width,table:document.querySelector('#workspaceModel .proposal-chart-scroll').getBoundingClientRect().width}));
   assert.ok(widths.document<=widths.viewport+2,JSON.stringify(widths));await page.screenshot({path:path.join(out,'gdc-model-mobile.png'),fullPage:true});
   await page.evaluate(()=>switchSection('individual'));await page.waitForTimeout(350);
   const compareWidth=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,table:document.querySelector('#multiAssetTableBody').closest('.proposal-chart-scroll').scrollWidth}));
   assert.ok(compareWidth.document<=compareWidth.viewport+2,JSON.stringify(compareWidth));
   await page.screenshot({path:path.join(out,'multi-compare-mobile.png'),fullPage:true});
  }
  console.log(JSON.stringify({models:setup.models,comparison:results.comparison,proposalCharts:firstReport.charts,errors}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
