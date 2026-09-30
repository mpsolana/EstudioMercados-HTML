const test=require('node:test'),assert=require('node:assert/strict'),Core=require('../assets/portfolio-compare-core.js'),Compare=require('../assets/multi-asset-compare.js');
const dates=['2025-01-31','2025-02-28','2025-03-31','2025-04-30'];
const series=prices=>prices.map((price,index)=>({date:new Date(`${dates[index]}T00:00:00Z`),price}));
const first={name:'Actual',entries:[{ticker:'A',weight:.6},{ticker:'B',weight:.4}],series:{A:series([100,110,99,108.9]),B:series([100,100,105,105])}};
test('portfolio and weight clone use exactly the same common closes',()=>{
    const clone={...first,name:'Clon',entries:[{ticker:'A',weight:.2},{ticker:'B',weight:.8}]};
    const built=Core.build([first,clone],{rebalance:'period',costBps:0});
    assert.equal(built.assets.length,2);
    assert.deepEqual(built.assets.map(asset=>asset.data.map(point=>point.date.toISOString().slice(0,10))),[dates,dates]);
    assert.ok(Math.abs(built.assets[0].data[1].price-106)<1e-10);
    assert.ok(Math.abs(built.assets[1].data[1].price-102)<1e-10);
    const compared=Compare.compare(built.assets);
    assert.equal(compared.rows.length,4);
    assert.notEqual(compared.assets[0].drawdown,compared.assets[1].drawdown);
});
test('two imported portfolios and a clone reject missing histories instead of filling zero',()=>{
    const second={name:'Segunda',entries:[{ticker:'C',weight:1}],series:{C:series([100,102,104,106])}};
    assert.equal(Core.build([first,second]).assets.length,2);
    assert.throws(()=>Core.build([first,{...second,series:{}}]),/falta historico/);
    assert.throws(()=>Core.build([{...first,entries:[{ticker:'A',weight:-1}]}]),/no negativos/);
});
test('rebalance policy changes the clone path without changing the date basis',()=>{
    const hold=Core.build([first],{rebalance:'hold',costBps:0});
    const constant=Core.build([first],{rebalance:'period',costBps:0});
    assert.deepEqual(hold.dates,constant.dates);
    assert.notEqual(hold.assets[0].data.at(-1).price,constant.assets[0].data.at(-1).price);
});
test('monthly portfolios align by month when their last trading dates differ',()=>{
    const otherDates=['2025-01-30','2025-02-27','2025-03-28','2025-04-29'];
    const other={name:'Segunda',entries:[{ticker:'C',weight:1}],series:{C:otherDates.map((date,i)=>({date:new Date(`${date}T00:00:00Z`),price:100+i*2}))}};
    const built=Core.build([first,other]);
    assert.equal(built.frequency,'M');
    assert.equal(built.assets[0].data.length,4);
    assert.deepEqual(built.assets[0].data.map(point=>point.date.toISOString().slice(0,10)),dates);
    assert.deepEqual(built.assets[1].data.map(point=>point.date.toISOString().slice(0,10)),dates);
});
