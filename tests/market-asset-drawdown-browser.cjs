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
  const result=await page.evaluate(async()=>{
   let calls=0;
   fetchYahooData=async ticker=>{calls++;return Array.from({length:30},(_,i)=>({date:new Date(Date.UTC(2023,i,1)),price:100+i-(i>=8&&i<=11?22:0)}));};
   await ensureAssetClassesData();
   const firstCalls=calls;
   await ensureAssetClassesData();
   const assets=assetClasses.map(item=>({ticker:item.s,name:item.n,data:globalAssetsData[item.s]}));
   MarketDrawdown.renderIndividual(document.getElementById('individualDrawdownCompare'),'ACTIVO',assets[0].data,assets);
   return {assetCount:assets.length,loaded:assets.filter(item=>item.data.length===30).length,firstCalls,calls};
  });
  assert.equal(result.assetCount,13);
  assert.equal(result.loaded,13);
  assert.equal(result.calls,result.firstCalls);
  assert.equal(await page.locator('#individualDrawdownCompare .main-svg').count()>0,true);
  const traces=await page.evaluate(()=>document.querySelector('#individualDrawdownCompare').data?.map(item=>item.x.length));
  assert.deepEqual(traces,[1,13]);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({assetClasses:result.loaded,errors}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
