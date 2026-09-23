const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
(async()=>{
 const out=process.env.BROWSER_OUTPUT_DIR;fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.dismiss());
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
  await page.evaluate(()=>{
   switchSection('cartera');PortfolioWorkspace.scope='initial';PortfolioWorkspace.step='proposal';portfolioWorkflowRefresh();
   const records=Array.from({length:6},(_,i)=>({isin:'ES'+String(i+1).padStart(10,'0'),name:['Global Equity A','Global Equity I','Euro Bond A','Euro Bond I','Flexible Credit A','Flexible Credit I'][i],fundId:'F'+Math.floor(i/2),manager:['Gestora A','Gestora A','Gestora B','Gestora B','Gestora C','Gestora C'][i],currency:'EUR',hedging:'No',category:i<2?'RV global':'RF euro',ter:i%2?.4:1.3,score:i%2?4.1:3.2,ret5:6,risk5:9}));
   fundUniverseState={records,isinIndex:new Map(records.map(r=>[r.isin,r]))};
   fundProposalState.rows=[0,2,4].map((i,j)=>({isin:records[i].isin,weight:[50,30,20][j],current:records[i],proposed:records[i+1],recommendations:[],cheaperClasses:[]}));fundProposalState.rows[2].proposed={...records[5],category:'Monetario',ter:1.6};
   document.getElementById('fundProposalCapital').value='200000';ProposalCharts.render('initial');
  });
  await page.waitForFunction(()=>document.getElementById('proposal-initial-concentration').data?.length===4);
  assert.equal(await page.evaluate(()=>document.getElementById('proposal-initial-waterfall').data[0].y.reduce((a,b)=>a+b,0)),1320);
  assert.equal(await page.evaluate(()=>document.getElementById('proposal-initial-pairs').data.filter(t=>t.xaxis==='x2'&&t.name==='Origen')[0].x[2]),null);
  for(const kind of ['waterfall','pairs','concentration'])await page.locator('#proposal-initial-'+kind).screenshot({path:path.join(out,kind+'.png')});
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.locator('#proposal-initial-waterfall').locator('..').screenshot({path:path.join(out,'mobile.png')});
  await page.setViewportSize({width:1440,height:1000});await page.locator('[data-workspace-step="report"]').click();
  for(const box of await page.locator('[data-report-block]').all())await box.uncheck();
  for(const key of ['waterfall','comparison','concentration'])await page.locator(`[data-report-block="${key}"]`).check();
  await page.evaluate(()=>generateFundProposalReport());
  let download=page.waitForEvent('download');await page.evaluate(()=>ReportDesign.downloadPdf(fundProposalState.reportHtml,'Nuevos-graficos.pdf'));await(await download).saveAs(path.join(out,'inicial.pdf'));
  for(const key of ['waterfall','comparison','concentration'])await page.locator(`[data-report-block="${key}"]`).uncheck();
  const calls=await page.evaluate(async()=>{const old=ProposalCharts.report;let count=0;ProposalCharts.report=async(...args)=>{count++;return old(...args);};try{await generateFundProposalReport();return count;}finally{ProposalCharts.report=old;}});assert.equal(calls,0);
  await page.locator('[data-workspace-scope="aggregate"]').click();await page.locator('[data-workspace-step="diagnosis"]').click();await page.locator('[data-workspace-tool="aggregate"]').click();
  await page.evaluate(()=>{
   aggregateScoringResults=[0,2,4].map((i,j)=>({included:true,position:{isin:fundUniverseState.records[i].isin,amount:[500000,2000000,3500000][j],weight:[10,30,60][j],rows:10,amountCount:10,accountCount:10,clientCount:[3,7,10][j]},universeMatch:{record:fundUniverseState.records[i]},currentRecord:fundUniverseState.records[i+1]}));aggregatePositionsState.hasAmounts=true;ProposalCharts.render('aggregate');
  });
  await page.waitForFunction(()=>document.getElementById('proposal-aggregate-opportunities').data?.[0]?.x.length===3);
  await page.locator('#proposal-aggregate-opportunities').screenshot({path:path.join(out,'opportunities.png')});
  const missed=await page.evaluate(()=>{aggregateScoringResults[0].position.accountCount=0;return ProposalCharts.model('opportunities','aggregate').sizedByClients;});assert.equal(missed,false);
  await page.locator('[data-workspace-step="report"]').click();assert.equal(await page.locator('[data-manager-block="opportunities"]').isChecked(),false);
  for(const box of await page.locator('[data-manager-block]').all())await box.uncheck();
  for(const key of ['concentration','opportunities'])await page.locator(`[data-manager-block="${key}"]`).check();
  await page.evaluate(()=>generateManagerReport());assert.ok(await page.evaluate(()=>managerReportHtml.includes('Detalle de oportunidades')));
  download=page.waitForEvent('download');await page.evaluate(()=>ReportDesign.downloadPdf(managerReportHtml,'Graficos-agregados.pdf'));await(await download).saveAs(path.join(out,'agregado.pdf'));
  assert.deepEqual(errors,[]);console.log('New charts, missing score, client coverage, mobile and optional PDFs passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
