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
