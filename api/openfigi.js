// api/openfigi.js
// Vercel Serverless Function - proxy opcional para OpenFIGI.
// Usa OPENFIGI_API_KEY si existe, pero mantiene el modo publico sin clave.

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo no permitido' });

    let payload = req.body;
    if (typeof payload === 'string') {
        try {
            payload = JSON.parse(payload);
        } catch (e) {
            return res.status(400).json({ error: 'Body JSON invalido' });
        }
    }
    if (!payload) return res.status(400).json({ error: 'Body JSON requerido' });

    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'MPS-MarketAnalyzer/1.0'
    };
    const env = globalThis.process?.env || {};
    const apiKey = env.OPENFIGI_API_KEY || env.OPEN_FIGI_API_KEY;
    if (apiKey) headers['X-OPENFIGI-APIKEY'] = apiKey;

    try {
        const response = await fetch('https://api.openfigi.com/v3/mapping', {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        });
        const text = await response.text();
        res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');
        return res.status(response.status).send(text);
    } catch (error) {
        return res.status(500).json({ error: `Error interno del proxy OpenFIGI: ${error.message}` });
    }
}
