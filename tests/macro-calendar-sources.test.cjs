const test = require('node:test');
const assert = require('node:assert/strict');

test('BEA and ECB publication calendars preserve official dates and report type', async () => {
    const { fetchBeaReleaseEvents, fetchEcbBulletinEvents, fetchEcbStabilityEvents } = await import('../api/macro/calendar.js');
    const originalFetch = global.fetch;
    global.fetch = async url => ({
        ok: true,
        text: async () => String(url).includes('bea.gov') ?
            '<tr><td><div class="release-date">November 25</div></td><td class="release-title views-field">Personal Income and Outlays, October 2026</td></tr><tr><td><div class="release-date">December 1</div></td><td class="release-title views-field">GDP (Second Estimate), 3rd Quarter 2026</td></tr>' :
            String(url).includes('financial-stability') ? 'The next release set for 18 November 2026.' :
            '<div class="title">Next release</div><ul><li>Next release: Issue 7, 2026 - 12 November 2026</li></ul>'
    });
    try {
        const bea = await fetchBeaReleaseEvents(2026);
        const bulletin = await fetchEcbBulletinEvents(2026);
        const stability = await fetchEcbStabilityEvents(2026);
        assert.deepEqual(bea.map(event => event.date), ['2026-11-25', '2026-12-01']);
        assert.equal(bea[0].label, 'EE. UU. PCE e ingresos');
        assert.equal(bulletin[0].date, '2026-11-12');
        assert.equal(bulletin[0].source, 'ECB');
        assert.equal(stability[0].date, '2026-11-18');
    } finally {
        global.fetch = originalFetch;
    }
});
