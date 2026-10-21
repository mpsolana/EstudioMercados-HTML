const test=require('node:test');
const assert=require('node:assert/strict');
const Optimizer=require('../assets/vendor/portfolio-allocation-0.0.11.min.js');
const Frontier=require('../assets/efficient-frontier-core.js');

function series(count=49,phase=0){
    let price=100;
    return {data:Array.from({length:count},(_,i)=>{
        if(i)price*=1+(phase===0?.004+.012*Math.sin(i*.9):phase===1?.006+.018*Math.cos(i*.75):.005+.009*Math.sin(i*.55));
        return {date:new Date(2021, i, 28),price};
    })};
}
const row=(isin,weight,proxy)=>({record:{isin,name:isin,...(proxy?{originSource:{proxyIsin:proxy}}:{})},weight});
const base=()=>({origin:[row('AAA',60),row('BBB',40)],proposal:[row('AAA',25),row('BBB',25),row('CCC',50)],series:{AAA:series(49,0),BBB:series(49,1),CCC:series(49,2)},optimizer:Optimizer});

test('frontier uses common monthly returns and exact independent proposal weights',()=>{
    const result=Frontier.calculate(base());
    assert.equal(result.months.length,49);
    assert.equal(result.assets.length,3);
    assert.ok(result.frontier.length>=20);
    assert.ok(result.frontier.every(p=>p.weights.every(w=>w>=-1e-6&&w<=1+1e-6)));
    assert.ok(result.actual.risk>0&&result.proposed.risk>0);
    assert.ok(result.actual.ret!==result.proposed.ret);
    assert.ok(result.actual.gap>=0&&result.proposed.gap>=0);
});
test('hypotheses change expected return but retain historical risk matrix',()=>{
    const input=base(),historical=Frontier.calculate(input);
    const scenario=Frontier.calculate({...input,mode:'assumptions',expected:{AAA:18,BBB:2,CCC:8}});
    assert.equal(scenario.assets[0].expectedReturn,18);
    assert.equal(scenario.actual.risk,historical.actual.risk);
    assert.notEqual(scenario.actual.ret,historical.actual.ret);
});
test('missing histories, incomplete shared window and inconsistent weights fail visibly',()=>{
    const input=base();delete input.series.CCC;
    assert.throws(()=>Frontier.calculate(input),/Faltan históricos/);
    input.series.CCC=series(20,2);
    assert.throws(()=>Frontier.calculate(input),/36 rentabilidades mensuales/);
    input.series.CCC=series(49,2);input.origin[0].weight=50;
    assert.throws(()=>Frontier.calculate(input),/deben sumar 100/);
});
test('proxy shares use the proxy history without inventing a second series',()=>{
    const input=base();input.origin=[row('CLASS-A',60,'AAA'),row('BBB',40)];
    const result=Frontier.calculate(input);
    assert.equal(result.assets.length,3);
    assert.equal(result.assets.find(asset=>asset.key==='AAA').origin,.6);
});
test('weight cap is enforced on frontier and identifies out-of-policy current portfolio',()=>{
    const result=Frontier.calculate({...base(),maxWeight:40});
    assert.ok(result.frontier.every(p=>p.weights.every(w=>w<=.400001)));
    assert.equal(result.actual.feasible,false);
    assert.equal(result.proposed.feasible,false);
    assert.throws(()=>Frontier.calculate({...base(),maxWeight:30}),/no permite invertir/);
});
test('benchmark appears only with complete coverage of the same monthly window',()=>{
    const complete=Frontier.calculate({...base(),benchmark:series(49,1)});
    assert.ok(complete.benchmark&&Number.isFinite(complete.benchmark.ret));
    const incomplete=Frontier.calculate({...base(),benchmark:series(42,1)});
    assert.equal(incomplete.benchmark,null);
    assert.equal(incomplete.frontier.length,complete.frontier.length);
});
