const PortfolioWorkspace = { scope: 'data', step: 'diagnosis', tool: 'main', revision: 1, snapshots: {}, engine: 'audit-1' };
function portfolioWorkspaceReady(){return Boolean(fundUniverseState?.records?.length || fundPortfolioRows?.length || GdcModel.state.models.length);}
function portfolioWorkspaceWarning(){
    const scope=PortfolioWorkspace.scope,tool=PortfolioWorkspace.tool;
    if(scope==='data')return portfolioWorkspaceReady()?'':'Carga el ranking del universo o el Excel de cartera modelo para empezar.';
    const missing=[];
    if(['initial','aggregate','screener','model'].includes(scope)&&!fundUniverseState?.records?.length)missing.push('ranking del universo');
    if(scope==='initial'&&!fundPortfolioRows?.length&&!fundProposalState?.rows?.length)missing.push('cartera modelo u origen manual');
    if(scope==='individual'&&tool==='main'&&!loadedPortfolio?.portfolioData?.length)missing.push('cartera con históricos o tickers Yahoo');
    if(scope==='individual'&&tool==='scoring'&&!fundPortfolioRows?.length)missing.push('cartera modelo');
    if(scope==='individual'&&tool==='scoring'&&!fundUniverseState?.records?.length)missing.push('ranking del universo');
    if(scope==='individual'&&tool==='funds'&&!fundUniverseState?.records?.length)missing.push('ranking del universo');
    if(scope==='individual'&&tool==='assets'&&!fundPortfolioRows?.length&&!loadedPortfolio?.entries?.length)missing.push('cartera modelo o cartera con históricos');
    if(scope==='aggregate'&&!aggregatePositionsState.rows.length)missing.push('posiciones agregadas');
    if(scope==='model'&&!GdcModel.state.models.length)missing.push('Excel GDC en Carga de datos');
    if(scope==='comparison'&&!PortfolioCompare.state.sources.some(Boolean))return 'Añade una cartera Excel, un activo Yahoo o una cartera Yahoo para iniciar la comparativa.';
    return missing.length?`Para completar esta vista, carga en Carga de datos: ${missing.join(' y ')}.`:'';
}
function portfolioCalculationSettings() {
    const value = (id, fallback) => document.getElementById(id)?.value ?? fallback;
    return { rebalance: value('portfolioRebalance', 'period'), costBps: Number(value('portfolioCostBps', 0)), riskFreeAnnual: Number(value('portfolioRiskFree', 0)) / 100, currency: value('portfolioBaseCurrency', 'EUR'), pricesInBase: document.getElementById('portfolioPricesInBase')?.checked || false, frequencyOverride: value('portfolioDataFrequency','auto'), simulation: { method:value('mcMethod','normal'), seed:Number(value('mcSeed',12345)), initialShock:Number(value('mcStress',0)) } };
}
function portfolioHistoryStale() {
    if (!loadedPortfolio?.calculationSettings) return false;
    const current = portfolioCalculationSettings();
    return ['rebalance','costBps','currency','pricesInBase','frequencyOverride'].some(key => current[key] !== loadedPortfolio.calculationSettings[key]);
}
function openYahooPortfolioAnalysis(){
    if(!loadedPortfolio?.analysisReady){document.getElementById('portfolioNotice').textContent='Carga y analiza la cartera Yahoo antes de abrir el análisis individual.';return;}
    switchSection('individual');document.querySelector('[data-individual-mode="single"]')?.click();
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
    const calculationHelp=document.querySelector('.workspace-calculation-help');if(calculationHelp)calculationHelp.hidden=w.scope!=='individual'||w.step!=='diagnosis'||!['main','yahoo'].includes(w.tool);
    document.querySelectorAll('[data-workspace-scope]').forEach(b=>{if(b.dataset.workspaceScope!=='data')b.disabled=!portfolioWorkspaceReady();});
    document.querySelector('.workspace-steps').hidden=['data','model','comparison'].includes(w.scope);
    const warning=document.getElementById('workspaceMissingData');warning.textContent=portfolioWorkspaceWarning();warning.hidden=!warning.textContent;
    if(w.scope==='data'){
        document.querySelectorAll('[data-workspace-panel]').forEach(el=>el.hidden=true);
        const data=document.getElementById('workspaceData');data.hidden=false;data.classList.remove('hidden');
        document.getElementById('workspaceTools').hidden=true;
        document.getElementById('workspaceReportOptions').hidden=true;
        document.getElementById('workspaceQuality').hidden=true;
        document.getElementById('workspaceContext').textContent='Seis cargas independientes para cada proceso';
        document.querySelectorAll('[data-workspace-scope]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.workspaceScope==='data')));
        document.querySelectorAll('[data-workspace-only]').forEach(el=>el.hidden=!el.dataset.workspaceOnly.split(' ').includes('data'));
        return;
    }
    if(['model','comparison'].includes(w.scope)){
        document.querySelectorAll('[data-workspace-panel]').forEach(el=>el.hidden=true);
        const panel=document.getElementById(w.scope==='model'?'workspaceModel':'workspacePortfolioCompare');panel.hidden=false;panel.classList.remove('hidden');
        document.getElementById('workspaceTools').hidden=true;
        document.getElementById('workspaceReportOptions').hidden=true;
        document.querySelectorAll('[data-workspace-scope]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.workspaceScope===w.scope)));
        document.getElementById('workspaceContext').textContent=w.scope==='model'?'GDC · carteras modelo · revision mensual':'Comparativa de carteras · históricos comunes';
        document.getElementById('workspaceQuality').hidden=false;
        document.getElementById('workspaceQuality').textContent=w.scope==='model'?`Universo: ${fundUniverseState?.records?.length||0} fondos · Modelos: ${GdcModel.state.models.length} · Historicos: segun cobertura disponible.`:'Las series se comparan en fechas comunes y con los mismos supuestos de rebalanceo y costes.';
        setTimeout(()=>window.dispatchEvent(new Event('resize')),50);
        return;
    }
    const steps = w.scope === 'initial' ? ['proposal','metrics','report'] : w.scope === 'screener' ? ['diagnosis'] : ['diagnosis','report'];
    if (!steps.includes(w.step)) w.step = steps[0];
    if (w.scope === 'screener') w.tool = 'screener';
    document.querySelectorAll('[data-workspace-panel]').forEach(el => el.hidden = true);
    const show = id => { const el = document.getElementById(id); if (el) { el.hidden = false; el.classList.remove('hidden'); } };
    if(w.scope==='individual'&&w.step==='diagnosis'&&['main','yahoo'].includes(w.tool))show('workspaceIndividualSetup');
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
        if (b.dataset.workspaceStep === 'diagnosis') b.textContent = w.scope === 'screener' ? '01 Screener' : '01 Diagnostico';
        if (b.dataset.workspaceStep === 'proposal') b.textContent = '01 Analisis inicial';
        if (b.dataset.workspaceStep === 'metrics') b.textContent = '02 Comparativa universo';
        if (b.dataset.workspaceStep === 'report') b.textContent = w.scope === 'initial' ? '03 Informe' : '02 Informe';
    });
    document.querySelectorAll('[data-workspace-scope]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.workspaceScope === w.scope)));
    document.querySelectorAll('[data-workspace-only]').forEach(el => el.hidden = !el.dataset.workspaceOnly.split(' ').includes(w.scope));
    if(calculationHelp)calculationHelp.hidden=w.scope!=='individual'||w.step!=='diagnosis'||!['main','yahoo'].includes(w.tool);
    const rows = fundProposalState.rows || [];
    const coverage = FinanceCore.weighted(rows, 'ter', 'current').coverage;
    document.getElementById('workspaceContext').textContent = `${w.scope === 'screener' ? 'Screener · universo de fondos' : w.scope === 'aggregate' ? 'Posiciones agregadas · sin backtest consolidado' : w.scope === 'initial' ? 'Analisis inicial · cartera de origen del cliente' : 'Cartera individual · comportamiento historico'} · ${portfolioCalculationSettings().currency} · Revision ${w.revision}`;
    document.getElementById('workspaceQuality').textContent = `Universo: ${fundUniverseState?.records?.length || 0} fondos · Aprobados por ISIN: ${approvedFundsState.records.length} · Cartera modelo: ${fundPortfolioRows.length} posiciones · Agregado: ${aggregatePositionsState.rows.length} posiciones.\n${rows.length ? `Cobertura TER de la propuesta: ${(coverage * 100).toFixed(1)} %. ` : ''}Score orientativo: compara fondos dentro de la misma categoria. Historicos: ${loadedPortfolio?.sourceLabel || 'pendientes'}.`;
    if (portfolioHistoryStale()) document.getElementById('workspaceQuality').textContent += '\nHipotesis modificadas: vuelve a cargar o importar la cartera antes de utilizar el backtest.';
    const unadjusted = (loadedPortfolio?.entries || []).filter(e => MarketData.metadata.get(e.ticker)?.priceType === 'close');
    if (unadjusted.length) document.getElementById('workspaceQuality').textContent += `\n${unadjusted.length} activos con cierre sin ajuste: no equivalen necesariamente a retorno total.`;
    if (w.scope === 'screener') document.getElementById('workspaceQuality').textContent = `Universo: ${fundUniverseState?.records?.length || 0} fondos · Aprobados por ISIN: ${approvedFundsState.records.length}.`;
    document.getElementById('workspaceQuality').hidden=false;
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
    shell.innerHTML = `<div class="workspace-heading"><div><h2>Analisis de carteras</h2><small id="workspaceContext"></small></div><div class="workspace-scope"><button data-workspace-scope="individual">Cartera individual</button><button data-workspace-scope="aggregate">Posiciones agregadas</button></div></div><nav class="workspace-steps" aria-label="Proceso de analisis"><button data-workspace-step="diagnosis">01 Diagnostico</button><button data-workspace-step="proposal">01 Analisis inicial</button><button data-workspace-step="report">02 Informe</button></nav><div id="workspaceTools" class="workspace-tools"></div><div id="workspaceQuality" class="workspace-status" role="status"></div><section id="workspaceData" class="workspace-panel" data-workspace-panel></section><section id="workspaceIndividualReports" class="workspace-panel" data-workspace-panel></section><section id="workspaceManagerReports" class="workspace-panel" data-workspace-panel></section>`;
    root.prepend(shell);
    shell.querySelector('.workspace-scope').insertAdjacentHTML('afterbegin','<button data-workspace-scope="data">Carga de datos</button><button data-workspace-scope="initial">Analisis Inicial</button>');
    document.getElementById('workspaceQuality').insertAdjacentHTML('beforebegin','<p id="workspaceMissingData" class="workspace-status" role="status"></p>');
    shell.querySelector('.workspace-scope').insertAdjacentHTML('beforeend','<button data-workspace-scope="screener">Screener</button>');
    shell.querySelector('.workspace-scope').insertAdjacentHTML('beforeend','<button data-workspace-scope="model">GDC · Cartera modelo</button>');
    shell.querySelector('.workspace-scope').insertAdjacentHTML('beforeend','<button data-workspace-scope="comparison">Comparativa de carteras</button>');
    shell.insertAdjacentHTML('beforeend','<section id="workspaceInitialReports" class="workspace-panel" data-workspace-panel></section>');
    shell.querySelector('[data-workspace-step="report"]').insertAdjacentHTML('beforebegin','<button data-workspace-step="metrics">02 Comparativa universo</button>');
    const reportOptions = document.createElement('div'); reportOptions.className = 'workspace-report-options';
    reportOptions.innerHTML = '<label><input type="checkbox" id="reportIncludeCharts" checked> Graficos</label><label><input type="checkbox" id="reportIncludeDetails" checked> Detalle de sustituciones</label><label><input type="checkbox" id="reportFinal"> Version final</label>';
    reportOptions.id = 'workspaceReportOptions'; document.getElementById('workspaceQuality').after(reportOptions);
    const data = document.getElementById('workspaceData');
    const importGrid = document.getElementById('portfolioExcelInput').closest('.grid').parentElement.parentElement;
    const individualSetup=document.createElement('section');individualSetup.id='workspaceIndividualSetup';individualSetup.className='workspace-panel workspace-individual-setup';individualSetup.dataset.workspacePanel='';root.append(individualSetup);
    const clientControls = root.querySelector('button[onclick="generatePortfolioReport()"]')?.closest('.rounded-lg');
    const managerControls = root.querySelector('button[onclick="generateManagerReport()"]')?.closest('.rounded-lg');
    if (clientControls) document.getElementById('workspaceIndividualReports').append(clientControls);
    if (managerControls) document.getElementById('workspaceManagerReports').append(managerControls);
    individualSetup.append(importGrid);
    importGrid.classList.remove('xl:grid-cols-3');importGrid.firstElementChild.classList.remove('xl:col-span-2');
    const portfolioInfo=document.getElementById('portfolioInfo');individualSetup.append(portfolioInfo);
    importGrid.querySelector('h3').textContent='Excel con histórico de cartera';
    importGrid.querySelector('h3+p').textContent='Elige backtest si el archivo contiene pesos y precios; elige evolución real si contiene una serie de valor liquidativo.';
    importGrid.querySelector('#portfolioImportHelp').textContent='Backtest: hoja weights (ticker, weight) y hoja prices (date y una columna por ticker). Real: hoja portfolio (date, value).';
    const yahooPanel=document.createElement('section');yahooPanel.id='portfolioSubtabContent-yahoo';yahooPanel.className='portfolio-subtab-content workspace-panel';yahooPanel.dataset.workspacePanel='';root.append(yahooPanel);
    yahooPanel.innerHTML='<h3 class="workspace-subtitle">Crear cartera con Yahoo Finance</h3><div class="workspace-settings workspace-yahoo-dates"><label>Desde<input type="date" id="workspaceYahooStart"></label><label>Hasta<input type="date" id="workspaceYahooEnd"></label></div>';
    for(const [local,global] of [['workspaceYahooStart','startDate'],['workspaceYahooEnd','endDate']]){const field=yahooPanel.querySelector(`#${local}`),source=document.getElementById(global);field.value=source?.value||(global==='endDate'?new Date().toISOString().slice(0,10):'');if(source)source.value=field.value;field.addEventListener('change',()=>{if(source)source.value=field.value;});}
    const builder = document.getElementById('portfolioBuilder'); yahooPanel.append(builder);
    builder.insertAdjacentHTML('afterend','<button type="button" class="workspace-view-individual" onclick="openYahooPortfolioAnalysis()"><i class="fa-solid fa-chart-line" aria-hidden="true"></i> Ver análisis individual</button>');
    const manualActions = document.getElementById('loadPortfolioBtn').parentElement;
    manualActions.classList.add('workspace-manual-actions');
    for (const [selector, icon, label] of [['[onclick="addPortfolioRow()"]','plus','Agregar activo'],['[onclick="normalizeWeights()"]','scale-balanced','Normalizar pesos'],['#analyzePortfolioBtn','rotate','Recalcular analisis']]) {
        const button = manualActions.querySelector(selector); button.innerHTML = `<i class="fa-solid fa-${icon}" aria-hidden="true"></i>`;
        button.title = label; button.setAttribute('aria-label',label); button.classList.add('workspace-icon');
    }
    document.getElementById('loadPortfolioBtn').textContent = 'Cargar tickers Yahoo y analizar';
    const upload = document.getElementById('fundUniverseFileInput').closest('.mt-6'); data.append(upload);
    upload.querySelector('h3').textContent='Archivos de análisis';
    const settings = document.createElement('div'); settings.className = 'workspace-settings'; settings.dataset.workspaceOnly = 'individual';
    settings.innerHTML = `<label>Rebalanceo<select id="portfolioRebalance"><option value="period">Cada observacion (pesos constantes)</option><option value="monthly">Mensual</option><option value="hold">Comprar y mantener</option></select></label><label>Coste por volumen negociado (pb)<input id="portfolioCostBps" type="number" min="0" max="1000" value="0"></label><label>Tipo libre de riesgo anual (%)<input id="portfolioRiskFree" type="number" min="-99" step="0.1" value="0"></label><label>Moneda base<select id="portfolioBaseCurrency"><option>EUR</option><option>USD</option><option>GBP</option></select></label><label><input id="portfolioPricesInBase" type="checkbox"> Historicos propios ya expresados en moneda base</label>`;
    individualSetup.prepend(settings);
    const help = document.createElement('footer'); help.className = 'workspace-calculation-help'; help.dataset.workspaceOnly = 'individual';
    help.innerHTML = '<h3>Hipotesis del analisis</h3><dl><dt>Rebalanceo</dt><dd>Define cuando se recuperan los pesos objetivo: en cada observacion, al cambiar de mes o nunca (comprar y mantener, dejando evolucionar los pesos).</dd><dt>Coste por volumen negociado</dt><dd>Coste aplicado a las compras y ventas de cada rebalanceo. 10 puntos basicos equivalen a 0,10% del importe negociado, no de toda la cartera. No incluye impuestos ni la inversion inicial.</dd><dt>Tipo libre de riesgo</dt><dd>Rentabilidad anual de referencia utilizada para calcular el Sharpe. Se convierte a la frecuencia de los datos; no modifica la evolucion del patrimonio.</dd><dt>Moneda base</dt><dd>Divisa en la que se construye la cartera. Los historicos Yahoo en otra divisa se convierten cuando hay datos de cambio disponibles.</dd><dt>Historicos propios</dt><dd>Marca esta casilla solo si los precios importados ya estan expresados en la moneda base. Evita convertirlos otra vez. No debe marcarse para omitir una conversion que falta.</dd></dl><p>Si cambias rebalanceo, costes, moneda o tratamiento de historicos, vuelve a cargar la cartera o importar el Excel para recalcularla.</p>';
    root.append(help);
    ['portfolioRebalance','portfolioCostBps','portfolioRiskFree','portfolioBaseCurrency','portfolioPricesInBase'].forEach((id,i) => {
        const description = help.querySelectorAll('dd')[i]; description.id = `${id}-help`; document.getElementById(id).setAttribute('aria-describedby',description.id);
    });
    const unit = document.createElement('label'); unit.className = 'workspace-context'; unit.innerHTML = 'Unidad de pesos de scoring y propuesta <select id="fundWeightUnit"><option value="percent">Porcentaje (0-100)</option><option value="fraction">Fraccion (0-1)</option><option value="amount">Importes (se normalizan)</option></select>'; data.prepend(unit);
    unit.dataset.workspaceOnly = 'data';
    const oldNav = document.getElementById('portfolioSubtab-main').parentElement; oldNav.hidden = true;
    const tools = { main:'Evolucion y riesgo', scoring:'Scoring', assets:'Distribucion', funds:'Comparativa fondos', yahoo:'Cartera Yahoo', aggregate:'Posiciones', massive:'Comparador masivo' };
    document.getElementById('workspaceTools').innerHTML = Object.entries(tools).map(([key,label]) => `<button data-workspace-tool="${key}">${label}</button>`).join('');
    for (const id of ['portfolioReportPreview','managerReportPreview']) {
        const target = document.getElementById(id); document.getElementById(id === 'portfolioReportPreview' ? 'workspaceIndividualReports' : 'workspaceManagerReports').append(target.parentElement);
    }
    const aggregate = document.getElementById('aggregatePositionsStatus').closest('.grid').parentElement;
    aggregate.id = 'workspaceAggregate'; aggregate.dataset.workspacePanel = ''; aggregate.classList.add('workspace-panel'); root.append(aggregate);
    const modelPanel=document.createElement('section');modelPanel.id='workspaceModel';modelPanel.className='workspace-panel';modelPanel.dataset.workspacePanel='';root.append(modelPanel);
    GdcModel.init();
    const gdcInput=document.getElementById('gdcPriorFile');
    const gdcCard=document.createElement('div');gdcCard.className='min-w-0 border border-slate-200 bg-slate-50 p-3';
    gdcCard.innerHTML='<div class="text-[11px] uppercase font-bold text-slate-500">GDC · comité mensual</div><div id="scoringDataStatus-gdc" role="status" aria-live="polite" class="text-sm font-bold text-slate-800 mt-2 break-words">Pendiente</div><label class="inline-flex items-center gap-1 mt-3 px-3 py-2 bg-blue-700 text-white rounded text-xs font-bold cursor-pointer"><i class="fa-solid fa-file-excel" aria-hidden="true"></i>Subir Excel</label>';
    gdcCard.querySelector('label').append(gdcInput);gdcInput.hidden=true;gdcInput.style.display='none';
    upload.querySelector('.grid').append(gdcCard);
    document.getElementById('fundPortfolioFileInput').closest('.min-w-0').querySelector('div').textContent='Cartera individual · scoring';
    upload.querySelector('.grid').classList.replace('xl:grid-cols-5','xl:grid-cols-3');
    const comparePanel=document.createElement('section');comparePanel.id='workspacePortfolioCompare';comparePanel.className='workspace-panel';comparePanel.dataset.workspacePanel='';root.append(comparePanel);
    PortfolioCompare.init();
    document.getElementById('aggregatePositionsTableBody').closest('.mb-5').insertAdjacentHTML('beforebegin','<div class="workspace-tools"><button type="button" onclick="useAggregateChangesInIndividualScoring()"><i class="fa-solid fa-arrow-right" aria-hidden="true"></i> Llevar cartera tras cambios a análisis individual</button></div>');
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
    document.getElementById('fundProposalPortfolioInput').insertAdjacentHTML('beforebegin','<button type="button" class="initial-origin-button" onclick="InitialAnalysis.useLoadedPortfolio()">Usar cartera modelo importada</button>');
    root.append(help);
    root.addEventListener('click', event => {
        const b = event.target.closest('button'); if (!b) return;
        if (b.dataset.workspaceScope) {
            PortfolioWorkspace.scope = b.dataset.workspaceScope;
            PortfolioWorkspace.step = b.dataset.workspaceScope === 'initial' ? 'proposal' : 'diagnosis';
            PortfolioWorkspace.tool = b.dataset.workspaceScope === 'aggregate' ? 'aggregate' : b.dataset.workspaceScope === 'screener' ? 'screener' : 'main';
            if (b.dataset.workspaceScope === 'screener') showPortfolioSubtab('screener');
        }
        if (b.dataset.workspaceStep) PortfolioWorkspace.step = b.dataset.workspaceStep;
        if (b.dataset.workspaceStep === 'diagnosis' && PortfolioWorkspace.scope === 'screener') showPortfolioSubtab('screener');
        if (b.dataset.workspaceTool) { PortfolioWorkspace.tool = b.dataset.workspaceTool; if (b.dataset.workspaceTool !== 'aggregate') showPortfolioSubtab(b.dataset.workspaceTool); }
        if (b.dataset.workspaceScope || b.dataset.workspaceStep || b.dataset.workspaceTool) portfolioWorkflowRefresh();
        if (b.dataset.workspaceStep === 'metrics') renderFundUniverseMetricComparison();
    });
    root.addEventListener('input', event => { if (!event.target.closest('[data-compact-fund-panel],#portfolioSubtabContent-screener,#assetAllocationWeights,.initial-metric-input,.aggregate-score-input,#workspacePortfolioCompare,#workspaceModel')) { invalidatePortfolioReports(); portfolioWorkflowRefresh(); } });
    const originalScoring=window.runFundScoringAnalysis;
    window.runFundScoringAnalysis=(...args)=>PortfolioLoading.track(originalScoring(...args));
    for (const name of ['importFundUniverseFile','importApprovedFundsFile','importFundScoringPortfolioFile','importAggregatePositionsFile','importAssetClassScreenerFile','importPortfolioExcel']) {
        const original = window[name]; window[name] = async (...args) => { invalidatePortfolioReports(); try { return await PortfolioLoading.run(async()=>{const result=await original(...args);if(name==='importPortfolioExcel'&&portfolioAnalysisPromise)await portfolioAnalysisPromise;await PortfolioLoading.settled();await PortfolioLoading.phase(90,'Actualizando estado de las vistas…');if(name==='importPortfolioExcel')GdcModel.render();portfolioWorkflowRefresh();return result;}); } catch(error) { alert(error.message); } };
    }
    for (const name of ['setFundProposalRecommendation','setFundPortfolioRows','clearFundScoringState','setAggregateManualCategory','setAggregateManualBucket','setAggregateManualScore','applyAggregateRecord','resetAggregateRecord']) {
        const original = window[name]; window[name] = (...args) => { invalidatePortfolioReports(); const result = original(...args); portfolioWorkflowRefresh(); return result; };
    }
    for (const [name, kind, previewId] of [['generatePortfolioReport','individual','portfolioReportPreview'],['generateManagerReport','aggregate','managerReportPreview'],['generateFundProposalReport','proposal','fundProposalReportPreview']]) {
        const original = window[name]; window[name] = async (...args) => {
            if (kind === 'individual' && portfolioHistoryStale()) { alert('Vuelve a cargar o importar la cartera con las nuevas hipotesis antes de generar el informe.'); PortfolioWorkspace.scope = 'data'; portfolioWorkflowRefresh(); return; }
            return PortfolioLoading.run(async()=>{
            await PortfolioLoading.phase(15,'Calculando tablas y gráficos del informe…');
            if (kind === 'aggregate') managerReportHtml = ''; else if (kind === 'individual') portfolioReportHtml = ''; else fundProposalState.reportHtml = '';
            const revision = PortfolioWorkspace.revision;
            try { await original(...args); } catch(error) { invalidatePortfolioReports(); alert(`No se ha generado el informe: ${error.message}`); return; }
            if (revision !== PortfolioWorkspace.revision) { invalidatePortfolioReports(); return; }
            const snapshot = portfolioSnapshot(kind);
            let html = kind === 'aggregate' ? managerReportHtml : kind === 'individual' ? portfolioReportHtml : fundProposalState.reportHtml;
            if (!html) return;
            await PortfolioLoading.phase(80,'Maquetando el informe y la vista previa…');
            html = ReportDesign.prepare(html, snapshot);
            if (kind === 'aggregate') managerReportHtml = html; else if (kind === 'individual') portfolioReportHtml = html; else fundProposalState.reportHtml = html;
            PortfolioWorkspace.snapshots[kind] = JSON.parse(JSON.stringify(snapshot));
            ReportDesign.preview(document.getElementById(previewId), html);
            PortfolioWorkspace.scope = kind === 'proposal' ? 'initial' : kind === 'aggregate' ? 'aggregate' : 'individual';
            PortfolioWorkspace.step = 'report'; portfolioWorkflowRefresh();
            },{title:'Generando informe',start:'Preparando los apartados seleccionados…',done:'Informe preparado'});
        };
    }
    portfolioWorkflowRefresh();
}
function downloadPortfolioSnapshot() {
    downloadBlob(JSON.stringify(PortfolioWorkspace.snapshots, null, 2), 'Trazabilidad_cartera.json', 'application/json');
}
initializePortfolioWorkspace();
