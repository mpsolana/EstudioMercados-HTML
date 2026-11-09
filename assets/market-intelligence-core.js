(function (root) {
    function shillerSeries(rows) {
        const header = rows.findIndex(row => String(row?.[0] ?? '').trim() === 'Date' && String(row?.[12] ?? '').includes('CAPE'));
        if (header < 0) throw new Error('No se reconocen las columnas del Excel de Shiller');
        const series = [];
        let year = null;
        let month = 0;
        for (const row of rows.slice(header + 1)) {
            const rawDate = Number(row?.[0]);
            const rowYear = Math.floor(rawDate);
            if (!Number.isFinite(rawDate) || rowYear < 1871 || rowYear > 2200) continue;
            if (rowYear !== year) { year = rowYear; month = 0; }
            month += 1;
            if (month > 12) throw new Error('Fechas mensuales de Shiller inconsistentes');
            const realTotalReturn = Number(row[9]);
            const cape = Number(row[12]);
            series.push({ year, month, date: year + '-' + String(month).padStart(2, '0'), cape, realTotalReturn });
        }
        const valid = series.filter(row => Number.isFinite(row.cape) && row.cape > 0 && Number.isFinite(row.realTotalReturn) && row.realTotalReturn > 0);
        if (valid.length < 120) throw new Error('Histórico CAPE insuficiente');
        return valid;
    }

    function regression(points) {
        if (points.length < 15) throw new Error('Muestra insuficiente para la regresión');
        const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
        const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
        const xx = points.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0);
        const xy = points.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0);
        const yy = points.reduce((sum, point) => sum + (point.y - meanY) ** 2, 0);
        if (!xx || !yy) throw new Error('Varianza insuficiente para la regresión');
        const slope = xy / xx;
        const intercept = meanY - slope * meanX;
        const residual = points.reduce((sum, point) => sum + (point.y - intercept - slope * point.x) ** 2, 0);
        return { slope, intercept, r2: Math.max(0, Math.min(1, 1 - residual / yy)), n: points.length };
    }

    function capeAnalysis(rows, horizonYears = 1) {
        if (![1, 3, 5].includes(horizonYears)) throw new Error('Plazo CAPE no válido');
        const series = shillerSeries(rows);
        const byDate = new Map(series.map(row => [row.date, row]));
        const firstDecember = series.find(row => row.month === 12)?.year;
        const points = series.filter(row => row.month === 12 && (row.year - firstDecember) % horizonYears === 0).map(row => {
            const future = byDate.get((row.year + horizonYears) + '-12');
            return future ? { date: row.date, x: row.cape, y: (future.realTotalReturn / row.realTotalReturn - 1) * 100 } : null;
        }).filter(Boolean);
        const fit = regression(points);
        const latest = series.at(-1);
        return { points, fit, horizonYears, latest: { date: latest.date, cape: latest.cape }, fittedAtLatest: fit.intercept + fit.slope * latest.cape };
    }

    const api = { shillerSeries, regression, capeAnalysis };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.MarketIntelligenceCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
