const test = require('node:test');
const assert = require('node:assert/strict');
const Rates = require('../assets/rate-sensitivity.js');

test('modified duration scales price impact by the fixed-income sleeve', () => {
    const rise = Rates.scenario({ amount: 100000, rfWeightPct: 40, duration: 4, changeBps: 100 });
    assert.equal(rise.rfAmount, 40000);
    assert.equal(rise.change, -1600);
    assert.equal(rise.portfolioReturn, -0.016);
    assert.equal(rise.portfolioValue, 98400);
    const fall = Rates.scenario({ amount: 100000, rfWeightPct: 40, duration: 4, changeBps: -100 });
    assert.equal(fall.change, 1600);
    assert.throws(() => Rates.scenario({ amount: 100, rfWeightPct: 101, duration: 4, changeBps: 100 }));
});

test('combined types and spread shocks keep separate durations and carry', () => {
    const result=Rates.combinedScenario({amount:100000,rfWeightPct:40,rateDuration:4,spreadDuration:3.5,rateBps:50,spreadBps:40,ytmPct:3,horizonMonths:6,includeCarry:true});
    assert.equal(result.rfAmount,40000);
    assert.equal(result.rateAmount,-800);
    assert.equal(result.creditAmount,-560);
    assert.equal(result.carryAmount,600);
    assert.ok(Math.abs(result.change+760)<1e-9);
    assert.ok(Math.abs(result.portfolioValue-99240)<1e-9);
    assert.ok(Math.abs(result.portfolioReturn+0.0076)<1e-12);
    assert.throws(()=>Rates.combinedScenario({amount:100000,rfWeightPct:40,rateDuration:4,rateBps:0,spreadBps:50}),/spread duration/);
    assert.equal(Rates.combinedScenario({amount:100000,rfWeightPct:40,rateDuration:4,rateBps:50,spreadBps:0}).change,-800);
});

test('position metrics require full coverage and never impute spread duration', () => {
    const summary=Rates.weightedPositions([{value:30000,rateDuration:4,spreadDuration:3,ytmPct:3},{value:10000,rateDuration:2,spreadDuration:NaN,ytmPct:5}],100000);
    assert.equal(summary.rfWeightPct,40);
    assert.equal(summary.rateDuration,3.5);
    assert.equal(summary.ytmPct,3.5);
    assert.ok(Number.isNaN(summary.spreadDuration));
    assert.equal(summary.missing.length,1);
});

test('forward pairs use month-end prices, a 12-month rate change and a calendar-month horizon', () => {
    const assets = [], rates = [];
    for (let month = 0; month < 27; month++) {
        const date = new Date(Date.UTC(2023, month + 1, 0));
        assets.push({ date, price: 100 + month });
        rates.push({ date, price: month - 2 });
    }
    const pairs = Rates.forwardPairs(assets, rates, 3);
    assert.equal(pairs.length, 12);
    assert.equal(pairs[0].date.toISOString().slice(0, 10), '2024-01-31');
    assert.equal(pairs[0].rateLevel, 10);
    assert.equal(pairs[0].rateChange, 12);
    assert.ok(Math.abs(pairs[0].forwardRet - 3 / 112) < 1e-12);
    assert.equal(Rates.summarize(pairs, pair => pair.rateChange > 0).n, 12);
    assert.equal(Rates.summarize(pairs, pair => pair.rateChange < 0).n, 0);
});

test('stale rate data are not carried across a long gap', () => {
    const assets = [], rates = [];
    for (let month = 0; month < 28; month++) {
        const date = new Date(Date.UTC(2023, month + 1, 0));
        assets.push({ date, price: 100 + month });
        if (month < 15) rates.push({ date, price: month });
    }
    assert.equal(Rates.forwardPairs(assets, rates, 1).length, 4);
});
