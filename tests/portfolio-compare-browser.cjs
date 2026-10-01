const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{pathToFileURL}=require('node:url');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
  await page.evaluate(()=>{switchSection('cartera');fundUniverseState={records:[{isin:'TEST',name:'Test'}]};portfolioWorkflowRefresh();document.querySelector('[data-workspace-scope="comparison"]').click();});
  await page.evaluate(async()=>{
   const dates=Array.from({length:18},(_,index)=>new Date(Date.UTC(2024,index+1,0)));
   const make=(name,weights,prices)=>{
    const book=XLSX.utils.book_new(),add=(sheet,rows)=>XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(rows),sheet);
    add('weights',[['ticker','weight','name'],...weights]);
    add('prices',[['date',...Object.keys(prices)],...dates.map((date,index)=>[date,...Object.values(prices).map(values=>values[index])])]);
    add('bench',[['date','INDICE'],...dates.map((date,index)=>[date,100+index*1.4])]);
    return new File([XLSX.write(book,{bookType:'xlsx',type:'array'})],name,{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
   };
   const a=make('A.xlsx',[['A',.6,'Activo A'],['B',.4,'Activo B']],{A:dates.map((_,i)=>100+i*2),B:dates.map((_,i)=>100+i*.5+(i%3))});
   const b=make('B.xlsx',[['C',1,'Activo C']],{C:dates.map((_,i)=>100+i*1.4+(i%4))});
   for(const [index,file] of [[0,a],[1,b]]){const input=document.getElementById(`portfolioCompareFile${index}`),dt=new DataTransfer();dt.items.add(file);input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));}
  });
  await page.waitForFunction(()=>PortfolioCompare.state.sources.every(Boolean));
  await page.locator('#portfolioCompareCloneAdd').click();
  await page.locator('[data-clone-weight="0:0"]').fill('20');
  await page.locator('[data-clone-weight="0:0"]').dispatchEvent('change');
  await page.locator('[data-clone-weight="0:1"]').fill('80');
  await page.locator('[data-clone-weight="0:1"]').dispatchEvent('change');
  await page.locator('#portfolioCompareBenchmark').selectOption('0:indice');
  await page.locator('#portfolioCompareRun').click();
  await page.waitForFunction(()=>document.querySelectorAll('#portfolioCompareTableBody tr').length===3);
  const compared=await page.evaluate(()=>({assets:PortfolioCompare.state.result.assets.length,bench:PortfolioCompare.state.result.benchmark?.ticker,returns:PortfolioCompare.state.result.assets.map(asset=>asset.total),rows:PortfolioCompare.state.result.rows.length,charts:['portfolioCompareBaseChart','portfolioCompareDrawdownChart','portfolioCompareScatterChart'].every(id=>document.querySelector(`#${id} .main-svg`))}));
  assert.equal(compared.assets,3);assert.equal(compared.bench,'indice');assert.equal(compared.charts,true);assert.notEqual(compared.returns[0],compared.returns[2]);
  assert.ok(await page.locator('#portfolioCompareCorrelationChart .main-svg').count()>0);
  assert.match(await page.locator('#portfolioCompareTableBody').innerText(),/días|No recuperado/);
  await page.locator('#portfolioCompareAddExcel').click();
  await page.evaluate(()=>{
   const dates=Array.from({length:18},(_,index)=>new Date(Date.UTC(2024,index+1,0)));
   const book=XLSX.utils.book_new();
   XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['ticker','weight'],['C',1]]),'weights');
   XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['date','C'],...dates.map((date,index)=>[date,100+index*1.1])]),'prices');
   const input=document.getElementById('portfolioCompareFile2'),transfer=new DataTransfer();
   transfer.items.add(new File([XLSX.write(book,{bookType:'xlsx',type:'array'})],'C.xlsx'));input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
  });
  await page.waitForFunction(()=>PortfolioCompare.state.sources[2]?.entries?.[0]?.ticker==='C');
  await page.evaluate(()=>{window.fetchYahooData=async ticker=>Array.from({length:18},(_,index)=>({date:new Date(Date.UTC(2024,index+1,0)),price:100+index*(ticker==='VTI'?1.5:ticker==='VXUS'?1.1:.5)+(index%3)*.2}));});
  await page.locator('#portfolioComparePreset').selectOption('bogleheads');
  assert.equal(await page.locator('.portfolio-compare-yahoo-row').count(),3);
  await page.locator('#portfolioCompareAddYahoo').click();
  await page.locator('#portfolioCompareRun').click();
  await page.waitForFunction(()=>PortfolioCompare.state.result?.assets.length===5);
  assert.equal(await page.locator('#portfolioCompareTableBody tr').count(),5);
  assert.equal(await page.evaluate(()=>PortfolioCompare.state.result.correlations.length),5);
  await page.evaluate(()=>{
   const source=PortfolioCompare.state.sources[0],built=PortfolioCompareCore.build([source]);
   loadedPortfolio={entries:source.entries,portfolioData:built.assets[0].data,priceSeries:Object.fromEntries(Object.entries(source.series).map(([key,data])=>[key,{data}])),benchmarks:source.benchmarks,calculationSettings:portfolioCalculationSettings(),sourceLabel:'A.xlsx'};
   switchSection('individual');document.querySelector('[data-individual-mode="compare"]').click();
   document.getElementById('multiAssetAddPortfolio').click();
   document.getElementById('multiAssetExcelBench').value='indice';document.getElementById('multiAssetAddExcelBench').click();
   document.querySelector('#multiAssetBenchmark').value='BENCH:INDICE';
   document.getElementById('multiAssetLoad').click();
  });
  await page.waitForFunction(()=>document.querySelector('#multiAssetStatus').textContent.includes('Benchmark: BENCH:INDICE'));
  assert.equal(await page.locator('#multiAssetTableBody tr').count(),2);
  assert.equal(await page.locator('#multiAssetHorizonBody tr').count(),2);
  assert.ok(await page.locator('#multiAssetCorrelationChart .main-svg').count()>0);
  await page.evaluate(()=>{
   document.querySelector('[data-individual-mode="single"]').click();
   const target=document.createElement('div');target.id='rangeTestChart';target.style.cssText='width:800px;height:400px';document.body.append(target);
   renderProfessionalRangeChart('rangeTestChart',[{horizon:'1 mes',mean:.06,min:-.04,max:.13},{horizon:'6 meses',mean:.11,min:-.08,max:.27}], 'horizon','mean','min','max','Retorno medio tras caídas');
  });
  await page.waitForFunction(()=>document.querySelector('#rangeTestChart .main-svg'));
  const range=await page.evaluate(()=>{const trace=document.getElementById('rangeTestChart').data[0];return {type:trace.type,mode:trace.mode,color:trace.line.color,range:trace.error_y.color,points:trace.x.length};});
  assert.deepEqual(range,{type:'scatter',mode:'lines+markers',color:'#204f78',range:'#8997a4',points:2});
  assert.deepEqual(errors,[]);
  const out=process.env.BROWSER_OUTPUT_DIR;if(out){fs.mkdirSync(out,{recursive:true});await page.locator('#rangeTestChart').screenshot({path:path.join(out,'professional-range-chart.png')});await page.evaluate(()=>{document.getElementById('rangeTestChart').remove();document.querySelector('[data-individual-mode="compare"]').click();});await page.screenshot({path:path.join(out,'portfolio-vs-bench.png'),fullPage:true});await page.evaluate(()=>switchSection('cartera'));await page.screenshot({path:path.join(out,'portfolio-comparison.png'),fullPage:true});await page.setViewportSize({width:390,height:844});await page.waitForTimeout(500);const width=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}));assert.ok(width.document<=width.viewport+2,JSON.stringify(width));await page.screenshot({path:path.join(out,'portfolio-comparison-mobile.png'),fullPage:true});}
  console.log(JSON.stringify({assets:compared.assets,rows:compared.rows,errors}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
