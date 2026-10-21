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
        await page.waitForFunction(()=>document.querySelector('#gdcAllocationSummary')&&typeof GdcModel!=='undefined');
        await page.evaluate(()=>{
            switchSection('cartera');
            const funds=[{isin:'AAA',name:'RF Europa A',category:'EUR Government Bond',score:3.1,ter:.35},{isin:'BBB',name:'RV Global B',category:'Global Equity',score:3.5,ter:.65}];
            fundUniverseState={records:funds,isinIndex:new Map(funds.map(item=>[item.isin,item]))};
            GdcModel.state.models=ModelPortfolioCore.parseGrid([['Categoría','Subcategoría','Prudente','Decidido'],['RF EUR','EUR Government Bond',70,40],['RV Global','Global Equity',30,60]]);
            GdcModel.state.models.forEach(portfolio=>{portfolio.rows[0].proposedPositions=[{isin:'AAA',share:100}];portfolio.rows[1].proposedPositions=[{isin:'BBB',share:100}];});
            GdcModel.state.benchmarkMeta={BA:{name:'Índice RF',assetClass:'RF EUR'},BB:{name:'Índice RV',assetClass:'RV Global'}};
            GdcModel.state.source='Prueba visual';GdcModel.state.views={'rf eur':{view:'UW',comment:'Duración corta'},'rv global':{view:'OW',comment:'Preferencia por RV'}};
            GdcModel.render();PortfolioWorkspace.scope='model';portfolioWorkflowRefresh();
        });
        const summary=page.locator('#gdcAllocationSummary');
        await summary.waitFor({state:'visible'});
        if(await summary.locator('text=Fondos en cartera').count()!==1||await page.locator('.gdc-view-ow').count()<1||await page.locator('.gdc-view-uw').count()<1)throw new Error('Faltan métricas o indicadores de view.');
        await summary.screenshot({path:path.join(os.tmpdir(),'gdc-committee-summary.png')});
        await page.locator('#gdcCommitteeReport').click();
        if(await page.locator('.gdc-sticky').evaluate(node=>getComputedStyle(node).position)!=='static')throw new Error('El encabezado fijo tapa el informe abierto.');
        const frame=page.frameLocator('#gdcReportPreview iframe');
        await frame.locator('text=Resumen de perfiles').first().waitFor({timeout:20000});
        if(await frame.locator('text=Fondos finales').count()!==2)throw new Error('El informe no incluye los dos perfiles.');
        await frame.locator('.report').screenshot({path:path.join(os.tmpdir(),'gdc-committee-report.png')});
        const [download]=await Promise.all([page.waitForEvent('download',{timeout:90000}),page.locator('#gdcCommitteePdf').click()]);
        const pdf=path.join(os.tmpdir(),'gdc-committee-test.pdf');await download.saveAs(pdf);
        if(fs.statSync(pdf).size<1500)throw new Error('El PDF del comité está vacío.');
        process.stdout.write(`GDC committee UI and PDF OK: ${pdf}\n`);
    }finally{await browser.close();}
})().catch(error=>{process.stderr.write(`${error.stack}\n`);process.exitCode=1;});
