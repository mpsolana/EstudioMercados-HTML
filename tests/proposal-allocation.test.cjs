const test=require('node:test'),assert=require('node:assert/strict');
const {allocate}=require('../assets/proposal-allocation.js');
const {savings}=require('../assets/proposal-chart-core.js');
const portfolio=(n,prefix,ter)=>Array.from({length:n},(_,i)=>({record:{isin:prefix+i,name:prefix+i,category:i%2?'RF':'RV',ter},weight:100/n}));
for(const [a,b] of [[20,10],[3,10],[10,3]])test(`independent ${a} to ${b} preserves weights and annual cost`,()=>{
 const origin=portfolio(a,'A',1.2),target=portfolio(b,'B',.4),rows=allocate(origin,target);
 for(const [side,positions] of [['current',origin],['proposed',target]])for(const p of positions)assert.ok(Math.abs(rows.filter(r=>r[side].isin===p.record.isin).reduce((s,r)=>s+r.weight,0)-p.weight)<1e-8);
 assert.ok(Math.abs(savings(rows,100000).total-800)<1e-8);
 assert.equal(origin[0].weight,100/a);
});
test('retains common holdings before category reallocation and rejects incomplete portfolios',()=>{
 const origin=portfolio(2,'A',1),target=[{...origin[0],weight:70},{...origin[1],weight:30}];
 const rows=allocate(origin,target);assert.equal(rows[0].current.isin,rows[0].proposed.isin);assert.equal(rows[0].weight,50);
 assert.throws(()=>allocate(origin,[{...target[0],weight:20}]),/100/);
 assert.throws(()=>allocate(origin,[{record:null,weight:100}]),/identifica/);
});
