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
        await page.waitForFunction(()=>document.querySelector('#workspaceInitialFrontier')&&typeof PortfolioAllocation==='object');
        await page.evaluate(()=>{
            switchSection('cartera');
            const ids=['ES0123456789','ES0123456797','ES0123456805'];
            const funds=ids.map((isin,i)=>({isin,name:['RF Europa','RV Global','Mixto Global'][i],category:['Bond','Equity','Allocation'][i],score:3,ter:.4}));
            fundUniverseState={records:funds,isinIndex:new Map(funds.map(fund=>[fund.isin,fund]))};
            const prices=Object.fromEntries(ids.map((isin,j)=>{let price=100;return [isin,{data:Array.from({length:49},(_,i)=>{if(i)price*=1+.004+j*.001+.008*Math.sin(i*(.7+j*.12));return {date:new Date(2021,i,28),price};})}];}));
            loadedPortfolio={sourceLabel:'Prueba visual',priceSeries:prices,benchmarks:{}};
            fundProposalState.rows=[{isin:ids[0],weight:60,current:funds[0],proposed:funds[0]},{isin:ids[1],weight:40,current:funds[1],proposed:funds[2]}];
            PortfolioWorkspace.scope='initial';PortfolioWorkspace.step='frontier';portfolioWorkflowRefresh();
        });
        await page.locator('#initialFrontierCalculate').click();
        await page.waitForFunction(()=>EfficientFrontierView.result?.frontier?.length>=20);
        if(await page.locator('#initialFrontierSummary tbody tr').count()!==2)throw new Error('Faltan las carteras de origen o propuesta.');
        await page.locator('#workspaceInitialFrontier').screenshot({path:path.join(os.tmpdir(),'initial-frontier-desktop.png')});
        await page.locator('#initialFrontierMode').selectOption('assumptions');
        await page.locator('#initialFrontierCalculate').click();
        await page.locator('[data-frontier-expected]').first().fill('18');
        await page.locator('[data-frontier-expected]').first().dispatchEvent('change');
        await page.locator('#initialFrontierCalculate').click();
        if(!await page.evaluate(()=>EfficientFrontierView.result?.assets[0]?.expectedReturn===18))throw new Error('No se aplica el retorno supuesto.');
        const html=await page.evaluate(()=>EfficientFrontierView.reportSection());
        if(!html.includes('data:image/png'))throw new Error('El informe opcional no incluye la gráfica.');
        await page.evaluate(()=>{
            document.querySelectorAll('[data-report-block]').forEach(input=>{input.checked=input.dataset.reportBlock==='frontier';input.dispatchEvent(new Event('change',{bubbles:true}));});
        });
        await page.evaluate(()=>ReportControls.generateInitial());
        if(!await page.evaluate(()=>fundProposalState.reportHtml?.includes('frontera eficiente')&&fundProposalState.reportHtml?.includes('data:image/png')))throw new Error('El informe inicial no integra la frontera seleccionada.');
        const [download]=await Promise.all([page.waitForEvent('download',{timeout:90000}),page.evaluate(()=>ReportDesign.downloadPdf(fundProposalState.reportHtml,'Frontera-inicial.pdf'))]);
        const pdf=path.join(os.tmpdir(),'initial-frontier-report.pdf');await download.saveAs(pdf);
        if(fs.statSync(pdf).size<3000)throw new Error('El PDF inicial no contiene el informe.');
        await page.setViewportSize({width:390,height:844});
        await page.evaluate(async()=>{window.dispatchEvent(new Event('resize'));await Plotly.Plots.resize(document.getElementById('initialFrontierChart'));});
        await page.waitForTimeout(300);
        if(await page.locator('#initialFrontierChart svg').count()<2)throw new Error('La gráfica móvil quedó vacía tras editar las hipótesis.');
        await page.locator('#workspaceInitialFrontier').screenshot({path:path.join(os.tmpdir(),'initial-frontier-mobile.png')});
        await page.locator('#initialFrontierChart').screenshot({path:path.join(os.tmpdir(),'initial-frontier-mobile-chart.png')});
        process.stdout.write('Frontera histórica, hipótesis, informe y capturas desktop/mobile OK.\n');
    }finally{await browser.close();}
})().catch(error=>{process.stderr.write(error.stack+'\n');process.exitCode=1;});
