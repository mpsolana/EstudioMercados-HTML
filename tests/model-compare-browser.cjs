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
   window.fetchYahooData=async ticker=>series(ticker==='AAA'?100:80);
   document.querySelector('[data-multi-ticker="0"]').value='AAA';document.querySelector('[data-multi-ticker="1"]').value='BBB';
   document.getElementById('multiAssetLoad').click();
   switchSection('cartera');
   const records=[{isin:'ES0000000001',name:'Fondo RF A',category:'RF Europa',manager:'GDC',score:3.5,ter:.6,ret5:5,risk5:4},{isin:'ES0000000002',name:'Fondo RF B',category:'RF Europa',manager:'GDC',score:3,ter:.8,ret5:4,risk5:5}];
   fundUniverseState={records,isinIndex:new Map(records.map(r=>[r.isin,r])),quartiles:buildFundQuartiles(records)};
   const book=XLSX.utils.book_new(),add=(name,rows)=>XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(rows),name);
   add('Cartera scoring',[['ISIN','peso'],['ES0000000001',100]]);
   add('Carteras Modelo',[['Categoria','Subcategoria','Conservadora'],['Renta fija','RF Europa',100]]);
   add('bench categ',[['ticker','name','asset class'],['BE','Indice RF Europa','RF Europa']]);
   add('bench',[['date','BE'],...dates.map((date,i)=>[date,100+i*.5])]);
   add('prices',[['date','ES0000000001'],...dates.map((date,i)=>[date,100+i])]);
   const file=new File([XLSX.write(book,{bookType:'xlsx',type:'array'})],'modelo-prueba.xlsx',{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
   await importFundScoringPortfolioFile(file);
   const loaded=GdcModel.state.models.length===1&&fundPortfolioRows.length===1;
   GdcModel.select(0,'ES0000000001');
   PortfolioWorkspace.scope='model';portfolioWorkflowRefresh();
   return {loaded,models:GdcModel.state.models.length,te:GdcModel.state.models[0].rows[0].selectedIsin,scope:PortfolioWorkspace.scope,scoreHtml:document.querySelector('#gdcBody').innerHTML,aggregateScoreHtml:quartileValueHtml(3.5,records[0],'score',false)};
  });
  await page.waitForFunction(()=>document.querySelector('#multiAssetTableBody tr')?.cells.length===8);
  assert.equal(setup.loaded,true);assert.equal(setup.models,1);assert.equal(setup.te,'ES0000000001');assert.equal(setup.scope,'model');
  assert.match(setup.scoreHtml,/quality-technical/);
  assert.match(setup.aggregateScoreHtml,/flex-col items-center/);
  const results=await page.evaluate(async()=>{
   await GdcModel.history(0);
   const limit=document.getElementById('gdcMaxTe');limit.value='0.01';limit.dispatchEvent(new Event('change',{bubbles:true}));
   document.getElementById('gdcComparable').click();const breach=document.getElementById('gdcStatus').classList.contains('gdc-te-breach');
   limit.value='1';limit.dispatchEvent(new Event('change',{bubbles:true}));const within=document.getElementById('gdcStatus').classList.contains('gdc-te-ok');
   document.getElementById('gdcReport').click();
   await new Promise(resolve=>setTimeout(resolve,2500));
   return {comparison:document.querySelector('#multiAssetTableBody').rows.length,comparisonCharts:['multiAssetBaseChart','multiAssetDrawdownChart','multiAssetScatterChart'].every(id=>document.querySelector(`#${id} .main-svg`)),te:document.querySelector('#gdcStatus').textContent,report:document.querySelector('#gdcReportPreview iframe')?.contentDocument?.body?.textContent||'',history:document.querySelector('#gdcHistory .main-svg')!==null,historyText:document.querySelector('#gdcHistory').textContent,priceKeys:Object.keys(GdcModel.state.prices),benchKeys:Object.keys(GdcModel.state.benchmarks),selected:GdcModel.state.models[0].rows[0],breach,within};
  });
  assert.equal(results.comparison,2);assert.equal(results.comparisonCharts,true);assert.match(results.te,/Tracking error/);assert.match(results.report,/Posiciones actuales y propuesta/);assert.match(results.report,/Metricas actuales frente a propuestas/);assert.match(results.report,/Reduccion de TER pendiente/);assert.equal(results.breach,true);assert.equal(results.within,true);assert.equal(results.history,true,JSON.stringify({text:results.historyText,priceKeys:results.priceKeys,benchKeys:results.benchKeys,selected:results.selected}));assert.deepEqual(errors,[]);
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
   const widths=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,weight:document.querySelector('#gdcWeightChart').getBoundingClientRect().width,table:document.querySelector('#workspaceModel .proposal-chart-scroll').getBoundingClientRect().width,charts:document.querySelector('.gdc-analysis-charts').getBoundingClientRect().width}));
   assert.ok(widths.document<=widths.viewport+2,JSON.stringify(widths));await page.screenshot({path:path.join(out,'gdc-model-mobile.png'),fullPage:true});
  }
  console.log(JSON.stringify({models:setup.models,comparison:results.comparison,history:results.history,errors}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
