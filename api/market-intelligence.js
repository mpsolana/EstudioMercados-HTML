const ECB_CURVE = 'https://data-api.ecb.europa.eu/service/data/YC/';
const SHILLER_HOME = 'https://shillerdata.com/';
const ECB_ESTR = 'https://data-api.ecb.europa.eu/service/data/EST/B.EU000A2X2A25.WT';
const ECB_DFR = 'https://data-api.ecb.europa.eu/service/data/FM/B.U2.EUR.4F.KR.DFR.LEV';
const TENORS = ['1Y', '2Y', '3Y', '5Y', '7Y', '10Y', '20Y', '30Y'];

async function get(url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(25000) });
    if (!response.ok) throw new Error('Fuente no disponible (' + response.status + ')');
    return response;
}

function parseCurve(csv, compare = 'previous') {
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
    const offsets = { '1M': 30, '3M': 91, '1Y': 365 };
    const target = offsets[compare] ? new Date(new Date(latest + 'T00:00:00Z').getTime() - offsets[compare] * 86400000).toISOString().slice(0, 10) : null;
    const comparisonDate = target ? ([...ordered].reverse().find(date => date <= target && Object.keys(dates.get(date)).length >= 4) || null) : (ordered.at(-2) || null);
    const comparison = comparisonDate ? dates.get(comparisonDate) : null;
    return {
        date: latest,
        previousDate: ordered.at(-2) || null,
        comparisonDate,
        comparison: compare,
        points: TENORS.filter(tenor => Number.isFinite(dates.get(latest)[tenor])).map(tenor => ({
            tenor,
            years: Number.parseInt(tenor, 10),
            rate: dates.get(latest)[tenor],
            previousRate: dates.get(ordered.at(-2))?.[tenor] ?? null,
            comparisonRate: comparison?.[tenor] ?? null
        }))
    };
}

function parseRateSeries(csv) {
    const lines = csv.trim().split(/\r?\n/);
    const fields = lines.shift().trim().split(',');
    const dateAt = fields.indexOf('TIME_PERIOD');
    const valueAt = fields.indexOf('OBS_VALUE');
    if (dateAt < 0 || valueAt < 0) throw new Error('Formato BCE inesperado');
    return lines.map(line => {
        const cells = line.split(',');
        return { date: cells[dateAt], value: cells[valueAt]?.trim() ? Number(cells[valueAt]) : NaN };
    }).filter(point => /^\d{4}-\d{2}-\d{2}$/.test(point.date) && Number.isFinite(point.value));
}

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });
    const dataset = req.query?.dataset;
    if (!['curve', 'shiller', 'policy'].includes(dataset)) return res.status(400).json({ error: 'Conjunto de datos no válido' });
    try {
        if (dataset === 'policy') {
            const start = new Date(Date.now() - 400 * 86400000).toISOString().slice(0, 10);
            const results = await Promise.allSettled([ECB_ESTR, ECB_DFR].map(url => get(url + '?format=csvdata&detail=dataonly&startPeriod=' + start).then(response => response.text()).then(parseRateSeries)));
            const series = results.map((result, index) => ({ id: index ? 'DFR' : 'ESTR', label: index ? 'Facilidad de depósito BCE' : '€STR observado', observations: result.status === 'fulfilled' ? result.value : [] }));
            if (!series.some(item => item.observations.length)) throw new Error('Tipos BCE no disponibles');
            res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=3600');
            return res.status(200).json({ series, source: 'BCE Data Portal; €STR observado y facilidad de depósito' });
        }
        if (dataset === 'curve') {
            const kind = req.query?.kind === 'forward' ? 'IF' : 'SR';
            const key = 'B.U2.EUR.4F.G_N_A.SV_C_YM.' + TENORS.map(tenor => kind + '_' + tenor).join('+');
            const compare = ['previous', '1M', '3M', '1Y'].includes(req.query?.compare) ? req.query.compare : 'previous';
            const lookback = compare === '1Y' ? 395 : compare === '3M' ? 125 : compare === '1M' ? 65 : 10;
            const start = new Date(Date.now() - lookback * 86400000).toISOString().slice(0, 10);
            const response = await get(ECB_CURVE + key + '?format=csvdata&detail=dataonly&startPeriod=' + start);
            res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=3600');
            return res.status(200).json({ ...parseCurve(await response.text(), compare), kind, source: 'BCE, curva soberana AAA zona euro' });
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

export { parseCurve, parseRateSeries };
