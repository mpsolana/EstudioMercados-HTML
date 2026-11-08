const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../assets/financial-education-advanced-core.js');

test('VAN descuenta flujos y coincide con TIR en el caso simple',()=>{
    assert.ok(Math.abs(C.npv([-100,110],.1))<1e-9);
    assert.equal(C.npv([-100,110],.2)<0,true);
    assert.throws(()=>C.npv([-100,110],-1),/tasa/);
});
test('el cruce compara intereses y aportaciones del mismo mes',()=>{
    const result=C.growth({capital:100000,monthly:500,annualReturn:.08,years:20});
    assert.equal(result.crossover,1);
    assert.equal(result.crossoverMonth,1);
    assert.ok(result.rows[1].interest>result.rows[1].contribution);
    assert.equal(result.monthlyRows.length,240);
    assert.equal(C.growth({capital:0,monthly:500,annualReturn:0,years:20}).crossover,null);
});
test('menor comisión preserva capital e interés compuesto',()=>{
    const input={capital:100000,monthly:200,annualReturn:.07,years:25};
    const different=C.feeDrag({...input,feeHigh:.02,feeLow:.003});
    assert.ok(different.low.at(-1)>different.high.at(-1));
    const equal=C.feeDrag({...input,feeHigh:.01,feeLow:.01});
    assert.equal(equal.high.at(-1),equal.low.at(-1));
});
test('mix es exhaustivo y cambia con horizonte e incomodidad',()=>{
    const calm=C.assetMix({horizon:35,panic:20}),nervous=C.assetMix({horizon:5,panic:90});
    assert.ok(calm.equity>nervous.equity);
    assert.ok(Math.abs(Object.values(calm).slice(0,4).reduce((sum,value)=>sum+value,0)-100)<1e-9);
});
test('FIRE y liquidez usan definiciones explícitas',()=>{
    assert.equal(C.fire({monthlyExpenses:2500,currentCapital:150000,withdrawalRate:.04}).target,750000);
    assert.equal(C.emergency({cash:12000,monthlyEssentials:2000,targetMonths:6}).months,6);
});
test('Monte Carlo con volatilidad cero coincide con capitalización determinista',()=>{
    const input={capital:100000,monthly:400,annualReturn:.06,volatility:0,years:10,target:100000,paths:100};
    const mc=C.monteCarlo(input),det=C.growth(input).rows.at(-1).value;
    assert.ok(Math.abs(mc.rows.at(-1).p50-det)<1e-5);
    assert.ok(Math.abs(mc.rows.at(-1).p90-mc.rows.at(-1).p10)<1e-5);
    assert.equal(mc.probability,1);
});
test('alquilar o comprar iguala el flujo mensual y refleja capital hipotecario',()=>{
    const result=C.rentBuy({price:120000,rent:1000,downPaymentRate:.5,entryCostRate:0,saleCostRate:0,mortgageRate:0,mortgageYears:10,maintenanceRate:0,annualTax:0,homeGrowth:0,rentGrowth:0,investmentReturn:0,years:10});
    assert.equal(result.payment,500);
    assert.equal(result.rows[0].owner,result.rows[0].renter);
    assert.ok(Math.abs(result.rows.at(-1).owner-180000)<.01);
    assert.ok(Math.abs(result.rows.at(-1).renter-60000)<.01);
    assert.equal(result.crossover,1);
});
test('empezar antes distingue rendimientos y capital adicional aportado',()=>{
    const rows=C.procrastination({startAge:25,laterAge:35,retirementAge:65,monthly:200,annualReturn:.06});
    assert.ok(rows.at(-1).early>rows.at(-1).late);
    assert.equal(rows.at(-1).earlyPaid-rows.at(-1).latePaid,24000);
});
test('avalancha ahorra intereses y bola de nieve anticipa primera cancelación',()=>{
    const debts=[{balance:5000,apr:.07,minimum:100},{balance:8000,apr:.19,minimum:130}];
    const avalanche=C.debtPlan({debts,monthlyBudget:500,method:'avalanche'});
    const snowball=C.debtPlan({debts,monthlyBudget:500,method:'snowball'});
    assert.ok(avalanche.totalInterest<snowball.totalInterest);
    assert.ok(snowball.firstPayoff<avalanche.firstPayoff);
    assert.ok(avalanche.rows.at(-1).remaining<1e-6);
});
