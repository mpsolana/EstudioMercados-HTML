const test=require('node:test'),assert=require('node:assert/strict'),core=require('../assets/analysis-core.js');
const origin={isin:'A',name:'Global Strategic Bond A EUR',manager:'House',category:'Bonds',aum:1000,ter:1,currency:'EUR',managerTenure:8};
test('research candidates cross category and hedging without automatic equivalence or approval',()=>{
 const candidate={...origin,isin:'B',name:'Global Strategic Bond I EUR Hedged',category:'Other',ter:.5};
 assert.equal(core.classMatch(origin,candidate),'');
 assert.deepEqual(core.classCandidates(origin,[candidate]),[candidate]);
 assert.deepEqual(core.classes(origin,[origin,candidate],new Set(['B'])).all,[]);
 const euro={...candidate,name:'Global Strategic Bond Euro Hedge'};
 assert.deepEqual(core.classCandidates(origin,[euro]),[euro]);assert.equal(core.classMatch(origin,euro),'');
});
test('AUM, tenure or manager alone never identify a fund family',()=>{
 const unrelated=[{...origin,isin:'B',name:'Global Equity Income'},{...origin,isin:'C',manager:'Another House'},{...origin,isin:'D',aum:300},{...origin,isin:'E',fundId:'different'}];
 assert.deepEqual(core.classCandidates({...origin,fundId:'base'},unrelated),[]);
 assert.deepEqual(core.classCandidates(origin,[{...origin,isin:'T',name:'Global Strategic Bond Fund I',managerTenure:NaN}]),[]);
 assert.equal(core.classCandidates(origin,[{...origin,isin:'T',name:'Global Strategic Bond Fund I',managerTenure:8}]).length,0);
});
test('explicit shared subfund ID identifies candidates but currency differences remain non-equivalent',()=>{
 const candidate={...origin,isin:'B',fundId:'123',currency:'USD'};
 assert.equal(core.classCandidates({...origin,fundId:'123'},[candidate]).length,1);
 assert.equal(core.classMatch({...origin,fundId:'123'},candidate),'');
});
test('tenure supports near family names only together with matching manager and AUM',()=>{
 const a={...origin,name:'Global Strategic Income Bond EUR'},b={...origin,isin:'B',name:'Global Strategic Income Bond Fund EUR'};
 assert.equal(core.classCandidates(a,[b]).length,1);
 assert.equal(core.classCandidates(a,[{...b,managerTenure:NaN}]).length,0);
 assert.equal(core.classCandidates(a,[{...b,manager:'Other'}]).length,0);
});
