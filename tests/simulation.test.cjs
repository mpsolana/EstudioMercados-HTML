const test=require('node:test'),assert=require('node:assert/strict');
const {simulate}=require('../assets/simulation-engine.js');
test('seeded simulation and bootstrap are repeatable',async()=>{
 const input={sims:5,stepsPerYear:12,histDays:24,longTermYears:2,capital:100,logReturns:[.01,-.02,.03],seed:42};
 const a=await simulate(input),b=await simulate(input);assert.deepEqual(a,b);assert.equal(a.monthlySamples[12].length,5);
 const c=await simulate({...input,method:'bootstrap'});assert.equal(c.longTermSamples[2].length,5);
 assert.notDeepEqual(a,c);
});
test('initial stress applies once and is reflected in drawdown',async()=>{
 const input={sims:2,stepsPerYear:12,histDays:24,longTermYears:2,capital:100,logReturns:[0,0],seed:42,initialShock:-.2};
 const result=await simulate(input);
 assert.deepEqual(result.longTermSamples[2],[80,80]);
 assert.ok(Math.abs(result.maxDrawdowns[0]-.2)<1e-12);
});
