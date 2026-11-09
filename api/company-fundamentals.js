import fundamentals from '../assets/company-fundamentals-core.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });
    const ticker = typeof req.query?.ticker === 'string' ? req.query.ticker.trim().toUpperCase() : '';
    if (!/^[A-Z0-9^._-]{1,20}$/.test(ticker)) return res.status(400).json({ error: 'Ticker no válido' });
    const now = Math.floor(Date.now() / 1000), start = now - 6 * 366 * 86400;
    const fundamentalUrl = new URL(`https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(ticker)}`);
    fundamentalUrl.search = new URLSearchParams({ symbol: ticker, type: Object.values(fundamentals.fields).join(','), period1: String(start), period2: String(now + 86400) }).toString();
    const chartUrl = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}`);
    chartUrl.search = new URLSearchParams({ period1: String(now - 370 * 86400), period2: String(now + 86400), interval: '1d' }).toString();
    try {
        const headers = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' };
        const [financialResponse, chartResult] = await Promise.all([
            fetch(fundamentalUrl, { headers, signal: AbortSignal.timeout(12000) }),
            fetch(chartUrl, { headers, signal: AbortSignal.timeout(12000) }).catch(() => null)
        ]);
        if (!financialResponse.ok) throw new Error('Fundamentales no disponibles');
        const annual = fundamentals.parse(await financialResponse.json());
        if (!annual.length) return res.status(404).json({ error: 'Yahoo no publica estados anuales para este ticker' });
        const chart = chartResult?.ok ? await chartResult.json().catch(() => null) : null;
        res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=3600');
        return res.status(200).json({ ticker, annual, drawdown1y: fundamentals.drawdown(chart), currency: chart?.chart?.result?.[0]?.meta?.currency || null,
            source: `https://finance.yahoo.com/quote/${encodeURIComponent(ticker)}/financials/` });
    } catch {
        return res.status(502).json({ error: 'No se pudieron consultar los estados anuales de Yahoo' });
    }
}
