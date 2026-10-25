const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');

(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
  const setup=await page.evaluate(()=>{
   switchSection('cartera');
   const dates=Array.from({length:24},(_,i)=>new Date(Date.UTC(2024,i,1)));
   const prices=dates.map((_,i)=>100+i*2-(i>=7&&i<=11?20:0));
   const book=XLSX.utils.book_new(),add=(name,rows)=>XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(rows),name);
   add('Carteras Modelo',[['Categoria','Subcategoria','Prudente'],['Renta fija','RF Europa',100]]);
   add('bench categ',[['ticker','name','asset class'],['BE','Indice RF Europa','RF Europa']]);
   add('bench',[['date','BE'],...dates.map((date,i)=>[date,prices[i]])]);
   GdcModel.loadWorkbook(book,'benchmark-prueba.xlsx');
   PortfolioWorkspace.scope='model';portfolioWorkflowRefresh();
   return {models:GdcModel.state.models.length,benchmarks:Object.keys(GdcModel.state.benchmarks)};
  });
  await page.waitForFunction(()=>document.querySelector('#gdcBenchmarkRecoveryChart .main-svg'));
  assert.equal(setup.models,1);
  assert.ok(setup.benchmarks.some(key=>key.toUpperCase()==='BE'));
  assert.ok(await page.locator('#gdcBenchmarkDrawdownChart .main-svg').count());
  assert.match(await page.locator('#gdcBenchmarkDrawdownNote').textContent(),/1\/1 benchmarks/);
  const plotted=await page.evaluate(()=>({recovery:document.querySelector('#gdcBenchmarkRecoveryChart').data?.[0],curve:document.querySelector('#gdcBenchmarkDrawdownChart').data?.[0]}));
  assert.ok(plotted.recovery.x[0]>0);
  assert.ok(plotted.recovery.y[0]>0);
  assert.ok(plotted.curve.y.some(value=>value<0));
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({models:setup.models,drawdownPct:plotted.recovery.x[0],recoveryDays:plotted.recovery.y[0],errors}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
