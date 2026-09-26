const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',async d=>{errors.push(d.message());await d.dismiss();});
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
  const result=await page.evaluate(async()=>{
   const isin=i=>'ES'+String(i).padStart(10,'0');
   switchSection('cartera');
   const portfolio=XLSX.utils.book_new(),keys=Array.from({length:20},(_,i)=>isin(i));
   XLSX.utils.book_append_sheet(portfolio,XLSX.utils.aoa_to_sheet([['ticker','weight'],...keys.map(key=>[key,.05])]),'weights');
   const history=names=>XLSX.utils.aoa_to_sheet([['date',...names],...Array.from({length:6000},(_,i)=>[new Date(Date.UTC(2000,0,i+1)),...names.map((_,j)=>100*Math.exp(i*.00005+Math.sin(i*.04+j)*.1))])]);
   XLSX.utils.book_append_sheet(portfolio,history(keys),'prices');XLSX.utils.book_append_sheet(portfolio,history(['Bench A','Bench B']),'bench');
   const transfer=new DataTransfer();transfer.items.add(new File([XLSX.write(portfolio,{type:'array',bookType:'xlsx'})],'cartera.xlsx'));
   document.getElementById('portfolioExcelInput').files=transfer.files;document.getElementById('portfolioPricesInBase').checked=true;
   await importPortfolioExcel();
   if(fundPortfolioRows.length!==20)throw new Error('La cartera individual no se ha sincronizado con scoring');
   const headers=['ISIN','Name','Morningstar Category','Score','KIID Ongoing Charge*','AUM*','Entidad*'];
   const rows=Array.from({length:20000},(_,i)=>[isin(i),'Strategy '+i+' A EUR','Categoria '+i%10,3,1,1000+i,'House']);
   const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([...Array.from({length:7},()=>[]),headers,...rows]),'Ranking Completo');
   const file=new File([XLSX.write(book,{type:'array',bookType:'xlsx'})],'ranking.xlsx');
   const old=renderFundScoringResults;let renders=0,late=0,ticks=0;
   renderFundScoringResults=(...args)=>{renders++;if(!PortfolioLoading.active)late++;return old(...args);};
   const timer=setInterval(()=>ticks++,50),start=performance.now();
   try{await importFundUniverseFile(file);await new Promise(r=>setTimeout(r,300));}
   finally{clearInterval(timer);renderFundScoringResults=old;}
   const source=[
    {ISIN:isin(1),'PRODUCT TYPE':'Fondos nacionales',INSTRUMENT:'Fondo nacional','Counter Value':100},
    {ISIN:isin(2),'PRODUCT TYPE':'Fondos internacionales',INSTRUMENT:'Fondo internacional','Counter Value':300},
    {ISIN:isin(3),'PRODUCT TYPE':'ETF Fondos cotizados internacionales',INSTRUMENT:'Indice','Counter Value':900},
    {ISIN:isin(4),'PRODUCT TYPE':'Investment Fund','TYPE OF ASSET':'Exchange-Traded Fund',INSTRUMENT:'Indice','Counter Value':900},
    {ISIN:isin(5),'PRODUCT TYPE':'Fund',INSTRUMENT:'Index ETF','Counter Value':900},
    {ISIN:isin(6),'PRODUCT TYPE':'Acciones',INSTRUMENT:'Empresa','Counter Value':900}
   ];
   const filtered=parseAggregatePositionRows(source),aggregate=aggregateFundPositions(filtered,'test');
   return {ms:performance.now()-start,renders,late,ticks,results:fundScoringResults.length,records:fundUniverseState.records.length,active:PortfolioLoading.active,kept:filtered.map(r=>r.isin),total:aggregate.totalAmount,weights:aggregate.aggregated.map(r=>r.weight)};
  });
  assert.equal(result.records,20000);assert.equal(result.results,20);assert.equal(result.renders,1);assert.equal(result.late,0);assert.ok(result.ticks>10);assert.equal(result.active,false);
  assert.deepEqual(result.kept,['ES0000000001','ES0000000002']);assert.equal(result.total,400);assert.deepEqual(result.weights,[75,25]);
  const tracked=await page.evaluate(async()=>{let done=false;await PortfolioLoading.run(async()=>{PortfolioLoading.track(new Promise(r=>setTimeout(()=>{done=true;r();},100)));});return done&&!PortfolioLoading.active;});assert.equal(tracked,true);
  const pdf=await page.evaluate(async()=>{
   const calls=[],old=PortfolioLoading.phase;PortfolioLoading.phase=async(p,label)=>{calls.push({p,active:PortfolioLoading.active,title:document.querySelector('dialog h2').textContent});return old(p,label);};
   try{await ReportDesign.downloadPdf('<h1>Prueba</h1><p>Informe de prueba</p>','prueba.pdf');}finally{PortfolioLoading.phase=old;}
   return {calls,active:PortfolioLoading.active};
  });
  assert.ok(pdf.calls.some(c=>c.p===75&&c.active&&c.title==='Generando PDF'));assert.equal(pdf.active,false);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result,pdf:true,errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
