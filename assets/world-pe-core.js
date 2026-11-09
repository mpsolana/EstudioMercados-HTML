(function (root) {
    function stats(rows, years) {
        const latest = rows.at(-1);
        if (!latest) return null;
        const start = new Date(latest.date + 'T00:00:00Z');
        start.setUTCFullYear(start.getUTCFullYear() - years);
        const values = rows.filter(row => row.date >= start.toISOString().slice(0, 10)).map(row => row.pe);
        if (values.length < 10) return null;
        const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
        const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
        const sd = Math.sqrt(variance);
        return { years, n: values.length, mean, sd, z: sd > 0 ? (latest.pe - mean) / sd : null };
    }

    function pricesFromYahoo(payload) {
        const result = payload?.chart?.result?.[0];
        const times = result?.timestamp || [];
        const adjusted = result?.indicators?.adjclose?.[0]?.adjclose;
        const close = result?.indicators?.quote?.[0]?.close;
        return times.map((time, index) => ({ date: new Date(time * 1000).toISOString().slice(0, 10), price: Number(adjusted?.[index] ?? close?.[index]) }))
            .filter(row => Number.isFinite(row.price) && row.price > 0);
    }

    function monthlyLast(prices) {
        const map = new Map();
        for (const row of prices) map.set(row.date.slice(0, 7), row.price);
        return map;
    }

    function regression(rows, prices, years) {
        const byMonth = monthlyLast(prices);
        const horizon = years * 12;
        const dated = rows.filter(row => byMonth.has(row.date.slice(0, 7)));
        const points = [];
        for (let index = 0; index + horizon < dated.length; index += horizon) {
            const first = dated[index], future = dated[index + horizon];
            const firstMonth = first.date.slice(0, 7), futureMonth = future.date.slice(0, 7);
            const [y0, m0] = firstMonth.split('-').map(Number), [y1, m1] = futureMonth.split('-').map(Number);
            if ((y1 - y0) * 12 + m1 - m0 !== horizon) continue;
            const base = byMonth.get(firstMonth), end = byMonth.get(futureMonth);
            if (!base || !end) continue;
            points.push({ date: first.date, x: first.pe, y: ((end / base) ** (1 / years) - 1) * 100 });
        }
        if (points.length < 8) return { years, n: points.length, points, fit: null };
        const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
        const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
        const xx = points.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0);
        const yy = points.reduce((sum, point) => sum + (point.y - meanY) ** 2, 0);
        if (xx < 1e-12 || yy < 1e-12) return { years, n: points.length, points, fit: null };
        const slope = points.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0) / xx;
        const intercept = meanY - slope * meanX;
        const residual = points.reduce((sum, point) => sum + (point.y - intercept - slope * point.x) ** 2, 0);
        const fit = { slope, intercept, r2: Math.max(0, Math.min(1, 1 - residual / yy)) };
        const latest = rows.at(-1)?.pe;
        return { years, n: points.length, points, fit, fittedAtLatest: Number.isFinite(latest) ? fit.intercept + fit.slope * latest : null };
    }

    function momentum(prices, window) {
        const values = prices.map(row => row.price);
        return prices.map((row, index) => {
            if (index + 1 < window) return null;
            const mean = values.slice(index + 1 - window, index + 1).reduce((sum, value) => sum + value, 0) / window;
            return { date: row.date, value: (row.price / mean - 1) * 100 };
        }).filter(Boolean);
    }

    const api = { stats, pricesFromYahoo, regression, momentum };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.WorldPeCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
