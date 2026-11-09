const test = require('node:test');
const assert = require('node:assert/strict');
const pe = require('../assets/world-pe-core.js');
const financials = require('../assets/company-fundamentals-core.js');

test('PER regression uses independent full-year CAGR windows and reports low sample', () => {
    const rows = Array.from({ length: 120 }, (_, i) => ({ date: `${2000 + Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}-01`, pe: 10 + i / 20 }));
    const prices = rows.map((row, i) => ({ date: row.date, price: 100 * 1.01 ** i }));
    const result = pe.regression(rows, prices, 1);
    assert.equal(result.n, 9);
    assert.ok(result.points.every(point => Math.abs(point.y - (1.01 ** 12 - 1) * 100) < 1e-8));
    assert.equal(result.fit, null); // constant future returns cannot support a meaningful fit
    assert.equal(pe.regression(rows, prices, 5).n, 1);
});

test('annual ROIC, ROE and ROA require two fiscal balance sheets; missing ratios remain missing', () => {
    const keys = financials.fields;
    const first = { revenue: 100, netIncome: 10, operatingIncome: 20, debt: 40, cash: 10, equity: 50, assets: 120, ebitda: 25, currentLiabilities: 20, taxRate: 0.25 };
    const second = { ...first, revenue: 120, netIncome: 12, equity: 60, assets: 140 };
    const payload = { timeseries: { result: Object.entries(keys).map(([name, key]) => ({ [key]: [
        { asOfDate: '2024-12-31', reportedValue: { raw: first[name] } },
        { asOfDate: '2025-12-31', reportedValue: { raw: second[name] } }
    ].filter(item => item.reportedValue.raw !== undefined) })) } };
    const rows = financials.parse(payload);
    assert.equal(rows[0].roe, null);
    assert.equal(rows[1].roe, 12 / 55);
    assert.equal(rows[1].roa, 12 / 130);
    assert.equal(rows[1].roic, 15 / 85);
    assert.equal(rows[1].netDebtEbitda, 30 / 25);
    assert.equal(rows[1].cashRatio, 10 / 20);
    assert.equal(financials.drawdown({ chart: { result: [{ timestamp: [1, 2, 3], indicators: { quote: [{ close: [80, 100, 75] }] } }] } }), -0.25);
});
