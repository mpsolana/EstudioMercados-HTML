const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');

(async()=>{
    const browser=await chromium.launch({headless:true});
    try{
        const page=await browser.newPage(),errors=[];
        page.on('pageerror',error=>errors.push(error.message));
        await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
        await page.evaluate(async()=>{
            switchSection('cartera');
            document.getElementById('portfolioPricesInBase').checked=true;
            const book=XLSX.utils.book_new(),add=(name,grid)=>XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(grid),name);
            const dates=Array.from({length:24},(_,i)=>new Date(Date.UTC(2024,0+i+1,0)));
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
        assert.deepEqual(state.benches,['BM1']);
        assert.ok(state.compareOptions>=2&&state.massiveOptions>=2);
        assert.match(state.status,/Históricos cargados/);
        assert.deepEqual(errors,[]);
        console.log('Maestro populates scoring, portfolio history and fund comparators');
    }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
