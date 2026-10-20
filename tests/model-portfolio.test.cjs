const test=require('node:test'),assert=require('node:assert/strict'),Model=require('../assets/model-portfolio-core.js');
test('parses model weights in fraction or percent and multiple Morningstar categories',()=>{
    const models=Model.parseGrid([['Categoria','Subcategorias','Conservadora','Dinamica'],['Bonos','RF Europa; RF Global',.6,30],['Acciones','RV Global',.4,70]]);
    assert.deepEqual(models.map(m=>m.total),[100,100]);
    assert.deepEqual(models[0].rows[0].subcategories,['RF Europa','RF Global']);
    assert.equal(models[1].rows[1].weight,70);
});
test('keeps benchmark weights fixed while committee allocation and RV bands change',()=>{
    const models=Model.parseGrid([['Categoria','Subcategorias','Cartera estratégica Prudente','Cartera estratégica Decidido'],['RF EUR','EUR Government Bond',77.5,37.5],['RV Global','Global Large-Cap Blend Equity',22.5,62.5]]);
    const prudent=models[0],decided=models[1];
    assert.equal(prudent.profile,'prudente');assert.equal(decided.profile,'decidido');
    prudent.rows[0].portfolioWeight=72;prudent.rows[1].portfolioWeight=28;
    assert.deepEqual(Model.allocation(prudent).band,[15,30]);
    assert.equal(Model.allocation(prudent).neutral,22.5);
    assert.equal(Model.allocation(prudent).benchmarkRv,22.5);
    assert.equal(Model.allocation(prudent).portfolioRv,28);
    assert.equal(prudent.rows[1].weight,22.5);
    assert.equal(Model.allocation(prudent).portfolioTotal,100);
});
test('retains zero-benchmark categories and does not invent RV classification for ambiguous names',()=>{
    const [model]=Model.parseGrid([['Categoria','Subcategorias','Muy Arriesgado'],['RF EUR','EUR Government Bond',20],['RV EM','Emerging Markets Equity',80],['Alternativos','Other',0]]);
    assert.equal(model.rows.length,3);
    assert.deepEqual(Model.allocation(model).band,[75,100]);
    assert.equal(model.rows[2].assetType,'Otros');
    model.rows[2].portfolioWeight=5;model.rows[0].portfolioWeight=15;
    assert.equal(Model.allocation(model).portfolioOther,5);
    assert.deepEqual(Model.allocation(model).unknown,['Alternativos']);
});
test('ranks only matching categories with numeric scores',()=>{
    const records=[{isin:'A',category:'RF Europa',score:3,ter:.5},{isin:'B',category:'RF Global',score:4,ter:1},{isin:'C',category:'RV Global',score:5,ter:.1},{isin:'D',category:'RF Europa',score:NaN,ter:0}];
    assert.deepEqual(Model.rank(records,['RF Europa','RF Global']).map(r=>r.isin),['B','A']);
});
test('top five chooses at most one fund per named manager',()=>{
    const records=[{isin:'A1',manager:'Gestora A',category:'RF Europa',score:4,ter:.8},{isin:'A2',manager:'Gestora A',category:'RF Europa',score:3.9,ter:.4},{isin:'B1',manager:'Gestora B',category:'RF Europa',score:3.8,ter:.6},{isin:'C1',manager:'Gestora C',category:'RF Europa',score:3.7,ter:.7}];
    assert.deepEqual(Model.rank(records,['RF Europa']).map(record=>record.isin),['A1','B1','C1']);
});
test('full universe keeps every matching share class and ranks missing scores last',()=>{
    const records=[{isin:'A',category:'RF Europa',score:3,ter:.7},{isin:'B',category:'RF Global',score:4,ter:.6},{isin:'C',category:'RF Europa',score:NaN,ter:.3},{isin:'D',category:'RV Global',score:4,ter:.1}];
    assert.deepEqual(Model.fullRank(records,['RF Europa','RF Global']).map(item=>item.isin),['B','A','C']);
});
test('category positions start equal and edited shares keep a 100 percent total',()=>{
    const positions=Model.equalPositions(['A','B','A','C']);
    assert.deepEqual(positions.map(item=>item.isin),['A','B','C']);
    assert.ok(Math.abs(positions.reduce((sum,item)=>sum+item.share,0)-100)<1e-10);
    const edited=Model.setShare(positions,0,60);
    assert.deepEqual(edited.map(item=>item.share),[60,20,20]);
    assert.deepEqual(Model.normalizePositions(edited.slice(0,2)).map(item=>item.share),[75,25]);
    assert.throws(()=>Model.setShare(positions,0,101),/entre 0% y 100%/);
});
test('editing one category weight preserves it and apportions the remainder to exactly 100 percent',()=>{
    const rows=[{weight:50,portfolioWeight:60},{weight:30,portfolioWeight:30},{weight:20,portfolioWeight:10}];
    Model.setPortfolioWeight(rows,0,50);
    assert.deepEqual(rows.map(row=>row.portfolioWeight),[50,37.5,12.5]);
    Model.setPortfolioWeight(rows,1,33.33);
    assert.equal(rows[1].portfolioWeight,33.33);
    assert.equal(Math.round(rows.reduce((sum,row)=>sum+row.portfolioWeight,0)*100),10000);
    assert.deepEqual(rows.map(row=>row.weight),[50,30,20]);
    assert.throws(()=>Model.setPortfolioWeight(rows,0,101),/entre 0% y 100%/);
    const empty=[{weight:30,portfolioWeight:0},{weight:70,portfolioWeight:0}];
    Model.setPortfolioWeight(empty,0,20);
    assert.deepEqual(empty.map(row=>row.portfolioWeight),[20,80]);
    const single=[{weight:100,portfolioWeight:20}];
    Model.setPortfolioWeight(single,0,20);
    assert.equal(single[0].portfolioWeight,100);
});
test('sharing current and proposed funds preserves profile allocations and independent position objects',()=>{
    const models=Model.parseGrid([['Categoria','Subcategoria','Prudente','Decidido'],['Bonos','RF Europa',70,40],['Acciones','RV Global',30,60]]);
    const [source,target]=models,origin=source.rows[0],destination=target.rows[0];
    origin.currentPositions=Model.equalPositions(['A','B']);
    destination.currentPositions=Model.equalPositions(['OLD']);
    destination.keepCurrent=true;
    assert.equal(Model.copyCategoryPositions(models,0,0,'current'),1);
    assert.deepEqual(destination.currentPositions,origin.currentPositions);
    assert.deepEqual(destination.proposedPositions,origin.currentPositions);
    assert.notEqual(destination.currentPositions[0],origin.currentPositions[0]);
    origin.proposedPositions=Model.setShare(Model.equalPositions(['C','D']),0,70);
    assert.equal(Model.copyCategoryPositions(models,0,0,'proposal'),1);
    assert.deepEqual(destination.proposedPositions,origin.proposedPositions);
    assert.equal(destination.keepCurrent,false);
    assert.equal(destination.weight,40);
    assert.equal(destination.portfolioWeight,40);
    origin.currentPositions=[];
    Model.copyCategoryPositions(models,0,0,'current');
    assert.deepEqual(destination.currentPositions,[]);
    assert.deepEqual(destination.proposedPositions,origin.proposedPositions);
    origin.proposedPositions=[];
    Model.copyCategoryPositions(models,0,0,'proposal');
    assert.deepEqual(destination.proposedPositions,[]);
    origin.keepCurrent=true;
    destination.currentPositions=Model.equalPositions(['TARGET']);
    Model.copyCategoryPositions(models,0,0,'proposal');
    assert.equal(destination.keepCurrent,true);
    assert.deepEqual(destination.proposedPositions,destination.currentPositions);
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
    assert.equal(Model.trackingError([{weight:100,selectedIsin:'A',benchmark:'ba'}],funds,benchmarks).months,4);
    assert.ok(Number.isNaN(Model.trackingError(rows,{A:funds.A},benchmarks).value));
    const gapped={A:[funds.A[0],funds.A[2],funds.A[3]],B:[funds.B[0],funds.B[2],funds.B[3]]};
    assert.ok(Number.isNaN(Model.trackingError(rows,gapped,benchmarks).value));
});
