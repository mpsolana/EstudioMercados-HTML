const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const os=require('node:os');
const {pathToFileURL}=require('node:url');

(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
  const setup=await page.evaluate(()=>{
   switchSection('cartera');
   const dates=Array.from({length:36},(_,i)=>new Date(Date.UTC(2023,i,1)));
   const prices=dates.map((_,i)=>100+i*2-(i>=7&&i<=11?20:0));
   const book=XLSX.utils.book_new(),add=(name,rows)=>XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(rows),name);
   add('Carteras Modelo',[['Categoria','Subcategoria','Prudente','Equilibrado'],['Renta fija','RF Europa',70,55],['Renta variable','RV Global',30,45]]);
   add('bench categ',[['ticker','name','asset class'],['BE','Indice RF Europa','RF Europa'],['EQ','Indice RV Global','RV Global']]);
   add('bench',[['date','BE','EQ'],...dates.map((date,i)=>[date,prices[i],100+i*3-(i>=7&&i<=11?30:0)])]);
   GdcModel.loadWorkbook(book,'benchmark-prueba.xlsx');
   PortfolioWorkspace.scope='model';portfolioWorkflowRefresh();
   return {models:GdcModel.state.models.length,benchmarks:Object.keys(GdcModel.state.benchmarks)};
  });
  await page.waitForFunction(()=>document.querySelector('#gdcBenchmarkRecoveryChart .main-svg'));
  assert.equal(setup.models,2);
  assert.ok(setup.benchmarks.some(key=>key.toUpperCase()==='BE'));
  assert.ok(await page.locator('#gdcBenchmarkDrawdownChart .main-svg').count());
  assert.match(await page.locator('#gdcBenchmarkDrawdownNote').textContent(),/2\/2 benchmarks/);
  assert.ok(await page.locator('#gdcBenchmarkRollingChart .main-svg').count());
  await page.locator('#gdcBenchmarkRollingYears').selectOption('2');
  assert.match(await page.locator('#gdcBenchmarkRollingNote').textContent(),/24 retornos mensuales/);
  const plotted=await page.evaluate(()=>({recovery:document.querySelector('#gdcBenchmarkRecoveryChart').data?.[0],curve:document.querySelector('#gdcBenchmarkDrawdownChart').data?.[0]}));
  assert.ok(plotted.recovery.x[0]>0);
  assert.ok(plotted.recovery.y[0]>0);
  assert.ok(plotted.curve.y.some(value=>value<0));
  await page.locator('.gdc-benchmark-risk').screenshot({path:path.join(os.tmpdir(),'gdc-benchmark-risk-desktop.png')});
  const weights=await page.evaluate(()=>{
   const input=document.querySelector('#gdcBandNumber');input.value='55';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
   const gdcFirst=ModelPortfolioCore.allocation(GdcModel.state.models[0]).portfolioRv;
   GdcModel.state.selected=1;GdcModel.render();
   const second=document.querySelector('#gdcBandNumber');second.value='55';second.dispatchEvent(new Event('input',{bubbles:true}));second.dispatchEvent(new Event('change',{bubbles:true}));
   const gdcSecond=ModelPortfolioCore.allocation(GdcModel.state.models[1]).portfolioRv;
   GdcModel.switchMode('GICI');
   const giciFirst=ModelPortfolioCore.allocation(GdcModel.state.models[0]).portfolioRv;
   const giciInput=document.querySelector('#gdcBandNumber');giciInput.value='45';giciInput.dispatchEvent(new Event('input',{bubbles:true}));giciInput.dispatchEvent(new Event('change',{bubbles:true}));
   const giciAdjusted=ModelPortfolioCore.allocation(GdcModel.state.models[0]).portfolioRv;
   GdcModel.switchMode('GDC');
   const afterGdc=GdcModel.state.models.map(item=>ModelPortfolioCore.allocation(item).portfolioRv);
   GdcModel.switchMode('GICI');
   const afterGici=ModelPortfolioCore.allocation(GdcModel.state.models[0]).portfolioRv;
   return {gdcFirst,gdcSecond,giciFirst,giciAdjusted,afterGdc,afterGici};
  });
  assert.ok(Math.abs(weights.gdcFirst-23.25)<.02,JSON.stringify(weights));
  assert.ok(Math.abs(weights.gdcSecond-41)<.02,JSON.stringify(weights));
  assert.ok(Math.abs(weights.giciAdjusted-21.75)<.02,JSON.stringify(weights));
  assert.ok(Math.abs(weights.afterGdc[0]-weights.gdcFirst)<.02,JSON.stringify(weights));
  assert.ok(Math.abs(weights.afterGdc[1]-weights.gdcSecond)<.02,JSON.stringify(weights));
  assert.ok(Math.abs(weights.afterGici-weights.giciAdjusted)<.02,JSON.stringify(weights));
  const exported=await page.evaluate(()=>{
   GdcModel.switchMode('GDC');
   const original=XLSX.writeFile;
   let rows;
   XLSX.writeFile=book=>{rows=XLSX.utils.sheet_to_json(book.Sheets.Asignacion,{header:1});};
   try{GdcModel.exportExcel();}finally{XLSX.writeFile=original;}
   return rows;
  });
  const selected=exported.filter(row=>row[0]==='Prudente'||row[0]==='Equilibrado');
  const rv=selected.filter(row=>row[1]==='Renta variable');
  assert.ok(rv.some(row=>row[0]==='Prudente'&&Math.abs(row[3]-weights.gdcFirst)<.02),JSON.stringify(rv));
  assert.ok(rv.some(row=>row[0]==='Equilibrado'&&Math.abs(row[3]-weights.gdcSecond)<.02),JSON.stringify(rv));
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({models:setup.models,drawdownPct:plotted.recovery.x[0],recoveryDays:plotted.recovery.y[0],errors}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
