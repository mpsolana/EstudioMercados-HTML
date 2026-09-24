const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
(async()=>{
 const out=process.env.BROWSER_OUTPUT_DIR;fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
  const simulation=await page.evaluate(()=>{
   switchSection('cartera');PortfolioWorkspace.scope='individual';PortfolioWorkspace.step='diagnosis';PortfolioWorkspace.tool='assets';portfolioWorkflowRefresh();
   const dates=Array.from({length:73},(_,i)=>new Date(Date.UTC(2019,i,1))),returns={A:Array.from({length:72},(_,i)=>i%3===0?-.04:.04),B:Array.from({length:72},()=>.001)},entries=[{ticker:'A',weight:.6},{ticker:'B',weight:.4}],settings={rebalance:'monthly',costBps:15};
   const series=HorizonCore.fromReturns(FinanceCore.portfolioPath(entries,dates,returns,settings)).map((p,i)=>({...p,date:dates[i]}));
   loadedPortfolio={portfolioData:series,frequency:'M',returns,entries,commonDates:dates,sourceLabel:'Test',calculationSettings:settings};
   const before=JSON.stringify(loadedPortfolio);preparePortfolioReportAllocationState();window.originalRange=assetAllocationState.analysisRows;
   const original=JSON.stringify(originalRange);setAssetAllocationWeight(0,90,'slider');
   return {sliders:document.querySelectorAll('[data-aa-slider]').length,original,visual:JSON.stringify(assetAllocationState.analysisRows),unchanged:before===JSON.stringify(loadedPortfolio),sum:Object.values(assetAllocationState.weights).reduce((a,b)=>a+b,0),source:document.getElementById('assetAllocationSource').textContent};
  });
  assert.equal(simulation.sliders,2);assert.notEqual(simulation.original,simulation.visual);assert.ok(simulation.unchanged);assert.equal(simulation.sum,1);assert.match(simulation.source,/Simulación visual/);
  await page.locator('#portfolioSubtabContent-assets').screenshot({path:path.join(out,'simulacion.png')});
  assert.equal(await page.evaluate(()=>{preparePortfolioReportAllocationState();return JSON.stringify(assetAllocationState.analysisRows)===JSON.stringify(originalRange);}),true);
  const classes=await page.evaluate(()=>{
   const a={isin:'ES0000000001',name:'Global Strategic Bond A EUR',manager:'Gestora',category:'Bonos',aum:1000,ter:1,score:3,risk5:5,ret5:4};
   const b={...a,isin:'ES0000000002',name:'Global Strategic Bond I EUR Hedged',category:'Otros',ter:.5,score:4,risk5:8,ret5:NaN};
   const c={...a,isin:'ES0000000003',name:'Global Strategic Bond B EUR',ter:.7,score:2};
   fundUniverseState={records:[a,b,c],isinIndex:new Map([a,b,c].map(r=>[r.isin,r])),quartiles:buildFundQuartiles([a,b,c])};
   aggregateScoringResults=[{position:{isin:a.isin,name:a.name,weight:100,amount:100000,amountCount:1,rows:1},currentRecord:a,originalRecord:a,universeMatch:{record:a},included:true}];
   switchSection('cartera');PortfolioWorkspace.scope='aggregate';PortfolioWorkspace.step='diagnosis';PortfolioWorkspace.tool='aggregate';portfolioWorkflowRefresh();
   setAggregateOrigin(0,b.isin);const result=aggregateScoringResults[0];
   const resolved={isin:result.position.isin,amount:result.position.amount,category:aggregateStaticRecord(result).category,score:aggregateEffectiveRecord(result).score,changed:aggregateHasAppliedChange(result),note:aggregateOriginNote(result),selector:document.getElementById('aggregate-origin-0').textContent,classes:shareClassActions(a,'applyAggregateRecord',0)};
   applyAggregateRecord(0,c.isin);resolved.replaced=aggregateHasAppliedChange(result);resetAggregateRecord(0);resolved.reset=aggregateEffectiveRecord(result).isin;keepAggregateRecord(0);resolved.status=reportAggregateChangeHtml(result);clearAggregateOrigin(0);resolved.restored=aggregateEffectiveRecord(result).isin;
   setAggregateOrigin(0,b.isin);resolved.report=buildManagerAggregatePositionsSection({rows:aggregateScoringResults});
   return resolved;
  });
  assert.equal(classes.isin,'ES0000000001');assert.equal(classes.amount,100000);assert.equal(classes.category,'Otros');assert.equal(classes.changed,false);assert.equal(classes.replaced,true);assert.equal(classes.reset,'ES0000000002');assert.equal(classes.restored,'ES0000000001');assert.match(classes.status,/Sin cambio/);assert.match(classes.classes,/TER 0.50%/);assert.match(classes.report,/Origen de datos seleccionado/);
  await page.locator('#aggregatePositionsTableBody').screenshot({path:path.join(out,'origen-agregado.png')});
  const comparison=await page.evaluate(async()=>{
   const [a,b,c]=fundUniverseState.records,rows=[{isin:a.isin,current:a,proposed:b}],old=FinancialVisuals.newPlot;let traces;
   FinancialVisuals.newPlot=async(el,data,...rest)=>{traces=data;return old(el,data,...rest);};try{await ReportControls.chart(rows);}finally{FinancialVisuals.newPlot=old;}
   const groups=ReportControls.independentComparisons([{isin:a.isin,current:a}],[{record:b},{record:c}]);
   const many=Array.from({length:21},(_,i)=>({label:'Gestora '+i,current:100/21,proposed:100/21})),compact=ProposalCharts.compactConcentration({manager:many,category:many,note:''},14);
   return {peers:traces.filter(t=>t.name.startsWith('Peer group')).map(t=>t.name),notes:ReportControls.chartNotes(rows),groups:groups.map(g=>g.rows.map(r=>({origin:r.current?.isin,proposal:r.proposed?.isin}))),compact,total:compact.manager.reduce((s,r)=>s+r.current,0)};
  });
  assert.equal(comparison.peers.length,1);assert.match(comparison.peers[0],/Bonos \+ Otros/);assert.match(comparison.notes,/Propuesta.*Retorno 5A/);assert.equal(comparison.groups.length,2);assert.equal(comparison.groups[0][1].proposal,'ES0000000003');assert.equal(comparison.groups[1][0].proposal,'ES0000000002');assert.equal(comparison.compact.manager.length,14);assert.ok(Math.abs(comparison.total-100)<1e-9);
  await page.evaluate(()=>{
   PortfolioWorkspace.scope='initial';PortfolioWorkspace.step='report';portfolioWorkflowRefresh();
   document.getElementById('fundWeightUnit').value='percent';document.getElementById('fundProposalPortfolioInput').value='ES0000000001;100%';fundProposalState.rows=[];
   document.getElementById('fundProposalCapital').value='100000';ProposalPortfolio.mode('independent');document.getElementById('proposalTargetInput').value='ES0000000002;60%\nES0000000003;40%';ProposalPortfolio.importText();
  });
  for(const box of await page.locator('[data-report-block]').all())await box.uncheck();for(const key of ['pairs','details','waterfall','comparison'])await page.locator(`[data-report-block="${key}"]`).check();
  await page.evaluate(()=>generateFundProposalReport());
  const initial=await page.evaluate(()=>fundProposalState.reportHtml);assert.match(initial,/Propuesta y peers de su categoría/);assert.match(initial,/chart-data-note/);assert.doesNotMatch(initial,/Cascada de ahorro anual/);assert.doesNotMatch(initial,/Origen y propuesta: TER y score/);
  let initialDownload=page.waitForEvent('download');await page.evaluate(()=>ReportDesign.downloadPdf(fundProposalState.reportHtml,'Independiente.pdf'));await(await initialDownload).saveAs(path.join(out,'independiente.pdf'));
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.setViewportSize({width:1440,height:1000});
  const html=await page.evaluate(async()=>{
   ProposalPortfolio.mode('paired');const [a,b]=fundUniverseState.records;
   fundProposalState.rows=Array.from({length:18},(_,i)=>({isin:a.isin,weight:100/18,current:{...a,manager:'Gestora profesional '+i,category:'Categoria '+i},proposed:{...b,manager:'Gestora profesional '+i,category:'Categoria '+i}}));
   const body=await ProposalCharts.report('concentration');window.testReport=ReportDesign.prepare(buildFundProposalReportDocumentHtml(`<main class="report proposal-report">${body.replace('block report-chart-page','block')}</main>`),portfolioSnapshot('proposal'));return body;
  });
  assert.equal((html.match(/<img /g)||[]).length,1);
  const download=page.waitForEvent('download');await page.evaluate(()=>ReportDesign.downloadPdf(testReport,'Concentracion.pdf'));await(await download).saveAs(path.join(out,'concentracion.pdf'));
  await page.setContent(html);await page.locator('img').screenshot({path:path.join(out,'concentracion.png')});
  assert.deepEqual(errors,[]);console.log('Visual weights, restored originals, origin overrides, candidate selectors, grouped peers and single-page concentration passed.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
