const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
(async()=>{
 const out=process.env.BROWSER_OUTPUT_DIR;fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],dialogs=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{dialogs.push(d.message());d.dismiss();});
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
  const consistency=await page.evaluate(()=>{
   const results=[];
   for(const freq of ['D','W','M','Q','A']){
    const n=HorizonCore.periodsPerYear[freq]*6,dates=Array.from({length:n+1},(_,i)=>new Date(Date.UTC(2019,0,1+i*({D:1,W:7,M:30,Q:91,A:365}[freq])))),returns={A:Array.from({length:n},(_,i)=>i%3===0?-.04:.018),B:Array.from({length:n},(_,i)=>i%5===0?.05:-.005)},entries=[{ticker:'A',weight:.6},{ticker:'B',weight:.4}];
    const rr=FinanceCore.portfolioPath(entries,dates,returns,{rebalance:'hold',costBps:10}),series=HorizonCore.fromReturns(rr).map((p,i)=>({...p,date:dates[i]}));
    loadedPortfolio={portfolioData:series,frequency:freq,returns,entries,commonDates:dates.map(d=>d.toISOString().slice(0,10)),sourceLabel:'Coherencia'};
    preparePortfolioReportAllocationState();const stats=calculateRollingStats(series,freq).find(r=>r.periods===HorizonCore.periodsPerYear[freq]*5),range=assetAllocationState.analysisRows.find(r=>r.months===60),line=calculateTimeSeries(series,freq)['5 Años'].y;
    results.push({freq,mean:stats.meanAnn,range:range.mean,lineMean:line.reduce((a,b)=>a+b,0)/line.length,min:stats.minAnn,rangeMin:range.min,max:stats.maxAnn,rangeMax:range.max,count:range.count,lineCount:line.length,path:document.getElementById('assetAllocationCumulativeChart').data[0].y.at(-1),actual:series.at(-1).price});
   }return results;
  });
  for(const r of consistency){for(const [a,b] of [[r.mean,r.range],[r.mean,r.lineMean],[r.min,r.rangeMin],[r.max,r.rangeMax],[r.path,r.actual]])assert.ok(Math.abs(a-b)<1e-9,JSON.stringify(r));assert.equal(r.count,r.lineCount);}
  await page.evaluate(()=>{switchSection('cartera');PortfolioWorkspace.scope='individual';PortfolioWorkspace.step='diagnosis';PortfolioWorkspace.tool='assets';portfolioWorkflowRefresh();});
  await page.locator('#assetAllocationScenarioChart').screenshot({path:path.join(out,'rango-backtest.png')});
  await page.evaluate(()=>{
   switchSection('cartera');PortfolioWorkspace.scope='initial';PortfolioWorkspace.step='proposal';portfolioWorkflowRefresh();
   const records=Array.from({length:6},(_,i)=>({isin:'ES'+String(i+1).padStart(10,'0'),name:'Fondo '+(i+1),category:i===5?'RF':'RV',ter:i===0?1:2+i/10,score:4-i/3,ret5:5+i,risk5:10+i}));fundUniverseState={records,isinIndex:new Map(records.map(r=>[r.isin,r])),quartiles:buildFundQuartiles(records)};
   document.getElementById('fundWeightUnit').value='percent';document.getElementById('fundProposalPortfolioInput').value='ES0000000001;60%\nES9999999999;40%';fundProposalState.rows=[];document.getElementById('fundProposalCapital').value='100000';
  });
  await page.selectOption('#proposalMode','independent');await page.fill('#proposalTargetInput','ES0000000002;50%\nES0000000006;50%');await page.getByRole('button',{name:'Cargar propuesta',exact:true}).click();
  const metrics=await page.evaluate(()=>({rows:fundProposalState.rows.length,ter:fundProposalWeighted('ter','proposed'),score:fundProposalWeighted('score','proposed'),current:fundProposalWeighted('ter','current'),saving:fundProposalSavingsData().annualSaving,coverage:ProposalPortfolio.weighted('ter','current').coverage,flows:ProposalPortfolio.rows().reduce((s,r)=>s+r.weight,0)}));
  assert.equal(metrics.rows,2);assert.ok(Math.abs(metrics.ter-2.3)<1e-10);assert.ok(Number.isFinite(metrics.score));assert.equal(metrics.current,1);assert.equal(metrics.coverage,.6);assert.ok(Number.isNaN(metrics.saving));assert.equal(metrics.flows,100);
  await page.locator('[data-workspace-step="report"]').click();for(const box of await page.locator('[data-report-block]').all())await box.uncheck();for(const key of ['positions','changes','methodology'])await page.locator(`[data-report-block="${key}"]`).check();
  await page.evaluate(()=>generateFundProposalReport());assert.ok(await page.evaluate(()=>fundProposalState.reportHtml.includes('60.0%')));assert.deepEqual(dialogs,[]);
  let download=page.waitForEvent('download');await page.evaluate(()=>ReportDesign.downloadPdf(fundProposalState.reportHtml,'Cobertura.pdf'));await(await download).saveAs(path.join(out,'cobertura.pdf'));
  await page.locator('[data-workspace-step="proposal"]').click();await page.selectOption('#proposalTargetUnit','fraction');await page.fill('#proposalTargetInput','ES0000000002;0,5\nES0000000006;0,5');await page.getByRole('button',{name:'Cargar propuesta',exact:true}).click();assert.equal(await page.evaluate(()=>ProposalPortfolio.targetRows().reduce((s,r)=>s+r.weight,0)),100);
  const independent=await page.evaluate(()=>{fundProposalState.rows[0].weight=50;renderFundProposalPortfolio();return {ter:fundProposalWeighted('ter','proposed'),current:fundProposalWeighted('ter','current'),status:document.getElementById('fundProposalStatus').textContent};});assert.ok(Number.isFinite(independent.ter));assert.ok(Number.isNaN(independent.current));assert.match(independent.status,/90.00%/);
  await page.locator('[data-workspace-scope="aggregate"]').click();await page.locator('[data-workspace-step="diagnosis"]').click();await page.locator('[data-workspace-tool="aggregate"]').click();
  await page.evaluate(()=>{const r=fundUniverseState.records[0];aggregateScoringResults=[{position:{isin:r.isin,name:r.name,weight:100,amount:100000,amountCount:1,rows:1},currentRecord:r,universeMatch:{record:r},included:true,manualTer:.5}];renderAggregateScoringResults();});
  const peers=await page.evaluate(()=>AggregatePeerTable.rows()[0]);assert.equal(peers.count,4);assert.equal(peers.meanTer,2.25);assert.equal(peers.record.ter,.5);
  await page.locator('#aggregatePeerValue').screenshot({path:path.join(out,'value-for-money.png')});
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.setViewportSize({width:1440,height:1000});
  await page.locator('[data-workspace-step="report"]').click();for(const box of await page.locator('[data-manager-block]').all())await box.uncheck();await page.locator('[data-manager-block="valueForMoney"]').check();await page.evaluate(()=>generateManagerReport());
  assert.ok(await page.evaluate(()=>managerReportHtml.includes('TER y Calidad frente a peers')));
  download=page.waitForEvent('download');await page.evaluate(()=>ReportDesign.downloadPdf(managerReportHtml,'Peers.pdf'));await(await download).saveAs(path.join(out,'peers.pdf'));
  assert.deepEqual(errors,[]);console.log(JSON.stringify({consistency,metrics,peerCount:peers.count,errors},null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
