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

test('reference scenarios from the RF brief preserve signs and units', () => {
    const cases=[
        [{rateDuration:4,spreadDuration:0,rateBps:50,spreadBps:0},-.01],
        [{rateDuration:0,spreadDuration:3.5,rateBps:0,spreadBps:40},-.007],
        [{rateDuration:4,spreadDuration:3.5,rateBps:50,spreadBps:40},-.017],
        [{rateDuration:4,spreadDuration:0,rateBps:-25,spreadBps:0},.005],
        [{rateDuration:0,spreadDuration:4,rateBps:0,spreadBps:-25},.005],
        [{rateDuration:4,spreadDuration:4,rateBps:0,spreadBps:0},0]
    ];
    for(const [input,expected] of cases){const result=Rates.combinedScenario({amount:1000000,rfWeightPct:50,...input});assert.ok(Math.abs(result.portfolioReturn-expected)<1e-12);assert.ok(Math.abs(result.change-result.portfolioReturn*1000000)<1e-7);}
    const carry=Rates.combinedScenario({amount:1000000,rfWeightPct:50,rateDuration:4,spreadDuration:0,rateBps:50,spreadBps:0,ytmPct:3.5,horizonMonths:6,includeCarry:true});
    assert.ok(Math.abs(carry.portfolioReturn+.00125)<1e-12);
    assert.ok(Math.abs(carry.change+1250)<1e-7);
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

test('forward macro matrix applies convexity on rates and credit shocks on IG/HY sleeves', () => {
    const rows = Rates.prospectiveScenarios({ amount: 100000, rfWeightPct: 80, duration: 3.2, convexity: 12,
        netYieldPct: 3.8, governmentPct: 50, igPct: 40, hyPct: 10, igSpreadDuration: 4, hySpreadDuration: 3.5 });
    assert.equal(rows.length, 4);
    const stagflation = rows[1];
    assert(Math.abs(stagflation.rates + .032) < 1e-12);
    assert(Math.abs(stagflation.convexityReturn - .0006) < 1e-12);
    assert(Math.abs(stagflation.credit + .00975) < 1e-12);
    assert(Math.abs(stagflation.rfReturn + .00315) < 1e-12);
    assert(Math.abs(stagflation.change + 252) < 1e-9);
    const recession = rows[2];
    assert(Math.abs(recession.igCredit + .024) < 1e-12);
    assert(Math.abs(recession.hyCredit + .01225) < 1e-12);
    assert(Math.abs(recession.rfReturn - .0511) < 1e-12);
    const sovereign = Rates.prospectiveScenarios({ amount: 100000, rfWeightPct: 100, duration: 3.2, convexity: 0,
        netYieldPct: 3.8, governmentPct: 100, igPct: 0, hyPct: 0 });
    assert.equal(sovereign[2].credit, 0);
    assert.throws(() => Rates.prospectiveScenarios({ amount: 100000, rfWeightPct: 80, duration: 3.2,
        convexity: 12, netYieldPct: 3.8, governmentPct: 50, igPct: 50, hyPct: 10 }), /Completa/);
});

test('breakeven returns the first quadratic crossing and distinguishes absent positive cushion', () => {
    const point = Rates.breakevenYield({ netYieldPct: 3.8, duration: 3.2, convexity: 12 });
    assert(Math.abs(point.linearBps - 118.75) < 1e-10);
    const dy = point.convexityBps / 10000;
    assert(Math.abs(.038 - 3.2 * dy + .5 * 12 * dy * dy) < 1e-12);
    assert(point.convexityBps > point.linearBps);
    assert.equal(Rates.breakevenYield({ netYieldPct: 0, duration: 3.2, convexity: 0 }).linearBps, 0);
    assert.equal(Rates.breakevenYield({ netYieldPct: -1, duration: 3.2, convexity: 10 }).convexityBps, null);
    assert.equal(Rates.breakevenYield({ netYieldPct: 50, duration: 1, convexity: 20 }).convexityBps, null);
    assert.throws(() => Rates.breakevenYield({ netYieldPct: 3.8, duration: 0 }), /duración/);
});
