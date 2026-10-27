const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {pathToFileURL}=require('node:url');

(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
  await page.evaluate(()=>{
   switchSection('cartera');PortfolioWorkspace.scope='initial';PortfolioWorkspace.step='rates';portfolioWorkflowRefresh();
   const panel=document.getElementById('workspaceInitialRates');
   for(const [id,value] of [['initialRateAmount','100000'],['initialRateWeight','60'],['initialRateDuration','4']]){
    const input=panel.querySelector('#'+id);input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));
   }
  });
  await page.waitForFunction(()=>document.querySelectorAll('#initialSimpleRateBody tr').length===7);
  assert.ok(await page.locator('#initialSimpleRateChart .main-svg').count()>0);
  assert.match(await page.locator('#initialSimpleRateBody').textContent(),/104.800,00/);
  const downloadPromise=page.waitForEvent('download');
  await page.locator('[data-rate-export="xlsx"]').click();
  const download=await downloadPromise;
  const rows=await page.evaluate(bytes=>{const book=XLSX.read(new Uint8Array(bytes),{type:'array'});return XLSX.utils.sheet_to_json(book.Sheets['Sensibilidad simple'],{header:1});},[...fs.readFileSync(await download.path())]);
  assert.equal(rows.length,8);
  assert.equal(rows[1][0],-200);
  assert.equal(rows[1][4],104800);
  await page.evaluate(()=>document.getElementById('initialRateResetScenarios').click());
  assert.equal(await page.locator('#initialSimpleRateBody tr').count(),7);
  assert.ok(await page.locator('#initialSimpleRateChart .main-svg').count()>0);
  await page.evaluate(()=>{const input=document.querySelector('#initialRateShock');input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.equal(await page.locator('#initialSimpleRateBody tr').count(),7);
  await page.evaluate(()=>{const input=document.querySelector('#initialRateDuration');input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.equal(await page.locator('#initialSimpleRateBody tr').count(),0);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({scenarios:rows.length-1,errors}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
