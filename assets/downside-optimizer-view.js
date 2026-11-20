const PortfolioOptimizerView = (() => {
    'use strict';
    const frequencyLabel = code => ({ D: 'diaria', C: 'diaria natural', W: 'semanal', M: 'mensual' })[code] || 'sin identificar';
    let panel, assets = [], result = null, selected = 0, revision = 0, signature = '';
    let running = false, applying = false, initializedDefaults = false;
    const overrides = new Map();
    const esc = value => escapeHtml(String(value ?? ''));
    const number = value => value === '' || value == null ? NaN : Number(String(value).replace(',', '.'));
    const pct = value => Number.isFinite(value) ? value.toLocaleString('es-ES', { maximumFractionDigits: 2 }) + '%' : '—';
    const fmt = value => value === Infinity ? '∞' : Number.isFinite(value) ? value.toLocaleString('es-ES', { maximumFractionDigits: 2 }) : '—';
    const norm = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    const controls = [
        ['maxRv', 'Máximo RV (% total)', 0, 100], ['minWeight', 'Mínimo por fondo incluido (%)', .1, 100],
        ['maxWeight', 'Máximo por fondo (%)', .1, 100], ['maxDrawdown', 'Caída máxima tolerada (%)', 0, 100],
        ['minRolling5', 'Peor rolling 5 años mínimo (% anual)', -100, 10000],
        ['maxRecovery', 'Máximo tiempo bajo máximos (días)', 1, 10000], ['maxDuration', 'Duración máxima RF (años)', .01, 100],
        ['minYield', 'TIR neta mínima RF (%)', -100, 100], ['minEfficiency', 'Mínimo TIR neta / duración', 0, 100],
        ['maxHy', 'Máximo HY (% de RF)', 0, 100], ['maxFx', 'Máximo exposición no EUR (%)', 0, 100],
        ['iterations', 'Combinaciones a generar', 100, 100000], ['seed', 'Semilla reproducible', 1, 4294967295],
        ['ulcerPenalty', 'Penalización por punto Ulcer', 0, 10], ['riskFree', 'Tasa libre de riesgo anual (%)', -99, 100]
    ];
    const labels = { fxPct: 'Exposición no EUR', grossYield: 'TIR bruta', ter: 'TER', duration: 'Duración' };
    const sourceSignature = () => JSON.stringify({ version: window.masterPriceVersion || 0,
        settings: portfolioCalculationSettings(), metadata: window.masterOptimizerMetadata,
        keys: Object.keys(window.masterPriceSeries || {}).map(isin => [isin, OverviewPanel.state.categories.get(isin),
            GdcModel.state.rfMetrics['F:' + isin], fundUniverseState?.isinIndex?.get(isin)?.ter]) });
    function metadataFromWorkbook(workbook) {
        const out = {};
        const aliases = {
            name: ['nombre', 'name', 'fondo'], type: ['tipoactivo', 'assettype', 'tipo', 'asset_class', 'asset class'],
            fxPct: ['noeurpct', 'exposicionnoeur', 'divisanocubiertapct'],
            credit: ['calidadcrediticia', 'creditquality', 'credito'],
            grossYield: ['tirbruta', 'grossytm', 'grossyield'],
            ter: ['ter', 'gastoscorrientes', 'gastos corrientes'], referenceYield: ['YTM', 'TIR'], duration: ['duracionmodificada', 'modifiedduration', 'duration', 'MD']
        };
        for (const sheet of workbook.SheetNames) {
            const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheet], { defval: null, raw: true });
            const displayed = XLSX.utils.sheet_to_json(workbook.Sheets[sheet], { defval: null, raw: false });
            for (const [index, row] of rows.entries()) {
                const fields = new Map(Object.entries(row).map(([key, value]) => [norm(key),
                    typeof value === 'number' && /%/.test(String(displayed[index]?.[key] || '')) ? value * 100 : value]));
                const isin = String(fields.get('isin') || fields.get('ticker') || '').trim().toUpperCase();
                if (!isLikelyIsin(isin)) continue;
                const metadata = { ...out[isin] };
                for (const [field, names] of Object.entries(aliases)) {
                    const value = names.map(name => fields.get(norm(name))).find(value => value != null && value !== '');
                    if (value != null) metadata[field] = (Object.hasOwn(labels, field) || field === 'referenceYield') ? number(typeof value === 'string' ? value.replace('%', '').trim() : value) : String(value).trim();
                }
                if (metadata.type) {
                    const type = ModelPortfolioCore.assetType(metadata.type);
                    if (['RF', 'RV'].includes(type)) metadata.type = type;
                    else if (out[isin]?.type) metadata.type = out[isin].type;
                    else delete metadata.type;
                }
                if (!metadata.credit) {
                    const category = norm(fields.get('assetclass'));
                    if (category.includes('highyield') || category.endsWith('hy')) metadata.credit = 'HY';
                    else if(category.includes('monetario')||category.includes('moneymarket')||category.startsWith('mm'))metadata.credit='Monetario';
                    else if (category.includes('investmentgrade') || category.endsWith('ig')) metadata.credit = 'IG';
                }
                if (metadata.credit) {
                    const credit = norm(metadata.credit);
                    metadata.credit = ['ig', 'investmentgrade', 'gradodeinversion'].includes(credit) ? 'IG' :
                        ['hy','highyield','altorendimiento'].includes(credit) ? 'HY' :
                            ['soberana','soberano','government'].includes(credit) ? 'Soberana' :
                                ['monetario','monetaria','moneymarket','mm','liquidez','cash'].includes(credit)?'Monetario':'';
                }
                out[isin] = metadata;
            }
        }
        return out;
    }
    function clearResults() {
        const output = panel.querySelector('[data-optimizer-results]');
        if (window.Plotly) for (const chart of output.querySelectorAll('.js-plotly-plot')) Plotly.purge(chart);
        output.replaceChildren();
    }
    function invalidate(message = 'Parámetros modificados. Ejecuta de nuevo el optimizador.') {
        revision++;
        result = null;
        if (!panel) return;
        clearResults();
        panel.querySelector('[data-optimizer-status]').textContent = message;
    }
    function refresh() {
        if (!panel) return;
        const current = sourceSignature();
        if (!initializedDefaults) {
            panel.querySelector('[name="riskFree"]').value = document.getElementById('portfolioRiskFree')?.value || '0';
            initializedDefaults = true;
        }
        if (signature === current && assets.length) return;
        const newMaster=panel.dataset.masterVersion !== String(window.masterPriceVersion || 0);
        if(newMaster)overrides.clear();
        panel.dataset.masterVersion = String(window.masterPriceVersion || 0);
        signature = current;
        invalidate('Revisa los datos de los fondos y selecciona el universo antes de calcular.');
        const currentFunds = new Set(fundPortfolioRows.map(row => row.isin));
        assets = Object.entries(window.masterPriceSeries || {}).map(([isin, series]) => {
            const record = fundUniverseState?.isinIndex?.get(isin) || fundPortfolioRows.find(row => row.isin === isin) || {};
            const classification = OverviewPanel.state.categories.get(isin);
            const mix = OverviewCore.exposureMix(classification);
            const rf = GdcModel.state.rfMetrics['F:' + isin] || {};
            const imported = window.masterOptimizerMetadata?.[isin] || {};
            const type = classification?.type || ModelPortfolioCore.assetType(record.category || record.assetClass || '');
            return { isin, name: record.name || series.label || isin, type: ['RV', 'RF'].includes(type) ? type : '',
                fxPct: mix ? (1 - mix[0]) * 100 : NaN, credit: '', grossYield: Number.isFinite(rf.grossYield) ? rf.grossYield : NaN, referenceYield: rf.ytm,
                duration: Number.isFinite(rf.duration) ? rf.duration : NaN, ter: Number.isFinite(record.ter) ? record.ter : NaN,
                ...imported, included: currentFunds.has(isin), data: series.data || series };
        });
        renderAssets();
        updateDates(newMaster);
    }
    function updateDates(force=false){
        const form=panel.querySelector('form');
        const selectedAssets=assets.map(asset=>({...asset,...overrides.get(asset.isin)})).filter(asset=>asset.included);
        const range=DownsideOptimizer.commonRange(selectedAssets.length?selectedAssets:assets);
        for(const key of ['start','end']){
            const field=form.elements[key];
            if(force||!field.value||field.value===field.dataset.autoDate)field.value=range[key];
            field.dataset.autoDate=range[key];
        }
        panel.querySelector('[data-opt-common-range]').textContent=range.count?`${range.count} fechas comunes · ${range.start} a ${range.end}`:'Sin fechas comunes en el universo seleccionado.';
    }
    function syncConstraints(){
        const form=panel.querySelector('form');
        for(const toggle of form.querySelectorAll('[data-opt-constraint]')){
            const field=form.elements[toggle.dataset.optConstraint];if(field)field.disabled=!toggle.checked;
        }
        form.elements.allowOpen.disabled=!form.querySelector('[data-opt-constraint="openRecovery"]').checked;
        form.elements.ulcerPenalty.disabled=['rolling5','meanRolling5'].includes(form.elements.objective.value);
    }
    function renderAssets() {
        panel.querySelector('[data-optimizer-universe]').innerHTML = assets.length
            ? assets.map((asset, index) => {
                const edit = { ...asset, ...overrides.get(asset.isin) };
                const options = (values, field) => '<option value="">Pendiente</option>' + values.map(value =>
                    `<option ${edit[field] === value ? 'selected' : ''}>${value}</option>`).join('');
                return `<tr><td><input type="checkbox" data-opt-asset="${index}" data-opt-field="included" ${edit.included ? 'checked' : ''} aria-label="Incluir ${esc(asset.isin)}"></td>
                    <th scope="row">${esc(asset.name)}<small>${esc(asset.isin)} · ${asset.data.length} precios · ${frequencyLabel(FinanceCore.frequency(asset.data))}</small><small>${asset.data.length ? new Date(asset.data[0].date).toISOString().slice(0, 10) + ' a ' + new Date(asset.data.at(-1).date).toISOString().slice(0, 10) : 'Sin fechas'}</small></th>
                    <td><select data-opt-asset="${index}" data-opt-field="type" aria-label="Tipo ${esc(asset.isin)}">${options(['RF','RV'], 'type')}</select></td>
                    <td><select data-opt-asset="${index}" data-opt-field="credit" ${edit.type === 'RV' ? 'disabled' : ''} aria-label="Calidad crediticia ${esc(asset.isin)}">${options(['Soberana','IG','HY','Monetario'], 'credit')}</select></td>
                    ${Object.entries(labels).map(([field, label]) => `<td><input type="number" step="0.01" ${field === 'grossYield' ? '' : 'min="0"'} ${field === 'fxPct' ? 'max="100"' : ''}
                        value="${Number.isFinite(edit[field]) ? edit[field] : ''}"
                        ${edit.type === 'RV' && field !== 'fxPct' ? 'disabled' : ''}
                        placeholder="${field === 'grossYield' && Number.isFinite(asset.referenceYield) ? 'YTM base: ' + fmt(asset.referenceYield) + '%' : 'Pendiente'}" data-opt-asset="${index}" data-opt-field="${field}" aria-label="${label} ${esc(asset.isin)}"></td>`).join('')}
                    </tr>`;
            }).join('') : '<tr><td colspan="8">Carga el Excel maestro con históricos posis/prices desde Carga de datos.</td></tr>';
    }
    function config() {
        const form = panel.querySelector('form');
        return { ...Object.fromEntries(controls.map(([name]) => [name, number(form.elements[name].value)])),
            start: form.elements.start.value, end: form.elements.end.value, rebalance: form.elements.rebalance.value,
            allowOpen: form.elements.allowOpen.checked, objective:form.elements.objective.value,
            disabledConstraints:[...form.querySelectorAll('[data-opt-constraint]')].filter(toggle=>!toggle.checked).map(toggle=>toggle.dataset.optConstraint) };
    }
    async function calculate() {
        if (running || applying) return;
        refresh();
        const token = ++revision, settings = portfolioCalculationSettings();
        const status = panel.querySelector('[data-optimizer-status]');
        result = null; clearResults();
        try {
            if (settings.currency !== 'EUR' || !settings.pricesInBase) throw new Error('Confirma que el maestro contiene VL en EUR en Carga de datos. El control de exposición no convierte históricos en otra divisa.');
            const selectedAssets = assets.map(asset => ({ ...asset, ...overrides.get(asset.isin) })).filter(asset => asset.included);
            const settingsSignature = sourceSignature();
            const data = config();
            running = true;
            panel.querySelector('[data-opt-run]').disabled = true;
            panel.querySelector('[data-opt-cancel]').disabled = false;
            const next = await DownsideOptimizer.optimize(selectedAssets, data, {
                cancelled: () => token !== revision || settingsSignature !== sourceSignature(),
                progress: progress => {
                    status.textContent = `${progress.iteration.toLocaleString('es-ES')} / ${progress.total.toLocaleString('es-ES')} generadas · ${progress.passed} superan fundamentales · ${progress.evaluated} reconstruidas · ${progress.valid} cumplen todo.`;
                    panel.querySelector('progress').value = progress.iteration / progress.total;
                }
            });
            if (token !== revision) return;
            result = next; selected = 0;
            panel.querySelector('progress').value = 1;
            renderResult();
        } catch (error) {
            status.textContent = error.message;
        } finally {
            running = false; panel.querySelector('[data-opt-run]').disabled = false; panel.querySelector('[data-opt-cancel]').disabled = true;
        }
    }
    function renderResult() {
        const output = panel.querySelector('[data-optimizer-results]'), winner = result.choices[selected];
        if (!winner) { output.textContent = 'La búsqueda no ha encontrado combinaciones evaluables.'; return; }
        const metric = winner.metrics;
        panel.querySelector('[data-optimizer-status]').textContent = `${result.unique.toLocaleString('es-ES')} combinaciones distintas · ${result.evaluated.toLocaleString('es-ES')} evaluadas históricamente · ${result.valid.toLocaleString('es-ES')} cumplen todos los límites · ${result.dates[0]} a ${result.dates.at(-1)} · ${result.dates.length} precios comunes · frecuencia ${frequencyLabel(result.frequency)}.`;
        const violations = candidate => candidate.failures.length ? candidate.failures.map(failure =>
            `${failure.name}: ${fmt(failure.value)} ${failure.unit} frente a límite ${fmt(failure.limit)} ${failure.unit}`).join(' · ') : 'Cumple las restricciones de esta muestra.';
        clearResults();
        output.innerHTML = `
            <h3>${result.valid ? 'Mejor cartera encontrada' : 'Aproximaciones a las restricciones'}</h3>
            <p class="workspace-context">${result.valid ? (result.config.objective==='meanRolling5'?'Ordenadas por la media de los retornos rolling anualizados a 5 años, entre las carteras que cumplen los filtros activos. Sin penalización Ulcer.':result.config.objective==='rolling5'?'Ordenadas por el peor rolling anualizado a 5 años. Sin penalización Ulcer ni objetivo a 3 años.':'Ordenadas por mínimo de los peores rolling a 3 y 5 años menos penalización Ulcer; Sharpe desempata.') :
                'Ninguna combinación muestreada cumple todos los límites. Las aproximaciones conservan sus incumplimientos visibles y no se pueden aplicar como solución válida.'}</p>
            <div class="optimizer-choices">${result.choices.map((candidate, index) =>
                `<button type="button" data-opt-choice="${index}" aria-pressed="${index === selected}">${result.valid ? 'Cartera' : 'Aproximación'} ${index + 1} · ${result.config.objective==='meanRolling5'?'Media rolling 5 años':'Rolling mínimo'} ${pct(candidate.objectiveReturn)}</button>`).join('')}</div>
            <p class="workspace-status">${esc(violations(winner))}</p>
            ${['M', 'W'].includes(result.frequency) ? `<p class="workspace-context">La muestra tiene frecuencia ${frequencyLabel(result.frequency)}. El drawdown y la recuperación se miden entre esos cierres; los movimientos dentro del período quedan fuera de la observación.</p>` : ''}
            <div class="optimizer-kpis">${[
                ['Peor rolling 3 años', pct(winner.worst3)], ['Peor rolling 5 años', pct(winner.worst5)],
                ['Media rolling 3 años',pct(winner.mean3)],['Media rolling 5 años',pct(winner.mean5)],
                ['Caída máxima', pct(winner.maxDrawdown === 0 ? 0 : -winner.maxDrawdown)], ['Máximo tiempo bajo máximos observado', fmt(winner.recoveryDays) + ' días'],
                ['Recuperación al cierre', winner.openRecovery ? 'Abierta · ' + fmt(winner.openRecovery) + ' días transcurridos' : 'Recuperada'],
                ['TIR neta RF', pct(metric.netYield)], ['Duración RF', fmt(metric.duration) + (metric.duration === 1 ? ' año' : ' años')],
                ['Impacto tipos +100 pb · cartera', pct(metric.rateImpact)], ['Sharpe', fmt(winner.sharpe)], ['Índice Ulcer', fmt(winner.ulcer)]
            ].map(([label, value]) => `<div><small>${label}</small><strong>${value}</strong></div>`).join('')}</div>
            <div class="optimizer-chart-grid"><div data-opt-allocation></div><div data-opt-cloud></div></div>
            <div data-opt-history class="optimizer-history"></div>
            <div class="proposal-chart-scroll"><table class="wide-report-table"><thead><tr><th>ISIN / fondo</th><th>Peso</th><th>Tipo</th><th>Exposición no EUR</th><th>TIR neta RF</th><th>Duración RF</th></tr></thead>
                <tbody>${result.assets.map((asset, i) => winner.weights[i] > 0 ? `<tr><th scope="row">${esc(asset.name)}<small>${esc(asset.isin)}</small></th><td>${pct(winner.weights[i] * 100)}</td><td>${asset.type}</td>
                <td>${pct(asset.fxPct)}</td><td>${asset.type === 'RF' ? pct(asset.grossYield - asset.ter) : '—'}</td><td>${asset.type === 'RF' ? fmt(asset.duration) : '—'}</td></tr>` : '').join('')}</tbody></table></div>
            <p class="workspace-context">RV ${pct(metric.rv)} · divisa no EUR ${pct(metric.fx)} · HY dentro de RF ${pct(metric.hy)} · TIR/duración ${fmt(metric.efficiency)}.</p>
            <p class="workspace-context">Al aplicar se trasladan los pesos al backtest y al scoring de la cartera individual, con el rebalanceo ${{ monthly: 'mensual', quarterly: 'trimestral', annual: 'anual' }[result.config.rebalance]}, la tasa libre de riesgo configurada y costes de transacción 0 para reproducir esta simulación.</p>
            <button type="button" data-opt-apply ${winner.failures.length ? 'disabled' : ''}>Aplicar pesos y recalcular cartera individual</button>
            <details><summary>Restricciones que más han rechazado combinaciones</summary><ul>${Object.entries(result.blockers).sort((a, b) => b[1] - a[1]).map(([name, count]) =>
                `<li>${esc(name)} · ${count.toLocaleString('es-ES')} descartes</li>`).join('')}</ul></details>`;
        if (!window.Plotly) return;
        const selectedAssets = result.assets.map((asset, i) => ({ ...asset, weight: winner.weights[i] })).filter(asset => asset.weight > 0);
        FinancialVisuals.newPlot(output.querySelector('[data-opt-allocation]'), [{
            type: 'bar', orientation: 'h', y: selectedAssets.map(asset => asset.name), x: selectedAssets.map(asset => asset.weight * 100),
            text: selectedAssets.map(asset => pct(asset.weight * 100)), textposition: 'auto', marker: { color: '#204f78' }
        }], { title: 'Distribución encontrada', margin: { l: 180, r: 25, t: 45, b: 55 }, xaxis: { title: 'Peso (%)' }, yaxis: { automargin: true } }, { responsive: true });
        FinancialVisuals.newPlot(output.querySelector('[data-opt-cloud]'), [
            ...[false, true].map(valid => { const points = result.cloud.filter(point => point.valid === valid);
                return { type: 'scattergl', mode: 'markers', name: valid ? 'Cumplen límites' : 'Fuera de límites',
                    x: points.map(point => point.dd), y: points.map(point => point.worst), marker: { color: valid ? '#247354' : '#a4afb9', size: 4, opacity: .45 },
                    hovertemplate: `Caída máxima %{x:.2f}%<br>${result.config.objective==='meanRolling5'?'Media rolling 5 años':'Peor rolling'} %{y:.2f}%<extra></extra>` }; }),
            { type: 'scatter', mode: 'markers', name: 'Seleccionada', x: [winner.maxDrawdown], y: [winner.objectiveReturn], marker: { color: '#204f78', size: 16, symbol: 'star' } }
        ], { title: 'Carteras evaluadas históricamente', margin: { l: 65, r: 25, t: 45, b: 55 }, xaxis: { title: 'Caída máxima (%)' }, yaxis: { title: result.config.objective==='meanRolling5'?'Media rolling anualizada a 5 años (%)':result.config.objective==='rolling5'?'Peor retorno anualizado a 5 años (%)':'Peor retorno anualizado 3 / 5 años (%)' } }, { responsive: true });
        FinancialVisuals.newPlot(output.querySelector('[data-opt-history]'), [
            { type: 'scatter', mode: 'lines', name: 'Patrimonio · base 100', x: result.dates, y: winner.path, line: { color: '#204f78' }, xaxis: 'x', yaxis: 'y' },
            { type: 'scatter', mode: 'lines', name: 'Drawdown', x: result.dates, y: winner.drawdowns.map(value => value * 100), line: { color: '#b34b50' }, fill: 'tozeroy', xaxis: 'x2', yaxis: 'y2' }
        ], { title: 'Evolución histórica y caídas', grid: { rows: 2, columns: 1, pattern: 'independent', roworder: 'top to bottom' },
            yaxis: { title: 'Base 100', domain: [.4, 1] }, yaxis2: { title: 'Caída (%)', domain: [0, .25] },
            xaxis: { matches: 'x2', showticklabels: false }, xaxis2: { type: 'date' }, margin: { l: 65, r: 25, t: 50, b: 50 } }, { responsive: true });
    }
    async function apply() {
        if (applying) return;
        if (!result || signature !== sourceSignature()) { invalidate('El maestro o los ajustes han cambiado. Calcula de nuevo.'); return; }
        const candidate = result.choices[selected];
        if (candidate.failures.length) return;
        const previous = { rebalance: document.getElementById('portfolioRebalance').value, cost: document.getElementById('portfolioCostBps').value, frequency: document.getElementById('portfolioDataFrequency').value, riskFree: document.getElementById('portfolioRiskFree').value };
        const entries = result.assets.map((asset, i) => ({ ticker: asset.isin, weight: candidate.weights[i], name: asset.name, assetClass: asset.type })).filter(asset => asset.weight > 0);
        const series = Object.fromEntries(entries.map(entry => {
            const source = window.masterPriceSeries[entry.ticker].data || window.masterPriceSeries[entry.ticker];
            return [entry.ticker, source.filter(point => { const date = new Date(point.date).toISOString().slice(0, 10); return result.dates.includes(date); })];
        }));
        applying = true;
        panel.querySelector('[data-opt-apply]').disabled = true;
        try {
            document.getElementById('portfolioRebalance').value = result.config.rebalance;
            document.getElementById('portfolioCostBps').value = '0';
            document.getElementById('portfolioDataFrequency').value = 'auto';
            document.getElementById('portfolioRiskFree').value = result.config.riskFree;
            computeImportedBacktestPortfolio(entries, series, 'Optimizador downside · Maestro', window.masterBenchmarks || {}, window.masterPriceSeries);
            await portfolioAnalysisPromise;
            syncFundScoringPortfolioFromEntries(entries, 'Optimizador downside · Maestro', { manual: true });
            PortfolioWorkspace.scope = 'individual'; PortfolioWorkspace.step = 'diagnosis'; PortfolioWorkspace.tool = 'main';
            showPortfolioSubtab('main'); portfolioWorkflowRefresh();
        } catch (error) {
            document.getElementById('portfolioRebalance').value = previous.rebalance;
            document.getElementById('portfolioCostBps').value = previous.cost;
            document.getElementById('portfolioDataFrequency').value = previous.frequency;
            document.getElementById('portfolioRiskFree').value = previous.riskFree;
            panel.querySelector('[data-optimizer-status]').textContent = error.message;
        } finally {
            applying = false;
            const button = panel.querySelector('[data-opt-apply]');
            if (button && result) button.disabled = result.choices[selected].failures.length > 0;
        }
    }
    function init(target) {
        panel = target;
        panel.classList.add('optimizer-panel');
        panel.innerHTML = `<h3>Optimizador de carteras · Downside y fundamentales</h3>
            <p class="workspace-context">Carga el Maestro en Carga de datos. Revisa los fondos y sus métricas, ajusta los límites y ejecuta la búsqueda. El resultado se puede aplicar a la cartera individual.</p>
            <div class="optimizer-layout"><form class="optimizer-controls">
                <label>Objetivo de optimización<select name="objective"><option value="downside">Rolling 3/5 años con penalización Ulcer</option><option value="rolling5">Maximizar el peor rolling a 5 años</option><option value="meanRolling5">Maximizar la media rolling a 5 años</option></select></label>
                <div class="optimizer-constraint-actions"><button type="button" data-opt-constraints="none">Quitar restricciones</button><button type="button" data-opt-constraints="all">Activar restricciones</button></div>
                <label>Perfil GDC / GICI<select name="profile">${[
                    ['muy_conservador','Muy Conservador'],['prudente','Prudente'],['equilibrado','Equilibrado'],
                    ['decidido','Decidido'],['muy_arriesgado','Muy Arriesgado']].map(([key, label]) =>
                        `<option value="${key}" ${key === 'equilibrado' ? 'selected' : ''}>${label} · RV máx. ${ModelPortfolioCore.bands[key][1]}%</option>`).join('')}</select></label>
                ${controls.map(([name,label,min,max])=>`<div class="optimizer-control-field"><label for="optimizer-${name}">${DownsideOptimizer.constraintKeys.includes(name)?`<input type="checkbox" data-opt-constraint="${name}" checked aria-label="Aplicar ${label}">`:''}${label}</label><input id="optimizer-${name}" name="${name}" type="number" min="${min}" max="${max}" step="${['iterations','seed','maxRecovery'].includes(name)?'1':'any'}" ${name==='minRolling5'?'aria-describedby="optimizer-rolling5-help"':'required'}></div>`).join('')}
                <p class="workspace-context">Para buscar retorno medio con protección histórica, elige «Media rolling a 5 años» y conserva un suelo para el peor rolling y los límites de riesgo del cliente. «Peor rolling» prioriza el período histórico más desfavorable. Marca solo los filtros que quieras aplicar. «Quitar restricciones» permite buscar usando únicamente el objetivo elegido. Se mantienen pesos no negativos que suman 100% y cinco años de datos comunes. El perfil solo aporta valores a los filtros activos.</p>
                <label>Desde<a class="optimizer-note-ref" href="#optimizer-dates-help" aria-label="Ver explicación de Desde">1</a><input name="start" type="date" aria-describedby="optimizer-dates-help"></label>
                <label>Hasta<a class="optimizer-note-ref" href="#optimizer-dates-help" aria-label="Ver explicación de Hasta">1</a><input name="end" type="date" aria-describedby="optimizer-dates-help"></label>
                <button type="button" data-opt-dates>Usar todo el histórico común</button><p class="workspace-context" data-opt-common-range></p>
                <label>Rebalanceo<select name="rebalance"><option value="monthly">Mensual</option><option value="quarterly">Trimestral</option><option value="annual">Anual</option></select></label>
                <label class="optimizer-check"><input type="checkbox" data-opt-constraint="openRecovery" checked> Exigir recuperación de caídas abiertas</label>
                <label class="optimizer-check"><input name="allowOpen" type="checkbox"> Admitir caídas abiertas si su tiempo transcurrido está dentro del límite</label>
                <p class="workspace-context">Ejemplos de formato: 45 significa 45%; duración 2 significa 2 años. El peso mínimo solo se aplica a los fondos incluidos.</p>
                <p id="optimizer-rolling5-help" class="workspace-context optimizer-field-note"><strong>Retorno rolling mínimo a 5 años.</strong> Es la rentabilidad anualizada mínima que exiges incluso en la peor ventana histórica de cinco años del período seleccionado. Escribe 2 para exigir al menos 2% anual en todas esas ventanas. Empieza en 0% anual; puedes editarlo o dejarlo vacío para desactivar este filtro. Una cartera por debajo del mínimo aparece únicamente como aproximación con el incumplimiento indicado.</p>
                <p id="optimizer-dates-help" class="workspace-context optimizer-field-note"><strong>1. Fechas del histórico.</strong> Por defecto se rellenan el primer y último dato común de los fondos seleccionados del Excel. Al cambiar el universo se actualizan las fechas automáticas y se respetan las que hayas editado. Desde indica el primer día y Hasta el último día de precios que quieres utilizar, ambos incluidos. Si dejas una fecha vacía, se utiliza el inicio o el final disponible correspondiente. El motor toma las fechas comunes de los fondos seleccionados dentro de ese intervalo y calcula allí caídas, recuperación, Sharpe, Ulcer y rolling. El intervalo necesita al menos cinco años para evaluar las ventanas móviles de 3 y 5 años.</p>
                <button type="button" data-opt-run>Ejecutar optimizador</button><button type="button" data-opt-cancel disabled>Cancelar</button>
            </form><div class="optimizer-main">
                <details open><summary>Universo y datos antes de calcular</summary>
                    <p class="workspace-context">Selecciona los fondos que quieres considerar en la búsqueda. Completa los campos necesarios para los filtros activos. Monetario se mantiene como categoría propia de RF. En el límite HY se trata como no-HY, igual que IG; no se le asigna un rating IG ni duración cero por defecto. Exposición no EUR significa exposición real sin cubrir, independientemente de la divisa de la clase. La TIR bruta se lee de una columna explícita del maestro o se introduce en la tabla. La YTM compartida se muestra como referencia cuando no consta que sea bruta. TIR neta = TIR bruta − TER, antes de fiscalidad del cliente. En cada fondo se muestra el número de precios y su frecuencia.</p>
                    <button type="button" data-opt-refresh>Volver a leer datos compartidos</button>
                    <div class="proposal-chart-scroll"><table class="wide-report-table"><thead><tr><th>Usar</th><th>Fondo</th><th>Tipo</th><th>Calidad RF</th><th>No EUR (%)</th><th>TIR bruta (%)</th><th>TER (%)</th><th>Duración (años)</th></tr></thead><tbody data-optimizer-universe></tbody></table></div>
                </details>
                <progress max="1" value="0" aria-label="Progreso de la búsqueda"></progress>
                <p class="workspace-status" data-optimizer-status role="status">Carga el Maestro para comenzar.</p>
                <div data-optimizer-results></div>
                <details class="optimizer-method"><summary>Datos, límites e interpretación</summary>
                    <p>El máximo RV de cada perfil se toma de las bandas compartidas de GDC/GICI (15%, 30%, 50%, 75% y 100%). Los demás límites son valores iniciales editables. Los límites de peso mínimo y máximo solo se aplican cuando están marcados. Sin ellos, cada fondo puede pesar entre 0% y 100%, con suma total 100%. Los fondos no elegidos pueden tener peso cero. RV y divisa se miden sobre toda la cartera; duración, TIR neta y HY se miden dentro de RF.</p>
                    <p>Se exigen cinco años comunes para comparar rolling de 3 y 5 años. Se detecta y utiliza la frecuencia diaria, semanal o mensual del maestro. Con cierres mensuales se miden caídas y recuperación observadas al cierre; las oscilaciones dentro del mes quedan fuera de esa muestra. Se usan VL en EUR sin volver a descontar TER. Se simula rebalanceo sin impuestos ni costes de transacción; el TER se resta únicamente a la TIR bruta actual de RF.</p>
                    <p>El máximo tiempo bajo máximos se mide desde el pico hasta recuperar ese nivel, en días naturales. Las caídas abiertas muestran el tiempo transcurrido, que es solo una cota mínima. Con el filtro de recuperación activo, por defecto se excluyen de las soluciones válidas; puedes admitirlas con el control correspondiente o desactivar ese filtro.</p>
                    <p>La media rolling es la media aritmética de las rentabilidades anualizadas de todas las ventanas comunes de ese plazo, no la rentabilidad acumulada de cinco años ni una previsión. Las ventanas se solapan y no son observaciones independientes. «Maximizar la media rolling a 5 años» ordena por esa media, manteniendo los filtros activos, incluido el suelo del peor rolling. Permite buscar rentabilidad media dentro de los límites del cliente. El peor rolling se centra en el período histórico menos favorable y puede preferir una cartera de menor retorno medio. Ninguno de los objetivos es superior para todos los mandatos.</p>
                    <p>El objetivo «Maximizar el peor rolling a 5 años» utiliza solo ese retorno y no resta Ulcer. En el objetivo original, la puntuación combina 3 y 5 años. En el objetivo de media tampoco se resta Ulcer. El mínimo rolling a 5 años, cuando está activado, se aplica como restricción de admisión antes de elegir las mejores carteras. La puntuación es mínimo(peor rolling 3 años, peor rolling 5 años) − penalización × Ulcer. Ulcer es la raíz de la media de las caídas porcentuales al cuadrado. Un empate técnico se considera una diferencia de puntuación de hasta 0,001 puntos. La penalización inicial 0,05 resta 0,05 puntos de retorno por cada punto Ulcer. Una búsqueda aleatoria finita encuentra candidatas y no garantiza un óptimo global ni demuestra que no exista una cartera factible.</p>
                    <p>Las métricas actuales de RF son un filtro fundamental, no datos históricos de cada fecha. La selección retrospectiva sobre toda la muestra tiene sesgo de selección y supervivencia; no garantiza protección ni retornos futuros. El impacto +100 pb es una aproximación por duración manteniendo el resto constante.</p>
                    <p>El Maestro puede incorporar una hoja Optimizador con columnas ISIN, Nombre, Tipo, No EUR pct, Calidad crediticia, TIR bruta, TER y Duración modificada. Los porcentajes pueden ser números en puntos porcentuales o celdas Excel con formato %. También se leen ticker, asset_class, YTM y MD de weights: YTM se conserva como referencia hasta que se indique su TIR bruta. Los datos se unen por ISIN. Conserva los cambios de fichas en el archivo fuente para cargas posteriores.</p>
                </details>
            </div></div>`;
        const form = panel.querySelector('form');
        const profile = () => {
            Object.entries(DownsideOptimizer.profiles[form.elements.profile.value]).forEach(([name, value]) => { form.elements[name].value = value; });
        };
        profile();
        for (const [name, value] of Object.entries({ minWeight: 5, maxWeight: 25, iterations: 20000, seed: 12345, ulcerPenalty: .05, riskFree: 0, minRolling5: 0 })) form.elements[name].value = value;
        syncConstraints();
        form.elements.profile.addEventListener('change', () => { profile(); invalidate(); });
        panel.addEventListener('input', event => { event.stopPropagation(); syncConstraints(); invalidate(); });
        panel.addEventListener('change', event => {
            const field = event.target.closest('[data-opt-asset]');
            if(event.target.matches('[data-opt-constraint],[name=objective]')){syncConstraints();invalidate();}
            if (!field) return;
            const asset = assets[Number(field.dataset.optAsset)], name = field.dataset.optField;
            const value = name === 'included' ? field.checked : ['type','credit'].includes(name) ? field.value : number(field.value);
            overrides.set(asset.isin, { ...overrides.get(asset.isin), [name]: value });
            if (name === 'type') renderAssets();
            if(name==='included')updateDates();
        });
        panel.querySelector('[data-opt-run]').addEventListener('click', () => { if (form.reportValidity()) calculate(); });
        panel.querySelector('[data-opt-cancel]').addEventListener('click', () => invalidate('Cálculo cancelado.'));
        panel.querySelector('[data-opt-refresh]').addEventListener('click', () => { signature = ''; refresh(); });
        panel.addEventListener('click', event => {
            const constraints=event.target.closest('[data-opt-constraints]');
            if(constraints){for(const toggle of form.querySelectorAll('[data-opt-constraint]'))toggle.checked=constraints.dataset.optConstraints==='all';syncConstraints();invalidate();}
            if(event.target.closest('[data-opt-dates]')){updateDates(true);invalidate();}
            const choice = event.target.closest('[data-opt-choice]');
            if (choice && result) { selected = Number(choice.dataset.optChoice); renderResult(); }
            if (event.target.closest('[data-opt-apply]')) apply();
        });
    }
    return { init, refresh, invalidate, metadataFromWorkbook };
})();
