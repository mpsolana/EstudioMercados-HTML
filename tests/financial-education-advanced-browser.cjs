const {chromium}=require('playwright');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const os=require('node:os');

(async()=>{
    const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'});
    try{
        const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
        page.on('pageerror',error=>errors.push(error.message));
        await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
        await page.evaluate(()=>switchSection('ayuda'));
        const order=await page.locator('#section-ayuda>.container>div').evaluateAll(nodes=>nodes.map(node=>node.id||node.querySelector('h2')?.textContent?.trim()));
        if(order.at(-1)!=='financialEducation')throw new Error('Educación financiera no está debajo de la explicación de Ayuda.');
        const tabs=[['growth','eduGrowthNote','eduCrossoverChart'],['beta','eduBetaNote','eduBetaChart'],['irr','eduIrrNote','eduIrrChart'],['fees','eduFeeNote','eduFeeChart'],['mix','eduMixNote','eduMixChart'],['fire','eduFireNote','eduFireChart'],['emergency','eduEmergencyNote','eduEmergencyChart'],['monte','eduMcNote','eduMcChart'],['rentbuy','eduHomeNote','eduHomeChart'],['procrastination','eduDelayNote','eduDelayChart'],['latte','eduLatteNote','eduLatteChart'],['debt','eduDebtNote','eduDebtChart']];
        for(const [name,note,chart] of tabs){
            await page.locator(`[data-edu-tab="${name}"]`).click();
            await page.waitForFunction(id=>document.getElementById(id)?.querySelector('svg'),chart);
            if(!(await page.locator('#'+note).textContent())?.trim())throw new Error(`Nota ausente en ${name}.`);
        }
        await page.locator('[data-edu-tab="growth"]').click();
        await page.locator('#eduMonthlyRange').fill('1000');
        if(await page.locator('#eduMonthly').inputValue()!=='1000'||!await page.locator('#eduGrowthNote').textContent().then(text=>text.includes('Cruce')))throw new Error('El slider no actualiza el cruce de intereses.');
        await page.locator('[data-edu-tab="irr"]').click();
        if(!await page.locator('#eduIrrNote').textContent().then(text=>text.includes('VAN')))throw new Error('Falta VAN junto a TIR.');
        await page.locator('[data-edu-tab="rentbuy"]').click();
        await page.screenshot({path:path.join(os.tmpdir(),'education-rent-buy-desktop.png')});
        await page.setViewportSize({width:390,height:844});
        for(const name of ['mix','monte','rentbuy','debt']){
            await page.locator(`[data-edu-tab="${name}"]`).click();
            await page.waitForTimeout(250);
            const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
            if(size.scroll>size.width+2)throw new Error(`Desbordamiento móvil en ${name}: ${JSON.stringify(size)}`);
        }
        await page.screenshot({path:path.join(os.tmpdir(),'education-debt-mobile.png')});
        if(errors.length)throw new Error('Errores de navegador: '+errors.join('; '));
        console.log('Ayuda, 12 dashboards, sliders, VAN y responsive desktop/móvil OK.');
    }finally{await browser.close();}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
