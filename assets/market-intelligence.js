(function (root) {
    const percent = value => Number.isFinite(value) ? value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %' : '—';
    let curveRequest = 0;
    let valuationRequest = 0;
    let shillerRows = null;

    async function responseOrError(url) {
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const response = await fetch(url);
                if (response.ok) return response;
                const details = await response.json().catch(() => ({}));
                if (attempt === 0 && response.status >= 500) continue;
                throw new Error(details.error || 'Datos no disponibles');
            } catch (error) {
                if (attempt === 1 || !error.name || error.name === 'Error') throw error;
            }
        }
    }

    async function loadCurve() {
        const request = ++curveRequest;
        const kind = document.getElementById('intelligenceCurveKind').value;
        const compare = document.getElementById('intelligenceCurveCompare').value;
        const status = document.getElementById('intelligenceCurveStatus');
        status.textContent = 'Consultando BCE…';
        try {
            const data = await (await responseOrError('/api/market-intelligence?dataset=curve&kind=' + kind + '&compare=' + compare)).json();
            if (request !== curveRequest) return;
            const points = data.points;
            const previous = points.filter(point => Number.isFinite(point.comparisonRate));
            const traces = [
                { x: points.map(point => point.years), y: points.map(point => point.rate), mode: 'lines+markers', name: data.date, line: { color: '#204f78', width: 2.5 }, marker: { size: 7 } }
            ];
            if (previous.length > 1) traces.push({ x: previous.map(point => point.years), y: previous.map(point => point.comparisonRate), mode: 'lines+markers', name: data.comparisonDate, line: { color: '#78828c', width: 1.5, dash: 'dot' }, marker: { size: 5 } });
            await FinancialVisuals.newPlot('intelligenceCurveChart', traces, {
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
                const delta = Number.isFinite(point.comparisonRate) ? (point.rate - point.comparisonRate) * 100 : null;
                for (const value of [point.tenor, percent(point.rate), delta === null ? '—' : delta.toLocaleString('es-ES', { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + ' pb']) {
                    const cell = document.createElement('td');
                    cell.className = 'border-b border-slate-100 px-3 py-2 text-right first:text-left';
                    cell.textContent = value;
                    row.append(cell);
                }
                body.append(row);
            }
            status.textContent = 'BCE · ' + data.date + (data.comparisonDate ? ' · comparación con ' + data.comparisonDate : ' · sin fecha comparable');
            const slopeOld = data.points.find(point => point.years === 10)?.comparisonRate - data.points.find(point => point.years === 1)?.comparisonRate;
            const slopeNow = ten?.rate - one?.rate;
            document.getElementById('intelligenceCurveInterpretation').textContent = Number.isFinite(slopeOld) && Number.isFinite(slopeNow) ?
                'Pendiente 10A–1A: ' + (slopeNow * 100).toFixed(0) + ' pb; ' + (Math.abs(slopeNow - slopeOld) < 0.01 ? 'casi sin cambio' : slopeNow > slopeOld ? 'más inclinada' : 'más plana') + ' frente al ' + data.comparisonDate + '. Una curva soberana refleja tipos, primas por plazo y riesgo de crédito; no permite aislar expectativas de decisiones del BCE.' :
                'No hay observación comparable suficiente para interpretar el cambio de pendiente.';
        } catch (error) {
            if (request !== curveRequest) return;
            status.textContent = 'No se pudo cargar la curva: ' + error.message;
            document.getElementById('intelligenceCurveInterpretation').textContent = 'Se conserva la última curva cargada; pulsa de nuevo para reintentar.';
        }
    }

    async function loadValuation(refresh = false) {
        const request = ++valuationRequest;
        const status = document.getElementById('intelligenceValuationStatus');
        const horizonYears = Number(document.getElementById('intelligenceCapeHorizon').value);
        status.textContent = shillerRows && !refresh ? 'Calculando plazo…' : 'Descargando serie de Shiller…';
        try {
            if (!root.XLSX) throw new Error('Falta la biblioteca de lectura Excel');
            if (!shillerRows || refresh) {
                const bytes = await (await responseOrError('/api/market-intelligence?dataset=shiller')).arrayBuffer();
                if (request !== valuationRequest) return;
                const workbook = XLSX.read(bytes, { type: 'array' });
                const sheet = workbook.Sheets.Data;
                if (!sheet) throw new Error('Falta la hoja Data en el Excel oficial');
                shillerRows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
            }
            const analysis = MarketIntelligenceCore.capeAnalysis(shillerRows, horizonYears);
            const points = analysis.points;
            const xMin = Math.min(analysis.latest.cape, ...points.map(point => point.x));
            const xMax = Math.max(analysis.latest.cape, ...points.map(point => point.x));
            const fit = analysis.fit;
            await FinancialVisuals.newPlot('intelligenceValuationChart', [
                { x: points.map(point => point.x), y: points.map(point => point.y), text: points.map(point => point.date + '–' + (Number(point.date.slice(0, 4)) + horizonYears)), type: 'scatter', mode: 'markers', name: 'Ventanas observadas', marker: { size: 7, opacity: 0.65, color: '#7199b8' } },
                { x: [xMin, xMax], y: [xMin, xMax].map(x => fit.intercept + fit.slope * x), type: 'scatter', mode: 'lines', name: 'Ajuste histórico', line: { color: '#204f78', width: 2 } },
                { x: [analysis.latest.cape], y: [analysis.fittedAtLatest], type: 'scatter', mode: 'markers', name: 'CAPE actual · ajuste', marker: { size: 11, color: '#bd7132', symbol: 'diamond' }, hovertemplate: 'CAPE: %{x:.1f}<br>Ajuste histórico: %{y:.1f}%<extra></extra>' }
            ], {
                margin: { t: 15, l: 65, r: 18, b: 65 },
                height: 350,
                xaxis: { title: 'CAPE al cierre de diciembre', range: [xMin - 2, xMax + 2] },
                yaxis: { title: 'Retorno real total anualizado a ' + horizonYears + (horizonYears === 1 ? ' año' : ' años') + ' (%)', zeroline: true },
                legend: { orientation: 'h', y: -0.3 },
                shapes: [{ type: 'rect', xref: 'x', yref: 'paper', x0: analysis.latest.cape - 0.35, x1: analysis.latest.cape + 0.35, y0: 0, y1: 1, fillcolor: 'rgba(189,113,50,0.07)', line: { color: '#bd7132', width: 1.5, dash: 'dot' } }]
            }, { responsive: true, displayModeBar: false });
            if (request !== valuationRequest) return;
            document.getElementById('intelligenceCapeLatest').textContent = analysis.latest.cape.toLocaleString('es-ES', { maximumFractionDigits: 1 });
            document.getElementById('intelligenceCapeR2').textContent = fit.r2.toLocaleString('es-ES', { maximumFractionDigits: 3 });
            document.getElementById('intelligenceCapeN').textContent = String(fit.n);
            document.getElementById('intelligenceCapeFitted').textContent = percent(analysis.fittedAtLatest);
            document.getElementById('intelligenceCapeHorizonLabel').textContent = horizonYears + (horizonYears === 1 ? ' año' : ' años');
            status.textContent = 'Shiller · dato publicado ' + analysis.latest.date + ' · ' + horizonYears + (horizonYears === 1 ? ' año' : ' años') + ' · ' + fit.n + ' ventanas no solapadas · R² ' + fit.r2.toFixed(3) + (fit.r2 < 0.1 ? ' · relación histórica débil' : '');
        } catch (error) {
            if (request !== valuationRequest) return;
            status.textContent = 'No se pudo cargar la valoración: ' + error.message;
        }
    }

    async function loadPolicyRates() {
        const status = document.getElementById('intelligencePolicyStatus');
        status.textContent = 'Consultando €STR y tipo de depósito…';
        try {
            const data = await (await responseOrError('/api/market-intelligence?dataset=policy')).json();
            const available = data.series.filter(series => series.observations.length);
            if (!available.length) throw new Error('Sin series disponibles');
            const lastMarketDate = data.series.find(series => series.id === 'ESTR')?.observations.at(-1)?.date;
            await FinancialVisuals.newPlot('intelligencePolicyChart', available.map(series => ({
                x: series.observations.map(point => point.date).concat(series.id === 'DFR' && lastMarketDate > series.observations.at(-1).date ? [lastMarketDate] : []),
                y: series.observations.map(point => point.value).concat(series.id === 'DFR' && lastMarketDate > series.observations.at(-1).date ? [series.observations.at(-1).value] : []),
                mode: 'lines', name: series.label, line: { color: series.id === 'ESTR' ? '#205b88' : '#78828c', width: 2, shape: series.id === 'DFR' ? 'hv' : 'linear' }
            })), {
                height: 315, margin: { t: 15, l: 58, r: 20, b: 55 },
                xaxis: { title: 'Fecha de observación' }, yaxis: { title: 'Tipo anual (%)' },
                legend: { orientation: 'h', y: -0.25 }
            }, { responsive: true, displayModeBar: false });
            status.textContent = available.map(series => {
                const last = series.observations.at(-1);
                return series.label + ': ' + percent(last.value) + ' (' + last.date + ')';
            }).join(' · ');
        } catch (error) {
            status.textContent = 'No se pudieron actualizar los tipos: ' + error.message;
        }
    }

    root.loadMarketCurve = loadCurve;
    root.loadMarketValuation = () => loadValuation(false);
    root.loadMarketIntelligence = () => Promise.allSettled([loadCurve(), loadValuation(true), loadPolicyRates()]);
})(typeof globalThis !== 'undefined' ? globalThis : window);
