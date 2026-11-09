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

test('ECB curve comparison uses the closest available earlier session and reports its actual date', async () => {
    const { parseCurve } = await import('../api/market-intelligence.js');
    const header = 'KEY,DATA_TYPE_FM,TIME_PERIOD,OBS_VALUE';
    const lines = ['1Y', '2Y', '5Y', '10Y'].flatMap(tenor => [
        'YC,SR_' + tenor + ',2026-09-30,2.1',
        'YC,SR_' + tenor + ',2026-10-30,2.3',
        'YC,SR_' + tenor + ',2026-11-02,2.4'
    ]);
    const result = parseCurve([header, ...lines].join('\n'), '1M');
    assert.equal(result.date, '2026-11-02');
    assert.equal(result.comparisonDate, '2026-09-30');
    assert.equal(result.points[0].comparisonRate, 2.1);
    assert.equal(result.points[0].previousRate, 2.3);
});

test('CAPE longer horizons use annualized real returns and independent windows', () => {
    const header = Array(13).fill(null);
    header[0] = 'Date'; header[12] = 'CAPE';
    const rows = [header];
    for (let year = 1871; year <= 2026; year++) for (let month = 1; month <= 12; month++) {
        const row = Array(13).fill(null);
        row[0] = Number(year + '.' + String(month).padStart(2, '0'));
        row[9] = 100 * 1.04 ** (year - 1871 + (month - 1) / 12);
        row[12] = 10 + year % 19 + month / 12;
        rows.push(row);
    }
    for (const horizon of [3, 5]) {
        const result = capeAnalysis(rows, horizon);
        assert.equal(result.horizonYears, horizon);
        assert.equal(result.points[1].date.slice(0, 4) - result.points[0].date.slice(0, 4), horizon);
        assert.ok(Math.abs(result.points[0].y - 4) < 1e-9);
        assert.ok(result.fit.n >= 30);
    }
});

test('ECB policy rate CSV parser preserves observation dates', async () => {
    const { parseRateSeries } = await import('../api/market-intelligence.js');
    const rows = parseRateSeries('KEY,TIME_PERIOD,OBS_VALUE\nEST,2026-11-05,2.442\nEST,2026-11-06,2.443');
    assert.deepEqual(rows, [{ date: '2026-11-05', value: 2.442 }, { date: '2026-11-06', value: 2.443 }]);
});
