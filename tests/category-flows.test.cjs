const test=require('node:test'),assert=require('node:assert/strict'),core=require('../assets/analysis-core.js');
test('category flows conserve portfolio capital, group repeated categories and retain unknowns',()=>{
    const rows=[{isin:'A',weight:15,current:{category:'Bonos',aum:999999},proposed:{category:'Acciones'}},{isin:'B',weight:15,current:{category:' bonos '},proposed:{category:'Acciones'}},{weight:60,current:{category:'Acciones'},proposed:{category:'Acciones'}},{weight:10,current:null,proposed:null}];
    const data=core.categoryFlows(rows,200000);
    assert.equal(data.links.reduce((s,l)=>s+l.amount,0),200000);
    assert.equal(data.links.find(l=>l.source==='bonos').amount,60000);
    assert.equal(data.links.find(l=>l.source==='bonos').funds.length,2);
    assert.equal(data.links.find(l=>l.source==='sin categoria').amount,20000);
    assert.equal(data.links.find(l=>l.source==='acciones').target,'acciones');
    assert.throws(()=>core.categoryFlows(rows,0));assert.throws(()=>core.categoryFlows([{weight:10}],100));assert.throws(()=>core.categoryFlows([{weight:-1},{weight:101}],100));
});
