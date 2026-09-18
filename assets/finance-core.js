(function (root) {
    'use strict';
    const annualPeriods = { D: 252, C: 365, W: 52, M: 12, Q: 4, A: 1 };
    function mean(values) { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN; }
    function stdev(values) { const m = mean(values); return values.length > 1 ? Math.sqrt(values.reduce((a, v) => a + (v - m) ** 2, 0) / (values.length - 1)) : NaN; }
    function frequency(series) {
        const gaps = series.slice(1).map((p, i) => (new Date(p.date) - new Date(series[i].date)) / 86400000).filter(g => g > 0).sort((a, b) => a - b);
        if (!gaps.length) return 'D';
        const gap = gaps[Math.floor(gaps.length / 2)];
        if (gap >= 250) return 'A';
        if (gap >= 70) return 'Q';
        if (gap >= 18) return 'M';
        if (gap >= 5) return 'W';
        return gaps.length >= 14 && gaps.every(g => g <= 1.1) ? 'C' : 'D';
    }
    function validateSeries(series, label = 'Serie') {
        if (!Array.isArray(series) || series.length < 2) throw new Error(`${label}: se necesitan al menos dos precios.`);
        series.forEach((point, i) => {
            const date = new Date(point.date).getTime();
            if (!Number.isFinite(date) || !Number.isFinite(point.price) || point.price <= 0) throw new Error(`${label}: fecha o precio no valido en fila ${i + 1}.`);
            if (i && date <= new Date(series[i - 1].date).getTime()) throw new Error(`${label}: fechas duplicadas o desordenadas.`);
        });
        return series;
    }
    function normalizeWeights(entries) {
        if (!entries.length || entries.some(e => !Number.isFinite(e.weight) || e.weight < 0)) throw new Error('Pesos no validos: usa valores no negativos en una misma unidad.');
        const total = entries.reduce((a, e) => a + e.weight, 0);
        if (!(total > 0)) throw new Error('La suma de pesos debe ser positiva.');
        const grouped = new Map();
        entries.forEach(e => { const key = e.ticker || e.isin; const previous = grouped.get(key); grouped.set(key, { ...e, weight: (previous?.weight || 0) + e.weight / total }); });
        return [...grouped.values()];
    }
    function weighted(rows, field, side) {
        const total = rows.reduce((a, r) => a + Math.max(0, r.weight || 0), 0);
        const valid = rows.filter(r => r.weight > 0 && Number.isFinite((side ? r[side] : r)?.[field]));
        const covered = valid.reduce((a, r) => a + r.weight, 0);
        return { value: covered ? valid.reduce((a, r) => a + r.weight * (side ? r[side] : r)[field], 0) / covered : NaN, coverage: total ? covered / total : 0, total, covered };
    }
    function sharpe(returns, freq = 'D', riskFreeAnnual = 0) {
        const periods = annualPeriods[freq] || 252;
        if (riskFreeAnnual <= -1 || !returns.every(Number.isFinite)) return NaN;
        const rf = (1 + riskFreeAnnual) ** (1 / periods) - 1;
        const excess = returns.map(r => r - rf), sd = stdev(excess);
        return sd > 0 ? mean(excess) / sd * Math.sqrt(periods) : NaN;
    }
    function cagr(series) {
        if (!series || series.length < 2) return NaN;
        const start = new Date(series[0].date), end = new Date(series.at(-1).date);
        const anniversary = new Date(start); anniversary.setUTCFullYear(start.getUTCFullYear() + 1);
        const years = (end - start) / 86400000 / 365.25;
        return end >= anniversary ? (series.at(-1).price / series[0].price) ** (1 / years) - 1 : NaN;
    }
    function portfolioPath(entries, dates, returns, settings = {}) {
        const normalized = normalizeWeights(entries);
        if (normalized.some(e => !returns[e.ticker] || returns[e.ticker].length !== dates.length - 1 || !returns[e.ticker].every(r => Number.isFinite(r) && r > -1))) throw new Error('Historicos incompletos: no se calcula una rentabilidad para pesos sin datos.');
        const target = normalized.map(e => e.weight);
        let weights = target.slice();
        const path = [];
        for (let i = 0; i < dates.length - 1; i++) {
            const monthChanged = i > 0 && new Date(dates[i]).toISOString().slice(0, 7) !== new Date(dates[i - 1]).toISOString().slice(0, 7);
            const rebalance = i > 0 && (settings.rebalance === 'period' || (settings.rebalance === 'monthly' && monthChanged));
            const turnover = rebalance ? weights.reduce((sum, w, k) => sum + Math.abs(w - target[k]), 0) : 0;
            if (rebalance) weights = target.slice();
            const growth = weights.map((w, k) => w * (1 + returns[normalized[k].ticker][i]));
            const gross = growth.reduce((a, v) => a + v, 0);
            const cost = turnover * Math.max(0, Number(settings.costBps) || 0) / 10000;
            if (cost >= 1) throw new Error('Coste de rebalanceo fuera de rango.');
            path.push(gross * (1 - cost) - 1);
            weights = growth.map(v => v / gross);
        }
        return path;
    }
    function sameFund(a, b) { return Boolean(a?.fundId && b?.fundId && String(a.fundId).trim() === String(b.fundId).trim() && a.currency && a.currency === b.currency && a.hedging && a.hedging === b.hedging); }
    function better(anchor, records) { return Number.isFinite(anchor?.score) ? records.filter(r => r.isin !== anchor.isin && r.category === anchor.category && Number.isFinite(r.score) && r.score > anchor.score).sort((a, b) => b.score - a.score || (a.ter ?? Infinity) - (b.ter ?? Infinity)) : []; }
    const api = { annualPeriods, mean, stdev, frequency, validateSeries, normalizeWeights, weighted, sharpe, cagr, portfolioPath, sameFund, better };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.FinanceCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
