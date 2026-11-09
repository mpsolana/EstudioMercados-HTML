// api/macro/calendar.js
// Vercel Serverless Function - dynamic macro calendar from official sources.

const CACHE = globalThis.__mpsMacroCalendarCache || new Map();
globalThis.__mpsMacroCalendarCache = CACHE;

const SOURCE_URLS = {
    fed: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm',
    bls: 'https://www.bls.gov/schedule/news_release/current_year.asp',
    ecb: 'https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html',
    hicp: 'https://www.ecb.europa.eu/press/calendars/statscal/ges/html/sthicp.en.html',
    bea: 'https://www.bea.gov/news/schedule/full',
    bulletin: 'https://www.ecb.europa.eu/press/economic-bulletin/html/index.en.html'
};

const MONTHS = {
    January: '01', February: '02', March: '03', April: '04', May: '05', June: '06',
    July: '07', August: '08', September: '09', October: '10', November: '11', December: '12'
};

const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export default async function handler(req, res) {
    setCors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const year = Number(req.query?.year || new Date().getUTCFullYear());
    const cacheKey = `calendar:${year}`;
    const cached = CACHE.get(cacheKey);
    if (cached && Date.now() - cached.ts < 6 * 60 * 60 * 1000) {
        return res.status(200).json({ ...cached.payload, cache: 'hit' });
    }

    const warnings = [];
    const groups = await Promise.allSettled([
        fetchFedEvents(year),
        fetchBlsCpiEvents(year),
        fetchEcbDecisionEvents(year),
        fetchEcbHicpEvents(year),
        fetchBeaReleaseEvents(year),
        fetchEcbBulletinEvents(year)
    ]);

    const officialEvents = [];
    for (const result of groups) {
        if (result.status === 'fulfilled') officialEvents.push(...result.value);
        else warnings.push(result.reason?.message || String(result.reason));
    }

    const fallback = fallbackEvents(year);
    const events = withFallbackCoverage(officialEvents, fallback);
    const merged = mergeEvents(events.length ? events : fallback);
    const payload = {
        year,
        updatedAt: new Date().toISOString(),
        source: officialEvents.length ? (events.length > officialEvents.length ? 'official+fallback' : 'official') : 'fallback',
        events: merged,
        warnings,
        sources: SOURCE_URLS
    };

    CACHE.set(cacheKey, { ts: Date.now(), payload });
    return res.status(200).json(payload);
}

async function fetchFedEvents(year) {
    const html = await fetchText(SOURCE_URLS.fed);
    const text = compactText(html);
    const start = text.indexOf(`${year} FOMC Meetings`);
    if (start < 0) throw new Error('Fed calendar section not found');
    const end = text.indexOf(`${year - 1} FOMC Meetings`, start + 1);
    const section = text.slice(start, end > start ? end : start + 2200);
    const events = [];
    const re = new RegExp(`(${Object.keys(MONTHS).join('|')})\\s+(\\d{1,2})(?:-(\\d{1,2}))?\\*?`, 'g');
    let match;
    while ((match = re.exec(section))) {
        const before = section.slice(Math.max(0, match.index - 18), match.index);
        if (/Released\s*$/i.test(before)) continue;
        const month = MONTHS[match[1]];
        const day = match[3] || match[2];
        events.push(event(`${year}-${month}-${pad(day)}`, 'fed', 'Fed decision', 'Federal Reserve', SOURCE_URLS.fed));
    }
    if (!events.length) throw new Error('Fed calendar parse returned no events');
    return events;
}

async function fetchBlsCpiEvents(year) {
    const html = await fetchText(SOURCE_URLS.bls);
    const rows = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    const events = [];
    for (const row of rows) {
        const text = compactText(row);
        if (!/Consumer Price Index for/i.test(text)) continue;
        const dateMatch = text.match(new RegExp(`(?:Monday|Tuesday|Wednesday|Thursday|Friday),\\s+(${Object.keys(MONTHS).join('|')})\\s+(\\d{1,2}),\\s+${year}`, 'i'));
        const refMatch = text.match(/Consumer Price Index for\s+([A-Za-z]+)\s+(\d{4})/i);
        if (!dateMatch) continue;
        const label = refMatch ? `US CPI ${monthLabel(refMatch[1])}` : 'US CPI';
        events.push(event(`${year}-${MONTHS[toTitle(dateMatch[1])]}-${pad(dateMatch[2])}`, 'inflation', label, 'BLS', SOURCE_URLS.bls));
    }
    if (!events.length) throw new Error('BLS CPI calendar parse returned no events');
    return events;
}

