// api/macro.js
// Vercel Serverless Function - macro data layer with official primary sources.

const CACHE = globalThis.__mpsMacroCache || new Map();
globalThis.__mpsMacroCache = CACHE;

const COLORS = {
    us: '#2563eb',
    euro: '#0f766e',
    germany: '#64748b',
    france: '#1d4ed8',
    italy: '#ef4444',
    spain: '#f59e0b',
    uk: '#7c3aed',
    m2: '#2563eb',
    velocity: '#7c3aed',
    curve: '#0f766e',
    sahm: '#ef4444'
};

const GROUP_META = {
    cli: { indicator: 'CLI OECD', unit: 'index', frequency: 'monthly', ttlMs: 12 * 60 * 60 * 1000 },
    pmi: { indicator: 'ICE BofA High Yield Effective Yield', unit: '%', frequency: 'monthly', ttlMs: 12 * 60 * 60 * 1000 },
    epu: { indicator: 'Economic Policy Uncertainty', unit: 'index', frequency: 'monthly', ttlMs: 12 * 60 * 60 * 1000 },
    cpi: { indicator: 'Inflacion CPI/HICP YoY', unit: '%', frequency: 'monthly', ttlMs: 12 * 60 * 60 * 1000 },
    rates: { indicator: 'Tipos oficiales', unit: '%', frequency: 'monthly', ttlMs: 12 * 60 * 60 * 1000 },
    bonds10y: { indicator: 'Bono soberano 10Y', unit: '%', frequency: 'monthly', ttlMs: 12 * 60 * 60 * 1000 },
    unemp: { indicator: 'Desempleo', unit: '%', frequency: 'monthly', ttlMs: 12 * 60 * 60 * 1000 },
    gdp: { indicator: 'PIB real indexado', unit: 'index', frequency: 'quarterly', ttlMs: 12 * 60 * 60 * 1000 },
    gdp_yoy: { indicator: 'PIB real YoY', unit: '%', frequency: 'quarterly', ttlMs: 12 * 60 * 60 * 1000 },
    money: { indicator: 'M2 y velocidad del dinero', unit: 'mixed', frequency: 'monthly', ttlMs: 12 * 60 * 60 * 1000 },
    recession: { indicator: 'Indicadores de recesion', unit: 'mixed', frequency: 'monthly', ttlMs: 12 * 60 * 60 * 1000 }
};

