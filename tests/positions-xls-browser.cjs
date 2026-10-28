const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');

(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'});
 try{
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
  const result=await page.evaluate(async()=>{
   switchSection('cartera');
   const book=XLSX.utils.book_new();
   XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([
    ['Security Code','Security Name','Investment Account','INVERSIS ACCOUNT NUMBER','Market Value','Product Type','Type of Asset','Balance Type'],
    ['ES0000000001','Fund A','Client A','P1',500,'Investment Fund','International Funds','Available'],
    ['ES0000000002','Fund B','Client A','P1',100,'Mutual Fund','International Funds','IMMOBILIZED'],
    ['ES0000000003','Fund C','Client A','P1',200,'Fund','International Funds','Available']
   ]),'Positions');
   const bytes=XLSX.write(book,{bookType:'biff8',type:'array'});
   await importAggregatePositionsFile(new File([bytes],'positions.xls',{type:'application/vnd.ms-excel'}));
   return {positions:OverviewPanel.state.positions.map(row=>row.isin),aggregate:aggregatePositionsState.aggregated.map(row=>row.isin),amount:OverviewPanel.state.positions.reduce((sum,row)=>sum+row.amount,0)};
  });
  assert.deepEqual(result.positions,['ES0000000001','ES0000000003']);
  assert.deepEqual(result.aggregate,['ES0000000001','ES0000000003']);
  assert.equal(result.amount,700);
  assert.deepEqual(errors,[]);
  console.log('Excel BIFF8 .xls with English headers and immobilized rows imported correctly.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
