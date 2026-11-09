(function (root) {
    const cache = new Map();
    let active = null;
    let request = 0;
    const format = value => Number.isFinite(value) ? value.toLocaleString('es-ES', { maximumFractionDigits: 2 }) + 'x' : '—';

    async function loadIndividualValuation() {
        const ticker = document.getElementById('tickerInput')?.value.trim().toUpperCase();
        const status = document.getElementById('individualValuationStatus');
        if (!ticker || !/^[A-Z0-9^._-]{1,20}$/.test(ticker)) { status.textContent = 'Introduce un ticker válido.'; return; }
        document.getElementById('individualValuationTicker').textContent = ticker;
        const serial = ++request;
        const cached = cache.get(ticker);
        if (cached && Date.now() - cached.at < 600000) { active = cached.data; prepareMetrics(active); renderIndividualValuation(); return; }
        status.textContent = 'Consultando múltiplos de ' + ticker + '…';
        try {
            const response = await fetch('/api/valuation?ticker=' + encodeURIComponent(ticker));
            const data = await response.json();
            if (serial !== request) return;
            if (!response.ok) throw new Error(data.error || 'Datos no disponibles');
            active = data;
            cache.set(ticker, { at: Date.now(), data });
            prepareMetrics(data);
            renderIndividualValuation();
        } catch (error) {
            if (serial !== request) return;
            active = null;
            document.getElementById('individualValuationCards').replaceChildren();
            document.getElementById('individualValuationRows').replaceChildren();
            document.getElementById('individualValuationChart').replaceChildren();
            status.textContent = error.message;
        }
    }

    function prepareMetrics(data) {
        const select = document.getElementById('individualValuationMetric');
        const previous = select.value;
        select.replaceChildren();
        for (const metric of data.metrics.filter(item => item.observations.length)) {
            const option = document.createElement('option'); option.value = metric.key; option.textContent = metric.label;
            select.append(option);
        }
        select.value = [...select.options].some(option => option.value === previous) ? previous : select.options[0]?.value;
    }

    async function renderIndividualValuation() {
        if (!active) return;
        const status = document.getElementById('individualValuationStatus');
        const cards = document.getElementById('individualValuationCards');
        cards.replaceChildren();
        for (const metric of active.metrics) {
            const latest = metric.observations.at(-1);
            const card = document.createElement('div'); card.className = 'border-t border-slate-200 pt-3';
            const title = document.createElement('div'); title.className = 'text-xs text-slate-500'; title.textContent = metric.label;
            const value = document.createElement('strong'); value.className = 'block text-xl text-slate-800'; value.textContent = latest ? format(latest.value) : 'Sin dato';
            const date = document.createElement('div'); date.className = 'text-xs text-slate-500'; date.textContent = latest ? latest.date : '—';
            card.append(title, value, date); cards.append(card);
        }
        const metric = active.metrics.find(item => item.key === document.getElementById('individualValuationMetric').value);
        if (!metric) return;
        const rows = document.getElementById('individualValuationRows'); rows.replaceChildren();
        for (const item of [...metric.observations].reverse()) {
            const tr = document.createElement('tr'); tr.className = 'border-b border-slate-100';
            const date = document.createElement('td'); date.className = 'py-2'; date.textContent = item.date;
            const value = document.createElement('td'); value.className = 'py-2 text-right tabular-nums'; value.textContent = format(item.value);
            tr.append(date, value); rows.append(tr);
        }
        await FinancialVisuals.newPlot('individualValuationChart', [{
            x: metric.observations.map(item => item.date), y: metric.observations.map(item => item.value),
            mode: 'lines+markers', name: metric.label, line: { color: '#204f78', width: 2 }, marker: { size: 5 }
        }], { height: 340, margin: { t: 18, l: 55, r: 18, b: 55 }, xaxis: { title: 'Fecha publicada' }, yaxis: { title: metric.label + ' (veces)' }, showlegend: false }, { responsive: true, displayModeBar: false });
        document.getElementById('individualValuationSource').href = active.source;
        status.textContent = active.ticker + ' · ' + metric.observations.length + ' observaciones de ' + metric.label + ' · ' + metric.observations[0].date + '–' + metric.observations.at(-1).date;
    }

    root.loadIndividualValuation = loadIndividualValuation;
    root.renderIndividualValuation = renderIndividualValuation;
})(typeof globalThis !== 'undefined' ? globalThis : window);
