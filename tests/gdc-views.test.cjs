const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const Model=require('../assets/model-portfolio-core.js');

function loadModel(){
    const context={ModelPortfolioCore:Model,fundUniverseState:{isinIndex:new Map()},loadedPortfolio:{benchCategories:{}},
        XLSX:{utils:{sheet_to_json:sheet=>sheet}},
        findSheet:(book,names)=>book.SheetNames.find(name=>names.some(candidate=>candidate.toLowerCase()===name.toLowerCase()))||null,
        sheetRows:(book,name)=>book.Sheets[name],
        firstValue:(row,keys)=>keys.map(key=>row[key.toLowerCase()]).find(value=>value!==undefined&&value!==null&&value!=='')??null,
        benchmarkCategorySheetToMap:()=>({}),benchmarkSheetToSeriesMap:()=>({}),
        normalizeIsin:value=>String(value||'').trim().toUpperCase(),parseNumber:value=>Number(value)};
    return vm.runInNewContext(fs.readFileSync(require.resolve('../assets/gdc-model.js'),'utf8')+'\nGdcModel',context);
}

test('the monthly workbook restores the latest view and still loads position weights',()=>{
    const gdc=loadModel();
    const sheets={
        'Carteras Modelo':[['Categoria','Subcategoria','Prudente','Decidido'],['RF EUR','EUR Government Bond',70,40],['RV Global','Global Equity',30,60]],
        'Asignacion':[{modelo:'Prudente','categoria gdc':'RF EUR','peso cartera (%)':65,'tipo activo':'RF'}],
        'GDC Estado':[{modelo:'Prudente','categoria gdc':'RF EUR',isin:'A','peso dentro categoria (%)':80},{modelo:'Prudente','categoria gdc':'RF EUR',isin:'B','peso dentro categoria (%)':20}],
        'GDC Views':[{fecha:'2026-08-20','categoria gdc':'RV Global',vista:'Neutral',comentario:'Sin cambios'},
            {fecha:'2026-09-20','categoria gdc':'RV Global',vista:' ow ',comentario:'Racional mensual'},
            {fecha:'2026-09-20','categoria gdc':'RF EUR',vista:'UW',comentario:'Duración'}]
    };
    const workbook={SheetNames:Object.keys(sheets),Sheets:sheets};
    const result=gdc.loadPriorWorkbook(workbook);
    assert.equal(result.positions,2);
    assert.equal(gdc.state.previousViewDate,'2026-09-20');
    assert.equal(gdc.state.views['rv global'].view,'OW');
    assert.equal(gdc.state.views['rv global'].comment,'Racional mensual');
    assert.equal(gdc.state.viewHistory.length,3);
    assert.equal(gdc.state.models[0].rows[0].portfolioWeight,65);
    assert.deepEqual(Array.from(gdc.state.models[0].rows[0].currentPositions,item=>item.share),[80,20]);
    const legacy={SheetNames:workbook.SheetNames.filter(name=>name!=='GDC Views'),Sheets:sheets};
    gdc.loadPriorWorkbook(legacy);
    assert.equal(gdc.state.previousViewDate,'');
    assert.equal(Object.keys(gdc.state.views).length,0);
});