async function fetchEcbDecisionEvents(year) {
    const html = await fetchText(SOURCE_URLS.ecb);
    const re = /<dt>\s*(\d{2})\/(\d{2})\/(\d{4})\s*<\/dt>\s*<dd>\s*([\s\S]*?)<\/dd>/gi;
    const events = [];
    let match;
    while ((match = re.exec(html))) {
        const [, day, month, eventYear, rawTitle] = match;
        if (Number(eventYear) !== year) continue;
        const title = compactText(rawTitle);
        if (!/monetary policy meeting/i.test(title) || !/Day 2|press conference/i.test(title)) continue;
        events.push(event(`${eventYear}-${month}-${day}`, 'ecb', 'BCE decision', 'ECB', SOURCE_URLS.ecb));
    }
    if (!events.length) throw new Error('ECB decision calendar parse returned no events');
    return events;
}

async function fetchEcbHicpEvents(year) {
    const html = await fetchText(SOURCE_URLS.hicp);
    const re = /<dt>\s*(\d{2})\/(\d{2})\/(\d{4})\s+\d{2}:\d{2}(?:\s+CET)?\s*<\/dt>\s*<dd>([\s\S]*?)<\/dd>/gi;
    const events = [];
    let match;
    while ((match = re.exec(html))) {
        const [, day, month, eventYear, rawTitle] = match;
        const title = compactText(rawTitle);
        const refMonth = title.match(/Reference period:\s*([A-Za-z]+)-\d{4}/i)?.[1];
        if (Number(eventYear) !== year || !/HICP/i.test(title) || !refMonth) continue;
        const isFlash = /flash estimate/i.test(title);
        const label = `Euro HICP ajustado ${isFlash ? 'flash ' : ''}${monthLabel(refMonth)}`;
        events.push(event(`${eventYear}-${month}-${day}`, 'inflation', label, 'ECB', SOURCE_URLS.hicp));
    }
    if (!events.length) throw new Error('ECB HICP calendar parse returned no events');
    return events;
}

async function fetchBeaReleaseEvents(year) {
    if (year !== new Date().getUTCFullYear()) return [];
    const html = await fetchText(SOURCE_URLS.bea);
    const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
    const events = [];
    for (const row of rows) {
        const date = row.match(/class="release-date"[^>]*>\s*([A-Za-z]+)\s+(\d{1,2})\s*</i);
        const title = row.match(/class="release-title[^"']*"[^>]*>([\s\S]*?)<\/td>/i);
        if (!date || !title) continue;
        const description = compactText(title[1]);
        const month = MONTHS[toTitle(date[1])];
        if (!month) continue;
        let label;
        if (/^Personal Income and Outlays,/i.test(description)) label = 'EE. UU. PCE e ingresos';
        else if (/^GDP \((Advance|Second|Third) Estimate\)/i.test(description)) label = 'EE. UU. PIB · ' + description.match(/\(([^)]+)\)/)[1];
        else continue;
        events.push(event(`${year}-${month}-${pad(date[2])}`, 'report', label, 'BEA', SOURCE_URLS.bea));
    }
    if (!events.length) throw new Error('BEA release calendar parse returned no events');
    return events;
}

async function fetchEcbBulletinEvents(year) {
    const html = await fetchText(SOURCE_URLS.bulletin);
    const match = compactText(html).match(/Next release:\s*Issue\s+\d+,\s*(\d{4})\s*-\s*(\d{1,2})\s+([A-Za-z]+)\s+\d{4}/i);
    if (!match || Number(match[1]) !== year) return [];
    const month = MONTHS[toTitle(match[3])];
    return month ? [event(`${year}-${month}-${pad(match[2])}`, 'report', 'BCE · Boletín Económico', 'ECB', SOURCE_URLS.bulletin)] : [];
}

