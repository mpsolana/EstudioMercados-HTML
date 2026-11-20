(function(root, factory) {
    const api = factory(root.FinanceCore || require('./finance-core.js'), root.ModelPortfolioCore || require('./model-portfolio-core.js'));
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.DownsideOptimizer = api;
})(globalThis, function(finance, modelCore) {
    'use strict';
    const DAY = 86400000;
    const inspectionContexts=new WeakMap();
    const conservative = { maxDrawdown: 7, maxRecovery: 365, maxDuration: 2, minYield: 2, minEfficiency: 1, maxHy: 10, maxFx: 15 };
    const moderate = { maxDrawdown: 10, maxRecovery: 365, maxDuration: 2, minYield: 3, minEfficiency: 1.5, maxHy: 20, maxFx: 30 };
    const dynamic = { maxDrawdown: 20, maxRecovery: 730, maxDuration: 5, minYield: 2, minEfficiency: .5, maxHy: 35, maxFx: 50 };
    const profiles = Object.fromEntries(Object.entries(modelCore.bands).map(([profile, band]) =>
        [profile, { ...(['muy_conservador', 'prudente'].includes(profile) ? conservative : profile === 'equilibrado' ? moderate : dynamic), maxRv: band[1] }]));
    const constraintKeys=['maxRv','minWeight','maxWeight','maxDrawdown','minRolling5','maxRecovery','maxDuration','minYield','minEfficiency','maxHy','maxFx','openRecovery'];
    const enabled=(config,key)=>!(config.disabledConstraints||[]).includes(key);
    const effective=config=>({...config,minWeight:enabled(config,'minWeight')?config.minWeight:0,maxWeight:enabled(config,'maxWeight')?config.maxWeight:100});
    function commonRange(assets){
        if(!assets.length)return {start:'',end:'',count:0};
        const dates=assets.map(asset=>new Set((asset.data||[]).filter(point=>Number.isFinite(+new Date(point.date))&&Number.isFinite(point.price)&&point.price>0).map(point=>new Date(point.date).toISOString().slice(0,10))));
        const common=[...dates[0]].filter(date=>dates.every(set=>set.has(date))).sort();
        return {start:common[0]||'',end:common.at(-1)||'',count:common.length};
    }
    function prepare(assets, config) {
        if (!assets.length) throw new Error('Selecciona al menos un fondo para la búsqueda.');
        if (new Set(assets.map(asset => asset.isin)).size !== assets.length) throw new Error('Hay ISIN duplicados.');
        const maps = assets.map(asset => {
            const needsType=['maxRv','maxDuration','minYield','minEfficiency','maxHy'].some(key=>enabled(config,key));
            if(needsType&&!['RF','RV'].includes(asset.type))throw new Error(asset.isin+': completa el tipo RF/RV para aplicar los filtros activos.');
            if(enabled(config,'maxFx')&&(!Number.isFinite(asset.fxPct)||asset.fxPct<0||asset.fxPct>100))throw new Error(asset.isin+': completa la exposición no EUR (0–100%).');
            if(asset.type==='RF'){
                if(enabled(config,'maxHy')&&!['IG','HY','Soberana','Monetario'].includes(asset.credit))throw new Error(asset.isin+': completa calidad RF (Soberana, IG, HY o Monetario).');
                if(['minYield','minEfficiency'].some(key=>enabled(config,key))&&(![asset.grossYield,asset.ter].every(Number.isFinite)||asset.ter<0))throw new Error(asset.isin+': completa TIR bruta y TER para los filtros activos.');
                if(['maxDuration','minEfficiency'].some(key=>enabled(config,key))&&(!Number.isFinite(asset.duration)||asset.duration<0))throw new Error(asset.isin+': completa duración de RF para los filtros activos.');
            }
            const loaded = asset.data || [];
            const data = loaded.map(point => ({ date: new Date(point.date), price: point.price })).filter(point => {
                const day = Number.isFinite(+point.date) ? point.date.toISOString().slice(0, 10) : '';
                return (!config.start || day >= config.start) && (!config.end || day <= config.end);
            });
            if (data.length < 2) throw new Error(asset.isin + ': ' + loaded.length + ' precios cargados, pero ' +
                data.length + ' en el intervalo ' + (config.start || 'inicio disponible') + ' a ' +
                (config.end || 'última fecha disponible') + '. Amplía las fechas para calcular rentabilidades.');
            finance.validateSeries(data, asset.isin);
            return new Map(data.map(point => [point.date.toISOString().slice(0, 10), point.price]));
        });
        const dates = [...maps[0].keys()].filter(date => maps.every(map => map.has(date))).sort();
        const times = dates.map(date => +new Date(date));
        if (dates.length < 2) throw new Error('Los fondos tienen precios, pero no hay dos fechas comunes dentro del intervalo seleccionado.');
        const frequency = finance.frequency(dates.map(date => ({ date })));
        if (!['D', 'C', 'W', 'M'].includes(frequency)) throw new Error('La frecuencia común es inferior a mensual. Se requieren observaciones mensuales, semanales o diarias.');
        const minimum = { D: 1000, C: 1000, W: 260, M: 61 }[frequency];
        const coversFiveYears = frequency === 'M'
            ? dates.at(-1).slice(0, 7) >= anniversary(dates[0], 5).toISOString().slice(0, 7)
            : new Date(dates.at(-1)) >= anniversary(dates[0], 5);
        if (dates.length < minimum || !coversFiveYears)
            throw new Error(dates.length + ' precios comunes (' + frequency + ') entre ' + dates[0] + ' y ' + dates.at(-1) +
                '. Se necesitan cinco años para calcular ambos rolling de 3 y 5 años. Amplía el período o reduce el universo.');
        const maximumGap = { D: 10, C: 10, W: 16, M: 45 }[frequency];
        if (times.some((time, i) => i > 0 && time - times[i - 1] > maximumGap * DAY))
            throw new Error('Hay huecos de más de ' + maximumGap + ' días naturales en los precios comunes (' + frequency + '). Revisa el maestro o acota las fechas.');
        const returns = Object.fromEntries(assets.map((asset, j) => [asset.isin, dates.slice(1).map((date, i) => maps[j].get(date) / maps[j].get(dates[i]) - 1)]));
        const windows = years => {
            let start = 0;
            return dates.map((date, end) => {
                const target = +anniversary(date, -years);
                if (frequency === 'M') {
                    const targetMonth = anniversary(date, -years).toISOString().slice(0, 7);
                    while (start + 1 < end && dates[start + 1].slice(0, 7) <= targetMonth) start++;
                    return dates[start].slice(0, 7) === targetMonth ? start : -1;
                }
                while (start + 1 < end && times[start + 1] <= target) start++;
                return times[start] <= target && target - times[start] <= 7 * DAY ? start : -1;
            });
        };
        return { assets, dates, times, returns, schedule: finance.rebalanceSchedule(dates, config.rebalance), windows3: windows(3), windows5: windows(5), frequency };
    }
    function anniversary(date, years) {
        const value = new Date(date);
        value.setUTCFullYear(value.getUTCFullYear() + years);
        return value;
    }
    function validate(config, count) {
        if (!count) throw new Error('Selecciona los fondos que formarán el universo de búsqueda.');
        config=effective(config);
        if(['rolling5','meanRolling5'].includes(config.objective))config.ulcerPenalty=0;
        if(config.objective&&!['downside','rolling5','meanRolling5'].includes(config.objective))throw new Error('Selecciona un objetivo válido.');
        if (enabled(config,'minRolling5') && config.minRolling5 != null && !Number.isNaN(config.minRolling5) &&
            (!Number.isFinite(config.minRolling5) || config.minRolling5 < -100))
            throw new Error('El mínimo rolling a 5 años debe ser un porcentaje anual válido, igual o superior a −100%.');
        const positive = ['minWeight', 'maxWeight', 'maxRecovery', 'maxDuration', 'iterations'].filter(key=>enabled(config,key));
        if (positive.some(field => !Number.isFinite(config[field]) || config[field] <= 0) ||
            ['maxRv', 'maxDrawdown', 'minYield', 'minEfficiency', 'maxHy', 'maxFx', 'ulcerPenalty', 'riskFree'].some(field => enabled(config,field)&&!Number.isFinite(config[field])))
            throw new Error('Completa todos los límites y usa valores numéricos.');
        if (['maxRv','maxDrawdown','maxHy','maxFx'].some(field => enabled(config,field)&&(config[field] < 0 || config[field] > 100)) ||
            config.minWeight > config.maxWeight || config.maxWeight > 100 || config.ulcerPenalty < 0 ||
            enabled(config,'minEfficiency')&&config.minEfficiency < 0 || config.riskFree <= -100 || !Number.isInteger(config.iterations) ||
            config.iterations < 100 || config.iterations > 100000 || !['monthly','quarterly','annual'].includes(config.rebalance))
            throw new Error('Revisa porcentajes, rebalanceo y número de combinaciones (100–100.000).');
        if(config.requireAll){
            if(count*config.minWeight>100+1e-8||count*config.maxWeight<100-1e-8)
                throw new Error(`Incluir los ${count} fondos es incompatible con los pesos: mínimo agregado ${count*config.minWeight}% y máximo agregado ${count*config.maxWeight}%. Ajusta los límites o desmarca incluir todos.`);
            return {minimum:count,maximum:count};
        }
        const minimum = Math.ceil(100 / config.maxWeight - 1e-10);
        const maximum = Math.min(count, Math.floor(100 / config.minWeight + 1e-10));
        if (minimum > maximum) throw new Error('Los pesos mínimo/máximo y el universo seleccionado no permiten invertir el 100%.');
        return { minimum, maximum };
    }
    function randomSource(seed) {
        let state = (Number(seed) || 1) >>> 0;
        const random=() => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return ((state >>> 0) + .5) / 4294967296; };
        random.state=()=>state>>>0;return random;
    }
    function sample(count, config, random, bounds) {
        config=effective(config);
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
            else if(asset.type==='RF') {
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
        if(enabled(config,'maxRv'))max('Renta variable', metrics.rv, config.maxRv, '%');
        if(enabled(config,'maxFx'))max('Divisa no EUR', metrics.fx, config.maxFx, '%');
        if (!(metrics.rf > 0)&&['maxDuration','minYield','minEfficiency','maxHy'].some(key=>enabled(config,key))) failures.push({ name: 'Manga RF ausente', value: 0, limit: 1, unit: '', distance: 1 });
        else {
            if(enabled(config,'maxDuration'))max('Duración RF', metrics.duration, config.maxDuration, 'años');
            if(enabled(config,'minYield'))min('TIR neta RF', metrics.netYield, config.minYield, '%');
            if(enabled(config,'minEfficiency'))min('TIR neta / duración', metrics.efficiency, config.minEfficiency, '');
            if(enabled(config,'maxHy'))max('HY dentro de RF', metrics.hy, config.maxHy, '%');
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
        const rollingStats = windows => {
            let minimum=Infinity,total=0,count=0;
            windows.forEach((start,end)=>{
                if(start<0)return;
                const value=((path[end]/path[start])**(365.25*DAY/(prepared.times[end]-prepared.times[start]))-1)*100;
                minimum=Math.min(minimum,value);total+=value;count++;
            });
            return {worst:count?minimum:NaN,mean:count?total/count:NaN,count};
        };
        const rolling3=rollingStats(prepared.windows3),rolling5=rollingStats(prepared.windows5);
        const worst3=rolling3.worst,worst5=rolling5.worst,mean3=rolling3.mean,mean5=rolling5.mean,ulcer=Math.sqrt(squares/path.length);
        return { maxDrawdown, maxRecovery, openRecovery, recoveryDays: Math.max(maxRecovery, openRecovery),
            worst3, worst5, mean3, mean5, rolling3Count:rolling3.count, rolling5Count:rolling5.count, worst: Math.min(worst3, worst5), ulcer,
            sharpe: finance.sharpe(returns, prepared.frequency, config.riskFree / 100),
            ...(keepPath ? { path, drawdowns } : {}) };
    }
    const distance = failures => failures.reduce((sum, failure) => sum + failure.distance, 0);
    function historicalFailures(metrics, config) {
        const failures = [];
        if (enabled(config,'minRolling5') && Number.isFinite(config.minRolling5) && metrics.worst5 < config.minRolling5 - 1e-8)
            failures.push({ name: 'Retorno rolling mínimo a 5 años', value: metrics.worst5, limit: config.minRolling5,
                unit: '% anual', distance: (config.minRolling5 - metrics.worst5) / Math.max(Math.abs(config.minRolling5), 1) });
        if (enabled(config,'maxDrawdown') && metrics.maxDrawdown > config.maxDrawdown + 1e-8) failures.push({ name: 'Drawdown máximo', value: metrics.maxDrawdown, limit: config.maxDrawdown, unit: '%', distance: (metrics.maxDrawdown - config.maxDrawdown) / Math.max(config.maxDrawdown, 1) });
        if (enabled(config,'maxRecovery') && metrics.recoveryDays > config.maxRecovery) failures.push({ name: 'Tiempo bajo máximos', value: metrics.recoveryDays, limit: config.maxRecovery, unit: 'días', distance: (metrics.recoveryDays - config.maxRecovery) / config.maxRecovery });
        if (enabled(config,'openRecovery') && metrics.openRecovery > 0 && !config.allowOpen) failures.push({ name: 'Recuperación aún abierta', value: metrics.openRecovery, limit: 0, unit: 'días', distance: 1 });
        return failures;
    }
    function objectiveMetrics(stats,config){
        const objectiveReturn=config.objective==='meanRolling5'?stats.mean5:config.objective==='rolling5'?stats.worst5:stats.worst;
        return {objectiveReturn,score:config.objective==='meanRolling5'||config.objective==='rolling5'?objectiveReturn:objectiveReturn-config.ulcerPenalty*stats.ulcer};
    }
    function inspectCandidate(result,index){
        const context=inspectionContexts.get(result),point=result.cloud[index];
        if(!context||!Number.isInteger(index)||!point)throw new Error('La cartera seleccionada ya no está disponible. Ejecuta de nuevo la búsqueda.');
        const {prepared,bounds}=context,config=result.config;
        const weights=sample(prepared.assets.length,config,randomSource(point.sampleSeed),bounds);
        const metrics=fundamentals(prepared.assets,weights),stats=history(prepared,weights,config,true);
        return {weights,metrics,...stats,...objectiveMetrics(stats,config),cloudIndex:index,
            failures:[...structural(metrics,config),...historicalFailures(stats,config)]};
    }
    async function optimize(assets, config, hooks = {}) {
        const bounds = validate(config, assets.length), prepared = prepare(assets, config);
        const random = randomSource(config.seed), best = [], nearest = [], fastNear = [], cloud = [], blockers = {};
        let passed = 0, valid = 0, evaluated = 0, unique = 0;
        const seen = new Set();
        const rank = (a, b) => Math.abs(a.score - b.score) > (['rolling5','meanRolling5'].includes(config.objective)?1e-10:.001) ? b.score - a.score : (Number.isFinite(b.sharpe) ? b.sharpe : -Infinity) - (Number.isFinite(a.sharpe) ? a.sharpe : -Infinity);
        const add = (list, point, compare, limit = 3) => { list.push(point); list.sort(compare); list.length = Math.min(limit, list.length); };
        const nearRank = (a, b) => distance(a.failures) - distance(b.failures) || a.failures.length - b.failures.length || rank(a, b);
        const evaluate = point => {
            const stats = history(prepared, point.weights, config);
            const historical = historicalFailures(stats, config);
            const failures = [...point.failures, ...historical];
            const candidate = { ...point, ...stats, failures,...objectiveMetrics(stats,config),cloudIndex:cloud.length };
            evaluated++;
            historical.forEach(failure => { blockers[failure.name] = (blockers[failure.name] || 0) + 1; });
            cloud.push({ index:cloud.length,sampleSeed:point.sampleSeed,dd: stats.maxDrawdown, worst: candidate.objectiveReturn, valid: !failures.length });
            if (!failures.length) { valid++; add(best, candidate, rank); }
            else add(nearest, candidate, nearRank);
        };
        for (let iteration = 0; iteration < config.iterations; iteration++) {
            if (iteration % 32 === 0 && hooks.cancelled?.()) throw new Error('Cálculo cancelado.');
            const sampleSeed=random.state();
            const weights = sample(assets.length, config, random, bounds), signature = weights.map(w => w.toFixed(8)).join(',');
            if (!seen.has(signature)) {
                seen.add(signature); unique++;
                const metrics = fundamentals(assets, weights), failures = structural(metrics, config), point = { weights, metrics, failures,sampleSeed };
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
        const result={ dates: prepared.dates, frequency: prepared.frequency, assets: assets.map(({ data, ...asset }) => asset), choices, cloud,
            unique, passed, evaluated, valid, blockers,rankedChoiceCount:choices.length, config: { ...config } };
        inspectionContexts.set(result,{prepared,bounds});return result;
    }
    return { profiles, constraintKeys, commonRange, prepare, validate, sample, randomSource, fundamentals, structural, history, optimize, inspectCandidate };
});
