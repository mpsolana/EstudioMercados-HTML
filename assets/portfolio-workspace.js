const PortfolioWorkspace = { scope: 'individual', step: 'data', tool: 'main', revision: 1, snapshots: {}, engine: 'audit-1' };
function portfolioCalculationSettings() {
    const value = (id, fallback) => document.getElementById(id)?.value ?? fallback;
    return { rebalance: value('portfolioRebalance', 'period'), costBps: Number(value('portfolioCostBps', 0)), riskFreeAnnual: Number(value('portfolioRiskFree', 0)) / 100, currency: value('portfolioBaseCurrency', 'EUR'), pricesInBase: document.getElementById('portfolioPricesInBase')?.checked || false, frequencyOverride: value('portfolioDataFrequency','auto'), simulation: { method:value('mcMethod','normal'), seed:Number(value('mcSeed',12345)), initialShock:Number(value('mcStress',0)) } };
}
function portfolioHistoryStale() {
    if (!loadedPortfolio?.calculationSettings) return false;
    const current = portfolioCalculationSettings();
    return ['rebalance','costBps','currency','pricesInBase','frequencyOverride'].some(key => current[key] !== loadedPortfolio.calculationSettings[key]);
}
async function portfolioConvertCurrencies(seriesMap, entries, start, end) {
    const settings = portfolioCalculationSettings();
    if (settings.pricesInBase) return;
    for (const entry of entries) {
        const meta = MarketData.metadata.get(entry.ticker);
        if (!meta?.currency) throw new Error(`${entry.ticker}: divisa no disponible. Confirma que los precios ya estan en la moneda base.`);
        if (meta.currency === settings.currency) continue;
        let source = meta.currency, scale = 1;
        if (source === 'GBp' || source === 'GBX') { source = 'GBP'; scale = .01; }
        const pair = `${source}${settings.currency}=X`;
        const fx = source === settings.currency ? null : await fetchYahooData(pair, start, end);
        seriesMap[entry.ticker] = seriesMap[entry.ticker].map(point => {
            const rate = fx ? getAlignedValueOnOrBefore(fx, point.date) : 1;
            if (!(rate > 0)) throw new Error(`Falta cambio ${pair} para ${point.date.toISOString().slice(0, 10)}.`);
            return { date: point.date, price: point.price * scale * rate };
        });
        entry.originalCurrency = meta.currency; entry.currency = settings.currency;
    }
}
function invalidatePortfolioReports() {
    PortfolioWorkspace.revision++;
    portfolioReportHtml = ''; managerReportHtml = '';
    fundProposalState.reportHtml = ''; fundProposalState.reportBodyHtml = '';
    PortfolioWorkspace.snapshots = {};
    ['portfolioReportPreview', 'managerReportPreview', 'fundProposalReportPreview'].forEach(id => {
        const el = document.getElementById(id); if (el) el.textContent = 'Datos modificados. Genera un nuevo informe.';
    });
}
function portfolioWorkflowRefresh() {
    const w = PortfolioWorkspace;
    const steps = w.scope === 'initial' ? ['data','proposal','metrics','report'] : w.scope === 'screener' ? ['data','diagnosis'] : ['data','diagnosis','report'];
    if (!steps.includes(w.step)) w.step = steps[1];
    if (w.scope === 'screener') w.tool = 'screener';
    document.querySelectorAll('[data-workspace-panel]').forEach(el => el.hidden = true);
    const show = id => { const el = document.getElementById(id); if (el) { el.hidden = false; el.classList.remove('hidden'); } };
    if (w.step === 'data') show('workspaceData');
    if (w.step === 'diagnosis') show(w.tool === 'aggregate' ? 'workspaceAggregate' : `portfolioSubtabContent-${w.tool}`);
    if (w.step === 'proposal' && w.scope === 'initial') show('workspaceProposal');
    if (w.step === 'metrics' && w.scope === 'initial') show('workspaceUniverseMetrics');
    if (w.step === 'report') show(w.scope === 'aggregate' ? 'workspaceManagerReports' : w.scope === 'initial' ? 'workspaceInitialReports' : 'workspaceIndividualReports');
    document.getElementById('workspaceTools').hidden = w.step !== 'diagnosis' || w.scope === 'screener';
    document.querySelectorAll('[data-workspace-tool]').forEach(b => {
        b.hidden = (['aggregate','massive'].includes(b.dataset.workspaceTool) ? 'aggregate' : 'individual') !== w.scope;
        b.setAttribute('aria-pressed',String(b.dataset.workspaceTool === w.tool));
    });
    document.getElementById('workspaceReportOptions').hidden = w.step !== 'report';
    document.querySelectorAll('[data-workspace-step]').forEach(b => {
        b.setAttribute('aria-current', b.dataset.workspaceStep === w.step ? 'step' : 'false');
        b.hidden = !steps.includes(b.dataset.workspaceStep);
        if (b.dataset.workspaceStep === 'diagnosis') b.textContent = w.scope === 'screener' ? '02 Screener' : '02 Diagnostico';
        if (b.dataset.workspaceStep === 'report') b.textContent = w.scope === 'initial' ? '04 Informe' : '03 Informe';
    });
    document.querySelectorAll('[data-workspace-scope]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.workspaceScope === w.scope)));
    document.querySelectorAll('[data-workspace-only]').forEach(el => el.hidden = !el.dataset.workspaceOnly.split(' ').includes(w.scope));
    const rows = fundProposalState.rows || [];
    const coverage = FinanceCore.weighted(rows, 'ter', 'current').coverage;
    document.getElementById('workspaceContext').textContent = `${w.scope === 'screener' ? 'Screener · universo de fondos' : w.scope === 'aggregate' ? 'Posiciones agregadas · sin backtest consolidado' : w.scope === 'initial' ? 'Analisis inicial · cartera de origen del cliente' : 'Cartera individual · comportamiento historico'} · ${portfolioCalculationSettings().currency} · Revision ${w.revision}`;
    document.getElementById('workspaceQuality').textContent = `Universo: ${fundUniverseState?.records?.length || 0} fondos · Aprobados por ISIN: ${approvedFundsState.records.length} · Cartera scoring: ${fundPortfolioRows.length} posiciones · Agregado: ${aggregatePositionsState.rows.length} posiciones.\n${rows.length ? `Cobertura TER de la propuesta: ${(coverage * 100).toFixed(1)} %. ` : ''}Score orientativo: compara fondos dentro de la misma categoria. Historicos: ${loadedPortfolio?.sourceLabel || 'pendientes'}.`;
    if (portfolioHistoryStale()) document.getElementById('workspaceQuality').textContent += '\nHipotesis modificadas: vuelve a cargar o importar la cartera antes de utilizar el backtest.';
    const unadjusted = (loadedPortfolio?.entries || []).filter(e => MarketData.metadata.get(e.ticker)?.priceType === 'close');
    if (unadjusted.length) document.getElementById('workspaceQuality').textContent += `\n${unadjusted.length} activos con cierre sin ajuste: no equivalen necesariamente a retorno total.`;
    if (w.scope === 'screener') document.getElementById('workspaceQuality').textContent = `Universo: ${fundUniverseState?.records?.length || 0} fondos · Aprobados por ISIN: ${approvedFundsState.records.length}.`;
    setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
    if(w.scope==='initial'&&w.step==='proposal')ProposalCharts.schedule('initial');
    if(w.scope==='aggregate'&&w.step==='diagnosis'&&w.tool==='aggregate')ProposalCharts.schedule('aggregate');
}
function portfolioSnapshot(kind) {
    const reportOptions = { charts: document.getElementById('reportIncludeCharts').checked, details: document.getElementById('reportIncludeDetails').checked, final: document.getElementById('reportFinal').checked };
    const rows = kind === 'aggregate' ? aggregateScoringResults.map(r => ({ weight:r.position.weight, current:aggregateStaticRecord(r), proposed:aggregateEffectiveRecord(r) })) : kind === 'individual' ? fundScoringResults.map(r => ({weight:r.weight,current:r.included ? fundResolvedRecord(r) : null,proposed:r.included ? fundResolvedRecord(r) : null})) : ProposalPortfolio.safeRows();
    return JSON.parse(JSON.stringify({
        id: `${kind}-${Date.now()}`, kind, revision: PortfolioWorkspace.revision, engine: PortfolioWorkspace.engine,
        createdAt: new Date().toISOString(), settings: portfolioCalculationSettings(), reportOptions, reportConfiguration: ReportControls.state(),
        capital: kind === 'proposal' ? fundProposalCapital() : null,
        source: { universe: fundUniverseState?.fileName || '', approved: approvedFundsState.fileName || '', portfolio: kind === 'individual' ? loadedPortfolio?.sourceLabel || '' : '', aggregate: kind === 'aggregate' ? aggregatePositionsState.fileName || '' : '' },
        portfolio: kind === 'individual' ? loadedPortfolio : null,
        aggregate: kind === 'aggregate' ? {positions:aggregatePositionsState.rows,results:aggregateScoringResults} : null,
        proposal: kind === 'proposal' ? fundProposalState.rows.map(r => ({id:r.id,isin:r.isin,weight:r.weight,current:r.current,proposed:r.proposed})) : [],
        independentProposal: kind==='proposal'&&ProposalPortfolio.independent?ProposalPortfolio.targetRows():null,
        coverage: {currentTer:FinanceCore.weighted(rows,'ter','current').coverage,proposedTer:FinanceCore.weighted(rows,'ter','proposed').coverage},
        dataSources: kind === 'individual' ? [...MarketData.metadata.entries()] : []
    }));
}
function initializePortfolioWorkspace() {
    const simulationControls = document.createElement('div'); simulationControls.className = 'workspace-settings';
    simulationControls.innerHTML = '<label>Modelo de escenarios<select id="mcMethod"><option value="normal">Lognormal independiente</option><option value="bootstrap">Bootstrap por bloques de 5 periodos</option></select></label><label>Semilla reproducible<input id="mcSeed" type="number" value="12345" min="1"></label><p class="text-xs">Escenarios estadisticos, no predicciones. No incluyen impuestos, costes ni cambios estructurales. Los bloques conservan solo dependencia local.</p>';
    document.getElementById('mcYears')?.parentElement.append(simulationControls);
    simulationControls.insertAdjacentHTML('beforeend','<label>Estres inicial hipotetico<select id="mcStress"><option value="0">Sin shock</option><option value="-0.1">Caida inicial 10%</option><option value="-0.2">Caida inicial 20%</option><option value="-0.35">Caida inicial 35%</option></select></label>');
    const root = document.querySelector('#section-cartera > .container > .bg-white');
    if (!root) return;
    root.classList.add('portfolio-workspace');
    const header = root.firstElementChild; header.hidden = true;
    const shell = document.createElement('div');
    shell.innerHTML = `<div class="workspace-heading"><div><h2>Analisis de carteras</h2><small id="workspaceContext"></small></div><div class="workspace-scope"><button data-workspace-scope="individual">Cartera individual</button><button data-workspace-scope="aggregate">Posiciones agregadas</button></div></div><nav class="workspace-steps" aria-label="Proceso de analisis"><button data-workspace-step="data">01 Datos</button><button data-workspace-step="diagnosis">02 Diagnostico</button><button data-workspace-step="proposal">03 Propuesta</button><button data-workspace-step="report">04 Informe</button></nav><div id="workspaceTools" class="workspace-tools"></div><div id="workspaceQuality" class="workspace-status" role="status"></div><section id="workspaceData" class="workspace-panel" data-workspace-panel></section><section id="workspaceIndividualReports" class="workspace-panel" data-workspace-panel></section><section id="workspaceManagerReports" class="workspace-panel" data-workspace-panel></section>`;
    root.prepend(shell);
    shell.querySelector('.workspace-scope').insertAdjacentHTML('afterbegin','<button data-workspace-scope="initial">Analisis Inicial</button>');
    shell.querySelector('.workspace-scope').insertAdjacentHTML('beforeend','<button data-workspace-scope="screener">Screener</button>');
    shell.insertAdjacentHTML('beforeend','<section id="workspaceInitialReports" class="workspace-panel" data-workspace-panel></section>');
    shell.querySelector('[data-workspace-step="proposal"]').textContent = '02 Analisis inicial';
    shell.querySelector('[data-workspace-step="report"]').textContent = '03 Informe';
    shell.querySelector('[data-workspace-step="report"]').insertAdjacentHTML('beforebegin','<button data-workspace-step="metrics">03 Comparativa universo</button>');
    const reportOptions = document.createElement('div'); reportOptions.className = 'workspace-report-options';
    reportOptions.innerHTML = '<label><input type="checkbox" id="reportIncludeCharts" checked> Graficos</label><label><input type="checkbox" id="reportIncludeDetails" checked> Detalle de sustituciones</label><label><input type="checkbox" id="reportFinal"> Version final</label>';
    reportOptions.id = 'workspaceReportOptions'; document.getElementById('workspaceQuality').after(reportOptions);
    const data = document.getElementById('workspaceData');
    const importGrid = document.getElementById('portfolioExcelInput').closest('.grid').parentElement.parentElement;
    const clientControls = root.querySelector('button[onclick="generatePortfolioReport()"]')?.closest('.rounded-lg');
    const managerControls = root.querySelector('button[onclick="generateManagerReport()"]')?.closest('.rounded-lg');
    if (clientControls) document.getElementById('workspaceIndividualReports').append(clientControls);
    if (managerControls) document.getElementById('workspaceManagerReports').append(managerControls);
    data.append(importGrid); importGrid.dataset.workspaceOnly = 'individual';
    const builder = document.getElementById('portfolioBuilder'); data.append(builder); builder.dataset.workspaceOnly = 'individual';
    const manualActions = document.getElementById('loadPortfolioBtn').parentElement;
    manualActions.classList.add('workspace-manual-actions');
    for (const [selector, icon, label] of [['[onclick="addPortfolioRow()"]','plus','Agregar activo'],['[onclick="normalizeWeights()"]','scale-balanced','Normalizar pesos'],['#analyzePortfolioBtn','rotate','Recalcular analisis']]) {
        const button = manualActions.querySelector(selector); button.innerHTML = `<i class="fa-solid fa-${icon}" aria-hidden="true"></i>`;
        button.title = label; button.setAttribute('aria-label',label); button.classList.add('workspace-icon');
    }
    document.getElementById('loadPortfolioBtn').textContent = 'Cargar tickers Yahoo y analizar';
    manualActions.insertAdjacentHTML('afterend','<p class="workspace-context">Carga Yahoo: utiliza este boton para los tickers introducidos arriba. Al cargar un Excel, el analisis se ejecuta automaticamente; no es necesario volver a pulsarlo.</p>');
    const upload = document.getElementById('fundUniverseFileInput').closest('.mt-6'); data.append(upload);
    document.getElementById('fundPortfolioFileInput').closest('.min-w-0').dataset.workspaceOnly = 'individual initial';
    document.getElementById('aggregatePositionsFileInput').closest('.min-w-0').dataset.workspaceOnly = 'aggregate';
    const settings = document.createElement('div'); settings.className = 'workspace-settings'; settings.dataset.workspaceOnly = 'individual';
    settings.innerHTML = `<label>Rebalanceo<select id="portfolioRebalance"><option value="period">Cada observacion (pesos constantes)</option><option value="monthly">Mensual</option><option value="hold">Comprar y mantener</option></select></label><label>Coste por volumen negociado (pb)<input id="portfolioCostBps" type="number" min="0" max="1000" value="0"></label><label>Tipo libre de riesgo anual (%)<input id="portfolioRiskFree" type="number" min="-99" step="0.1" value="0"></label><label>Moneda base<select id="portfolioBaseCurrency"><option>EUR</option><option>USD</option><option>GBP</option></select></label><label><input id="portfolioPricesInBase" type="checkbox"> Historicos propios ya expresados en moneda base</label>`;
    data.prepend(settings);
    const help = document.createElement('footer'); help.className = 'workspace-calculation-help'; help.dataset.workspaceOnly = 'individual';
    help.innerHTML = '<h3>Hipotesis del analisis</h3><dl><dt>Rebalanceo</dt><dd>Define cuando se recuperan los pesos objetivo: en cada observacion, al cambiar de mes o nunca (comprar y mantener, dejando evolucionar los pesos).</dd><dt>Coste por volumen negociado</dt><dd>Coste aplicado a las compras y ventas de cada rebalanceo. 10 puntos basicos equivalen a 0,10% del importe negociado, no de toda la cartera. No incluye impuestos ni la inversion inicial.</dd><dt>Tipo libre de riesgo</dt><dd>Rentabilidad anual de referencia utilizada para calcular el Sharpe. Se convierte a la frecuencia de los datos; no modifica la evolucion del patrimonio.</dd><dt>Moneda base</dt><dd>Divisa en la que se construye la cartera. Los historicos Yahoo en otra divisa se convierten cuando hay datos de cambio disponibles.</dd><dt>Historicos propios</dt><dd>Marca esta casilla solo si los precios importados ya estan expresados en la moneda base. Evita convertirlos otra vez. No debe marcarse para omitir una conversion que falta.</dd></dl><p>Si cambias rebalanceo, costes, moneda o tratamiento de historicos, vuelve a cargar la cartera o importar el Excel para recalcularla.</p>';
    root.append(help);
    ['portfolioRebalance','portfolioCostBps','portfolioRiskFree','portfolioBaseCurrency','portfolioPricesInBase'].forEach((id,i) => {
        const description = help.querySelectorAll('dd')[i]; description.id = `${id}-help`; document.getElementById(id).setAttribute('aria-describedby',description.id);
    });
    const unit = document.createElement('label'); unit.className = 'workspace-context'; unit.innerHTML = 'Unidad de pesos de scoring y propuesta <select id="fundWeightUnit"><option value="percent">Porcentaje (0-100)</option><option value="fraction">Fraccion (0-1)</option><option value="amount">Importes (se normalizan)</option></select>'; data.prepend(unit);
    unit.dataset.workspaceOnly = 'individual initial aggregate';
    const oldNav = document.getElementById('portfolioSubtab-main').parentElement; oldNav.hidden = true;
    const tools = { main:'Evolucion y riesgo', scoring:'Scoring', assets:'Distribucion', funds:'Comparativa fondos', aggregate:'Posiciones', massive:'Comparador masivo' };
    document.getElementById('workspaceTools').innerHTML = Object.entries(tools).map(([key,label]) => `<button data-workspace-tool="${key}">${label}</button>`).join('');
    for (const id of ['portfolioReportPreview','managerReportPreview']) {
        const target = document.getElementById(id); document.getElementById(id === 'portfolioReportPreview' ? 'workspaceIndividualReports' : 'workspaceManagerReports').append(target.parentElement);
    }
    const aggregate = document.getElementById('aggregatePositionsStatus').closest('.grid').parentElement;
    aggregate.id = 'workspaceAggregate'; aggregate.dataset.workspacePanel = ''; aggregate.classList.add('workspace-panel'); root.append(aggregate);
    root.querySelectorAll('.portfolio-subtab-content').forEach(el => { el.dataset.workspacePanel = ''; el.classList.add('workspace-panel'); });
    const compositionMode = document.createElement('label'); compositionMode.className = 'workspace-context';
    compositionMode.innerHTML = 'Distribucion por <select id="portfolioCompositionMode" onchange="if(loadedPortfolio) renderPortfolioComposition(loadedPortfolio.entries)"><option value="fund">Fondos</option><option value="category">Categorias</option></select>';
    document.getElementById('portfolioCompositionChart').before(compositionMode);
    const proposalPreview = document.getElementById('fundProposalReportPreview'); document.getElementById('workspaceInitialReports').append(proposalPreview);
    const reportActions = document.createElement('div'); reportActions.className='workspace-tools'; reportActions.innerHTML='<button onclick="generateFundProposalReport()">Generar informe inicial</button><button onclick="downloadFundProposalReportPdf()">Descargar PDF</button><button onclick="downloadPortfolioSnapshot()">Descargar trazabilidad JSON</button>';
    document.getElementById('workspaceInitialReports').prepend(reportActions);
    root.querySelectorAll('#portfolioSubtabContent-funds button').forEach(button => { if (/generateFundProposalReport|downloadFundProposalReportPdf/.test(button.getAttribute('onclick') || '')) button.hidden = true; });
    const proposal = document.getElementById('fundProposalStatus').parentElement;
    proposal.id = 'workspaceProposal'; proposal.dataset.workspacePanel = ''; proposal.classList.add('workspace-panel'); root.append(proposal);
    const metrics = document.getElementById('fundUniverseCompareStatus').parentElement;
    metrics.id = 'workspaceUniverseMetrics'; metrics.dataset.workspacePanel = ''; metrics.classList.add('workspace-panel'); root.append(metrics);
    document.getElementById('fundProposalPortfolioInput').insertAdjacentHTML('beforebegin','<button type="button" class="initial-origin-button" onclick="InitialAnalysis.useLoadedPortfolio()">Usar cartera scoring importada</button>');
    root.append(help);
    root.addEventListener('click', event => {
        const b = event.target.closest('button'); if (!b) return;
        if (b.dataset.workspaceScope) {
            PortfolioWorkspace.scope = b.dataset.workspaceScope;
            PortfolioWorkspace.step = b.dataset.workspaceScope === 'screener' ? 'diagnosis' : 'data';
            PortfolioWorkspace.tool = b.dataset.workspaceScope === 'aggregate' ? 'aggregate' : b.dataset.workspaceScope === 'screener' ? 'screener' : 'main';
            if (b.dataset.workspaceScope === 'screener') showPortfolioSubtab('screener');
        }
        if (b.dataset.workspaceStep) PortfolioWorkspace.step = b.dataset.workspaceStep;
        if (b.dataset.workspaceStep === 'diagnosis' && PortfolioWorkspace.scope === 'screener') showPortfolioSubtab('screener');
        if (b.dataset.workspaceTool) { PortfolioWorkspace.tool = b.dataset.workspaceTool; if (b.dataset.workspaceTool !== 'aggregate') showPortfolioSubtab(b.dataset.workspaceTool); }
        if (b.dataset.workspaceScope || b.dataset.workspaceStep || b.dataset.workspaceTool) portfolioWorkflowRefresh();
        if (b.dataset.workspaceStep === 'metrics') renderFundUniverseMetricComparison();
    });
    root.addEventListener('input', event => { if (!event.target.closest('[data-compact-fund-panel],#portfolioSubtabContent-screener,#assetAllocationWeights')) { invalidatePortfolioReports(); portfolioWorkflowRefresh(); } });
    for (const name of ['importFundUniverseFile','importApprovedFundsFile','importFundScoringPortfolioFile','importAggregatePositionsFile','importAssetClassScreenerFile','importPortfolioExcel']) {
        const original = window[name]; window[name] = async (...args) => { invalidatePortfolioReports(); try { return await PortfolioLoading.run(async()=>{const result=await original(...args);if(name==='importPortfolioExcel'&&portfolioAnalysisPromise)await portfolioAnalysisPromise;await PortfolioLoading.phase(90,'Actualizando estado de las vistas…');return result;}); } catch(error) { alert(error.message); } finally { portfolioWorkflowRefresh(); } };
    }
    for (const name of ['setFundProposalRecommendation','setFundPortfolioRows','clearFundScoringState','setAggregateManualCategory','setAggregateManualBucket','setAggregateManualScore','applyAggregateRecord','resetAggregateRecord']) {
        const original = window[name]; window[name] = (...args) => { invalidatePortfolioReports(); const result = original(...args); portfolioWorkflowRefresh(); return result; };
    }
    for (const [name, kind, previewId] of [['generatePortfolioReport','individual','portfolioReportPreview'],['generateManagerReport','aggregate','managerReportPreview'],['generateFundProposalReport','proposal','fundProposalReportPreview']]) {
        const original = window[name]; window[name] = async (...args) => {
            if (kind === 'individual' && portfolioHistoryStale()) { alert('Vuelve a cargar o importar la cartera con las nuevas hipotesis antes de generar el informe.'); PortfolioWorkspace.step = 'data'; portfolioWorkflowRefresh(); return; }
            if (kind === 'aggregate') managerReportHtml = ''; else if (kind === 'individual') portfolioReportHtml = ''; else fundProposalState.reportHtml = '';
            const revision = PortfolioWorkspace.revision;
            try { await original(...args); } catch(error) { invalidatePortfolioReports(); alert(`No se ha generado el informe: ${error.message}`); return; }
            if (revision !== PortfolioWorkspace.revision) { invalidatePortfolioReports(); return; }
            const snapshot = portfolioSnapshot(kind);
            let html = kind === 'aggregate' ? managerReportHtml : kind === 'individual' ? portfolioReportHtml : fundProposalState.reportHtml;
            if (!html) return;
            html = ReportDesign.prepare(html, snapshot);
            if (kind === 'aggregate') managerReportHtml = html; else if (kind === 'individual') portfolioReportHtml = html; else fundProposalState.reportHtml = html;
            PortfolioWorkspace.snapshots[kind] = JSON.parse(JSON.stringify(snapshot));
            ReportDesign.preview(document.getElementById(previewId), html);
            PortfolioWorkspace.scope = kind === 'proposal' ? 'initial' : kind === 'aggregate' ? 'aggregate' : 'individual';
            PortfolioWorkspace.step = 'report'; portfolioWorkflowRefresh();
        };
    }
    portfolioWorkflowRefresh();
}
function downloadPortfolioSnapshot() {
    downloadBlob(JSON.stringify(PortfolioWorkspace.snapshots, null, 2), 'Trazabilidad_cartera.json', 'application/json');
}
initializePortfolioWorkspace();
