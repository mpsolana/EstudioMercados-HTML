const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),outbound=[],errors=[];
  page.on('request',req=>{if(/^https?:/.test(req.url()))outbound.push(req.url());});
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(pathToFileURL(path.resolve(__dirname,'../local.html')).href,{waitUntil:'load'});
  await page.waitForFunction(()=>window.APP_CONFIDENTIAL&&typeof SharedData!=='undefined'&&typeof OverviewPanel!=='undefined'&&window.XLSX&&window.Plotly);
  await page.evaluate(async()=>{
   const file=(name,sheets)=>{const book=XLSX.utils.book_new();for(const [sheet,rows] of Object.entries(sheets))XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(rows),sheet);return new File([XLSX.write(book,{type:'array',bookType:'xlsx'})],name,{lastModified:1700000000000});};
   const header=Array(65).fill(null);header[2]='CUENTA (Inversis)';header[49]='PERFIL GESTION ID';
   const row=Array(65).fill(null);row[1]='Cliente sintético';row[2]='ACCT1';row[49]='EQUILIBRADO';row[55]='GDC';row[60]='TEST';
   await SharedData.scan('control',[file('Control.xlsx',{'Control DNI & TEST':[[],[],header,row]})]);
   await SharedData.scan('bbdd',[
    file('Posis.xlsx',{Sheet1:[['ISIN','INSTRUMENT','ACCOUNT','DIV INSTITUTION COUNTER VALUE'],['ES0000000001','Fondo sintético','ACCT1',1000]]}),
    file('Saldos.xlsx',{Sheet1:[['TRANSACTIONAL ACCOUNT','ACCOUNT','BALANCE','CURRENCY'],['CASH1','SUB1',200,'EUR']]})
   ]);
  });
  // Refresh re-renders candidates without replacing active financial data.
  await page.getByRole('button',{name:'Revisar cambios'}).click();
  await page.getByRole('button',{name:'Cargar selección'}).click();
  await page.waitForFunction(()=>SharedData.state.notice.startsWith('Carga completada'));
  assert.equal(await page.evaluate(()=>OverviewPanel.state.clients.length),1);
  assert.equal(await page.evaluate(()=>OverviewPanel.state.positions.length),1);
  assert.equal(await page.evaluate(()=>OverviewPanel.state.balances.length),1);
  assert.equal(await page.evaluate(()=>Object.keys(SharedData.state.loaded).length),3);
  assert.ok(await page.evaluate(()=>SharedData.state.batch.length>10));
  assert.equal(await page.evaluate(async()=>{try{await fetch('https://example.com/private');return false;}catch{return true;}}),true);
  assert.equal(await page.evaluate(()=>{try{new XMLHttpRequest().open('POST','https://example.com');return false;}catch{return true;}}),true);
  // Exercise actual manual file input, used when directory handles are unavailable.
  await page.evaluate(()=>{window.showDirectoryPicker=undefined;});
  const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Vincular BBDD',exact:true}).click();
  const input=await chooser;assert.equal(input.isMultiple(),true);
  const fs=require('node:fs'),folder=path.resolve(__dirname,'../test-results/shared-fallback');fs.mkdirSync(folder,{recursive:true});
  const bytes=await page.evaluate(()=>{const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['TRANSACTIONAL ACCOUNT','BALANCE','CURRENCY'],['CASH2',100,'EUR']]),'Sheet1');return [...new Uint8Array(XLSX.write(book,{type:'array',bookType:'xlsx'}))];});
  fs.writeFileSync(path.join(folder,'Balance.xlsx'),Buffer.from(bytes));
  fs.mkdirSync(path.join(folder,'nested'),{recursive:true});fs.writeFileSync(path.join(folder,'nested','ignored.xlsx'),'ignored');
  await input.setFiles(folder);
  await page.waitForFunction(()=>!SharedData.state.busy);
  assert.equal(await page.evaluate(()=>SharedData.state.candidates.filter(row=>row.source==='bbdd').length),1);
  // Directory API contract: read-only, no recursion, and reject a changed source
  // before applying any of the selected imports.
  await page.evaluate(()=>{
   let file=SharedData.state.candidates.find(row=>row.source==='bbdd').file;
   const original=file;window.sharedPickerOptions=null;
   window.showDirectoryPicker=async options=>{window.sharedPickerOptions=options;return {name:'BBDD de prueba',queryPermission:async()=> 'granted',async *entries(){yield [file.name,{kind:'file',getFile:async()=>file}];yield ['nested',{kind:'directory'}];},getFileHandle:async()=>({getFile:async()=>file})};};
   window.changeSharedSource=()=>{file=new File(['changed'],original.name);};
  });
  await page.getByRole('button',{name:'Vincular BBDD',exact:true}).click();
  await page.waitForFunction(()=>!SharedData.state.busy&&SharedData.state.sources.get('bbdd')?.handle);
  assert.equal(await page.evaluate(()=>window.sharedPickerOptions.mode),'read');
  await page.evaluate(()=>window.changeSharedSource());
  await page.getByRole('button',{name:'Cargar selección'}).click();
  await page.waitForFunction(()=>!SharedData.state.busy);
  assert.match(await page.evaluate(()=>SharedData.state.notice),/cambiado durante la revisión/);
  assert.equal(await page.evaluate(()=>OverviewPanel.state.balances[0].amount),200);
  const download=page.waitForEvent('download');
  await page.evaluate(()=>ReportDesign.downloadPdf('<html><body><h1>Informe sintético</h1><table><tr><td>Prueba</td><td>100 EUR</td></tr></table></body></html>','prueba-local.pdf'));
  const pdf=await download;assert.match(pdf.suggestedFilename(),/\.pdf$/);
  assert.deepEqual(outbound,[]);
  const blockedRequest=page.waitForEvent('requestfailed',{predicate:request=>request.url()==='https://example.com/csp-probe.png'});
  const violation=await page.evaluate(()=>new Promise(resolve=>{
   const image=document.createElement('img');
   document.addEventListener('securitypolicyviolation',event=>{image.remove();resolve(event.effectiveDirective);},{once:true});
   image.src='https://example.com/csp-probe.png';document.body.append(image);
  }));
  assert.equal(violation,'img-src');
  assert.match((await blockedRequest).failure().errorText,/^(?:csp|net::ERR_BLOCKED_BY_CSP)$/i);
  assert.deepEqual(outbound,['https://example.com/csp-probe.png']);
  assert.deepEqual(errors,[]);
  if(process.env.SHARED_SCREENSHOT)await page.screenshot({path:process.env.SHARED_SCREENSHOT});
  console.log('Local edition: imports, fallback picker, provenance and no outbound HTTP requests verified.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
