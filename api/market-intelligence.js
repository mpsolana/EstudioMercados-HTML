const ECB_CURVE = 'https://data-api.ecb.europa.eu/service/data/YC/';
const SHILLER_HOME = 'https://shillerdata.com/';
const TENORS = ['1Y', '2Y', '3Y', '5Y', '7Y', '10Y', '20Y', '30Y'];

async function get(url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(25000) });
    if (!response.ok) throw new Error('Fuente no disponible (' + response.status + ')');
    return response;
}

function parseCurve(csv) {
    const lines = csv.trim().split(/\r?\n/);
    const fields = lines.shift().split(',');
    const dateAt = fields.indexOf('TIME_PERIOD');
    const valueAt = fields.indexOf('OBS_VALUE');
    const tenorAt = fields.indexOf('DATA_TYPE_FM');
    if ([dateAt, valueAt, tenorAt].some(index => index < 0)) throw new Error('Formato de curva BCE inesperado');
    const dates = new Map();
    for (const line of lines) {
        const cells = line.split(',');
        const date = cells[dateAt];
        const tenor = cells[tenorAt]?.replace(/^(SR|IF)_/, '');
        const value = Number(cells[valueAt]);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !TENORS.includes(tenor) || !Number.isFinite(value)) continue;
        if (!dates.has(date)) dates.set(date, {});
        dates.get(date)[tenor] = value;
    }
    const ordered = [...dates.keys()].sort();
    const latest = ordered.at(-1);
    if (!latest || Object.keys(dates.get(latest)).length < 4) throw new Error('Curva BCE incompleta');
    return {
        date: latest,
        previousDate: ordered.at(-2) || null,
        points: TENORS.filter(tenor => Number.isFinite(dates.get(latest)[tenor])).map(tenor => ({
            tenor,
            years: Number.parseInt(tenor, 10),
            rate: dates.get(latest)[tenor],
            previousRate: dates.get(ordered.at(-2))?.[tenor] ?? null
        }))
    };
}

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });
    const dataset = req.query?.dataset;
    if (!['curve', 'shiller'].includes(dataset)) return res.status(400).json({ error: 'Conjunto de datos no válido' });
    try {
        if (dataset === 'curve') {
            const kind = req.query?.kind === 'forward' ? 'IF' : 'SR';
            const key = 'B.U2.EUR.4F.G_N_A.SV_C_YM.' + TENORS.map(tenor => kind + '_' + tenor).join('+');
            const response = await get(ECB_CURVE + key + '?format=csvdata&detail=dataonly&lastNObservations=2');
            res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=3600');
            return res.status(200).json({ ...parseCurve(await response.text()), kind, source: 'BCE, curva soberana AAA zona euro' });
        }
        const page = await (await get(SHILLER_HOME)).text();
        const match = page.match(/href=["']([^"']*\/ie_data\.xls(?:\?[^"']*)?)["']/i);
        if (!match) throw new Error('No se encuentra el Excel oficial de Shiller');
        const url = new URL(match[1].replaceAll('&amp;', '&'), SHILLER_HOME);
        if (url.protocol !== 'https:' || url.hostname !== 'img1.wsimg.com') throw new Error('Origen del Excel no reconocido');
        const file = await get(url);
        const bytes = Buffer.from(await file.arrayBuffer());
        if (bytes.length > 5_000_000) throw new Error('El Excel excede el tamaño permitido');
        res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=86400');
        res.setHeader('Content-Type', 'application/vnd.ms-excel');
        return res.status(200).send(bytes);
    } catch (error) {
        return res.status(502).json({ error: error.message });
    }
}

export { parseCurve };