const SERIES_CATALOG = {
    cli: [
        series('USALOLITOAASTSAM', 'EEUU', 'us', 'cli', fred('USALOLITOAASTSAM', 'FRED/OECD CLI')),
        series('DEULOLITOAASTSAM', 'Alemania', 'germany', 'cli', fred('DEULOLITOAASTSAM', 'FRED/OECD CLI')),
        series('FRALOLITOAASTSAM', 'Francia', 'france', 'cli', fred('FRALOLITOAASTSAM', 'FRED/OECD CLI')),
        series('ITALOLITOAASTSAM', 'Italia', 'italy', 'cli', fred('ITALOLITOAASTSAM', 'FRED/OECD CLI')),
        series('ESPLOLITOAASTSAM', 'Espana', 'spain', 'cli', fred('ESPLOLITOAASTSAM', 'FRED/OECD CLI')),
        series('GBRLOLITOAASTSAM', 'UK', 'uk', 'cli', fred('GBRLOLITOAASTSAM', 'FRED/OECD CLI'))
    ],
    pmi: [
        series('BAMLH0A0HYM2EY', 'EEUU HY', 'us', 'pmi', fred('BAMLH0A0HYM2EY', 'FRED/ICE BofA', { aggregate: 'monthlyLast' })),
        series('BAMLHE00EHYIEY', 'Euro HY', 'euro', 'pmi', fred('BAMLHE00EHYIEY', 'FRED/ICE BofA', { aggregate: 'monthlyLast' }))
    ],
    epu: [
        series('USEPUINDXM', 'EEUU EPU', 'us', 'epu', fred('USEPUINDXM', 'FRED/EPU')),
        series('EUEPUINDXM', 'Europa EPU', 'euro', 'epu', fred('EUEPUINDXM', 'FRED/EPU'))
    ],
    cpi: [
        series('BLS_CUUR0000SA0_YOY', 'EEUU CPI YoY', 'us', 'cpi', bls('CUUR0000SA0', 'BLS CPI-U All items', { transform: 'yoy' })),
        series('EUROSTAT_EA20_HICP_YOY', 'Eurozona HICP YoY', 'euro', 'cpi', eurostatHicp('Eurostat HICP all-items YoY'))
    ],
    rates: [
        series('DFEDTARU', 'Fed upper bound', 'us', 'rates', fred('DFEDTARU', 'FRED/Federal Reserve target upper bound', { aggregate: 'monthlyLast' })),
        series('ECB_DFR', 'ECB Deposit Rate', 'euro', 'rates', ecbRate('DFR', 'ECB Data Portal deposit facility', { aggregate: 'monthlyLast' })),
        series('ECB_MRR', 'ECB Main Refinancing', 'euro', 'rates', ecbRate('MRR_FR', 'ECB Data Portal main refinancing fixed rate', { aggregate: 'monthlyLast' }))
    ],
    bonds10y: [
        series('DGS10', 'EEUU 10Y', 'us', 'bonds10y', fred('DGS10', 'FRED/Treasury', { aggregate: 'monthlyLast' })),
        series('IRLTLT01DEM156N', 'Alemania 10Y', 'germany', 'bonds10y', fred('IRLTLT01DEM156N', 'FRED/OECD')),
        series('IRLTLT01FRM156N', 'Francia 10Y', 'france', 'bonds10y', fred('IRLTLT01FRM156N', 'FRED/OECD')),
        series('IRLTLT01ITM156N', 'Italia 10Y', 'italy', 'bonds10y', fred('IRLTLT01ITM156N', 'FRED/OECD')),
        series('IRLTLT01ESM156N', 'Espana 10Y', 'spain', 'bonds10y', fred('IRLTLT01ESM156N', 'FRED/OECD')),
        series('IRLTLT01GBM156N', 'UK 10Y', 'uk', 'bonds10y', fred('IRLTLT01GBM156N', 'FRED/OECD'))
    ],
    unemp: [
        series('UNRATE', 'EEUU', 'us', 'unemp', fred('UNRATE', 'FRED/BLS')),
        series('LRHUTTTTDEM156S', 'Alemania', 'germany', 'unemp', fred('LRHUTTTTDEM156S', 'FRED/OECD')),
        series('LRHUTTTTFRM156S', 'Francia', 'france', 'unemp', fred('LRHUTTTTFRM156S', 'FRED/OECD')),
        series('LRHUTTTTITM156S', 'Italia', 'italy', 'unemp', fred('LRHUTTTTITM156S', 'FRED/OECD')),
        series('LRHUTTTTESM156S', 'Espana', 'spain', 'unemp', fred('LRHUTTTTESM156S', 'FRED/OECD')),
        series('LRHUTTTTGBM156S', 'UK', 'uk', 'unemp', fred('LRHUTTTTGBM156S', 'FRED/OECD'))
    ],
    gdp: [
        series('GDPC1', 'EEUU PIB real', 'us', 'gdp', fred('GDPC1', 'FRED/BEA', { transform: 'indexFirst' })),
        series('CLVMNACSCAB1GQEA19', 'Eurozona PIB real', 'euro', 'gdp', fred('CLVMNACSCAB1GQEA19', 'FRED/Eurostat', { transform: 'indexFirst' })),
        series('CLVMNACSCAB1GQDE', 'Alemania PIB real', 'germany', 'gdp', fred('CLVMNACSCAB1GQDE', 'FRED/Eurostat', { transform: 'indexFirst' })),
        series('CLVMNACSCAB1GQFR', 'Francia PIB real', 'france', 'gdp', fred('CLVMNACSCAB1GQFR', 'FRED/Eurostat', { transform: 'indexFirst' })),
        series('CLVMNACSCAB1GQIT', 'Italia PIB real', 'italy', 'gdp', fred('CLVMNACSCAB1GQIT', 'FRED/Eurostat', { transform: 'indexFirst' })),
        series('CLVMNACSCAB1GQES', 'Espana PIB real', 'spain', 'gdp', fred('CLVMNACSCAB1GQES', 'FRED/Eurostat', { transform: 'indexFirst' })),
        series('NGDPRSAXDCGBQ', 'UK PIB real', 'uk', 'gdp', fred('NGDPRSAXDCGBQ', 'FRED/ONS', { transform: 'indexFirst' }))
    ],
    gdp_yoy: [
        series('GDPC1', 'EEUU PIB real YoY', 'us', 'gdp_yoy', fred('GDPC1', 'FRED/BEA', { transform: 'yoyQuarterly' })),
        series('CLVMNACSCAB1GQEA19', 'Eurozona PIB real YoY', 'euro', 'gdp_yoy', fred('CLVMNACSCAB1GQEA19', 'FRED/Eurostat', { transform: 'yoyQuarterly' })),
        series('CLVMNACSCAB1GQDE', 'Alemania PIB real YoY', 'germany', 'gdp_yoy', fred('CLVMNACSCAB1GQDE', 'FRED/Eurostat', { transform: 'yoyQuarterly' })),
        series('CLVMNACSCAB1GQFR', 'Francia PIB real YoY', 'france', 'gdp_yoy', fred('CLVMNACSCAB1GQFR', 'FRED/Eurostat', { transform: 'yoyQuarterly' })),
        series('CLVMNACSCAB1GQIT', 'Italia PIB real YoY', 'italy', 'gdp_yoy', fred('CLVMNACSCAB1GQIT', 'FRED/Eurostat', { transform: 'yoyQuarterly' })),
        series('CLVMNACSCAB1GQES', 'Espana PIB real YoY', 'spain', 'gdp_yoy', fred('CLVMNACSCAB1GQES', 'FRED/Eurostat', { transform: 'yoyQuarterly' })),
        series('NGDPRSAXDCGBQ', 'UK PIB real YoY', 'uk', 'gdp_yoy', fred('NGDPRSAXDCGBQ', 'FRED/ONS', { transform: 'yoyQuarterly' }))
    ],
    money: [
        series('WM2NS', 'M2', 'm2', 'money', fred('WM2NS', 'FRED/Federal Reserve', { aggregate: 'monthlyLast', axis: 'y' })),
        series('M2V', 'Velocidad M2', 'velocity', 'money', fred('M2V', 'FRED/Federal Reserve', { axis: 'y2', frequency: 'quarterly' }))
    ],
    recession: [
        series('T10Y2Y', '10Y-2Y', 'curve', 'recession', fred('T10Y2Y', 'FRED/Treasury', { aggregate: 'monthlyLast', axis: 'y' })),
        series('SAHMREALTIME', 'Sahm Rule', 'sahm', 'recession', fred('SAHMREALTIME', 'FRED/Sahm', { axis: 'y2' }))
    ]
};

