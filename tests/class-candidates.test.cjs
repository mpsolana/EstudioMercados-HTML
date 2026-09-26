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
test('conflicting manager, AUM and explicit family IDs do not produce candidates',()=>{
 const unrelated=[{...origin,isin:'C',manager:'Another House'},{...origin,isin:'D',aum:300},{...origin,isin:'E',fundId:'different'}];
 assert.deepEqual(core.classCandidates({...origin,fundId:'base'},unrelated),[]);
 assert.equal(core.classCandidates(origin,[{...origin,isin:'T',name:'Global Strategic Bond Fund I',managerTenure:NaN}]).length,1);
 assert.equal(core.classCandidates(origin,[{...origin,isin:'T',name:'Global Strategic Bond Fund I',managerTenure:8}]).length,1);
});
test('explicit shared subfund ID identifies candidates but currency differences remain non-equivalent',()=>{
 const candidate={...origin,isin:'B',fundId:'123',currency:'USD'};
 assert.equal(core.classCandidates({...origin,fundId:'123'},[candidate]).length,1);
 assert.equal(core.classMatch({...origin,fundId:'123'},candidate),'');
});
test('matching manager and AUM support near family names even without tenure',()=>{
 const a={...origin,name:'Global Strategic Income Bond EUR'},b={...origin,isin:'B',name:'Global Strategic Income Bond Fund EUR'};
 assert.equal(core.classCandidates(a,[b]).length,1);
 assert.equal(core.classCandidates(a,[{...b,managerTenure:NaN}]).length,1);
 assert.equal(core.classCandidates(a,[{...b,manager:'Other'}]).length,0);
});
test('metadata layer adds cross-category candidates regardless of name or class suffix',()=>{
 const candidate={...origin,isin:'B',name:'Completely Different Label Z',category:'Other',manager:'House Asset Management',aum:1010,managerTenure:NaN};
 assert.deepEqual(core.classCandidates(origin,[candidate]),[candidate]);
 assert.equal(core.classMatch(origin,candidate),'');
 assert.deepEqual(core.classes(origin,[origin,candidate],new Set(['B'])).all,[]);
 assert.deepEqual(core.classCandidates(origin,[{...candidate,aum:1100}]),[]);
 assert.deepEqual(core.classCandidates(origin,[{...candidate,manager:'',managerTenure:NaN}]),[]);
 assert.equal(core.classCandidates(origin,[{...candidate,manager:'',managerTenure:8}]).length,1);
 assert.deepEqual(core.classCandidates(origin,[{...candidate,manager:'',managerTenure:NaN,fundTenure:8}]),[]);
 assert.deepEqual(core.classCandidates(origin,[{...candidate,manager:'Other House',managerTenure:8}]),[]);
});
test('EURH share classes cross categories but stay research candidates, not equivalents',()=>{
 const other={...origin,isin:'H',name:'Global Strategic Bond I EURH Acc',category:'Other',manager:'House Asset Management'};
 assert.equal(core.familyName(other.name),core.familyName(origin.name));assert.equal(core.classCandidates(origin,[other]).length,1);assert.equal(core.classMatch(origin,other),'');
 assert.equal(core.classCandidates(origin,[{...other,aum:NaN}]).length,1);
 assert.equal(core.classCandidates(origin,[{...other,aum:NaN,managerTenure:NaN}]).length,0);
 assert.equal(core.classCandidates(origin,[{...other,aum:NaN,managerTenure:NaN,fundTenure:8}]).length,0);
 assert.equal(core.classCandidates({...origin,managerTenure:NaN,fundTenure:8},[{...other,aum:NaN,managerTenure:NaN,fundTenure:8}]).length,1);
});
