// api/yahoo.js
// Vercel Serverless Function — Proxy para Yahoo Finance
// Evita problemas CORS al hacer la petición desde el servidor de Vercel.

export default async function handler(req, res) {
    // Permitir CORS desde cualquier origen (el front-end de Vercel lo necesita)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { ticker, period1, period2, interval = '1d' } = req.query;

    if (!ticker || !period1 || !period2) {
        return res.status(400).json({ error: 'Faltan parámetros: ticker, period1, period2' });
    }

    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${period1}&period2=${period2}&interval=${interval}&events=history`;

    try {
        const response = await fetch(yahooUrl, {
            headers: {
                // Headers para simular un navegador y evitar bloqueos de Yahoo
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': 'https://finance.yahoo.com/',
                'Origin': 'https://finance.yahoo.com',
            }
        });

        if (!response.ok) {
            // Intentar con query2 si query1 falla
            const yahooUrl2 = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${period1}&period2=${period2}&interval=${interval}&events=history`;
            const response2 = await fetch(yahooUrl2, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Referer': 'https://finance.yahoo.com/',
                    'Origin': 'https://finance.yahoo.com',
                }
            });
            if (!response2.ok) {
                return res.status(response2.status).json({ error: `Yahoo Finance respondió con HTTP ${response2.status}` });
            }
            const data2 = await response2.json();
            return res.status(200).json(data2);
        }

        const data = await response.json();
        return res.status(200).json(data);

    } catch (error) {
        return res.status(500).json({ error: `Error interno del proxy: ${error.message}` });
    }
}