function series(id, label, country, group, provider) {
    return { id, label, country, color: COLORS[country], group, provider };
}

function fred(seriesId, source, options = {}) {
    return { type: 'fred', seriesId, source, ...options };
}

function bls(seriesId, source, options = {}) {
    return { type: 'bls', seriesId, source, ...options };
}

function eurostatHicp(source, options = {}) {
    return { type: 'eurostatHicp', source, ...options };
}

function ecbRate(rateId, source, options = {}) {
    return { type: 'ecbRate', rateId, source, frequency: 'daily', ...options };
}

export default async function handler(req, res) {
    setCors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const group = String(req.query.group || '').trim();
    const period = String(req.query.period || '10Y').trim().toUpperCase();

    if (!SERIES_CATALOG[group]) {
        return res.status(400).json({ error: `Grupo macro no soportado: ${group}` });
    }

    try {
        const meta = GROUP_META[group];
        const items = await Promise.all(SERIES_CATALOG[group].map(def => loadSeries(def, meta, period)));
        const series = items.filter(Boolean);
        const warnings = series.flatMap(item => item.warnings || []);
        const usableCount = series.filter(item => item.observations.length > 0).length;

        res.setHeader('Cache-Control', `s-maxage=${usableCount > 0 ? 43200 : 900}, stale-while-revalidate=900`);
        return res.status(200).json({
            group,
            period,
            indicator: meta.indicator,
            generatedAt: new Date().toISOString(),
            usableCount,
            series,
            warnings
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}

async function loadSeries(def, meta, period) {
    const cacheKey = `${def.group}:${def.id}:${period}`;
    const cached = CACHE.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const warnings = [];
    try {
        const raw = await fetchProvider(def.provider, period);
        let clean = normalizeObservations(raw);
        if (def.provider.aggregate === 'monthlyLast') clean = aggregateMonthlyLast(clean);
        if (def.provider.transform === 'yoy') clean = transformYoY(clean);
        if (def.provider.transform === 'yoyQuarterly') clean = transformYoY(clean, 4);

        let sliced = sliceByPeriod(clean, period);
        if (def.provider.transform === 'indexFirst') sliced = indexFirst(sliced);

        const providerFrequency = def.provider.frequency || meta.frequency;
        if (!isUsableSeries(sliced, providerFrequency)) {
            warnings.push(`${def.label}: FRED devolvio datos insuficientes`);
        }

        const value = {
            id: def.id,
            label: def.label,
            country: def.country,
            indicator: meta.indicator,
            frequency: providerFrequency,
            unit: meta.unit,
            source: def.provider.source,
            fallbackRank: 0,
            color: def.color,
            axis: def.provider.axis || 'y',
            observations: toWire(sliced),
            warnings
        };
        CACHE.set(cacheKey, { expiresAt: Date.now() + meta.ttlMs, value });
        return value;
    } catch (error) {
        const value = {
            id: def.id,
            label: def.label,
            country: def.country,
            indicator: meta.indicator,
            frequency: meta.frequency,
            unit: meta.unit,
            source: def.provider.source,
            fallbackRank: null,
            color: def.color,
            observations: [],
            warnings: [`${def.label}: ${(def.provider.seriesId || def.provider.rateId || def.provider.type)} fallo (${error.message})`]
        };
        CACHE.set(cacheKey, { expiresAt: Date.now() + 15 * 60 * 1000, value });
        return value;
    }
}

async function fetchProvider(provider, period) {
    if (provider.type === 'fred') return fetchFred(provider.seriesId);
    if (provider.type === 'bls') return fetchBls(provider.seriesId, period);
    if (provider.type === 'eurostatHicp') return fetchEurostatHicp();
    if (provider.type === 'ecbRate') return fetchEcbRate(provider.rateId);
    throw new Error(`Proveedor no soportado: ${provider.type}`);
}

async function fetchFred(seriesId) {
    const apiKey = process.env.FRED_API_KEY || process.env.FRED_API_TOKEN;
    if (!apiKey) throw new Error('FRED_API_KEY no configurada en Vercel');

    const url = new URL('https://api.stlouisfed.org/fred/series/observations');
    url.searchParams.set('series_id', seriesId);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('file_type', 'json');
    url.searchParams.set('sort_order', 'asc');

    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    if (json.error_message) throw new Error(json.error_message);

    return (json.observations || [])
        .filter(o => o.value !== '.' && o.value !== '')
        .map(o => ({ date: o.date, value: Number(o.value) }))
        .filter(o => Number.isFinite(o.value));
}

async function fetchBls(seriesId, period) {
    const currentYear = new Date().getUTCFullYear();
    const yearsBack = period === '5Y' ? 7 : period === '10Y' ? 12 : 20;
    const startyear = String(Math.max(2000, currentYear - yearsBack));
    const endyear = String(currentYear);
    const response = await fetch('https://api.bls.gov/publicAPI/v2/timeseries/data/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ seriesid: [seriesId], startyear, endyear })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    if (json.status !== 'REQUEST_SUCCEEDED') throw new Error((json.message || []).join('; ') || 'BLS request failed');
    const rows = json.Results?.series?.[0]?.data || [];
    return rows
        .filter(row => /^M\d{2}$/.test(row.period) && row.value !== '-' && row.value !== '')
        .map(row => ({
            date: `${row.year}-${row.period.slice(1)}-01`,
            value: Number(row.value)
        }))
        .filter(row => Number.isFinite(row.value))
        .sort((a, b) => new Date(a.date) - new Date(b.date));
}

async function fetchEurostatHicp() {
    const url = new URL('https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_minr');
    url.searchParams.set('format', 'JSON');
    url.searchParams.set('lang', 'en');
    url.searchParams.set('unit', 'RCH_A');
    url.searchParams.set('coicop18', 'TOTAL');
    url.searchParams.set('geo', 'EA20');
    url.searchParams.set('lastTimePeriod', '360');

    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    return jsonStatTimeSeries(json).map(point => ({ date: `${point.date}-01`, value: point.value }));
}

async function fetchEcbRate(rateId) {
    const url = `https://data-api.ecb.europa.eu/service/data/FM/B.U2.EUR.4F.KR.${encodeURIComponent(rateId)}.LEV?format=csvdata&lastNObservations=6000`;
    const response = await fetch(url, { headers: { Accept: 'text/csv' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const csv = await response.text();
    const lines = csv.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return [];
    const header = parseCsvLine(lines[0]);
    const dateIdx = header.indexOf('TIME_PERIOD');
    const valueIdx = header.indexOf('OBS_VALUE');
    if (dateIdx < 0 || valueIdx < 0) throw new Error('ECB CSV sin TIME_PERIOD/OBS_VALUE');
    return lines.slice(1).map(line => {
        const cols = parseCsvLine(line);
        return { date: cols[dateIdx], value: Number(cols[valueIdx]) };
    }).filter(row => row.date && Number.isFinite(row.value));
}

function jsonStatTimeSeries(json) {
    const timeIndex = json.dimension?.time?.category?.index || {};
    const values = json.value || {};
    const times = Object.entries(timeIndex).sort((a, b) => a[1] - b[1]);
    return times.map(([date, idx]) => ({ date, value: Number(values[String(idx)]) })).filter(point => Number.isFinite(point.value));
}

function parseCsvLine(line) {
    const cols = [];
    let current = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (quoted && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                quoted = !quoted;
            }
        } else if (ch === ',' && !quoted) {
            cols.push(current);
            current = '';
        } else {
            current += ch;
        }
    }
    cols.push(current);
    return cols;
}

function normalizeObservations(observations) {
    return observations
        .map(o => ({ date: new Date(o.date), value: Number(o.value) }))
        .filter(o => !Number.isNaN(o.date.getTime()) && Number.isFinite(o.value))
        .sort((a, b) => a.date - b.date);
}

function aggregateMonthlyLast(series) {
    const buckets = new Map();
    series.forEach(point => {
        const key = `${point.date.getUTCFullYear()}-${String(point.date.getUTCMonth() + 1).padStart(2, '0')}`;
        const current = buckets.get(key);
        if (!current || point.date > current.date) buckets.set(key, point);
    });
    return [...buckets.values()].sort((a, b) => a.date - b.date);
}

function transformYoY(series, lag = 12) {
    const yoy = [];
    for (let i = lag; i < series.length; i++) {
        const prev = series[i - lag].value;
        if (prev !== 0) yoy.push({ date: series[i].date, value: ((series[i].value / prev) - 1) * 100 });
    }
    return yoy;
}

function indexFirst(series) {
    const first = series.find(point => Number.isFinite(point.value) && point.value !== 0);
    if (!first) return [];
    return series.map(point => ({ date: point.date, value: (point.value / first.value) * 100 }));
}

function sliceByPeriod(series, period) {
    if (!series.length || period === 'MAX') return series;
    const years = period === '5Y' ? 5 : period === '20Y' ? 20 : 10;
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - years);
    return series.filter(o => o.date >= cutoff);
}

function toWire(series) {
    return series.map(o => ({
        date: o.date instanceof Date ? o.date.toISOString().slice(0, 10) : String(o.date).slice(0, 10),
        value: Number(o.value)
    }));
}

function isUsableSeries(series, frequency) {
    const minObs = frequency === 'quarterly' ? 4 : 12;
    if (!series || series.length < minObs) return false;
    const lastDate = new Date(series[series.length - 1].date);
    const maxAgeMonths = frequency === 'quarterly' ? 9 : 4;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - maxAgeMonths);
    return lastDate >= cutoff;
}

function setCors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export { SERIES_CATALOG, GROUP_META, loadSeries };
