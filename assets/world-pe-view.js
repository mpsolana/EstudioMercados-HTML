(function (root) {
    const markets = [
        ['usa', 'EE. UU.'], ['europe', 'Europa'], ['china', 'China'], ['india', 'India'],
        ['emerging', 'Emergentes'], ['global', 'Global · VT'], ['world', 'MSCI World']
    ];
    const colors = ['#a16a43', '#577f78', '#8d6785', '#708eaa', '#987e4c', '#5f7287'];
    const peCache = new Map(), priceCache = new Map();
    let active = null, request = 0;
    const number = (value, digits = 2) => Number.isFinite(value) ? value.toLocaleString('es-ES', { maximumFractionDigits: digits }) : '—';

    function compareControls() {
        const box = document.getElementById('worldPeCompare');
        if (box.childElementCount) return;
        for (const [key, label] of markets) {
            const wrap = document.createElement('label'); wrap.className = 'inline-flex items-center gap-1 cursor-pointer';
            const input = document.createElement('input'); input.type = 'checkbox'; input.value = key; input.addEventListener('change', loadWorldPe);
            const text = document.createElement('span'); text.textContent = label;
            wrap.append(input, text); box.append(wrap);
        }
    }

    async function pe(market) {
        if (peCache.has(market)) return peCache.get(market);
        const response = await fetch('/api/world-pe?market=' + encodeURIComponent(market));
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'PER no disponible');
        peCache.set(market, data);
        return data;
    }

    async function prices(ticker, interval) {
        const key = ticker + ':' + interval;
        if (priceCache.has(key)) return priceCache.get(key);
        const end = Math.floor(Date.now() / 1000) + 86400;
        const start = interval === '1mo' ? Date.UTC(1990, 0, 1) / 1000 : end - 400 * 86400;
        const params = new URLSearchParams({ ticker, period1: String(start), period2: String(end), interval });
        const response = await fetch('/api/yahoo?' + params);
        if (!response.ok) throw new Error('Precios Yahoo no disponibles');
        const rows = WorldPeCore.pricesFromYahoo(await response.json());
        if (!rows.length) throw new Error('Histórico del ETF no disponible');
        priceCache.set(key, rows);
        return rows;
    }

    async function loadWorldPe() {
        compareControls();
        const serial = ++request;
        const market = document.getElementById('worldPeMarket').value;
        const status = document.getElementById('worldPeStatus');
        status.textContent = 'Consultando PER y precios del ETF…';
        try {
            const primary = await pe(market);
            const overlays = [...document.querySelectorAll('#worldPeCompare input:checked')].map(input => input.value).filter(key => key !== market);
            const [others, monthly, daily] = await Promise.all([
                Promise.allSettled(overlays.map(async key => {
                    const item = await pe(key);
                    const [monthly, daily] = await Promise.all([prices(item.proxy, '1mo').catch(() => []), prices(item.proxy, '1d').catch(() => [])]);
                    return { item, monthly, daily };
                })),
                prices(primary.proxy, '1mo').catch(() => []),
                prices(primary.proxy, '1d').catch(() => [])
            ]);
            if (serial !== request) return;
            active = { primary, others: others.filter(item => item.status === 'fulfilled').map(item => item.value), monthly, daily };
            status.textContent = primary.label + ' · último PER mensual ' + primary.observations.at(-1).date + ' · ' + primary.observations.length + ' observaciones' + (!monthly.length ? ' · retornos no disponibles' : '');
            await renderWorldPe();
        } catch (error) {
            if (serial === request) status.textContent = 'No se pudo cargar el PER: ' + error.message;
        }
    }

    function card(label, value, detail) {
        const box = document.createElement('div'); box.className = 'border-t border-slate-200 pt-3';
        const small = document.createElement('div'); small.className = 'text-xs text-slate-500'; small.textContent = label;
        const strong = document.createElement('strong'); strong.className = 'block text-xl text-slate-800'; strong.textContent = value;
        const sub = document.createElement('div'); sub.className = 'text-xs text-slate-500'; sub.textContent = detail;
        box.append(small, strong, sub); return box;
    }

    async function renderWorldPe() {
        if (!active) return;
        const { primary, others, monthly, daily } = active;
        const rows = primary.observations, latest = rows.at(-1);
        const windowYears = Number(document.getElementById('worldPeStatsWindow').value);
        const horizonYears = Number(document.getElementById('worldPeHorizon').value);
        const momentumWindow = Number(document.getElementById('worldPeMomentumWindow').value);
        const selected = WorldPeCore.stats(rows, windowYears);
        const momentum = WorldPeCore.momentum(daily, momentumWindow);
        const recentMomentum = momentum.at(-1)?.value;
        let model;
        try { model = WorldPeCore.regression(rows, monthly, horizonYears); }
        catch { model = { n: 0, fit: null, points: [] }; }
        const cards = document.getElementById('worldPeOverview'); cards.replaceChildren(
            card('Último PER mensual', number(latest.pe) + 'x', primary.proxy + ' · ' + latest.date),
            card('PER frente a media ' + windowYears + 'A', selected && Number.isFinite(selected.z) ? (selected.z >= 0 ? '+' : '') + number(selected.z) + ' σ' : '—', selected ? 'Media ' + number(selected.mean) + 'x · σ ' + number(selected.sd) : 'Histórico insuficiente'),
            card('Precio frente a SMA ' + momentumWindow, Number.isFinite(recentMomentum) ? (recentMomentum >= 0 ? '+' : '') + number(recentMomentum) + ' %' : '—', momentum.at(-1)?.date || 'Sin precio suficiente'),
            card('Regresión · ' + horizonYears + 'A', model.fit ? number(model.fittedAtLatest) + ' %' : 'Sin estimación', model.fit ? 'R² ' + number(model.fit.r2, 3) + ' · ' + model.n + ' ventanas' : model.n + ' ventanas; mínimo 8')
        );
        document.getElementById('worldPeSource').href = primary.source;

        const traces = [{ x: rows.map(row => row.date), y: rows.map(row => row.pe), mode: 'lines', name: primary.label, line: { color: '#204f78', width: 2.5 } }];
        others.forEach(({ item }, index) => traces.push({ x: item.observations.map(row => row.date), y: item.observations.map(row => row.pe), mode: 'lines', name: item.label, line: { color: colors[index % colors.length], width: 1.5 } }));
        const marketBody = document.getElementById('worldPeMarketRows'); marketBody.replaceChildren();
        for (const sample of [{ item: primary, monthly, daily }, ...others]) {
            const last = sample.item.observations.at(-1), historic = WorldPeCore.stats(sample.item.observations, 10);
            const motion = WorldPeCore.momentum(sample.daily, 200).at(-1)?.value;
            const estimate = WorldPeCore.regression(sample.item.observations, sample.monthly, horizonYears);
            const values = [sample.item.label, number(last.pe) + 'x', historic && Number.isFinite(historic.z) ? number(historic.z) + ' σ' : '—', Number.isFinite(motion) ? number(motion) + ' %' : '—', estimate.fit ? number(estimate.fittedAtLatest) + ' % anual' : '—', estimate.fit ? number(estimate.fit.r2, 3) : '—'];
            const tr = document.createElement('tr'); tr.className = 'border-b border-slate-100';
            values.forEach((value, index) => { const td = document.createElement('td'); td.className = 'py-2 ' + (index ? 'text-right tabular-nums' : ''); td.textContent = value; tr.append(td); });
            marketBody.append(tr);
        }
        const bands = selected ? [
            { xref: 'paper', x0: 0, x1: 1, y0: Math.max(0, selected.mean - 2 * selected.sd), y1: selected.mean + 2 * selected.sd, fillcolor: 'rgba(77,124,158,0.07)', line: { width: 0 } },
            { xref: 'paper', x0: 0, x1: 1, y0: Math.max(0, selected.mean - selected.sd), y1: selected.mean + selected.sd, fillcolor: 'rgba(77,124,158,0.10)', line: { width: 0 } },
            { type: 'line', xref: 'paper', x0: 0, x1: 1, y0: selected.mean, y1: selected.mean, line: { color: '#7b8994', width: 1, dash: 'dot' } }
        ] : [];
        await FinancialVisuals.newPlot('worldPeChart', traces, { height: 350, margin: { t: 18, l: 55, r: 18, b: 55 }, xaxis: { title: 'Fecha mensual' }, yaxis: { title: 'PER (veces)' }, shapes: bands, legend: { orientation: 'h', y: -0.28 } }, { responsive: true, displayModeBar: false });

        const statsBody = document.getElementById('worldPeStatsRows'); statsBody.replaceChildren();
        for (const years of [1, 5, 10, 20]) {
            const item = WorldPeCore.stats(rows, years), tr = document.createElement('tr'); tr.className = 'border-b border-slate-100';
            const cells = [years + ' año' + (years > 1 ? 's' : ''), item ? number(item.mean) + 'x' : '—', item ? number(item.sd) : '—', item && Number.isFinite(item.z) ? (item.z >= 0 ? '+' : '') + number(item.z) + ' σ' : '—'];
            cells.forEach((value, index) => { const td = document.createElement('td'); td.className = 'py-2 ' + (index ? 'text-right tabular-nums ' : '') + (index === 3 && item ? (item.z > 1 ? 'text-red-700' : item.z < -1 ? 'text-emerald-700' : 'text-slate-700') : ''); td.textContent = value; tr.append(td); });
            statsBody.append(tr);
        }

        const momentumBox = document.getElementById('worldPeMomentumChart');
        if (momentum.length) await FinancialVisuals.newPlot(momentumBox.id, [{ x: momentum.map(row => row.date), y: momentum.map(row => row.value), mode: 'lines+markers', name: 'Precio/SMA − 1', line: { color: '#204f78', width: 1.5 }, marker: { size: 3, color: momentum.map(row => row.value >= 0 ? '#1b857a' : '#c94c4c') } }], { height: 270, margin: { t: 15, l: 55, r: 15, b: 45 }, yaxis: { title: 'Distancia a SMA (%)' }, shapes: [{ type: 'line', xref: 'paper', x0: 0, x1: 1, y0: 0, y1: 0, line: { color: '#748292', width: 1 } }], showlegend: false }, { responsive: true, displayModeBar: false });
        else momentumBox.textContent = 'No hay suficientes cierres diarios para la media móvil.';

        const forecastBox = document.getElementById('worldPeForecastChart');
        const forecastStatus = document.getElementById('worldPeForecastStatus');
        if (!model.fit) { forecastBox.textContent = 'Sin regresión: se requieren al menos 8 ventanas independientes con PER y precio ajustado del ETF.'; forecastStatus.textContent = model.n + ' ventanas disponibles a ' + horizonYears + ' años.'; return; }
        const xValues = model.points.map(point => point.x), low = Math.min(...xValues, latest.pe), high = Math.max(...xValues, latest.pe);
        const fit = model.fit;
        await FinancialVisuals.newPlot(forecastBox.id, [
            { x: xValues, y: model.points.map(point => point.y), mode: 'markers', name: 'Ventanas observadas', marker: { size: 7, color: '#6589a5' } },
            { x: [low, high], y: [low, high].map(x => fit.intercept + fit.slope * x), mode: 'lines', name: 'Ajuste lineal', line: { color: '#204f78', width: 2 } }
        ], { height: 320, margin: { t: 15, l: 60, r: 20, b: 55 }, xaxis: { title: 'PER inicial (veces)' }, yaxis: { title: 'Retorno anualizado posterior ' + horizonYears + 'A (%)' }, shapes: [{ type: 'line', x0: latest.pe, x1: latest.pe, yref: 'paper', y0: 0, y1: 1, line: { color: '#bd7132', dash: 'dot', width: 1.5 } }], legend: { orientation: 'h', y: -0.27 } }, { responsive: true, displayModeBar: false });
        forecastStatus.textContent = 'Ajuste al PER mensual actual: ' + number(model.fittedAtLatest) + ' % anualizado · R² ' + number(fit.r2, 3) + ' · ' + model.n + ' ventanas independientes' + (model.n < 15 ? ' · muestra corta' : '') + (fit.r2 < 0.2 ? ' · relación histórica débil' : '') + '. No es una previsión fiable.';
    }

    root.loadWorldPe = loadWorldPe;
    root.renderWorldPe = renderWorldPe;
})(typeof globalThis !== 'undefined' ? globalThis : window);
