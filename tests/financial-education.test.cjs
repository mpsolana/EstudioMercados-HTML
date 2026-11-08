const test=require('node:test');
const assert=require('node:assert/strict');
const Core=require('../assets/financial-education-core.js');

test('compound growth in accumulating ETF without sales has no annual tax',()=>{
    const scenario=Core.simulate({capital:100000,basis:100000,years:10,annualReturn:.06,fee:0,dividendYield:0,realizedFraction:0,taxRate:.25});
    assert.equal(scenario.annualTax,0);
    assert.ok(Math.abs(scenario.grossFinal-100000*1.06**10)<.01);
    assert.ok(scenario.exitTax>0);
});
test('eligible fund deferral helps only when taxable comparator realizes gains',()=>{
    const common={capital:100000,basis:100000,years:15,annualReturn:.06,taxRate:.25,fundFee:0,taxableFee:0,dividendYield:0,transition:false};
    const noSales=Core.comparison({...common,realizedFraction:0});
    assert.ok(Math.abs(noSales.fund.netFinal-noSales.taxable.netFinal)<.01);
    const annualSales=Core.comparison({...common,realizedFraction:1});
    assert.ok(annualSales.fund.netFinal>annualSales.taxable.netFinal);
});
test('one-time switch from shares taxes initial positive gain and resets basis',()=>{
    const result=Core.simulate({capital:100000,basis:80000,years:1,annualReturn:0,fee:0,dividendYield:0,realizedFraction:0,taxRate:.25,transition:true});
    assert.equal(result.initialTax,5000);
    assert.equal(result.rows[0].basis,95000);
    assert.equal(result.netFinal,95000);
});
test('unrealized loss does not create a tax credit in the simplified model',()=>{
    const result=Core.simulate({capital:100000,basis:120000,years:1,annualReturn:0,fee:0,dividendYield:0,realizedFraction:0,taxRate:.25,transition:true});
    assert.equal(result.initialTax,0);
    assert.equal(result.netFinal,100000);
});
test('dividends have annual leakage while untouched gains do not',()=>{
    const result=Core.simulate({capital:100000,basis:100000,years:1,annualReturn:.06,fee:0,dividendYield:.02,realizedFraction:0,taxRate:.25});
    assert.equal(result.annualTax,500);
    assert.equal(result.grossFinal,105500);
});
test('TIR and equal-correlation diversification retain mathematical checks',()=>{
    assert.ok(Math.abs(Core.irr([-100,110])-.1)<1e-10);
    assert.equal(Core.irr([-100,-10]),null);
    const rows=Core.diversification({count:20,volatility:20,correlation:.25});
    assert.equal(rows[0].risk,20);
    assert.ok(rows.at(-1).risk<rows[0].risk);
    assert.ok(rows.at(-1).risk>10);
});
