const {chromium}=require('playwright');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const assert=require('node:assert/strict');

(async()=>{
    const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'});
    try{
        const page=await browser.newPage({viewport:{width:1200,height:900}});
        await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
        await page.waitForFunction(()=>typeof renderRollingVolatility==='function'&&typeof calculateRollingStats==='function'&&window.Plotly);
        const result=await page.evaluate(async()=>{
            const data=Array.from({length:600},(_,i)=>({date:new Date(Date.UTC(2023,0,1+i)).toISOString().slice(0,10),price:100*Math.exp(i*.0002+Math.sin(i/13)*.04)}));
            renderBarChart(calculateRollingStats(data,'D'));
            renderRollingVolatility(data,'D');
            await Promise.all(['rollingAnnualizedChart','rollingVolatilityChart'].map(id=>new Promise(resolve=>{
                const chart=document.getElementById(id);
                if(chart.data?.length)return resolve();
                chart.on('plotly_afterplot',resolve);
            })));
            const annual=document.getElementById('rollingAnnualizedChart');
            const volatility=document.getElementById('rollingVolatilityChart');
            return {annualTraces:annual.data.length,labels:annual.data.slice(1).flatMap(trace=>trace.text||[]),points:volatility.data[0].x.length,positive:volatility.data[0].y.every(value=>Number.isFinite(value)&&value>0)};
        });
        assert.equal(result.annualTraces,4);
        assert.ok(result.labels.length>0);
        assert.ok(result.labels.every(label=>/%$/.test(label)));
        assert.ok(result.points>100);
        assert.ok(result.positive);
        process.stdout.write('Rolling: volatilidad móvil y etiquetas mín/media/máx OK.\n');
    }finally{await browser.close();}
})().catch(error=>{process.stderr.write(error.stack+'\n');process.exitCode=1;});
