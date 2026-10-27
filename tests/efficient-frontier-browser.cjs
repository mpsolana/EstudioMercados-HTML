const {chromium}=require('playwright');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const os=require('node:os');
const fs=require('node:fs');

(async()=>{
    const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'});
    try{
        const page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});
        await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
        await page.waitForFunction(()=>document.querySelector('#workspaceIndividualFrontier')&&typeof PortfolioAllocation==='object');
        const imported=await page.evaluate(()=>{
            const workbook=XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([
                ['Date','ES0123456789','ES0123456797','ES0123456805','Comentario'],
                ['2021-01-31',100,100,100,'no es una serie'],
                ['2021-02-28',101,99,102,'texto']
            ]),'prices');
            const entries=[{ticker:'ES0123456789',weight:1,name:'Origen'}];
            const portfolio=priceSheetToSeriesMap(workbook,'prices',entries);
            const all=allPriceSeriesFromSheet(workbook,'prices',entries,portfolio);
            return {ids:Object.keys(all).sort(),origin:all['ES0123456789'].label,proposed:all['ES0123456805'].data.length};
        });
        if(imported.ids.join(',')!=='ES0123456789,ES0123456797,ES0123456805'||imported.origin!=='Origen'||imported.proposed!==2)throw new Error('Maestro no conserva todos los ISIN de prices para la frontera.');
        await page.evaluate(()=>{
            switchSection('cartera');
            const ids=['ES0123456789','ES0123456797','ES0123456805'];
            const funds=ids.map((isin,i)=>({isin,name:['RF Europa','RV Global','Mixto Global'][i],category:['Bond','Equity','Allocation'][i],score:3,ter:.4}));
            fundUniverseState={records:funds,isinIndex:new Map(funds.map(fund=>[fund.isin,fund]))};
            const prices=Object.fromEntries(ids.map((isin,j)=>{let price=100;return [isin,{data:Array.from({length:73},(_,i)=>{if(i)price*=1+.004+j*.001+.008*Math.sin(i*(.7+j*.12));return {date:new Date(2021,i,28),price};})}];}));
            window.masterPriceSeries=prices;window.masterBenchmarks={};window.masterPriceVersion=(window.masterPriceVersion||0)+1;
            fundPortfolioRows=[{isin:ids[0],name:funds[0].name,weight:60},{isin:ids[1],name:funds[1].name,weight:40}];
            PortfolioWorkspace.scope='individual';PortfolioWorkspace.step='frontier';portfolioWorkflowRefresh();
        });
        await page.locator('#initialFrontierCalculate').click();
        await page.waitForFunction(()=>EfficientFrontierView.result?.frontier?.length>=20);
        if(await page.locator('#initialFrontierSummary tbody tr').count()<3)throw new Error('Faltan las carteras de referencia y el objetivo.');
        if(await page.locator('#initialFrontierWeights tbody tr').count()!==2)throw new Error('Faltan pesos actuales y objetivo.');
        if(!await page.evaluate(()=>EfficientFrontierView.result?.annualCorrelation?.years>=4))throw new Error('Falta correlación anual no solapada.');
        if(!await page.evaluate(()=>document.querySelector('#initialFrontierChart').data?.[0]?.mode==='lines+markers'))throw new Error('Faltan los puntos de la frontera.');
        await page.locator('#initialFrontierObjective').selectOption('sameReturn');
        if(!await page.locator('#initialFrontierObjectiveNote').textContent())throw new Error('Falta la explicación del objetivo alternativo.');
        await page.locator('#initialFrontierObjective').selectOption('sameRisk');
        await page.locator('#workspaceIndividualFrontier').screenshot({path:path.join(os.tmpdir(),'individual-frontier-desktop.png')});
        await page.locator('#initialFrontierMode').selectOption('assumptions');
        await page.locator('#initialFrontierCalculate').click();
        await page.locator('[data-frontier-expected]').first().fill('18');
        await page.locator('[data-frontier-expected]').first().dispatchEvent('change');
        await page.locator('#initialFrontierCalculate').click();
        if(!await page.evaluate(()=>EfficientFrontierView.result?.assets[0]?.expectedReturn===18))throw new Error('No se aplica el retorno supuesto.');
        const html=await page.evaluate(()=>EfficientFrontierView.reportSection());
        if(!html.includes('data:image/png'))throw new Error('El informe opcional no incluye la gráfica.');
        const [download]=await Promise.all([page.waitForEvent('download',{timeout:90000}),page.evaluate(async()=>ReportDesign.downloadPdf(`<html><body class="report manager-report">${await EfficientFrontierView.reportSection()}</body></html>`,'Frontera-individual.pdf'))]);
        const pdf=path.join(os.tmpdir(),'individual-frontier-report.pdf');await download.saveAs(pdf);
        if(fs.statSync(pdf).size<3000)throw new Error('El PDF individual no contiene la frontera.');
        await page.setViewportSize({width:390,height:844});
        await page.evaluate(async()=>{window.dispatchEvent(new Event('resize'));await Plotly.Plots.resize(document.getElementById('initialFrontierChart'));});
        await page.waitForTimeout(300);
        if(await page.locator('#initialFrontierChart svg').count()<2)throw new Error('La gráfica móvil quedó vacía tras editar las hipótesis.');
        await page.locator('#workspaceIndividualFrontier').screenshot({path:path.join(os.tmpdir(),'individual-frontier-mobile.png')});
        await page.locator('#initialFrontierChart').screenshot({path:path.join(os.tmpdir(),'initial-frontier-mobile-chart.png')});
        process.stdout.write('Frontera Maestro en cartera individual, hipótesis y capturas desktop/mobile OK.\n');
    }finally{await browser.close();}
})().catch(error=>{process.stderr.write(error.stack+'\n');process.exitCode=1;});
