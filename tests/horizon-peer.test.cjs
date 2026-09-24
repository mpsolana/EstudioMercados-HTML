const test=require('node:test'),assert=require('node:assert/strict'),H=require('../assets/horizon-core.js'),P=require('../assets/peer-value.js');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);
for(const freq of ['D','C','W','M','Q','A'])test(`rolling mean and range share all windows at ${freq} frequency`,()=>{
 const annual=H.periodsPerYear[freq],series=H.fromReturns(Array.from({length:annual*6},(_,i)=>i%3===0?-.03:.018));
 const r=H.horizon(series,60,freq),samples=H.windows(series,annual*5,freq),s=H.summary(samples,'annualized');
 assert.equal(r.count,annual+1);near(r.meanAnn,s.mean);near(r.minAnn,s.min);near(r.maxAnn,s.max);
});
test('annualize each window before averaging; short horizons are cumulative; insufficient data is not zero',()=>{
 const series=H.fromReturns(Array.from({length:60},(_,i)=>i<20?-.025:.04)),r=H.horizon(series,36,'M');
 assert.ok(Math.abs(r.meanAnn-((1+r.meanTot)**(1/3)-1))>1e-5);
 near(H.horizon(series,3,'M').meanAnn,H.horizon(series,3,'M').meanTot);
 assert.ok(Number.isNaN(H.horizon(series,120,'M').meanAnn));assert.equal(H.horizon(series,120,'M').count,0);
 assert.equal(H.horizon(series,1,'Q'),null);
 assert.equal(H.windows([{price:100},{price:NaN},{price:110}],2,'M').length,0);
});
test('known compounding is annualized using the actual input frequency',()=>{
 const daily=H.horizon(H.fromReturns(Array(253).fill(.001)),12,'D');near(daily.meanAnn,1.001**252-1);assert.equal(daily.count,2);
 const monthly=H.horizon(H.fromReturns(Array(61).fill(.01)),60,'M');near(monthly.meanAnn,1.01**12-1);assert.equal(monthly.count,2);
});
test('peer value uses a common complete cohort, deduplicates ISINs, and excludes the fund itself',()=>{
 const records=[{isin:'A',category:'RV',ter:1,score:4},{isin:'B',category:'rv',ter:2,score:2},{isin:'C',category:'RV',ter:3,score:3},{isin:'D',category:'RV',ter:4,score:4},{isin:'E',category:'RV',ter:.1,score:NaN},{isin:'Z',category:'RF',ter:.2,score:9}];
 const idx=P.index([...records,records[1]]),r=P.compare(records[0],idx);
 assert.equal(r.count,3);assert.equal(r.total,4);near(r.meanTer,3);near(r.meanScore,3);near(r.deltaTer,-2);assert.match(r.assessment,/Menor coste \/ mejor/);
 assert.equal(P.compare({...records[0],category:'RF'},idx).assessment,'Muestra reducida');
 assert.ok(Number.isNaN(P.compare({category:'Sin categoria'},idx).meanTer));
 near(P.compare({...records[0],ter:.5},idx).meanTer,3);
});
