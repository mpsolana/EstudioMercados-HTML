const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const os=require('node:os');

(async()=>{
    const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'});
    try{
        const page=await browser.newPage(),errors=[];
        page.on('pageerror',error=>errors.push(error.message));
        await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
        await page.evaluate(async()=>{
            switchSection('cartera');
            document.getElementById('portfolioPricesInBase').checked=true;
            const book=XLSX.utils.book_new(),add=(name,grid)=>XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(grid),name);
            const dates=Array.from({length:48},(_,i)=>new Date(Date.UTC(2022,0+i+1,0)));
            add('Cartera Scoring',[['ISIN','Peso','Nombre'],['ES0000000001',60,'Fondo A'],['ES0000000002',40,'Fondo B']]);
            add('posis',[['date','ES0000000001','ES0000000002'],...dates.map((date,i)=>[date,100+i*.8,100+i*1.1])]);
            add('bench',[['date','BM1'],...dates.map((date,i)=>[date,100+i])]);
            add('bench categ',[['ticker','name','asset class'],['BM1','Indice Morningstar','RF EUR']]);
            const file=new File([XLSX.write(book,{bookType:'xlsx',type:'array'})],'Maestro.xlsx');
            await importFundScoringPortfolioFile(file);
        });
        await page.waitForFunction(()=>loadedPortfolio?.analysisReady===true);
        const state=await page.evaluate(()=>({weights:fundPortfolioRows.map(row=>row.weight),entries:loadedPortfolio.entries.map(row=>row.ticker),prices:Object.keys(loadedPortfolio.priceSeries),benches:Object.keys(loadedPortfolio.benchmarks),compareOptions:document.getElementById('fundCompareAssetSelect').options.length,massiveOptions:document.getElementById('massiveCompareAssetSelect').options.length,status:document.getElementById('masterHistoryStatus').textContent}));
        assert.deepEqual(state.weights,[60,40]);
        assert.deepEqual(state.entries,['ES0000000001','ES0000000002']);
        assert.deepEqual(state.prices,['ES0000000001','ES0000000002']);
        assert.deepEqual(state.benches.map(key=>key.toUpperCase()),['BM1']);
        assert.deepEqual(await page.evaluate(()=>Object.keys(window.masterPriceSeries||{})),['ES0000000001','ES0000000002']);
        assert.ok(state.compareOptions>=2&&state.massiveOptions>=1,JSON.stringify(state));
        assert.match(state.status,/Históricos cargados/);
        await page.evaluate(()=>{
            const panel=document.getElementById('workspaceInitialRates');panel.hidden=false;panel.style.display='block';
            for(const [id,value] of [['initialRateAmount','100000'],['initialRateWeight','40'],['initialRateDuration','4'],['initialSpreadDuration','3.5'],['initialRateShock','50'],['initialSpreadShock','40']])panel.querySelector('#'+id).value=value;
            renderInitialRateSensitivity();
        });
        await page.waitForFunction(()=>document.querySelector('#initialRateWaterfall.js-plotly-plot')&&document.querySelectorAll('#initialRateBody tr').length>=6);
        assert.match(await page.locator('#initialRateStatus').innerText(),/duración tipos/);
        assert.match(await page.locator('#initialRateBody').innerText(),/Tensión conjunta/);
        const sensitivityExport=await page.evaluate(async()=>{const previous=XLSX.writeFile;let book;try{XLSX.writeFile=value=>{book=value;};await exportInitialRateSensitivity('xlsx');}finally{XLSX.writeFile=previous;}return {sheets:book.SheetNames,rows:XLSX.utils.sheet_to_json(book.Sheets.Escenarios)};});
        assert.deepEqual(sensitivityExport.sheets,['Escenarios','Hipótesis']);
        assert.equal(sensitivityExport.rows.find(row=>row.Escenario==='Personalizado')['Impacto cartera (importe)'],-1360);
        await page.locator('#workspaceInitialRates').screenshot({path:path.join(os.tmpdir(),'rate-sensitivity-desktop.png')});
        await page.setViewportSize({width:390,height:844});
        await page.waitForTimeout(300);
        const widths=await page.evaluate(()=>{const panel=document.querySelector('#workspaceInitialRates').getBoundingClientRect(),plots=[...document.querySelectorAll('#workspaceInitialRates .js-plotly-plot')].map(node=>({id:node.id,left:node.getBoundingClientRect().left,right:node.getBoundingClientRect().right}));return {panel:{left:panel.left,right:panel.right},grid:getComputedStyle(document.querySelector('.rate-visual-grid')).gridTemplateColumns,plots};});
        assert.ok(widths.plots.every(plot=>plot.left>=widths.panel.left-5&&plot.right<=widths.panel.right+5),JSON.stringify(widths));
        await page.locator('#workspaceInitialRates').screenshot({path:path.join(os.tmpdir(),'rate-sensitivity-mobile.png')});
        const frontierFallback=await page.evaluate(async()=>{
            fundProposalState.rows=[{isin:'ES0000000001',weight:60,current:{isin:'ES0000000001',name:'Fondo A'},proposed:{isin:'ES0000000001',name:'Fondo A'}},{isin:'ES0000000002',weight:40,current:{isin:'ES0000000002',name:'Fondo B'},proposed:{isin:'ES0000000002',name:'Fondo B'}}];
            loadedPortfolio.priceSeries={};
            await EfficientFrontierView.calculate();
            return {status:document.querySelector('#initialFrontierStatus').textContent,points:EfficientFrontierView.result?.months.length};
        });
        assert.ok(frontierFallback.points>=37,JSON.stringify(frontierFallback));
        assert.deepEqual(errors,[]);
        console.log('Maestro populates scoring, portfolio history and fund comparators');
    }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
