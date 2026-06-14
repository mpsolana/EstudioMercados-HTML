// api/macro/health.js
// Lightweight diagnostics for the macro data layer.

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const checks = await Promise.all([
        checkFred(),
        checkBls(),
        checkEurostat(),
        checkEcb()
    ]);

    const ok = checks.every(c => c.ok || c.optional);
    return res.status(ok ? 200 : 503).json({
        ok,
        generatedAt: new Date().toISOString(),
        checks
    });
}

async function checkFred() {
    const apiKey = process.env.FRED_API_KEY || process.env.FRED_API_TOKEN;
    if (!apiKey) {
        return {
            provider: 'FRED',
            ok: false,
            optional: false,
            message: 'FRED_API_KEY no configurada'
        };
    }

    try {
        const url = new URL('https://api.stlouisfed.org/fred/series/observations');
        url.searchParams.set('series_id', 'DFEDTARU');
        url.searchParams.set('api_key', apiKey);
        url.searchParams.set('file_type', 'json');
        url.searchParams.set('sort_order', 'desc');
        url.searchParams.set('limit', '1');

        const response = await fetch(url, { headers: { Accept: 'application/json' } });
        return {
            provider: 'FRED',
            ok: response.ok,
            optional: false,
            message: response.ok ? 'OK' : `HTTP ${response.status}`
        };
    } catch (error) {
        return { provider: 'FRED', ok: false, optional: false, message: error.message };
    }
}

async function checkBls() {
    try {
        const response = await fetch('https://api.bls.gov/publicAPI/v2/timeseries/data/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ seriesid: ['CUUR0000SA0'], startyear: '2025', endyear: String(new Date().getUTCFullYear()) })
        });
        return {
            provider: 'BLS',
            ok: response.ok,
            optional: false,
            message: response.ok ? 'OK' : `HTTP ${response.status}`
        };
    } catch (error) {
        return { provider: 'BLS', ok: false, optional: false, message: error.message };
    }
}

async function checkEurostat() {
    try {
        const response = await fetch('https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_minr?format=JSON&lang=en&unit=RCH_A&coicop18=TOTAL&geo=EA20&lastTimePeriod=1', {
            headers: { Accept: 'application/json' }
        });
        return {
            provider: 'Eurostat',
            ok: response.ok,
            optional: false,
            message: response.ok ? 'OK' : `HTTP ${response.status}`
        };
    } catch (error) {
        return { provider: 'Eurostat', ok: false, optional: false, message: error.message };
    }
}

async function checkEcb() {
    try {
        const response = await fetch('https://data-api.ecb.europa.eu/service/data/FM/B.U2.EUR.4F.KR.DFR.LEV?format=csvdata&lastNObservations=1', {
            headers: { Accept: 'text/csv' }
        });
        return {
            provider: 'ECB',
            ok: response.ok,
            optional: false,
            message: response.ok ? 'OK' : `HTTP ${response.status}`
        };
    } catch (error) {
        return { provider: 'ECB', ok: false, optional: false, message: error.message };
    }
}
