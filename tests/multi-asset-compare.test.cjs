const test=require('node:test'),assert=require('node:assert/strict'),Compare=require('../assets/multi-asset-compare.js');
const dates=['2023-01-02','2023-02-02','2023-03-02','2023-04-03'];
const series=values=>values.map((price,i)=>({date:new Date(dates[i]+'T00:00:00Z'),price}));
test('compares only common dates and rebases each asset at the same point',()=>{
    const a={ticker:'A',data:series([100,110,120,130])},b={ticker:'B',data:series([50,55,60,65]).slice(1)};
    const result=Compare.compare([a,b]);
    assert.equal(result.rows.length,3);
    assert.deepEqual(result.assets[0].base100,[100,120/110*100,130/110*100]);
    assert.deepEqual(result.assets[1].base100,[100,60/55*100,65/55*100]);
    assert.ok(Number.isNaN(result.assets[0].annual));
});
test('drawdown and risk use the same selected window',()=>{
    const a={ticker:'A',data:series([100,120,90,110])},b={ticker:'B',data:series([100,100,100,100])};
    const result=Compare.compare([a,b]);
    assert.equal(result.assets[0].drawdown,-.25);
    assert.equal(result.assets[1].vol,0);
    assert.throws(()=>Compare.compare([a]),/dos y cuatro/);
    assert.throws(()=>Compare.compare([a,{ticker:'C',data:series([1,2,3,4]).slice(3)}]),/tres precios/);
});
test('keeps four assets on one shared calendar',()=>{
    const assets=['A','B','C','D'].map((ticker,index)=>({ticker,data:series([100,101+index,102+index,103+index])}));
    const result=Compare.compare(assets);
    assert.equal(result.assets.length,4);
    assert.equal(result.rows.length,4);
    assert.equal(new Set(result.assets.map(asset=>asset.color)).size,4);
});
