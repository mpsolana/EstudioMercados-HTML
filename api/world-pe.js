const MARKETS = Object.freeze({
    world: { label: 'MSCI World', proxy: 'URTH', path: '/area/msci-world/' },
    emerging: { label: 'Mercados emergentes', proxy: 'EEM', path: '/area/emerging-markets/' }
});

function parseWorldPe(html) {
    const block = html.match(/\bdetailPE_data\s*=\s*\[([\s\S]*?)\];/);
    if (!block || block[1].length > 200000) throw new Error('Serie PER no reconocida');
    const rows = [...block[1].matchAll(/\[\s*Date\.UTC\(\s*(\d{4})\s*,\s*(\d{1,2})\s*,\s*(\d{1,2})\s*\)\s*,\s*([\d.]+)\s*\]/g)]
        .map(match => ({ date: `${match[1]}-${String(Number(match[2]) + 1).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`, pe: Number(match[4]) }))
        .filter(row => Number.isFinite(row.pe) && row.pe > 0 && row.pe < 200);
    if (rows.length < 24 || new Set(rows.map(row => row.date)).size !== rows.length || rows.some((row, index) => index && row.date <= rows[index - 1].date)) throw new Error('Histórico PER incompleto o desordenado');
    return rows;
}

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });
    const market = typeof req.query?.market === 'string' ? req.query.market : '';
    const item = MARKETS[market];
    if (!item) return res.status(400).json({ error: 'Mercado no disponible' });
    const source = 'https://worldperatio.com' + item.path;
    try {
        const response = await fetch(source, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MarketAnalyzer/1.0)', Accept: 'text/html' }, signal: AbortSignal.timeout(12000) });
        if (!response.ok) throw new Error('Fuente no disponible');
        const html = await response.text();
        if (html.length > 1000000) throw new Error('Respuesta excesiva');
        const observations = parseWorldPe(html);
        res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=86400');
        return res.status(200).json({ market, label: item.label, proxy: item.proxy, source, observations });
    } catch {
        return res.status(502).json({ error: 'No se pudo actualizar el PER de WorldPEratio' });
    }
}

export { parseWorldPe };
