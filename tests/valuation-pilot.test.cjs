const test = require('node:test');
const assert = require('node:assert/strict');

test('WorldPEratio parser reads numeric monthly series without executing page code', async () => {
    const { parseWorldPe } = await import('../api/world-pe.js');
    const rows = Array.from({ length: 30 }, (_, index) => `[Date.UTC(${2023 + Math.floor(index / 12)}, ${index % 12}, 1),${(14 + index / 10).toFixed(2)}]`).join(',');
    const result = parseWorldPe(`<script>detailPE_data = [${rows}]; window.bad = true;</script>`);
    assert.equal(result.length, 30);
    assert.deepEqual(result[0], { date: '2023-01-01', pe: 14 });
    assert.equal(result.at(-1).date, '2025-06-01');
    assert.throws(() => parseWorldPe('detailPE_data = [alert(1)]'), /reconocida/);
});

test('Yahoo multiple parser preserves dates and missing measures', async () => {
    const { parseValuation } = await import('../api/valuation.js');
    const metrics = parseValuation({ timeseries: { result: [
        { trailingPeRatio: [{ asOfDate: '2026-09-30', reportedValue: { raw: 27 } }, { asOfDate: '2026-06-30', reportedValue: { raw: 24 } }] },
        { trailingEnterprisesValueEBITDARatio: [{ asOfDate: '2026-09-30', reportedValue: { raw: 18 } }] }
    ] } });
    assert.deepEqual(metrics.find(item => item.key === 'trailingPeRatio').observations, [{ date: '2026-06-30', value: 24 }, { date: '2026-09-30', value: 27 }]);
    assert.equal(metrics.find(item => item.key === 'trailingPbRatio').observations.length, 0);
});
