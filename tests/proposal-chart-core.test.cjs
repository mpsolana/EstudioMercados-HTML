const test=require('node:test'),assert=require('node:assert/strict'),core=require('../assets/proposal-chart-core.js');
const row=(weight,ter,newTer)=>({weight,isin:'A',current:{name:'A',category:'Bonos',manager:'Gestora',ter},proposed:{name:'B',category:'Bonos',manager:'Otra',ter:newTer}});
test('waterfall respects positive and negative savings, missing values and weights',()=>{
 const data=core.savings([row(60,1,.5),row(40,.5,1)],200000);assert.equal(data.total,200);assert.equal(data.coverage,100);
 const missing=core.savings([row(60,1,.5),row(40,NaN,1)],200000);assert.equal(missing.total,600);assert.equal(missing.coverage,60);assert.equal(missing.missing,1);
 assert.throws(()=>core.savings([row(30,1,.5)],100));assert.throws(()=>core.savings([row(100,1,.5)],0));
});
test('paired scoring suppresses incomparable categories, not zero or negative valid scores',()=>{
 const r=row(100,0,.5);r.current.score=0;r.proposed.score=-1;assert.deepEqual(core.pairs([r])[0].score,[0,-1]);r.proposed.category='Acciones';assert.deepEqual(core.pairs([r])[0].score,[null,null]);assert.deepEqual(core.pairs([r])[0].ter,[0,.5]);
});
test('concentration conserves both totals and identifies missing metadata',()=>{
 const data=core.concentration([row(60,1,.5),{weight:40,current:{manager:' gestora '},proposed:null}],'manager');assert.equal(data.find(r=>r.label==='Gestora').current,100);assert.equal(data.reduce((s,r)=>s+r.proposed,0),100);assert.equal(data.find(r=>r.label==='Gestora sin identificar').proposed,40);
});
test('opportunities require actual complete amounts and never fabricate client counts',()=>{
 const entry={position:{isin:'A',amount:100000,rows:2,amountCount:2,accountCount:2,clientCount:1},current:{ter:1,name:'A'},alternative:{ter:.5,name:'B'}};
 const data=core.opportunities([entry]);assert.equal(data.points[0].saving,500);assert.equal(data.sizedByClients,true);
 assert.equal(core.opportunities([{...entry,position:{...entry.position,amountCount:1}}]).points.length,0);
 assert.equal(core.opportunities([{...entry,position:{...entry.position,accountCount:1}}]).sizedByClients,false);
});
