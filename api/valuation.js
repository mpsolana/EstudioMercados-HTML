const MEASURES = Object.freeze({
    trailingPeRatio: 'PER histórico',
    trailingForwardPeRatio: 'PER estimado',
    trailingEnterprisesValueEBITDARatio: 'EV/EBITDA',
    trailingPsRatio: 'Precio/ventas',
    trailingPbRatio: 'Precio/valor contable',
    trailingEnterprisesValueRevenueRatio: 'EV/ingresos'
});

function parseValuation(payload) {
    if (payload?.timeseries?.error) throw new Error('Yahoo no devolvió fundamentales');
    const result = payload?.timeseries?.result || [];
    return Object.entries(MEASURES).map(([key, label]) => {
        const found = result.find(item => Array.isArray(item[key]));
        const observations = (found?.[key] || []).map(item => ({ date: item.asOfDate, value: Number(item.reportedValue?.raw) }))
            .filter(item => /^\d{4}-\d{2}-\d{2}$/.test(item.date) && Number.isFinite(item.value) && item.value > 0)
            .sort((a, b) => a.date.localeCompare(b.date));
        return { key, label, observations };
    });
}

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });
    const ticker = typeof req.query?.ticker === 'string' ? req.query.ticker.trim().toUpperCase() : '';
    if (!/^[A-Z0-9^._-]{1,20}$/.test(ticker)) return res.status(400).json({ error: 'Ticker no válido' });
    const end = Math.floor(Date.now() / 1000) + 86400;
    const start = end - 11 * 366 * 86400;
    const params = new URLSearchParams({ symbol: ticker, type: Object.keys(MEASURES).join(','), period1: String(start), period2: String(end) });
    const source = `https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(ticker)}`;
    try {
        const response = await fetch(source + '?' + params, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
        if (!response.ok) throw new Error('Yahoo no disponible');
        const metrics = parseValuation(await response.json());
        if (!metrics.some(metric => metric.observations.length)) return res.status(404).json({ error: 'Sin múltiplos para este ticker; índices y ETF pueden no estar cubiertos' });
        res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=3600');
        return res.status(200).json({ ticker, metrics, source });
    } catch {
        return res.status(502).json({ error: 'No se pudieron consultar los múltiplos de Yahoo' });
    }
}

export { parseValuation };
