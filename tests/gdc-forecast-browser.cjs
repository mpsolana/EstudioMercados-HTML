const {chromium}=require('playwright');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const os=require('node:os');

(async()=>{
    const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'});
    try{
        const page=await browser.newPage({viewport:{width:1440,height:900}});
        await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
        await page.waitForFunction(()=>typeof Plotly!=='undefined'&&typeof GdcModel!=='undefined');
        await page.evaluate(async()=>{
            GdcModel.state.expected={A:{returnPct:8,riskPct:10},B:{returnPct:8.2,riskPct:10.3},C:{returnPct:2,riskPct:0},D:{returnPct:-1,riskPct:5}};
            GdcModel.state.benchmarkMeta={A:{name:'Indice RV global',assetClass:'RV Global'},B:{name:'Indice RV emergente',assetClass:'RV Emergente'},C:{name:'Indice monetario',assetClass:'Monetario EUR'},D:{name:'Indice RF corto',assetClass:'RF EUR Corto'}};
            const chart=document.createElement('div');chart.id='gdcForecastChart';chart.style.cssText='width:1200px;height:540px;background:#fff;margin:30px auto';document.body.replaceChildren(chart);
            await GdcModel.plotForecast(chart);
        });
        const result=await page.evaluate(()=>{
            const plot=document.querySelector('#gdcForecastChart .plot'),markers=[...document.querySelectorAll('#gdcForecastChart .scatterlayer .point')];
            const bounds=plot.getBoundingClientRect();
            return {markers:markers.length,bounds:{top:bounds.top,bottom:bounds.bottom},points:markers.map(marker=>{const box=marker.getBoundingClientRect();return {top:box.top,bottom:box.bottom};}),labels:[...document.querySelectorAll('#gdcForecastChart .scatterlayer text')].map(el=>el.textContent)};
        });
        if(result.markers!==4||!result.labels.some(label=>label.includes('RV Global'))||result.points.some(point=>point.top<result.bounds.top-1||point.bottom>result.bounds.bottom+1))throw new Error(`Grafica recortada o incompleta: ${JSON.stringify(result)}`);
        const output=path.join(os.tmpdir(),'gdc-forecast-visual.png');await page.locator('#gdcForecastChart').screenshot({path:output});
        process.stdout.write(`GDC forecast visual OK: ${output}\n`);
    }finally{await browser.close();}
})().catch(error=>{process.stderr.write(`${error.stack}\n`);process.exitCode=1;});
