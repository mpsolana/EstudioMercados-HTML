const test=require('node:test');
const assert=require('node:assert/strict');
const Drawdown=require('../assets/market-drawdown.js');
const prices=values=>values.map((price,index)=>({date:new Date(Date.UTC(2026,0,index+1)),price}));

test('max drawdown measures trough to recovery in calendar days',()=>{
    const result=Drawdown.analyze(prices([100,90,80,85,100,70,80]));
    assert.ok(Math.abs(result.depth+.3)<1e-12);
    assert.equal(result.recovered,false);
    assert.equal(result.days,1);
    assert.ok(Math.abs(result.curve.at(-1).drawdown+.2)<1e-12);
});

test('recovered episode uses first previous-peak regain',()=>{
    const result=Drawdown.analyze(prices([100,80,85,100,110]));
    assert.ok(Math.abs(result.depth+.2)<1e-12);
    assert.equal(result.recovered,true);
    assert.equal(result.days,2);
    assert.equal(result.recovery.toISOString().slice(0,10),'2026-01-04');
});

test('invalid and short series do not produce a statistic',()=>{
    assert.equal(Drawdown.analyze(prices([100])),null);
    assert.equal(Drawdown.analyze([{date:'bad',price:1}]),null);
});
