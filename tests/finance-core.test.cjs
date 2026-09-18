const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../assets/finance-core.js');
test('category distribution groups equivalent labels and sums weights',()=>{
    const rows=F.groupCategories([{category:'Renta Fija',weight:15},{category:' renta  FIJA ',weight:15},{category:'Acciones',weight:70}]);
    assert.deepEqual(rows,[{category:'Renta Fija',weight:30},{category:'Acciones',weight:70}]);
});
test('1 and 99 remain 1% and 99%; fractions normalize consistently', () => {
    assert.deepEqual(F.normalizeWeights([{ticker:'A',weight:1},{ticker:'B',weight:99}]).map(e=>e.weight), [.01,.99]);
    assert.deepEqual(F.normalizeWeights([{ticker:'A',weight:.01},{ticker:'B',weight:.99}]).map(e=>e.weight), [.01,.99]);
    assert.throws(()=>F.normalizeWeights([{ticker:'A',weight:-1}]));
});
test('weekly and calendar daily annualization',()=>{
    const series = gap => Array.from({length:20},(_,i)=>({date:new Date(2025,0,1+i*gap),price:100}));
    assert.equal(F.frequency(series(7)),'W'); assert.equal(F.frequency(series(1)),'C');
});
test('automatic recommendations must improve; no equivalent classes inferred by AUM',()=>{
    assert.equal(F.better({isin:'A',category:'B',score:9},[{isin:'B',category:'B',score:3}]).length,0);
    assert.equal(F.sameFund({aum:100,category:'B'},{aum:100,category:'B'}),false);
});
test('missing prices block; buy and hold differs from constant weights',()=>{
    const entries=[{ticker:'A',weight:.5},{ticker:'B',weight:.5}], dates=['2025-01-01','2025-02-01','2025-03-01'];
    assert.throws(()=>F.portfolioPath(entries,dates,{A:[1,0]}));
    const r={A:[1,-.5],B:[0,0]};
    const hold=F.portfolioPath(entries,dates,r,{rebalance:'hold'});
    const reb=F.portfolioPath(entries,dates,r,{rebalance:'period'});
    assert.ok(Math.abs((1+hold[0])*(1+hold[1])-1)<1e-12);
    assert.equal((1+reb[0])*(1+reb[1]),1.125);
});
test('coverage and short performance do not masquerade as full data',()=>{
    assert.equal(F.weighted([{weight:50,ter:1},{weight:50,ter:NaN}],'ter').coverage,.5);
    assert.ok(Number.isNaN(F.cagr([{date:'2025-01-01',price:100},{date:'2025-02-01',price:110}])));
    assert.ok(Number.isFinite(F.cagr([{date:'2025-01-01',price:100},{date:'2026-01-01',price:110}])));
    assert.throws(()=>F.validateSeries([{date:'2025-01-01',price:100},{date:'2025-01-01',price:110}]));
});
test('Sharpe uses arithmetic excess returns',()=>{
    assert.ok(Math.abs(F.sharpe([.1,-.1],'A'))<1e-12);
    assert.ok(F.sharpe([.1,.2,.3],'A',.05)>0);
});
test('monthly rebalance accepts Date objects without rebalancing daily',()=>{
    const entries=[{ticker:'A',weight:50},{ticker:'B',weight:50}];
    const dates=['2025-01-01','2025-01-02','2025-01-03'].map(d=>new Date(d));
    const returns={A:[1,-.5],B:[0,0]};
    assert.deepEqual(F.portfolioPath(entries,dates,returns,{rebalance:'monthly'}),F.portfolioPath(entries,dates,returns,{rebalance:'hold'}));
    const monthly=['2025-01-31','2025-02-01','2025-02-02'].map(d=>new Date(d));
    assert.deepEqual(F.portfolioPath(entries,monthly,returns,{rebalance:'monthly'}),F.portfolioPath(entries,monthly,returns,{rebalance:'period'}));
});
