const test = require('node:test');
const assert = require('node:assert/strict');
const { capeAnalysis } = require('../assets/market-intelligence-core.js');

test('CAPE uses non-overlapping December observations and real total returns', () => {
    const header = Array(13).fill(null);
    header[0] = 'Date';
    header[12] = 'CAPE';
    const rows = [header];
    for (let year = 2000; year <= 2025; year++) {
        for (let month = 1; month <= 12; month++) {
            const row = Array(13).fill(null);
            row[0] = Number(year + '.' + String(month).padStart(2, '0'));
            row[9] = 100 * 1.06 ** (year - 2000 + (month - 1) / 12);
            row[12] = 15 + (year % 7) + month / 12;
            rows.push(row);
        }
    }
    const result = capeAnalysis(rows);
    assert.equal(result.latest.date, '2025-12');
    assert.equal(result.points[0].date, '2000-12');
    assert.equal(result.points.at(-1).date, '2024-12');
    assert.equal(result.fit.n, 25);
    assert.ok(Math.abs(result.points[0].y - 6) < 1e-9);
});

test('ECB curve parser retains the latest observation and basis for daily change', async () => {
    const { parseCurve } = await import('../api/market-intelligence.js');
    const header = 'KEY,DATA_TYPE_FM,TIME_PERIOD,OBS_VALUE';
    const lines = ['1Y', '2Y', '5Y', '10Y'].flatMap(tenor => [
        'YC,SR_' + tenor + ',2026-11-04,2.5',
        'YC,SR_' + tenor + ',2026-11-05,2.6'
    ]);
    const result = parseCurve([header, ...lines].join('\n'));
    assert.equal(result.date, '2026-11-05');
    assert.equal(result.previousDate, '2026-11-04');
    assert.equal(result.points.length, 4);
    assert.equal(result.points[0].previousRate, 2.5);
});
