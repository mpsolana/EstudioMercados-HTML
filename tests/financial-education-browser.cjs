const {chromium}=require('playwright');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const os=require('node:os');

(async()=>{
    const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'});
    try{
        const page=await browser.newPage({viewport:{width:1365,height:900}}),errors=[];
        page.on('pageerror',error=>errors.push(error.message));
        await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
        await page.evaluate(()=>switchSection('ayuda'));
        await page.locator('[data-edu-tab="tax"]').click();
        await page.waitForFunction(()=>document.querySelector('#eduTaxChart').data?.length===2);
        const base=await page.locator('#eduTaxNote').textContent();
        if(!base.includes('Diferencia neta'))throw new Error('No se calculó el escenario fiscal.');
        await page.locator('#taxTransition').check();
        const initialTax=await page.locator('#eduTaxResults tbody tr:first-child td:nth-child(4)').textContent();
        if(initialTax==='—'||!initialTax.includes('5'))throw new Error('No se grava la plusvalía inicial: '+initialTax);
        await page.locator('#taxClientMode').selectOption('prospect');
        if(await page.locator('#taxBasis').inputValue()!=='100000'||await page.locator('#taxTransition').isChecked())throw new Error('El prospecto no inicia sin plusvalía previa.');
        await page.screenshot({path:path.join(os.tmpdir(),'financial-education-desktop.png'),fullPage:false});
        await page.locator('[data-edu-tab="diversification"]').click();
        if(!await page.locator('#eduDiversificationChart svg').count())throw new Error('Gráfico de diversificación vacío.');
        await page.setViewportSize({width:390,height:844});
        await page.locator('[data-edu-tab="tax"]').click();
        await page.waitForTimeout(300);
        const dimensions=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,chart:document.querySelector('#eduTaxChart').clientWidth}));
        if(dimensions.scroll>dimensions.width+2||dimensions.chart<250)throw new Error('El simulador fiscal desborda en móvil: '+JSON.stringify({...dimensions,offenders:await page.evaluate(()=>[...document.querySelectorAll('#section-ayuda *')].filter(el=>el.getBoundingClientRect().right>innerWidth+2).slice(0,8).map(el=>({tag:el.tagName,id:el.id,class:el.className,right:el.getBoundingClientRect().right})))}));
        await page.screenshot({path:path.join(os.tmpdir(),'financial-education-mobile.png'),fullPage:false});
        if(errors.length)throw new Error('Errores del navegador: '+errors.join('; '));
        console.log('Educación y fiscalidad: interacciones, gráficos y vistas desktop/móvil OK.');
    }finally{await browser.close();}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
