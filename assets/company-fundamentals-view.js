(function (root) {
    const definitions = [
        ['revenue', 'Ingresos', 'money', 0], ['netIncome', 'Beneficio neto', 'money', 0],
        ['operatingCashFlow', 'Flujo de caja operativo', 'money', 0], ['freeCashFlow', 'Flujo de caja libre', 'money', 0],
        ['operatingMargin', 'Margen operativo', 'percent', 1], ['netMargin', 'Margen neto', 'percent', 1],
        ['roic', 'ROIC', 'percent', 1], ['roe', 'ROE', 'percent', 1], ['roa', 'ROA', 'percent', 1],
        ['netDebtEbitda', 'Deuda neta / EBITDA', 'multiple', -1], ['cashRatio', 'Cash ratio', 'multiple', 1],
        ['shares', 'Acciones en circulación', 'shares', 0], ['drawdown1y', 'Caída desde máximo 1A', 'percent', 1]
    ];
    const cache = new Map();
    let origin = null, peers = [], serial = 0;
    const digits = value => Number.isFinite(value) ? value.toLocaleString('es-ES', { maximumFractionDigits: 2 }) : '—';
    function format(value, unit, currency) {
        if (!Number.isFinite(value)) return 'Sin dato';
        if (unit === 'percent') return digits(value * 100) + ' %';
        if (unit === 'multiple') return digits(value) + 'x';
        if (unit === 'money') return digits(value / 1e9) + ' mil M';
        if (unit === 'shares') return digits(value / 1e6) + ' M';
        return digits(value);
    }
    function latestValue(data, key) { return key === 'drawdown1y' ? data?.drawdown1y : data?.annual?.at(-1)?.[key]; }
    async function get(ticker) {
        const saved = cache.get(ticker);
        if (saved && Date.now() - saved.at < 600000) return saved.data;
        const response = await fetch('/api/company-fundamentals?ticker=' + encodeURIComponent(ticker));
        const data = await response.json();
        if (!response.ok) throw new Error(ticker + ': ' + (data.error || 'sin fundamentales'));
        cache.set(ticker, { at: Date.now(), data });
        return data;
    }
    async function loadCompanyFundamentals(ticker) {
        const current = ++serial;
        const status = document.getElementById('companyFundamentalsStatus');
        status.textContent = 'Cargando estados anuales de ' + ticker + '…';
        try {
            const data = await get(ticker);
            if (current !== serial) return;
            origin = data; peers = [];
            const select = document.getElementById('companyHistoryMetric');
            select.replaceChildren();
            for (const [key, label] of definitions.filter(item => item[0] !== 'drawdown1y')) {
                const option = document.createElement('option'); option.value = key; option.textContent = label; select.append(option);
            }
            status.textContent = ticker + ' · ' + data.annual.length + ' cierres anuales · último ' + data.annual.at(-1).date;
            renderCompanyHistory(); renderCompanyComparison();
        } catch (error) {
            if (current !== serial) return;
            origin = null; peers = [];
            status.textContent = error.message;
            document.getElementById('companyHistoryChart').replaceChildren();
            document.getElementById('companyCompareHead').replaceChildren();
            document.getElementById('companyCompareBody').replaceChildren();
        }
    }
    async function loadCompanyPeers() {
        if (!origin) return;
        const input = document.getElementById('companyPeerTickers').value.toUpperCase().split(/[;,\s]+/).filter(Boolean);
        const tickers = [...new Set(input)].filter(ticker => ticker !== origin.ticker);
        const status = document.getElementById('companyFundamentalsStatus');
        if (tickers.length > 4 || tickers.some(ticker => !/^[A-Z0-9^._-]{1,20}$/.test(ticker))) { status.textContent = 'Introduce hasta cuatro tickers válidos.'; return; }
        const current = ++serial;
        status.textContent = 'Comparando ' + origin.ticker + ' con ' + tickers.join(', ') + '…';
        const results = await Promise.allSettled(tickers.map(get));
        if (current !== serial) return;
        peers = results.filter(result => result.status === 'fulfilled').map(result => result.value);
        const failures = results.filter(result => result.status === 'rejected').map(result => result.reason.message);
        status.textContent = 'Origen ' + origin.ticker + ' · ' + peers.length + ' comparables cargados' + (failures.length ? ' · ' + failures.join('; ') : '');
        renderCompanyComparison();
    }
    async function renderCompanyHistory() {
        if (!origin) return;
        const key = document.getElementById('companyHistoryMetric').value;
        const definition = definitions.find(item => item[0] === key);
        if (!definition) return;
        const rows = origin.annual.filter(row => Number.isFinite(row[key]));
        const box = document.getElementById('companyHistoryChart');
        if (!rows.length) { box.textContent = 'Sin histórico de ' + definition[1] + '.'; return; }
        await FinancialVisuals.newPlot(box.id, [{ x: rows.map(row => row.date), y: rows.map(row => definition[2] === 'percent' ? row[key] * 100 : definition[2] === 'money' ? row[key] / 1e9 : definition[2] === 'shares' ? row[key] / 1e6 : row[key]),
            mode: 'lines+markers', name: definition[1], line: { color: '#204f78', width: 2 }, marker: { size: 6 } }],
        { height: 300, margin: { t: 15, l: 70, r: 20, b: 55 }, xaxis: { title: 'Cierre fiscal anual' }, yaxis: { title: definition[1] + (definition[2] === 'money' ? ' (miles de millones)' : definition[2] === 'percent' ? ' (%)' : '') }, showlegend: false }, { responsive: true, displayModeBar: false });
    }
    function renderCompanyComparison() {
        if (!origin) return;
        const head = document.getElementById('companyCompareHead'), body = document.getElementById('companyCompareBody');
        head.replaceChildren(); body.replaceChildren();
        const tr = document.createElement('tr'); tr.className = 'border-b border-slate-300 text-slate-700';
        for (const label of ['Métrica', origin.ticker + ' · origen', ...peers.map(data => data.ticker)]) {
            const th = document.createElement('th'); th.className = 'px-2 py-2 text-right first:text-left'; th.textContent = label; tr.append(th);
        }
        head.append(tr);
        const dates = document.createElement('tr'); dates.className = 'text-xs text-slate-500';
        for (const value of ['Cierre fiscal', origin.annual.at(-1)?.date || '—', ...peers.map(data => data.annual.at(-1)?.date || '—')]) {
            const td = document.createElement('td'); td.className = 'px-2 py-1 text-right first:text-left'; td.textContent = value; dates.append(td);
        }
        body.append(dates);
        for (const [key, label, unit, direction] of definitions) {
            const row = document.createElement('tr'); row.className = 'border-b border-slate-100';
            const title = document.createElement('td'); title.className = 'px-2 py-2 font-medium text-slate-700'; title.textContent = label; row.append(title);
            const baseline = latestValue(origin, key);
            for (const [index, data] of [origin, ...peers].entries()) {
                const value = latestValue(data, key), cell = document.createElement('td');
                cell.className = 'px-2 py-2 text-right tabular-nums'; cell.textContent = format(value, unit, data.currency);
                if (index && direction && Number.isFinite(value) && Number.isFinite(baseline)) {
                    const delta = (value - baseline) * direction;
                    if (Math.abs(delta) > Math.max(Math.abs(baseline) * 0.01, 1e-8)) cell.className += delta > 0 ? ' bg-emerald-50 text-emerald-800' : ' bg-red-50 text-red-800';
                }
                row.append(cell);
            }
            body.append(row);
        }
    }
    root.loadCompanyFundamentals = loadCompanyFundamentals;
    root.loadCompanyPeers = loadCompanyPeers;
    root.renderCompanyHistory = renderCompanyHistory;
})(typeof globalThis !== 'undefined' ? globalThis : window);