async function fetchText(url) {
    const response = await fetch(url, {
        headers: {
            Accept: 'text/html,application/xhtml+xml',
            'User-Agent': 'Mozilla/5.0 (compatible; MacroDashboard/1.0)'
        }
    });
    if (!response.ok) throw new Error(`${url} HTTP ${response.status}`);
    return response.text();
}

function compactText(html) {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim();
}

function mergeEvents(events) {
    const byKey = new Map();
    for (const e of events) {
        const key = `${e.date}|${e.type}|${e.label}`;
        byKey.set(key, e);
    }
    return [...byKey.values()].sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));
}

function withFallbackCoverage(officialEvents, fallback) {
    if (!officialEvents.length) return fallback;
    const today = new Date();
    const covered = [...officialEvents];
    const hasUsCpi = officialEvents.some(e => /^US CPI/i.test(e.label));
    const hasFed = officialEvents.some(e => e.type === 'fed');
    const hasEcb = officialEvents.some(e => e.type === 'ecb');
    for (const e of fallback) {
        const isPast = new Date(`${e.date}T00:00:00Z`) < today;
        const fillsMissingSource =
            (!hasUsCpi && /^US CPI/i.test(e.label)) ||
            (!hasFed && e.type === 'fed') ||
            (!hasEcb && e.type === 'ecb');
        if (isPast || fillsMissingSource) covered.push(e);
    }
    return covered;
}

function event(date, type, label, source, url = null) {
    return { date, type, label, source, url };
}

function monthLabel(monthName) {
    const title = toTitle(monthName);
    const idx = Number(MONTHS[title]) - 1;
    return MONTHS_ES[idx] || title.slice(0, 3).toLowerCase();
}

function toTitle(value) {
    return String(value).charAt(0).toUpperCase() + String(value).slice(1).toLowerCase();
}

function pad(value) {
    return String(value).padStart(2, '0');
}

function fallbackEvents(year) {
    if (year !== 2026) return [];
    return [
        event('2026-01-13', 'inflation', 'US CPI dic', 'fallback'),
        event('2026-01-28', 'fed', 'Fed decision', 'fallback'),
        event('2026-01-29', 'ecb', 'BCE decision', 'fallback'),
        event('2026-02-13', 'inflation', 'US CPI ene', 'fallback'),
        event('2026-03-11', 'inflation', 'US CPI feb', 'fallback'),
        event('2026-03-12', 'ecb', 'BCE decision', 'fallback'),
        event('2026-03-18', 'fed', 'Fed decision', 'fallback'),
        event('2026-04-10', 'inflation', 'US CPI mar', 'fallback'),
        event('2026-04-29', 'fed', 'Fed decision', 'fallback'),
        event('2026-04-30', 'ecb', 'BCE decision', 'fallback'),
        event('2026-05-12', 'inflation', 'US CPI abr', 'fallback'),
        event('2026-06-10', 'inflation', 'US CPI may', 'fallback'),
        event('2026-06-11', 'ecb', 'BCE decision', 'fallback'),
        event('2026-06-17', 'fed', 'Fed decision', 'fallback'),
        event('2026-07-14', 'inflation', 'US CPI jun', 'fallback'),
        event('2026-07-23', 'ecb', 'BCE decision', 'fallback'),
        event('2026-07-29', 'fed', 'Fed decision', 'fallback'),
        event('2026-08-12', 'inflation', 'US CPI jul', 'fallback'),
        event('2026-09-10', 'ecb', 'BCE decision', 'fallback'),
        event('2026-09-11', 'inflation', 'US CPI ago', 'fallback'),
        event('2026-09-16', 'fed', 'Fed decision', 'fallback'),
        event('2026-10-14', 'inflation', 'US CPI sep', 'fallback'),
        event('2026-10-28', 'fed', 'Fed decision', 'fallback'),
        event('2026-10-29', 'ecb', 'BCE decision', 'fallback'),
        event('2026-11-10', 'inflation', 'US CPI oct', 'fallback'),
        event('2026-12-09', 'fed', 'Fed decision', 'fallback'),
        event('2026-12-10', 'inflation', 'US CPI nov', 'fallback'),
        event('2026-12-17', 'ecb', 'BCE decision', 'fallback')
    ];
}

function setCors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export { fetchBeaReleaseEvents, fetchEcbBulletinEvents };
