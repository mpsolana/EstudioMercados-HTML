const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const nodePath=require('node:path');
const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('dialog', dialog => dialog.dismiss());
        if(process.env.RATE_TEST_LIB_DIR)await page.route('https://**/*', route => {
            const url = route.request().url();
            const file = url.includes('cdn.tailwindcss.com') ? 'mandate-tailwind.js' :
                url.endsWith('/plotly.min.js') ? 'mandate-plotly-alt.js' :
                url.endsWith('/xlsx.full.min.js') ? 'mandate-xlsx.cjs' :
                url.endsWith('/math.min.js') ? 'mandate-math.js' : null;
            return file ? route.fulfill({ path: nodePath.join(process.env.RATE_TEST_LIB_DIR,file), contentType: 'application/javascript' }) : route.abort();
        });
        await page.goto(pathToFileURL(nodePath.resolve(__dirname,'../index.html')).href, { waitUntil: 'domcontentloaded' });
        await page.locator('#section-btn-cartera').click();
        await page.evaluate(async () => {
            const book = XLSX.utils.book_new();
            const add = (name, rows) => XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), name);
            const isins = Array.from({length:6}, (_, i) => 'ES' + String(i + 1).padStart(10,'0'));
            const dates = [];
            for (let time = +new Date('2017-01-02'); time <= +new Date('2023-01-03'); time += 86400000) {
                const date = new Date(time);
                if (![0,6].includes(date.getUTCDay())) dates.push(date);
            }
            add('Cartera Scoring', [['ISIN','Peso','Nombre'], ...isins.map((isin,i) => [isin,100/6,'Fondo ' + (i+1)])]);
            add('posis', [['date',...isins], ...dates.map((date,t) => [date,...isins.map((_,i) => 100 * Math.exp((.0001 + i * .000015) * t + .002 * Math.sin(t/30+i)))])]);
            add('Optimizador', [['ISIN','Nombre','Tipo','No EUR pct','Calidad crediticia','TIR bruta','TER','Duración modificada'],
                ...isins.map((isin,i) => [isin,'Fondo '+(i+1),i<4?'RF':'RV',0,i===0?'Monetario':'IG',.04,.005,1])]);
            for (let i=2;i<=7;i++) {
                for (const column of ['D','F','G']) book.Sheets.Optimizador[column+i].z='0.0%';
            }
            document.getElementById('portfolioPricesInBase').checked=true;
            await importFundScoringPortfolioFile(new File([XLSX.write(book,{bookType:'xlsx',type:'array'})], 'Maestro-optimizador.xlsx'));
        });
        await page.waitForFunction(()=>loadedPortfolio?.analysisReady);
        await page.locator('[data-workspace-scope=individual]').click();
        await page.locator('[data-workspace-step=optimizer]').click();
        const panel = page.locator('#workspaceIndividualOptimizer');
        await panel.waitFor({state:'visible'});
        assert.equal(await panel.locator('[data-optimizer-universe] tr').count(), 6);
        assert.equal(await panel.locator('[data-opt-asset="0"][data-opt-field=ter]').inputValue(), '0.5');
        assert.equal(await panel.locator('[data-opt-asset="0"][data-opt-field=grossYield]').inputValue(), '4');
        assert.equal(await panel.locator('[data-opt-asset="0"][data-opt-field=type]').inputValue(), 'RF');
        assert.equal(await panel.locator('[name=start]').inputValue(),'2017-01-02');
        assert.equal(await panel.locator('[name=end]').inputValue(),'2023-01-03');
        await panel.locator('[name=start]').fill('2017-02-01');
        await panel.locator('[data-opt-asset="5"][data-opt-field=included]').uncheck();
        assert.equal(await panel.locator('[name=start]').inputValue(),'2017-02-01');
        await panel.locator('[data-opt-asset="5"][data-opt-field=included]').check();
        await panel.locator('[data-opt-dates]').click();
        assert.equal(await panel.locator('[name=start]').inputValue(),'2017-01-02');
        assert.equal(await panel.locator('[data-opt-asset="0"][data-opt-field=credit]').inputValue(),'Monetario');
        assert.equal(await panel.locator('[name=minRolling5]').inputValue(), '0');
        assert.equal(await panel.locator('[name=start]').getAttribute('aria-describedby'), 'optimizer-dates-help');
        assert.match(await panel.locator('#optimizer-dates-help').innerText(), /ambos incluidos/);
        await panel.locator('[name=iterations]').fill('200');
        await panel.locator('[name=rebalance]').selectOption('quarterly');
        await panel.locator('[data-opt-run]').click();
        await panel.locator('[data-opt-apply]').waitFor();
        assert.equal(await panel.locator('[data-opt-apply]').isEnabled(),true);
        assert.equal(await panel.locator('.js-plotly-plot').count(),3);
        const path = await panel.locator('[data-opt-history]').evaluate(chart => chart.data[0].y);
        if(process.env.RATE_SCREENSHOT_DIR)await panel.screenshot({path:nodePath.join(process.env.RATE_SCREENSHOT_DIR,'optimizer-desktop.png')});
        await page.setViewportSize({width:390,height:850});
        await page.evaluate(async()=>{for(const chart of document.querySelectorAll('#workspaceIndividualOptimizer .js-plotly-plot')) await Plotly.Plots.resize(chart);});
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
        if(process.env.RATE_SCREENSHOT_DIR)await panel.screenshot({path:nodePath.join(process.env.RATE_SCREENSHOT_DIR,'optimizer-mobile.png')});
        await page.setViewportSize({width:1440,height:1000});
        await panel.locator('[data-opt-apply]').click();
        await page.waitForFunction(()=>loadedPortfolio?.sourceLabel==='Optimizador downside · Maestro' && PortfolioWorkspace.step==='diagnosis');
        const applied = await page.evaluate(()=>({path:loadedPortfolio.portfolioData.map(point=>point.price/10),weights:loadedPortfolio.entries.map(entry=>entry.weight),
            settings:loadedPortfolio.calculationSettings,scoring:fundPortfolioRows.map(row=>[row.isin,row.weight])}));
        assert.equal(applied.settings.rebalance,'quarterly');
        assert.equal(applied.settings.costBps,0);
        assert.equal(applied.scoring.length,applied.weights.length);
        applied.scoring.forEach((row,i)=>assert(Math.abs(row[1]/100-applied.weights[i])<1e-9));
        assert.equal(applied.path.length,path.length);
        path.forEach((value,i)=>assert(Math.abs(value-applied.path[i])<1e-6));
        assert(Math.abs(applied.weights.reduce((a,b)=>a+b,0)-1)<1e-9);
        await page.locator('[data-workspace-step=optimizer]').click();
        await panel.locator('[name=minYield]').fill('20');
        await panel.locator('[data-opt-run]').click();
        await panel.getByText('Aproximaciones a las restricciones',{exact:true}).waitFor();
        assert.equal(await panel.locator('[data-opt-apply]').isDisabled(),true);
        assert((await panel.locator('[data-opt-choice]').count()) >= 1 && (await panel.locator('[data-opt-choice]').count()) <= 3);
        assert.match(await panel.locator('[data-optimizer-results] .workspace-status').innerText(),/TIR neta RF/);
        await panel.locator('[name=minYield]').fill('3');
        await panel.locator('[name=minRolling5]').fill('50');
        await panel.locator('[data-opt-run]').click();
        await panel.getByText('Aproximaciones a las restricciones',{exact:true}).waitFor();
        assert.equal(await panel.locator('[data-opt-apply]').isDisabled(),true);
        assert.match(await panel.locator('[data-optimizer-results] .workspace-status').innerText(),/Retorno rolling mínimo a 5 años/);
        await panel.locator('[name=minRolling5]').fill('');
        await panel.locator('[data-opt-run]').click();
        await page.waitForFunction(()=>!document.querySelector('[data-opt-run]').disabled);
        assert.equal(await panel.locator('[data-opt-apply]').isEnabled(),true);
        await panel.locator('[name=iterations]').fill('20000');
        await panel.locator('[data-opt-run]').click();
        await panel.locator('[data-opt-cancel]').click();
        await page.waitForFunction(()=>!document.querySelector('[data-opt-run]').disabled);
        assert.equal(await panel.locator('[data-optimizer-results]').innerText(),'');
        await panel.locator('[data-opt-constraints=none]').click();
        assert.equal(await panel.locator('[data-opt-constraint]:checked').count(),0);
        assert.equal(await panel.locator('[name=maxRv]').isDisabled(),true);
        await panel.locator('[name=objective]').selectOption('rolling5');
        assert.equal(await panel.locator('[name=ulcerPenalty]').isDisabled(),true);
        await panel.locator('[name=iterations]').fill('200');
        await panel.locator('[data-opt-asset="0"][data-opt-field=grossYield]').fill('');
        await panel.locator('[data-opt-asset="0"][data-opt-field=duration]').fill('');
        await panel.locator('[data-opt-run]').click();
        await page.waitForFunction(()=>!document.querySelector('[data-opt-run]').disabled);
        assert.equal(await panel.locator('[data-opt-apply]').isEnabled(),true);
        assert.match(await panel.locator('[data-optimizer-results]').innerText(),/Sin penalización Ulcer/);
        await panel.locator('[name=objective]').selectOption('meanRolling5');
        await panel.locator('[data-opt-run]').click();
        await page.waitForFunction(()=>!document.querySelector('[data-opt-run]').disabled);
        assert.equal(await panel.locator('[data-opt-apply]').isEnabled(),true);
        assert.match(await panel.locator('[data-optimizer-results]').innerText(),/Media rolling 5 años/);
        assert.match(await panel.locator('[data-optimizer-results]').innerText(),/Ordenadas por la media/);
        await panel.locator('[data-opt-constraint=minRolling5]').check();
        await panel.locator('[name=minRolling5]').fill('100');
        await panel.locator('[data-opt-run]').click();
        await panel.getByText('Aproximaciones a las restricciones',{exact:true}).waitFor();
        assert.equal(await panel.locator('[data-opt-apply]').isDisabled(),true);
        await page.locator('[data-workspace-scope=initial]').click();
        assert.deepEqual(await page.locator('.workspace-steps [data-workspace-step]:visible').evaluateAll(buttons => buttons.map(button => button.dataset.workspaceStep)),
            ['proposal','metrics','rates','report']);
        assert.deepEqual(errors,[]);
        console.log('Optimizer browser OK: real XLSX import, % metadata, optimization, 3 plots, mobile, applied daily path, infeasibility and cancellation.');
    } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
