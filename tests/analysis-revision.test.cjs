const test=require('node:test'),assert=require('node:assert/strict'),core=require('../assets/analysis-core.js');
const origin={isin:'ES0000000001',fundId:'F1',currency:'EUR',hedging:'No',ter:1,score:4,category:'Bonos'};
test('equivalent classes distinguish unknown, cheapest, universe and approved',()=>{
    const cheap={...origin,isin:'ES0000000002',ter:.2},approved={...origin,isin:'ES0000000003',ter:.4},wrong={...cheap,isin:'ES0000000004',currency:'USD',ter:.1};
    const result=core.classes(origin,[origin,cheap,approved,wrong],new Set([approved.isin]));
    assert.equal(result.status,'cheaper');assert.equal(result.all[0].isin,cheap.isin);assert.equal(result.approved[0].isin,approved.isin);
    assert.equal(core.classes(cheap,[origin,cheap],new Set()).status,'lowest');
    assert.equal(core.classes({...origin,fundId:''},[cheap],new Set()).status,'unknown');
    assert.equal(core.classes({...origin,originSource:{mode:'proxy'}},[cheap],new Set()).status,'unknown');
    assert.equal(core.classes(origin,[{...cheap,ter:NaN}],new Set()).status,'unknown');
});
test('weighted impact uses the same coverage and excludes cross-category score changes',()=>{
    const rows=[{weight:60,current:origin,proposed:{...origin,ter:.5,score:6}},{weight:40,current:origin,proposed:{...origin,ter:NaN,score:9,category:'Acciones'}}];
    const ter=core.comparison(rows,'ter'),score=core.comparison(rows,'score');
    assert.equal(ter.coverage,.6);assert.equal(ter.current,1);assert.equal(ter.proposed,.5);assert.equal(ter.delta,-.5);
    assert.equal(score.coverage,.6);assert.equal(score.delta,2);
});
test('asset class units preserve formatted and explicit percentages without magnitude guessing',()=>{
    for(const value of [.06,'0,06'])assert.equal(core.percent(value,'','fraction'),6);
    assert.equal(core.percent(.06,'0.00%','points'),6);assert.equal(core.percent('6%',''),6);
    assert.equal(core.percent('6','','points'),6);assert.equal(core.percent(-.06,'','fraction'),-6);
    assert.equal(core.percent(.06,'','points'),.06);assert.ok(Number.isNaN(core.percent(null,'')));assert.ok(Number.isNaN(core.percent('N/A','')));
});
test('sampling is bounded, deterministic and covers the full sorted result',()=>{
    const rows=Array.from({length:20000},(_,i)=>i),sample=core.sample(rows,500);assert.equal(sample.length,500);assert.equal(sample[0],0);assert.equal(sample.at(-1),19999);assert.deepEqual(sample,core.sample(rows,500));
});
test('report periods keep a preceding base and do not reuse stale years as YTD',()=>{
    const rows=['2023-12-29','2024-01-31','2024-12-31','2025-02-01'].map(date=>({date:new Date(date),price:100}));
    const ytd=core.windowRows(rows,'YTD','','',new Date('2025-02-01'));assert.equal(ytd.length,2);assert.equal(ytd[0],rows[2]);
    assert.deepEqual(core.windowRows(rows.slice(0,2),'YTD','','',new Date('2025-02-01')),[]);
    assert.throws(()=>core.windowRows(rows,'CUSTOM','2025-01-01','2024-01-01'));
    assert.equal(core.windowRows(rows,'ALL'),rows);
});
