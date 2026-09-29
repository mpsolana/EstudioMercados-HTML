const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('dialog',d=>d.dismiss());
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
  const timing=await page.evaluate(()=>{
   switchSection('cartera');const isin=i=>'ES'+String(i).padStart(10,'0');
   const records=Array.from({length:20000},(_,i)=>({isin:isin(i),name:`Strategy ${i} A EUR`,category:`Category ${i%8}`,manager:'House',aum:1000+i,score:2+(i%5)*.2,ter:.5+(i%5)*.2,ret1:4,risk3:5,dd1:-8,dd3:-12,dd5:-18,ret5:7,risk5:9}));
   fundUniverseState={records,isinIndex:new Map(records.map(r=>[r.isin,r])),quartiles:buildFundQuartiles(records)};
   aggregatePositionsState={aggregated:Array.from({length:12},(_,i)=>({isin:isin(i),name:records[i].name,weight:100/12,amount:1000,amountCount:1,rows:1,accounts:new Set(),clientCount:1})),rows:[],hasAmounts:true,totalAmount:12000};
   aggregateScoringResults=aggregatePositionsState.aggregated.map((position,i)=>createAggregateResultState(position,{record:records[i]},{}));
   PortfolioWorkspace.scope='aggregate';PortfolioWorkspace.step='diagnosis';PortfolioWorkspace.tool='aggregate';portfolioWorkflowRefresh();
   const start=performance.now();renderAggregateScoringResults();const first=performance.now()-start;
   const lazy=document.getElementById('aggregateFullUniverse-0').querySelector('[data-fund-selector-results]').children.length===0;
   const change=performance.now();applyAggregateRecord(0,isin(100));const applied=performance.now()-change;
   const origin=aggregateStaticRecord(aggregateScoringResults[0]),proposal=aggregateEffectiveRecord(aggregateScoringResults[0]);
   editAggregateOriginMetrics(0);const dialog=document.querySelector('dialog.initial-origin-dialog');dialog.querySelector('[name="score"]').value='3.5';dialog.querySelector('[name="ter"]').value='0.7';dialog.querySelector('form').requestSubmit();
   const manual=aggregateStaticRecord(aggregateScoringResults[0]);
   const summary=buildManagerSummarySection(aggregateScoringSummary());
   const peer=AggregatePeerTable.report();
   const changes=buildManagerProposedChangesSection(aggregateScoringSummary());
   useAggregateChangesInIndividualScoring();
   return {first,applied,lazy,origin:origin.isin,proposal:proposal.isin,manualScore:manual.score,manualTer:manual.ter,manualRet1:manual.ret1,summary,peer,changes,transferred:fundPortfolioRows.map(r=>({isin:r.isin,weight:r.weight})),scope:PortfolioWorkspace.scope,step:PortfolioWorkspace.step,tool:PortfolioWorkspace.tool,columns:document.querySelector('.aggregate-positions-table thead tr').cells.length,firstRow:document.querySelector('#aggregatePositionsTableBody tr[data-aggregate-bucket]').cells.length};
  });
  assert.equal(timing.lazy,true);assert.equal(timing.columns,16);assert.equal(timing.firstRow,16);assert.equal(timing.origin,'ES0000000000');assert.equal(timing.proposal,'ES0000000100');assert.equal(timing.manualScore,3.5);assert.equal(timing.manualTer,.7);assert.equal(timing.manualRet1,4);
  assert.match(timing.summary,/Resumen agregado tras cambios/);assert.doesNotMatch(timing.summary,/No aprobados|<span>Aprobados/);assert.match(timing.summary,/Score técnico/);assert.match(timing.peer,/Score técnico/);assert.match(timing.changes,/Strategy 100 A EUR/);
  assert.equal(timing.transferred[0].isin,'ES0000000100');assert.equal(timing.transferred.length,12);assert.ok(Math.abs(timing.transferred.reduce((s,r)=>s+r.weight,0)-100)<1e-8);assert.deepEqual([timing.scope,timing.step,timing.tool],['individual','diagnosis','scoring']);
  assert.ok(timing.applied<3000,`Cambio agregado lento: ${timing.applied.toFixed(0)} ms`);
  const initial=await page.evaluate(()=>{
   const records=fundUniverseState.records;fundProposalState.rows=records.slice(0,10).map((record,i)=>({id:'perf-'+i,isin:record.isin,weight:10,current:record,proposed:record,recommendations:[],cheaperClasses:[],missing:false}));
   PortfolioWorkspace.scope='initial';PortfolioWorkspace.step='proposal';portfolioWorkflowRefresh();
   const start=performance.now();renderFundProposalPortfolio();const first=performance.now()-start;
   const lazy=document.getElementById('fundProposalFullUniverse-0').querySelector('[data-fund-selector-results]').children.length===0;
   const change=performance.now();setFundProposalRecommendation(0,records[80].isin);const applied=performance.now()-change;
   return {first,applied,lazy,isin:fundProposalState.rows[0].proposed.isin};
  });
  assert.equal(initial.lazy,true);assert.equal(initial.isin,'ES0000000080');assert.ok(initial.applied<3000,`Cambio inicial lento: ${initial.applied.toFixed(0)} ms`);
  const alpha=await page.evaluate(()=>{
   const saved=ReportControls.manager.range,asOf=ReportControls.manager.asOf;
   ReportControls.manager.range='YTD';ReportControls.manager.asOf=new Date('2026-09-29');
   const points=values=>values.map(([date,price])=>({date:new Date(date),price}));
   const bench={label:'Referencia',data:points([['2025-12-31',100],['2026-01-31',102],['2026-09-01',105]])};
   const good=buildMassiveComparisonTablesHtml([{label:'Fondo A',data:points([['2025-12-31',100],['2026-01-31',110],['2026-09-01',120]])}],bench);
   const bad=buildMassiveComparisonTablesHtml([{label:'Fondo B',data:points([['2025-12-31',100],['2026-01-31',95],['2026-09-01',90]])}],bench);
   ReportControls.manager.range=saved;ReportControls.manager.asOf=asOf;return {good,bad};
  });
  assert.match(alpha.good,/class="num good"/);assert.match(alpha.bad,/class="num bad"/);
  const report=await page.evaluate(async()=>{
   for(const key of Object.keys(ReportControls.manager.blocks))ReportControls.manager.blocks[key]=['summary','impact','positions','valueForMoney','changes'].includes(key);
   document.getElementById('reportIncludeCharts').checked=false;
   await generateManagerReport();
   const doc=new DOMParser().parseFromString(managerReportHtml,'text/html');
   const summary=[...doc.querySelectorAll('h2')].find(h=>h.textContent==='Resumen agregado tras cambios')?.parentElement?.textContent||'';
   return {summary,html:managerReportHtml,peer:[...doc.querySelectorAll('h2')].find(h=>h.textContent.includes('frente a peers'))?.parentElement?.outerHTML||''};
  });
  assert.match(report.summary,/Score técnico/);assert.doesNotMatch(report.summary,/No aprobados|Aprobados/);
  assert.match(report.html,/Téc\. 3\.50/);assert.match(report.html,/Strategy 100 A EUR/);assert.match(report.peer,/class="good"|class="bad"/);
  const out=process.env.BROWSER_OUTPUT_DIR;if(out){fs.mkdirSync(out,{recursive:true});const download=page.waitForEvent('download');await page.evaluate(()=>ReportDesign.downloadPdf(managerReportHtml,'Agregado-revision.pdf'));await(await download).saveAs(path.join(out,'agregado-revision.pdf'));}
  assert.deepEqual(errors,[]);console.log(JSON.stringify({aggregateMs:timing.applied,initialMs:initial.applied,firstAggregateMs:timing.first,firstInitialMs:initial.first,errors}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
