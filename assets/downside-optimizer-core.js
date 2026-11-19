(function(root, factory) {
    const api = factory(root.FinanceCore || require('./finance-core.js'));
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.DownsideOptimizer = api;
})(globalThis, function(finance) {
    'use strict';
    const DAY = 86400000;
    const profiles = {
        conservador: { maxRv: 20, maxDrawdown: 7, maxRecovery: 365, maxDuration: 2, minYield: 2, minEfficiency: 1, maxHy: 10, maxFx: 15 },
        moderado: { maxRv: 45, maxDrawdown: 10, maxRecovery: 365, maxDuration: 2, minYield: 3, minEfficiency: 1.5, maxHy: 20, maxFx: 30 },
        dinamico: { maxRv: 75, maxDrawdown: 20, maxRecovery: 730, maxDuration: 5, minYield: 2, minEfficiency: .5, maxHy: 35, maxFx: 50 }
    };
    function prepare(assets, config) {
        if (!assets.length) throw new Error('Selecciona al menos un fondo para la búsqueda.');
        if (new Set(assets.map(asset => asset.isin)).size !== assets.length) throw new Error('Hay ISIN duplicados.');
        const maps = assets.map(asset => {
            if (!['RF', 'RV'].includes(asset.type) || !Number.isFinite(asset.fxPct) || asset.fxPct < 0 || asset.fxPct > 100)
                throw new Error(asset.isin + ': completa tipo y exposición real no EUR (0–100%).');
            if (asset.type === 'RF' && (!['IG', 'HY', 'Soberana'].includes(asset.credit) ||
                ![asset.grossYield, asset.ter, asset.duration].every(Number.isFinite) || asset.ter < 0 || asset.duration < 0))
                throw new Error(asset.isin + ': completa calidad, TIR bruta, TER y duración de RF.');
            const data = (asset.data || []).filter(point => (!config.start || new Date(point.date) >= new Date(config.start)) &&
                (!config.end || new Date(point.date) <= new Date(config.end))).map(point => ({ date: new Date(point.date), price: point.price }));
            finance.validateSeries(data, asset.isin);
            if (!['D', 'C'].includes(finance.frequency(data))) throw new Error(asset.isin + ': el optimizador requiere valores liquidativos diarios.');
            return new Map(data.map(point => [point.date.toISOString().slice(0, 10), point.price]));
        });
        const dates = [...maps[0].keys()].filter(date => maps.every(map => map.has(date))).sort();
        if (dates.length < 1000 || !dates.length || new Date(dates.at(-1)) < anniversary(dates[0], 5))
            throw new Error('Se necesitan al menos cinco años y 1.000 precios diarios comunes. Reduce el universo o amplía el período.');
        const times = dates.map(date => +new Date(date));
        if (times.some((time, i) => i > 0 && time - times[i - 1] > 10 * DAY))
            throw new Error('Hay huecos de más de 10 días naturales en los precios comunes. Revisa el maestro o acota las fechas.');
        const returns = Object.fromEntries(assets.map((asset, j) => [asset.isin, dates.slice(1).map((date, i) => maps[j].get(date) / maps[j].get(dates[i]) - 1)]));
        const windows = years => {
            let start = 0;
            return dates.map((date, end) => {
                const target = +anniversary(date, -years);
                while (start + 1 < end && times[start + 1] <= target) start++;
                return times[start] <= target && target - times[start] <= 7 * DAY ? start : -1;
            });
        };
        return { assets, dates, times, returns, schedule: finance.rebalanceSchedule(dates, config.rebalance), windows3: windows(3), windows5: windows(5), frequency: finance.frequency(dates.map(date => ({ date }))) };
    }
    function anniversary(date, years) {
        const value = new Date(date);
        value.setUTCFullYear(value.getUTCFullYear() + years);
        return value;
    }
    function validate(config, count) {
        if (!count) throw new Error('Selecciona los fondos que formarán el universo de búsqueda.');
        const positive = ['minWeight', 'maxWeight', 'maxRecovery', 'maxDuration', 'iterations'];
        if (positive.some(field => !Number.isFinite(config[field]) || config[field] <= 0) ||
            ['maxRv', 'maxDrawdown', 'minYield', 'minEfficiency', 'maxHy', 'maxFx', 'ulcerPenalty', 'riskFree'].some(field => !Number.isFinite(config[field])))
            throw new Error('Completa todos los límites y usa valores numéricos.');
        if (['maxRv','maxDrawdown','maxHy','maxFx'].some(field => config[field] < 0 || config[field] > 100) ||
            config.minWeight > config.maxWeight || config.maxWeight > 100 || config.ulcerPenalty < 0 ||
            config.minEfficiency < 0 || config.riskFree <= -100 || !Number.isInteger(config.iterations) ||
            config.iterations < 100 || config.iterations > 100000 || !['monthly','quarterly','annual'].includes(config.rebalance))
            throw new Error('Revisa porcentajes, rebalanceo y número de combinaciones (100–100.000).');
        const minimum = Math.ceil(100 / config.maxWeight - 1e-10);
        const maximum = Math.min(count, Math.floor(100 / config.minWeight + 1e-10));
        if (minimum > maximum) throw new Error('Los pesos mínimo/máximo y el universo seleccionado no permiten invertir el 100%.');
        return { minimum, maximum };
    }
    function randomSource(seed) {
        let state = (Number(seed) || 1) >>> 0;
        return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return ((state >>> 0) + .5) / 4294967296; };
    }
    function sample(count, config, random, bounds) {
        const size = bounds.minimum + Math.floor(random() * (bounds.maximum - bounds.minimum + 1));
        const order = Array.from({ length: count }, (_, i) => i);
        for (let i = count - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
        const selected = order.slice(0, size), weights = Array(count).fill(0);
        selected.forEach(i => { weights[i] = config.minWeight / 100; });
        let remaining = 1 - size * config.minWeight / 100;
        let active = selected;
        while (remaining > 1e-12 && active.length) {
            const draws = active.map(() => -Math.log(random())), total = draws.reduce((a, b) => a + b, 0);
            let allocated = 0;
            active.forEach((i, j) => {
                const addition = Math.min(remaining * draws[j] / total, config.maxWeight / 100 - weights[i]);
                weights[i] += addition; allocated += addition;
            });
            remaining -= allocated;
            active = active.filter(i => weights[i] < config.maxWeight / 100 - 1e-12);
        }
        return weights;
    }
    function fundamentals(assets, weights) {
        let rv = 0, fx = 0, rf = 0, duration = 0, netYield = 0, hy = 0;
        assets.forEach((asset, i) => {
            const w = weights[i]; fx += w * asset.fxPct;
            if (asset.type === 'RV') rv += w * 100;
            else {
                rf += w; duration += w * asset.duration; netYield += w * (asset.grossYield - asset.ter);
                if (asset.credit === 'HY') hy += w;
            }
        });
        const averageDuration = rf > 0 ? duration / rf : NaN, averageYield = rf > 0 ? netYield / rf : NaN;
        return { rv, fx, rf: rf * 100, duration: averageDuration, netYield: averageYield,
            efficiency: averageDuration > 0 ? averageYield / averageDuration : averageYield > 0 ? Infinity : 0,
            hy: rf > 0 ? hy / rf * 100 : NaN, rateImpact: -duration };
    }
    function structural(metrics, config) {
        const failures = [];
        const max = (name, value, limit, unit) => { if (value > limit + 1e-8) failures.push({ name, value, limit, unit, distance: (value - limit) / Math.max(Math.abs(limit), 1) }); };
        const min = (name, value, limit, unit) => { if (value < limit - 1e-8) failures.push({ name, value, limit, unit, distance: (limit - value) / Math.max(Math.abs(limit), 1) }); };
        max('Renta variable', metrics.rv, config.maxRv, '%');
        max('Divisa no EUR', metrics.fx, config.maxFx, '%');
        if (!(metrics.rf > 0)) failures.push({ name: 'Manga RF ausente', value: 0, limit: 1, unit: '', distance: 1 });
        else {
            max('Duración RF', metrics.duration, config.maxDuration, 'años');
            min('TIR neta RF', metrics.netYield, config.minYield, '%');
            min('TIR neta / duración', metrics.efficiency, config.minEfficiency, '');
            max('HY dentro de RF', metrics.hy, config.maxHy, '%');
        }
        return failures;
    }
    function history(prepared, weights, config, keepPath = false) {
        const entries = prepared.assets.map((asset, i) => ({ ticker: asset.isin, weight: weights[i] })).filter(entry => entry.weight > 0);
        const returns = finance.portfolioPath(entries, prepared.dates, prepared.returns, { rebalance: config.rebalance, costBps: 0, schedule: prepared.schedule });
        const path = [100], drawdowns = [0];
        let peak = 100, peakIndex = 0, maxDrawdown = 0, squares = 0, maxRecovery = 0, openRecovery = 0;
        let inDrawdown = false;
        for (let t = 1; t < prepared.dates.length; t++) {
            const growth = 1 + returns[t - 1];
            const value = path.at(-1) * growth;
            path.push(value);
            if (value >= peak * (1 - 1e-12)) {
                if (inDrawdown) maxRecovery = Math.max(maxRecovery, (prepared.times[t] - prepared.times[peakIndex]) / DAY);
                peak = Math.max(peak, value); peakIndex = t; inDrawdown = false;
            } else inDrawdown = true;
            const dd = Math.min(0, value / peak - 1);
            drawdowns.push(dd); maxDrawdown = Math.max(maxDrawdown, -dd * 100); squares += (dd * 100) ** 2;
        }
        if (inDrawdown) openRecovery = (prepared.times.at(-1) - prepared.times[peakIndex]) / DAY;
        const worst = windows => {
            let minimum = Infinity;
            windows.forEach((start, end) => {
                if (start < 0) return;
                const value = (path[end] / path[start]) ** (365.25 * DAY / (prepared.times[end] - prepared.times[start])) - 1;
                minimum = Math.min(minimum, value * 100);
            });
            return minimum === Infinity ? NaN : minimum;
        };
        const worst3 = worst(prepared.windows3), worst5 = worst(prepared.windows5), ulcer = Math.sqrt(squares / path.length);
        return { maxDrawdown, maxRecovery, openRecovery, recoveryDays: Math.max(maxRecovery, openRecovery),
            worst3, worst5, worst: Math.min(worst3, worst5), ulcer,
            sharpe: finance.sharpe(returns, prepared.frequency, config.riskFree / 100),
            ...(keepPath ? { path, drawdowns } : {}) };
    }
    const distance = failures => failures.reduce((sum, failure) => sum + failure.distance, 0);
    function historicalFailures(metrics, config) {
        const failures = [];
        if (metrics.maxDrawdown > config.maxDrawdown + 1e-8) failures.push({ name: 'Drawdown máximo', value: metrics.maxDrawdown, limit: config.maxDrawdown, unit: '%', distance: (metrics.maxDrawdown - config.maxDrawdown) / Math.max(config.maxDrawdown, 1) });
        if (metrics.recoveryDays > config.maxRecovery) failures.push({ name: 'Tiempo bajo máximos', value: metrics.recoveryDays, limit: config.maxRecovery, unit: 'días', distance: (metrics.recoveryDays - config.maxRecovery) / config.maxRecovery });
        if (metrics.openRecovery > 0 && !config.allowOpen) failures.push({ name: 'Recuperación aún abierta', value: metrics.openRecovery, limit: 0, unit: 'días', distance: 1 });
        return failures;
    }
    async function optimize(assets, config, hooks = {}) {
        const bounds = validate(config, assets.length), prepared = prepare(assets, config);
        const random = randomSource(config.seed), best = [], nearest = [], fastNear = [], cloud = [], blockers = {};
        let passed = 0, valid = 0, evaluated = 0, unique = 0;
        const seen = new Set();
        const rank = (a, b) => Math.abs(a.score - b.score) > .001 ? b.score - a.score : (Number.isFinite(b.sharpe) ? b.sharpe : -Infinity) - (Number.isFinite(a.sharpe) ? a.sharpe : -Infinity);
        const add = (list, point, compare, limit = 3) => { list.push(point); list.sort(compare); list.length = Math.min(limit, list.length); };
        const nearRank = (a, b) => distance(a.failures) - distance(b.failures) || a.failures.length - b.failures.length || rank(a, b);
        const evaluate = point => {
            const stats = history(prepared, point.weights, config);
            const historical = historicalFailures(stats, config);
            const failures = [...point.failures, ...historical];
            const candidate = { ...point, ...stats, failures, score: stats.worst - config.ulcerPenalty * stats.ulcer };
            evaluated++;
            historical.forEach(failure => { blockers[failure.name] = (blockers[failure.name] || 0) + 1; });
            cloud.push({ dd: stats.maxDrawdown, worst: stats.worst, valid: !failures.length });
            if (!failures.length) { valid++; add(best, candidate, rank); }
            else add(nearest, candidate, nearRank);
        };
        for (let iteration = 0; iteration < config.iterations; iteration++) {
            if (iteration % 32 === 0 && hooks.cancelled?.()) throw new Error('Cálculo cancelado.');
            const weights = sample(assets.length, config, random, bounds), signature = weights.map(w => w.toFixed(8)).join(',');
            if (!seen.has(signature)) {
                seen.add(signature); unique++;
                const metrics = fundamentals(assets, weights), failures = structural(metrics, config), point = { weights, metrics, failures };
                if (!failures.length) { passed++; evaluate(point); }
                else {
                    failures.forEach(failure => { blockers[failure.name] = (blockers[failure.name] || 0) + 1; });
                    add(fastNear, point, (a, b) => distance(a.failures) - distance(b.failures), 30);
                }
            }
            if (iteration % 32 === 0) {
                hooks.progress?.({ iteration, total: config.iterations, unique, passed, evaluated, valid });
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }
        // When no structural survivor exists, evaluate a bounded pool of the closest fundamentals.
        if (hooks.cancelled?.()) throw new Error('Cálculo cancelado.');
        if (!passed) fastNear.forEach(evaluate);
        const choices = valid ? best : nearest;
        for (const point of choices) Object.assign(point, history(prepared, point.weights, config, true));
        return { dates: prepared.dates, assets: assets.map(({ data, ...asset }) => asset), choices, cloud,
            unique, passed, evaluated, valid, blockers, config: { ...config } };
    }
    return { profiles, prepare, validate, sample, randomSource, fundamentals, structural, history, optimize };
});
