const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {pathToFileURL}=require('node:url');

(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  if(process.env.RATE_TEST_LIB_DIR)await page.route('https://**/*',route=>{
   const url=route.request().url();
   const file=url.includes('cdn.tailwindcss.com')?'mandate-tailwind.js':url.endsWith('/plotly.min.js')?'mandate-plotly-alt.js':url.endsWith('/xlsx.full.min.js')?'mandate-xlsx.cjs':url.endsWith('/math.min.js')?'mandate-math.js':null;
   return file?route.fulfill({path:path.join(process.env.RATE_TEST_LIB_DIR,file),contentType:'application/javascript'}):route.abort();
  });
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>Boolean(window.Plotly&&window.XLSX));
  await page.evaluate(()=>{switchSection('cartera');PortfolioWorkspace.scope='initial';PortfolioWorkspace.step='rates';portfolioWorkflowRefresh();});
  const panel=page.locator('#workspaceInitialRates');
  const fill=async(name,value)=>panel.locator('form').first().locator(`[name="${name}"]`).fill(value);
  for(const [name,value] of Object.entries({value:'350000',rf:'90',duration:'2.5',ytm:'4',shock:'50',cutoff:'2026-10-05',goal:'200000'}))await fill(name,value);
  assert.equal(await panel.locator('.rate-simple,#initialRateScenarioChart,.initial-rate-table').count(),0);
  assert.equal(await panel.locator('[name=duration]').count(),1);
  assert.equal(await panel.locator('#initialRateCurve').isVisible(),true);
  assert.equal(await panel.locator('#initialSpreadCurve').isVisible(),false);
  assert.equal(await panel.locator('#initialCombinedHeat').isVisible(),false);
  const report=panel.locator('[data-rate-sensitivity-report]');
  assert.doesNotMatch(await report.locator('thead').innerText(),/Crédito RF/);
  assert.equal(await report.locator('tbody tr').count(),9);
  assert.equal(await panel.locator('[data-sensitivity]').evaluate(el=>el.data[0].text.length),9);
  assert.equal(await panel.locator('#initialRateWaterfall').evaluate(el=>el.data[0].text.length),2);
  await fill('spreadDuration','2.3');await fill('spreadShock','50');
  assert.equal(await panel.locator('#initialCombinedHeat').isVisible(),true);
  assert.match(await report.locator('thead').innerText(),/Crédito RF/);
  const matrix=await panel.locator('#initialCombinedHeat').evaluate(el=>({annotations:el.layout.annotations,scale:el.data[0].colorscale}));
  assert.equal(matrix.annotations.length,25);
  assert(matrix.annotations.every(note=>/%$/.test(note.text)));
  assert.deepEqual(matrix.scale,[[0,'#526372'],[.5,'#fff'],[1,'#1e527d']]);
  assert.equal(await panel.locator('#initialRateWaterfall').evaluate(el=>el.data[0].text.length),3);
  await panel.locator('#initialRateCarry').check();
  assert.equal(await panel.locator('#initialRateWaterfall').evaluate(el=>el.data[0].text.length),4);
  assert.match(await report.locator('tbody tr').nth(4).innerText(),/-3\.622,50/);
  for(const [name,value] of Object.entries({netYieldPct:'3.8',convexity:'12',governmentPct:'50',igPct:'40',hyPct:'10',igSpreadDuration:'4',hySpreadDuration:'3.5'}))await fill(name,value);
  assert.equal(await panel.locator('[data-macro-report] tbody tr').count(),4);
  assert.equal(await panel.locator('[data-macro-chart]').evaluate(el=>el.data.at(-1).text.length),4);
  // All standalone settings precede the first result. Per-asset sale assumptions remain next to their positions.
  assert.equal(await panel.evaluate(el=>{
   const form=el.querySelector('#workspacePortfolioMandate>section>form'),results=el.querySelector('[data-dashboard]');
   return Boolean(form.compareDocumentPosition(results)&Node.DOCUMENT_POSITION_FOLLOWING);
  }),true);
  const downloadPromise=page.waitForEvent('download');await panel.locator('[data-rate-export="xlsx"]').click();
  const download=await downloadPromise;
  const exported=await page.evaluate(bytes=>{
   const book=XLSX.read(new Uint8Array(bytes),{type:'array'});
   return XLSX.utils.sheet_to_json(book.Sheets.Sensibilidad,{header:1});
  },[...fs.readFileSync(await download.path())]);
  assert.equal(exported.length,10);
  assert(exported[0].includes('Impacto crédito RF (%)'));
  assert(Math.abs(exported[5][4]+3622.5)<1e-8);
  const pdf=await page.evaluate(async()=>{
   const original=ReportDesign.downloadPdf;let output;
   ReportDesign.downloadPdf=async(html,name)=>{output={html,name};};
   try{await exportInitialRateSensitivity('pdf');return output;}finally{ReportDesign.downloadPdf=original;}
  });
  assert.equal(pdf.name,'Sensibilidad-RF.pdf');
  assert.match(pdf.html,/Stress testing prospectivo/);
  assert.doesNotMatch(pdf.html,/id="initialMacroRateChart"/);
  assert((pdf.html.match(/<figure>/g)||[]).length>=4);
  if(process.env.RATE_SCREENSHOT_DIR){
   await panel.locator('.rate-visual-grid').screenshot({path:path.join(process.env.RATE_SCREENSHOT_DIR,'rates-risk-desktop.png')});
   await report.screenshot({path:path.join(process.env.RATE_SCREENSHOT_DIR,'rates-integrated-sensitivity.png')});
  }
  await fill('spreadDuration','');
  assert.equal(await panel.locator('#initialCombinedHeat').isVisible(),false);
  assert.doesNotMatch(await report.locator('thead').innerText(),/Crédito RF/);
  await fill('spreadDuration','2.3');
  await page.setViewportSize({width:390,height:850});
  await page.evaluate(async()=>{for(const chart of document.querySelectorAll('#workspaceInitialRates .js-plotly-plot'))if(chart.getBoundingClientRect().width)await Plotly.Plots.resize(chart);});
  assert.equal(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
  if(process.env.RATE_SCREENSHOT_DIR)await panel.locator('.rate-visual-grid').screenshot({path:path.join(process.env.RATE_SCREENSHOT_DIR,'rates-risk-mobile.png')});
  await fill('duration','');
  assert.equal(await panel.locator('#initialRateWaterfall .main-svg').count(),0);
  const legacyInputs=await panel.locator('form').first().evaluate(form=>Object.fromEntries([...form.elements].filter(field=>field.name).map(field=>[field.name,field.value])));
  delete legacyInputs.spreadDuration;delete legacyInputs.spreadShock;
  await panel.locator('[data-load]').setInputFiles({name:'supuestos-v5.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:5,inputs:legacyInputs}))});
  await panel.getByText('Supuestos cargados. Carga los extractos de esta cartera.',{exact:true}).waitFor();
  assert.equal(await panel.locator('[name=value]').inputValue(),'350000');
  await page.evaluate(()=>{
   initialRatePositions=[{isin:'TEST',name:'RF prueba',weight:60,rateDuration:2,spreadDuration:3,ytmPct:4,source:'Manual'}];
   renderInitialRatePositions();
  });
  await panel.locator('#initialRateMode').selectOption('positions');
  await panel.locator('[data-rate-position="0"][data-rate-field="rateDuration"]').fill('3');
  assert.equal(await panel.locator('[name=duration]').inputValue(),'3');
  assert.equal(await panel.locator('[name=rf]').inputValue(),'60');
  assert.equal(await panel.locator('[name=spreadDuration]').inputValue(),'3');
  assert.deepEqual(errors,[]);
  console.log('Rates browser OK: shared fields, removed duplicates, optional spreads, labelled matrix and waterfall, macro, Excel and mobile layout.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
