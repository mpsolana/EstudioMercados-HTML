const {chromium}=require('playwright');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const os=require('node:os');
const assert=require('node:assert/strict');

(async()=>{
    const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'});
    try{
        const page=await browser.newPage({viewport:{width:1440,height:900}});
        await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
        await page.waitForFunction(()=>window.Plotly&&typeof MarketDrawdown!=='undefined');
        await page.locator('#section-btn-mercados').click();
        await page.evaluate(()=>{
            const series=[100,95,80,86,100,104].map((price,index)=>({date:new Date(2026,0,index+1),price}));
            globalIndicesData[marketIndices[0].s]=series;
            document.getElementById('marketDrawdownGroup').value='indices';
            renderMarketDrawdown();
        });
        await page.waitForFunction(()=>Boolean(document.querySelector('#marketDrawdownScatter svg')));
        assert.ok((await page.locator('#marketDrawdownNote').innerText()).includes('días naturales'));
        await page.locator('#marketDrawdownScatter').screenshot({path:path.join(os.tmpdir(),'market-drawdown-scatter.png')});
        await page.locator('#marketDrawdownHistory').screenshot({path:path.join(os.tmpdir(),'market-drawdown-history.png')});
        process.stdout.write('Market drawdown charts rendered.\n');
    }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
