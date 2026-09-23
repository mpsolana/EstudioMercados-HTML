const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
(async()=>{
 const out=process.env.BROWSER_OUTPUT_DIR;fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.dismiss());
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
  await page.evaluate(()=>{
   switchSection('cartera');PortfolioWorkspace.scope='initial';PortfolioWorkspace.step='proposal';portfolioWorkflowRefresh();
   const records=Array.from({length:30},(_,i)=>({isin:'ES'+String(i+1).padStart(10,'0'),name:`Fondo ${i+1} de renta ${i%2?'fija':'variable'}`,category:i%2?'RF Europa':'RV Global',manager:'Gestora '+i%3,currency:'EUR',ter:i<20?1.2:.4,score:2+i/20,ret5:3+i/5,risk5:4+i/3}));
   fundUniverseState={records,isinIndex:new Map(records.map(r=>[r.isin,r])),quartiles:buildFundQuartiles(records)};
   fundProposalState.rows=records.slice(0,20).map(r=>({isin:r.isin,weight:5,current:r,proposed:r,recommendations:[],cheaperClasses:[]}));
   document.getElementById('fundProposalCapital').value='100000';renderFundProposalPortfolio();
  });
  await page.selectOption('#proposalMode','independent');
  await page.fill('#proposalTargetInput',Array.from({length:10},(_,i)=>`ES${String(i+21).padStart(10,'0')};10%`).join('\n'));
  await page.getByRole('button',{name:'Cargar propuesta',exact:true}).click();
  const result=await page.evaluate(()=>({rows:ProposalPortfolio.rows().length,targets:ProposalPortfolio.targetRows().length,saving:fundProposalSavingsData().annualSaving,total:CategoryFlows.model().links.reduce((s,l)=>s+l.amount,0)}));
  assert.equal(result.targets,10);assert.ok(Math.abs(result.saving-800)<1e-7);assert.ok(Math.abs(result.total-100000)<1e-6);
  await page.locator('.proposal-target-section').screenshot({path:path.join(out,'propuesta-independiente.png')});
  await page.locator('[aria-label="weight destino 1"]').fill('9');await page.locator('[aria-label="weight destino 1"]').dispatchEvent('change');
  assert.equal(await page.evaluate(()=>Number.isFinite(fundProposalSavingsData().annualSaving)),false);
  await page.locator('[aria-label="weight destino 1"]').fill('10');await page.locator('[aria-label="weight destino 1"]').dispatchEvent('change');
  await page.selectOption('#proposalMode','paired');assert.equal(await page.evaluate(()=>fundProposalState.rows.length),20);
  await page.selectOption('#proposalMode','independent');assert.equal(await page.evaluate(()=>ProposalPortfolio.targetRows().length),10);
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(500);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,JSON.stringify(await page.evaluate(()=>[...document.querySelectorAll('section,table,select,textarea')].filter(el=>el.getBoundingClientRect().right>innerWidth).map(el=>[el.id,el.className,el.getBoundingClientRect().right]))));await page.setViewportSize({width:1440,height:1000});
  const traces=await page.evaluate(async()=>{
   const rows=[{current:fundUniverseState.records[0],proposed:fundUniverseState.records[21]}],old=FinancialVisuals.newPlot;let captured;
   FinancialVisuals.newPlot=(el,data,...args)=>{captured=data;return old(el,data,...args);};
   try{await ReportControls.chart(rows);return captured;}finally{FinancialVisuals.newPlot=old;}
  });
  const peers=traces.filter(t=>t.name.startsWith('Peer group'));assert.equal(peers.length,2);assert.equal(peers.reduce((n,t)=>n+t.x.length,0),30);assert.ok(peers.every(t=>Array.isArray(t.marker.size)));assert.ok(new Set(peers.flatMap(t=>t.marker.size)).size>1);
  assert.equal(traces.find(t=>t.meta?.financialRole==='origin').marker.size,peers[0].marker.size[0]);
  await page.locator('[data-workspace-step="report"]').click();for(const box of await page.locator('[data-report-block]').all())await box.uncheck();for(const key of ['positions','changes'])await page.locator(`[data-report-block="${key}"]`).check();
  await page.evaluate(()=>generateFundProposalReport());assert.ok(await page.evaluate(()=>fundProposalState.reportHtml.includes('Composición propuesta')));
  let download=page.waitForEvent('download');await page.evaluate(()=>ReportDesign.downloadPdf(fundProposalState.reportHtml,'Propuesta.pdf'));await(await download).saveAs(path.join(out,'propuesta.pdf'));
  await page.evaluate(()=>{
   ProposalPortfolio.mode('paired');fundProposalState.rows=fundProposalState.rows.slice(0,1);fundProposalState.rows[0].weight=100;fundProposalState.rows[0].proposed=fundUniverseState.records[21];
  });
  for(const box of await page.locator('[data-report-block]').all())await box.uncheck();for(const key of ['details','pairs'])await page.locator(`[data-report-block="${key}"]`).check();
  await page.evaluate(()=>generateFundProposalReport());assert.ok(await page.evaluate(()=>fundProposalState.reportHtml.includes('Leyenda de cuartiles')));
  download=page.waitForEvent('download');await page.evaluate(()=>ReportDesign.downloadPdf(fundProposalState.reportHtml,'Peers.pdf'));await(await download).saveAs(path.join(out,'peers.pdf'));
  const aggregate=await page.evaluate(()=>{
   const current=fundUniverseState.records[0];aggregateScoringResults=[{included:true,position:{isin:current.isin,name:current.name,weight:100,amount:100000,rows:1,amountCount:1},originalRecord:current,universeMatch:{record:current},currentRecord:current}];
   applyAggregateRecord(0,fundUniverseState.records[21].isin);const changed=aggregateEffectiveRecord(aggregateScoringResults[0]);
   const input=document.createElement('input');input.type='number';input.step='any';input.value='.25';setAggregateManualTer(0,input);const manual=aggregateEffectiveRecord(aggregateScoringResults[0]).ter;
   keepAggregateRecord(0);const state=reportAggregateChangeHtml(aggregateScoringResults[0]);
   input.value='.9';setAggregateManualTer(0,input);keepAggregateRecord(0);return {category:changed.category,manual,state,keptTer:aggregateEffectiveRecord(aggregateScoringResults[0]).ter,original:current.ter,html:aggregateRecommendationHtml(aggregateScoringResults[0],0)};
  });
  assert.equal(aggregate.category,'RF Europa');assert.equal(aggregate.manual,.25);assert.match(aggregate.state,/Sin cambio/);assert.equal(aggregate.keptTer,.9);assert.equal(aggregate.original,1.2);assert.match(aggregate.html,/Universo completo/);
  const asset=await page.evaluate(()=>{
   assetClassScreenerState.records=[{assetClass:'RV',funds:20,ret5Mean:6,risk5Mean:12}];
   for(const id of ['assetClassScreenerXAxis','assetClassScreenerYAxis','assetClassScreenerZAxis'])document.getElementById(id).innerHTML='<option value="ret5Mean">Retorno</option><option value="risk5Mean">Riesgo</option><option value="funds">Fondos</option>';
   document.getElementById('assetClassScreenerXAxis').value='ret5Mean';document.getElementById('assetClassScreenerYAxis').value='risk5Mean';document.getElementById('assetClassScreenerZAxis').value='funds';
   renderAssetClassScatter(assetClassScreenerState.records);
   const el=document.getElementById('assetClassScreenerScatter');return {color:el.data[0].marker.color,title:el.data[0].marker.colorbar.title,scale:el.data[0].marker.colorscale};
  });assert.deepEqual(asset.color,[12]);assert.match(JSON.stringify(asset.title),/Risk|Riesgo/i);assert.equal(asset.scale.at(-1)[1],'#204f78');
  const compact=await page.evaluate(()=>{
   fundScoringResults=fundUniverseState.records.slice(0,12).map(r=>({isin:r.isin,weight:100/12,included:true,currentRecord:r,record:r,universeMatch:{record:r}}));
   const html=`<html><head></head><body><main class="report"><h1>Informe de cartera</h1>${buildClientScoringReportSection()}</main></body></html>`;
   window.testScoringHtml=ReportDesign.prepare(html,portfolioSnapshot('individual'));return {split:testScoringHtml.includes('Parte 1'),tableCount:new DOMParser().parseFromString(testScoringHtml,'text/html').querySelectorAll('table').length};
  });assert.equal(compact.split,false);assert.equal(compact.tableCount,1);
  download=page.waitForEvent('download');await page.evaluate(()=>ReportDesign.downloadPdf(testScoringHtml,'Scoring.pdf'));await(await download).saveAs(path.join(out,'scoring.pdf'));
  assert.deepEqual(errors,[]);console.log('Independent portfolios, peers, aggregate decisions, screener and PDFs passed');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
