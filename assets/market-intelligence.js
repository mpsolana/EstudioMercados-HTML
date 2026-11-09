(function (root) {
    const percent = value => Number.isFinite(value) ? value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %' : '—';

    async function responseOrError(url) {
        const response = await fetch(url);
        if (!response.ok) {
            const details = await response.json().catch(() => ({}));
            throw new Error(details.error || 'Datos no disponibles');
        }
        return response;
    }

    async function loadCurve() {
        const kind = document.getElementById('intelligenceCurveKind').value;
        const status = document.getElementById('intelligenceCurveStatus');
        status.textContent = 'Consultando BCE…';
        try {
            const data = await (await responseOrError('/api/market-intelligence?dataset=curve&kind=' + kind)).json();
            const points = data.points;
            const previous = points.filter(point => Number.isFinite(point.previousRate));
            const traces = [
                { x: points.map(point => point.years), y: points.map(point => point.rate), mode: 'lines+markers', name: 'Última sesión', line: { color: '#204f78', width: 2.5 }, marker: { size: 7 } }
            ];
            if (previous.length > 1) traces.push({ x: previous.map(point => point.years), y: previous.map(point => point.previousRate), mode: 'lines+markers', name: 'Sesión anterior', line: { color: '#78828c', width: 1.5, dash: 'dot' }, marker: { size: 5 } });
            FinancialVisuals.newPlot('intelligenceCurveChart', traces, {
                margin: { t: 15, l: 65, r: 18, b: 55 },
                height: 330,
                xaxis: { title: 'Vencimiento (años)', tickvals: innerWidth < 600 ? [1, 5, 10, 20, 30] : points.map(point => point.years) },
                yaxis: { title: 'Tipo anual (%)', zeroline: true },
                legend: { orientation: 'h', y: -0.25 }
            }, { responsive: true, displayModeBar: false });
            const one = points.find(point => point.years === 1);
            const ten = points.find(point => point.years === 10);
            document.getElementById('intelligenceCurveSlope').textContent = one && ten ? ((ten.rate - one.rate) * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + ' pb' : '—';
            const body = document.getElementById('intelligenceCurveRows');
            body.replaceChildren();
            for (const point of points) {
                const row = document.createElement('tr');
                const delta = Number.isFinite(point.previousRate) ? (point.rate - point.previousRate) * 100 : null;
                for (const value of [point.tenor, percent(point.rate), delta === null ? '—' : delta.toLocaleString('es-ES', { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + ' pb']) {
                    const cell = document.createElement('td');
                    cell.className = 'border-b border-slate-100 px-3 py-2 text-right first:text-left';
                    cell.textContent = value;
                    row.append(cell);
                }
                body.append(row);
            }
            status.textContent = 'BCE · ' + data.date + (data.previousDate ? ' · comparación con ' + data.previousDate : '');
        } catch (error) {
            status.textContent = 'No se pudo cargar la curva: ' + error.message;
            document.getElementById('intelligenceCurveSlope').textContent = '—';
            document.getElementById('intelligenceCurveRows').replaceChildren();
            document.getElementById('intelligenceCurveChart').replaceChildren();
        }
    }

    async function loadValuation() {
        const status = document.getElementById('intelligenceValuationStatus');
        status.textContent = 'Descargando serie de Shiller…';
        try {
            if (!root.XLSX) throw new Error('Falta la biblioteca de lectura Excel');
            const bytes = await (await responseOrError('/api/market-intelligence?dataset=shiller')).arrayBuffer();
            const workbook = XLSX.read(bytes, { type: 'array' });
            const sheet = workbook.Sheets.Data;
            if (!sheet) throw new Error('Falta la hoja Data en el Excel oficial');
            const analysis = MarketIntelligenceCore.capeAnalysis(XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null }));
            const points = analysis.points;
            const xMin = Math.min(...points.map(point => point.x));
            const xMax = Math.max(...points.map(point => point.x));
            const fit = analysis.fit;
            FinancialVisuals.newPlot('intelligenceValuationChart', [
                { x: points.map(point => point.x), y: points.map(point => point.y), text: points.map(point => point.date), type: 'scatter', mode: 'markers', name: 'Años observados', marker: { size: 7, opacity: 0.65, color: '#7199b8' } },
                { x: [xMin, xMax], y: [xMin, xMax].map(x => fit.intercept + fit.slope * x), type: 'scatter', mode: 'lines', name: 'Ajuste histórico', line: { color: '#204f78', width: 2 } }
            ], {
                margin: { t: 15, l: 65, r: 18, b: 65 },
                height: 350,
                xaxis: { title: 'CAPE al cierre de diciembre' },
                yaxis: { title: 'Retorno real total 12m (%)', zeroline: true },
                legend: { orientation: 'h', y: -0.3 }
            }, { responsive: true, displayModeBar: false });
            document.getElementById('intelligenceCapeLatest').textContent = analysis.latest.cape.toLocaleString('es-ES', { maximumFractionDigits: 1 });
            document.getElementById('intelligenceCapeR2').textContent = fit.r2.toLocaleString('es-ES', { maximumFractionDigits: 3 });
            document.getElementById('intelligenceCapeN').textContent = String(fit.n);
            status.textContent = 'Shiller · último CAPE: ' + analysis.latest.date + ' · muestra anual sin solapamiento' + (fit.r2 < 0.1 ? ' · relación a 12 meses débil' : '');
        } catch (error) {
            status.textContent = 'No se pudo cargar la valoración: ' + error.message;
            document.getElementById('intelligenceValuationChart').replaceChildren();
        }
    }

    root.loadMarketCurve = loadCurve;
    root.loadMarketIntelligence = () => Promise.allSettled([loadCurve(), loadValuation()]);
})(typeof globalThis !== 'undefined' ? globalThis : window);
