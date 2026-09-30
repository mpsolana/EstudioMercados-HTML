const test=require('node:test'),assert=require('node:assert/strict'),Model=require('../assets/model-portfolio-core.js');
test('parses model weights in fraction or percent and multiple Morningstar categories',()=>{
    const models=Model.parseGrid([['Categoria','Subcategorias','Conservadora','Dinamica'],['Bonos','RF Europa; RF Global',.6,30],['Acciones','RV Global',.4,70]]);
    assert.deepEqual(models.map(m=>m.total),[100,100]);
    assert.deepEqual(models[0].rows[0].subcategories,['RF Europa','RF Global']);
    assert.equal(models[1].rows[1].weight,70);
});
test('ranks only matching categories with numeric scores',()=>{
    const records=[{isin:'A',category:'RF Europa',score:3,ter:.5},{isin:'B',category:'RF Global',score:4,ter:1},{isin:'C',category:'RV Global',score:5,ter:.1},{isin:'D',category:'RF Europa',score:NaN,ter:0}];
    assert.deepEqual(Model.rank(records,['RF Europa','RF Global']).map(r=>r.isin),['B','A']);
});
test('top five chooses at most one fund per named manager',()=>{
    const records=[{isin:'A1',manager:'Gestora A',category:'RF Europa',score:4,ter:.8},{isin:'A2',manager:'Gestora A',category:'RF Europa',score:3.9,ter:.4},{isin:'B1',manager:'Gestora B',category:'RF Europa',score:3.8,ter:.6},{isin:'C1',manager:'Gestora C',category:'RF Europa',score:3.7,ter:.7}];
    assert.deepEqual(Model.rank(records,['RF Europa']).map(record=>record.isin),['A1','B1','C1']);
});
test('tracking error uses common monthly returns and refuses missing histories',()=>{
    const dates=['2026-01-31','2026-02-28','2026-03-31','2026-04-30'];
    const series=values=>values.map((price,i)=>({date:new Date(dates[i]+'T00:00:00Z'),price}));
    const rows=[{weight:60,selectedIsin:'A',benchmark:'BA'},{weight:40,selectedIsin:'B',benchmark:'BB'}];
    const funds={A:series([100,101,102,103]),B:series([100,102,104,106])};
    const benchmarks={BA:{data:series([100,100,100,100])},BB:{data:series([100,101,102,103])}};
    const te=Model.trackingError(rows,funds,benchmarks);
    assert.ok(Number.isFinite(te.value)&&te.value>0);
    assert.equal(te.months,4);
    assert.ok(Number.isNaN(Model.trackingError(rows,{A:funds.A},benchmarks).value));
    const gapped={A:[funds.A[0],funds.A[2],funds.A[3]],B:[funds.B[0],funds.B[2],funds.B[3]]};
    assert.ok(Number.isNaN(Model.trackingError(rows,gapped,benchmarks).value));
});
