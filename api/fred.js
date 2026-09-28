// api/fred.js
// Vercel Serverless Function — Proxy para FRED API (St. Louis Fed)
// Evita problemas CORS al hacer la petición desde el servidor de Vercel.

export default async function handler(req, res) {
    // Permitir CORS desde cualquier origen (el front-end de Vercel lo necesita)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { series_id, api_key, file_type = 'json', sort_order = 'asc' } = req.query;
    const resolvedApiKey = api_key || process.env.FRED_API_KEY || process.env.FRED_API_TOKEN;

    if (!series_id || !resolvedApiKey) {
        return res.status(400).json({ error: 'Faltan parámetros: series_id y FRED_API_KEY en el entorno' });
    }

    const fredUrl = `https://api.stlouisfed.org/fred/series/observations?series_id=${encodeURIComponent(series_id)}&api_key=${encodeURIComponent(resolvedApiKey)}&file_type=${encodeURIComponent(file_type)}&sort_order=${encodeURIComponent(sort_order)}`;

    try {
        const response = await fetch(fredUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            return res.status(response.status).json({ error: `FRED API respondió con HTTP ${response.status}` });
        }

        const data = await response.json();
        return res.status(200).json(data);

    } catch (error) {
        return res.status(500).json({ error: `Error interno del proxy: ${error.message}` });
    }
}
