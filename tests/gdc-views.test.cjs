const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const Model=require('../assets/model-portfolio-core.js');

function loadModel(){
    let exported,plot;
    const xlsx={utils:{sheet_to_json:sheet=>sheet,book_new:()=>({sheets:{}}),aoa_to_sheet:grid=>grid,book_append_sheet:(book,sheet,name)=>{book.sheets[name]=sheet;}},writeFile:(book,name)=>{exported={book,name};}};
    const context={ModelPortfolioCore:Model,fundUniverseState:{isinIndex:new Map()},loadedPortfolio:{benchCategories:{}},
        XLSX:xlsx,window:{XLSX:xlsx,Plotly:{},innerWidth:1200},FinancialVisuals:{newPlot:async(...args)=>{plot=args;}},
        findSheet:(book,names)=>book.SheetNames.find(name=>names.some(candidate=>candidate.toLowerCase()===name.toLowerCase()))||null,
        sheetRows:(book,name)=>book.Sheets[name],
        firstValue:(row,keys)=>keys.map(key=>row[key.toLowerCase()]).find(value=>value!==undefined&&value!==null&&value!=='')??null,
        benchmarkCategorySheetToMap:()=>({}),benchmarkSheetToSeriesMap:()=>({}),
        normalizeIsin:value=>String(value||'').trim().toUpperCase(),parseNumber:value=>Number(value)};
    const gdc=vm.runInNewContext(fs.readFileSync(require.resolve('../assets/gdc-model.js'),'utf8')+'\nGdcModel',context);
    gdc.lastExport=()=>exported;gdc.lastPlot=()=>plot;return gdc;
}

test('the monthly workbook restores the latest view and still loads position weights',()=>{
    const gdc=loadModel();
    const sheets={
        'Carteras Modelo':[['Categoria','Subcategoria','Prudente','Decidido'],['RF EUR','EUR Government Bond',70,40],['RV Global','Global Equity',30,60]],
        'Asignacion':[{modelo:'Prudente','categoria gdc':'RF EUR','peso cartera (%)':65,'tipo activo':'RF'}],
        'GDC Estado':[{modelo:'Prudente','categoria gdc':'RF EUR',isin:'A','peso dentro categoria (%)':80},{modelo:'Prudente','categoria gdc':'RF EUR',isin:'B','peso dentro categoria (%)':20}],
        'GDC Views':[{fecha:'2026-08-20','categoria gdc':'RV Global',vista:'Neutral',comentario:'Sin cambios'},
            {fecha:'2026-09-20','categoria gdc':'RV Global',vista:' ow ',comentario:'Racional mensual'},
            {fecha:'2026-09-20','categoria gdc':'RF EUR',vista:'UW',comentario:'Duración'}],
        'GDC Expected':[{tipo:'PARAMETRO','tasa libre riesgo (%)':2.5},{tipo:'INDICE',ticker:'BENCH1','retorno esperado (%)':6,'riesgo esperado (%)':9}],
        'GDC RF':[{tipo:'INDICE',identificador:'BENCH1','duracion modificada (anos)':4,'ytm (%)':3.2},{tipo:'FONDO',identificador:'A','duracion modificada (anos)':3.5,'ytm (%)':3.8}]
    };
    const workbook={SheetNames:Object.keys(sheets),Sheets:sheets};
    const result=gdc.loadPriorWorkbook(workbook);
    assert.equal(result.positions,2);
    assert.equal(gdc.state.previousViewDate,'2026-09-20');
    assert.equal(gdc.state.views['rv global'].view,'OW');
    assert.equal(gdc.state.views['rv global'].comment,'Racional mensual');
    assert.equal(gdc.state.viewHistory.length,3);
    assert.equal(gdc.state.models[0].rows[0].portfolioWeight,65);
    assert.equal(gdc.state.riskFreePct,2.5);
    assert.equal(gdc.state.expected.BENCH1.returnPct,6);
    assert.equal(gdc.state.rfMetrics['F:A'].duration,3.5);
    gdc.state.committeeDate='2026-10-20';
    gdc.exportExcel();
    const exported=gdc.lastExport();
    assert.equal(exported.name,'GDC_comite_2026-10-20.xlsx');
    assert.ok(exported.book.sheets['GDC Expected'].some(row=>row[1]==='BENCH1'&&row[2]===6&&row[3]===9));
    assert.ok(exported.book.sheets['GDC RF'].some(row=>row[1]==='A'&&row[2]===3.5&&row[3]===3.8));
    assert.deepEqual(Array.from(gdc.state.models[0].rows[0].currentPositions,item=>item.share),[80,20]);
    const legacy={SheetNames:workbook.SheetNames.filter(name=>!['GDC Views','GDC Expected','GDC RF'].includes(name)),Sheets:sheets};
    gdc.loadPriorWorkbook(legacy);
    assert.equal(gdc.state.previousViewDate,'');
    assert.equal(Object.keys(gdc.state.views).length,0);
    assert.equal(Object.keys(gdc.state.expected).length,0);
    assert.equal(Object.keys(gdc.state.rfMetrics).length,0);
});
test('forecast chart uses annual percent axes and signed Sharpe bubble sizes',async()=>{
    const gdc=loadModel();
    gdc.state.expected={A:{returnPct:8,riskPct:10},B:{returnPct:-2,riskPct:10},C:{returnPct:3,riskPct:0}};
    gdc.state.riskFreePct=2;
    assert.equal(await gdc.plotForecast({id:'gdcForecastChart',textContent:''}),true);
    const [,traces,layout]=gdc.lastPlot();
    assert.equal(layout.xaxis.title,'Rentabilidad esperada anual (%)');
    assert.equal(layout.yaxis.title,'Riesgo esperado anual (%)');
    const positive=traces.find(item=>item.name==='Sharpe positivo'),negative=traces.find(item=>item.name==='Sharpe no positivo'),missing=traces.find(item=>item.name==='Sharpe no calculable');
    assert.equal(positive.x[0],8);assert.equal(positive.y[0],10);
    assert.equal(negative.x[0],-2);assert.equal(negative.y[0],10);
    assert.ok(positive.marker.size[0]>negative.marker.size[0]);
    assert.equal(missing.marker.symbol,'circle-open');
    assert.ok(missing.customdata[0][1]==='No calculable');
});
