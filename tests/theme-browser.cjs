const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const fs = require('node:fs');

(async () => {
    const output = process.env.BROWSER_OUTPUT_DIR;
    assert.ok(output, 'Set BROWSER_OUTPUT_DIR for visual evidence');
    fs.mkdirSync(output, { recursive:true });
    const browser = await chromium.launch({headless:true});
    try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('https://**/*', route => /tailwindcss|plotly|mathjs|xlsx|font-awesome/.test(route.request().url()) ? route.continue() : route.abort());
        await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
        for (const width of [1440,390]) {
            await page.setViewportSize({width,height:1000});
            for (const section of ['mercados','valoraciones','macro','individual','cartera','ayuda']) {
                await page.evaluate(name => {switchSection(name);window.scrollTo(0,0);},section);
                await page.screenshot({path:path.join(output,`${section}-${width}.png`)});
                const dimensions = await page.evaluate(() => ({width:innerWidth,scroll:document.documentElement.scrollWidth}));
                assert.ok(dimensions.scroll <= width+1, `${section} overflows at ${width}: ${dimensions.scroll}`);
                assert.equal(await page.locator(`#section-${section}`).isVisible(),true);
            }
            await page.evaluate(() => switchSection('cartera'));
            await page.locator('[data-workspace-scope="initial"]').click();
            await page.locator('[data-workspace-step="metrics"]').click();
            await page.screenshot({path:path.join(output,`metrics-${width}.png`)});
            assert.ok(await page.locator('#workspaceUniverseMetrics').isVisible());
            const tabs = await page.locator('[data-workspace-step]:visible').evaluateAll(nodes => nodes.map(node => ({client:node.clientWidth,scroll:node.scrollWidth})));
            assert.ok(tabs.every(tab => tab.scroll<=tab.client+1),'Workflow labels fit');
        }
        assert.deepEqual(errors,[]);
        console.log('All six sections and initial metrics checked at desktop/mobile widths.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
