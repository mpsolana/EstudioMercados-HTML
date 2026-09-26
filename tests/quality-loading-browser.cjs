const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
(async()=>{
 const out=process.env.BROWSER_OUTPUT_DIR;fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],dialogs=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{dialogs.push(d.message());d.dismiss();});
  await page.route('https://**/*',route=>/tailwindcss|plotly|mathjs|xlsx|pdfmake|font-awesome/.test(route.request().url())?route.continue():route.abort());
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
  const loading=await page.evaluate(async()=>{
   switchSection('cartera');
   const n=6000,tickers=Array.from({length:8},(_,i)=>'A'+i),benchmarks=Array.from({length:16},(_,i)=>'B'+i),book=XLSX.utils.book_new();
   XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['ticker','weight'],...tickers.map(t=>[t,1/8])]),'weights');
   const sheet=keys=>XLSX.utils.aoa_to_sheet([['date',...keys],...Array.from({length:n},(_,i)=>[new Date(Date.UTC(2000,0,i+1)),...keys.map((_,j)=>100*Math.exp(i*.00005+Math.sin(i*.04+j)*.1))])]);
   XLSX.utils.book_append_sheet(book,sheet(tickers),'prices');XLSX.utils.book_append_sheet(book,sheet(benchmarks),'bench');
   const file=new File([XLSX.write(book,{type:'array',bookType:'xlsx'})],'historicos-largos.xlsx'),dt=new DataTransfer();dt.items.add(file);document.getElementById('portfolioExcelInput').files=dt.files;document.getElementById('portfolioPricesInBase').checked=true;
   const phases=[],old=PortfolioLoading.phase;PortfolioLoading.phase=async(p,label)=>{phases.push(p);await old(p,label);};let ticks=0;const timer=setInterval(()=>ticks++,50),start=performance.now();
   try{await importPortfolioExcel();}finally{clearInterval(timer);PortfolioLoading.phase=old;}
   return {ms:performance.now()-start,bytes:file.size,ticks,phases,progress:document.querySelector('dialog progress')?.value,ready:loadedPortfolio.analysisReady,points:loadedPortfolio.portfolioData.length,bench:Object.keys(loadedPortfolio.benchmarks).length,busy:PortfolioLoading.active,modal:!!document.querySelector('dialog[open]')};
  });
  assert.equal(loading.points,6000);assert.equal(loading.bench,16);assert.equal(loading.ready,true);assert.equal(loading.busy,false);assert.equal(loading.modal,false);assert.ok(loading.ticks>5);assert.equal(loading.progress,100);assert.ok(loading.phases.includes(85));assert.ok(loading.ms<120000);
  await page.evaluate(()=>{PortfolioWorkspace.scope='initial';PortfolioWorkspace.step='report';portfolioWorkflowRefresh();const records=[{isin:'ES0000000001',name:'Origen de prueba',category:'Bonos',score:3.9999,ter:1.2,ret5:3,risk5:4},{isin:'ES0000000002',name:'PROPUESTA EXCLUIDA',category:'Bonos',score:4,ter:.5,ret5:4,risk5:5},{isin:'ES0000000003',name:'Peer de prueba',category:'Bonos',score:2.7,ter:.7,ret5:3.5,risk5:3}];fundUniverseState={records,isinIndex:new Map(records.map(r=>[r.isin,r])),quartiles:buildFundQuartiles(records)};document.getElementById('fundWeightUnit').value='percent';document.getElementById('fundProposalPortfolioInput').value='ES0000000001;100%';analyzeFundProposalPortfolio();fundProposalState.rows[0].proposed=records[1];});
  await page.locator('#reportCompareProposal').uncheck();for(const box of await page.locator('[data-report-block]').all())await box.uncheck();for(const key of ['positions','details','pairs'])await page.locator(`[data-report-block="${key}"]`).check();
  const traces=await page.evaluate(async()=>{const old=FinancialVisuals.newPlot,captured=[];FinancialVisuals.newPlot=(target,data,...rest)=>{captured.push(...data);return old(target,data,...rest);};try{await generateFundProposalReport();}finally{FinancialVisuals.newPlot=old;}return captured.map(t=>({name:t.name,role:t.meta?.financialRole}));});
  const report=await page.evaluate(()=>fundProposalState.reportHtml);assert.ok(report.includes('★★★★☆'));assert.ok(report.includes('quality-methodology'));assert.ok(!report.includes('PROPUESTA EXCLUIDA'));assert.ok(!traces.some(t=>t.role==='proposal'));assert.ok(traces.some(t=>t.role==='origin'));assert.ok(traces.some(t=>t.name.startsWith('Media')));
  assert.equal(await page.evaluate(()=>{const doc=new DOMParser().parseFromString(fundProposalState.reportHtml,'text/html'),table=[...doc.querySelectorAll('table')].find(t=>t.rows[0].textContent.includes('Datos disponibles'));return table.rows[1].cells[3].textContent;}),'3');
  assert.equal(await page.evaluate(async()=>{try{await PortfolioLoading.run(()=>{throw new Error('test');});}catch{}return !PortfolioLoading.active&&!document.querySelector('dialog[open]');}),true);
  const download=page.waitForEvent('download');await page.evaluate(()=>ReportDesign.downloadPdf(fundProposalState.reportHtml,'Calidad.pdf'));await(await download).saveAs(path.join(out,'calidad-origen.pdf'));
  await page.locator('#workspaceInitialReports').screenshot({path:path.join(out,'control-informe.png')});
  assert.deepEqual(errors,[]);assert.deepEqual(dialogs,[]);console.log(JSON.stringify({loading,quality:true,originOnly:true,errors},null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
