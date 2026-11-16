const assert = require('node:assert/strict');
const test = require('node:test');
const { calculate } = require('../assets/portfolio-mandate.js');

const etf = { kind: 'Dividendo', isin: 'IE0000000001', name: 'ETF de distribución', confirmed: true, ccy: 'EUR' };
const bond = { kind: 'Cupón', isin: 'FR0000000002', name: 'BONO 2,50 301129', confirmed: true, ccy: 'EUR' };
const trade = (instrument, code, date, amount) => ({ ...instrument, code, date, amount });

test('projects a regular dividend and derives a bond coupon from name and nominal', () => {
    const trades = [
        trade(etf, '1', '2026-03-18', 235),
        trade(etf, '2', '2026-06-19', 248),
        trade(etf, '3', '2026-09-17', 252),
        { ...bond, code: '4', kind: '', date: '2026-06-18', nominal: 200000, bondMovement: 1 }
    ];
    const result = calculate({ cutoff: '2026-10-05' }, { trades });
    assert.deepEqual(result.calendar.map(({ date, amount, gross }) => [date, amount, gross]), [
        ['2026-11-30', 5000, true], ['2026-12-18', 245, false]
    ]);
    assert.deepEqual(result.calendar[1].range, [235, 252]);
    assert.equal(result.bonds[0].maturity, '2029-11-30');
});

test('hand-entered coupons take priority and sold bonds do not contribute future income', () => {
    const trades = [
        { ...trade(bond, '5', '2025-11-30', 4998), nominal: 200000 },
        { ...bond, kind: '', code: '6', nominal: 200000, date: '2026-09-15', bondMovement: -1 }
    ];
    const result = calculate({
        cutoff: '2026-10-05',
        rules: { 'C:BONO NUEVO 5 311028': { name: 'BONO NUEVO 5 311028', kind: 'Cupón', nominal: '100000', net: '4800' } }
    }, { trades });
    assert.deepEqual(result.calendar.map(({ date, amount, gross }) => [date, amount, gross]), [['2026-10-31', 4800, false]]);
    assert.equal(result.bonds.length, 1);
    assert.equal(result.paymentAssets.find(row => row.isin === bond.isin).excluded, true);
});

test('a recurring override rolls forward across years, while a newly booked payment stays in actuals', () => {
    const trades = [trade(etf, '1', '2027-09-17', 250)];
    const result = calculate({
        cutoff: '2027-09-30',
        rules: { ['D:' + etf.isin]: { name: etf.name, kind: etf.kind, next: '2025-09-18', frequency: '3', net: '280' } }
    }, { trades });
    assert.equal(result.dividends, 250);
    assert.deepEqual(result.calendar.map(({ date, amount }) => [date, amount]), [['2027-12-18', 280]]);
});

test('an override saved by product name follows the ISIN when it appears in a later extract', () => {
    const trades = [{ ...bond, kind: '', code: '2', nominal: 200000, date: '2026-09-10', bondMovement: 1 }];
    const result = calculate({
        cutoff: '2026-10-05',
        rules: { 'C:BONO 2 50 301129': { name: bond.name, kind: bond.kind, nominal: '200000', net: '4990' } }
    }, { trades });
    assert.equal(result.paymentAssets.length, 1);
    assert.deepEqual(result.calendar.map(({ isin, amount }) => [isin, amount]), [[bond.isin, 4990]]);
});
