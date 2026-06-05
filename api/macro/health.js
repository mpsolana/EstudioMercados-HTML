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
        checkWorldBank()
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
        url.searchParams.set('series_id', 'FEDFUNDS');
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

async function checkWorldBank() {
    try {
        const response = await fetch('https://api.worldbank.org/v2/country/US/indicator/FP.CPI.TOTL.ZG?format=json&per_page=1', {
            headers: { Accept: 'application/json' }
        });
        return {
            provider: 'World Bank',
            ok: response.ok,
            optional: true,
            message: response.ok ? 'OK' : `HTTP ${response.status}`
        };
    } catch (error) {
        return { provider: 'World Bank', ok: false, optional: true, message: error.message };
    }
}
