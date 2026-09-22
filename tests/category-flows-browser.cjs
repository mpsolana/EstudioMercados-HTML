const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {pathToFileURL}=require('node:url');
(async()=>{
    const out=process.env.BROWSER_OUTPUT_DIR;fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({headless:true});
    try{
        const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
        await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
        await page.evaluate(async()=>{
            switchSection('cartera');PortfolioWorkspace.scope='initial';PortfolioWorkspace.step='proposal';portfolioWorkflowRefresh();
            const record=(isin,name,category)=>({isin,name,category,ter:1,score:4});
            fundProposalState.rows=[{isin:'ES0000000001',weight:35,current:record('ES0000000001','Fondo bonos global','Bonos'),proposed:record('ES0000000002','Fondo renta variable','Acciones')},{isin:'ES0000000003',weight:25,current:record('ES0000000003','Fondo renta fija','Bonos'),proposed:record('ES0000000003','Fondo renta fija','Bonos')},{isin:'ES0000000004',weight:30,current:record('ES0000000004','Fondo acciones','Acciones'),proposed:record('ES0000000005','Fondo monetario','Monetario')},{isin:'ES0000000006',weight:10,current:null,proposed:null}];
            document.getElementById('fundProposalCapital').value='200000';await CategoryFlows.render();
        });
        assert.equal(await page.locator('#fundProposalCategoryFlows .sankey-link').count(),4);
        const values=await page.evaluate(()=>document.getElementById('fundProposalCategoryFlows').data[0].link.value);assert.deepEqual(values,[70000,50000,60000,20000]);
        await page.locator('.category-flows-section').screenshot({path:path.join(out,'sankey-desktop.png')});
        await page.locator('#fundProposalCategoryFlows .sankey-link').first().hover();await page.waitForTimeout(200);assert.match(await page.locator('#fundProposalCategoryFlows').textContent(),/Fondo bonos global/);
        await page.evaluate(async()=>{document.getElementById('fundProposalCapital').value='100000';await CategoryFlows.render();});assert.equal(await page.evaluate(()=>document.getElementById('fundProposalCategoryFlows').data[0].link.value[0]),35000);
        await page.setViewportSize({width:390,height:844});await page.waitForTimeout(400);await page.locator('.category-flows-section').screenshot({path:path.join(out,'sankey-mobile.png')});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
        await page.setViewportSize({width:1440,height:1000});await page.locator('[data-workspace-step="report"]').click();
        for(const box of await page.locator('[data-report-block]').all())await box.uncheck();await page.locator('[data-report-block="flows"]').check();
        await page.evaluate(()=>generateFundProposalReport());assert.ok(await page.evaluate(()=>fundProposalState.reportHtml.includes('Flujos de capital por categorías')));
        const download=page.waitForEvent('download');await page.evaluate(()=>ReportDesign.downloadPdf(fundProposalState.reportHtml,'Flujos.pdf'));await(await download).saveAs(path.join(out,'sankey.pdf'));
        await page.locator('[data-report-block="flows"]').uncheck();await page.evaluate(()=>generateFundProposalReport());assert.equal(await page.evaluate(()=>fundProposalState.reportHtml.includes('Flujos de capital por categorías')),false);
        assert.deepEqual(errors,[]);console.log('Sankey desktop/mobile, AUM updates, hover and optional PDF passed');
    }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
