const ReportControls=(()=>{
    const metrics={risk5:'Riesgo 5A (%)',ret5:'Retorno 5A (%)',ter:'TER (%)',score:'Score',risk3:'Riesgo 3A (%)',ret3:'Retorno 3A (%)',risk1:'Riesgo 1A (%)',ret1:'Retorno 1A (%)',aum:'AUM'};
    const blocks={waterfall:'Cascada de ahorro anual',comparison:'Origen y propuesta: TER / score',concentration:'Concentración por gestora y categoría',positions:'Tabla de posiciones',changes:'Tabla de cambios',classes:'Clases mas baratas',details:'Detalle de metricas',savings:'Grafica de ahorro',overview:'Comparacion global',pairs:'Graficas por sustitucion',flows:'Flujos de categorías (AUM)',manual:'Ajustes manuales',methodology:'Metodología y cobertura',sources:'Origen de los datos'};
    const initial={blocks:Object.fromEntries(Object.keys(blocks).map(k=>[k,true])),x:'risk5',y:'ret5',size:'ter'};
    const managerBlocks={concentration:'Concentración por gestora y categoría',opportunities:'Mapa de oportunidades (uso interno)',summary:'Resumen ejecutivo',impact:'Cambios de TER y score',classes:'Clases más baratas',positions:'Posiciones',changes:'Sustituciones propuestas',exposure:'Exposición por bloques',santa:'Análisis Santalucía',comparisons:'Comparativas por benchmark',methodology:'Metodología y cobertura',sources:'Origen de los datos'};
    const manager={range:'YTD',start:'',end:'',blocks:Object.fromEntries(Object.keys(managerBlocks).map(k=>[k,k!=='opportunities']))};
    let extendApproved=false;
    function options(){const charts=document.getElementById('reportIncludeCharts')?.checked!==false,details=document.getElementById('reportIncludeDetails')?.checked!==false;return {...initial,blocks:{...initial.blocks,waterfall:charts&&initial.blocks.waterfall,comparison:charts&&initial.blocks.comparison,concentration:charts&&initial.blocks.concentration,flows:charts&&initial.blocks.flows,savings:charts&&initial.blocks.savings,overview:charts&&initial.blocks.overview,pairs:charts&&details&&initial.blocks.pairs,details:details&&initial.blocks.details}};}
    function changed(){invalidatePortfolioReports();portfolioWorkflowRefresh();}
    function init(){
        ProposalCharts.init();
        for(const id of ['fundProposalTableBody','fundScoringTableBody','aggregatePositionsTableBody']){
            const table=document.getElementById(id)?.closest('table');if(!table)continue;table.classList.add('scoring-comparison-table');
            table.querySelectorAll('th').forEach(th=>{if(['Acción','Recomendaciones'].includes(th.textContent.trim()))th.textContent='Clases y alternativas';});
        }
        const panel=document.createElement('section');panel.dataset.workspaceOnly='initial';panel.className='report-control-panel';
        const opts=Object.entries(metrics).map(([k,v])=>`<option value="${k}">${v}</option>`).join('');
        panel.innerHTML=`<h3>Contenido del informe inicial</h3><div class="workspace-report-options">${Object.entries(blocks).map(([k,v])=>`<label><input type="checkbox" data-report-block="${k}" checked>${v}</label>`).join('')}</div><div class="workspace-settings"><label>Comparacion<select id="reportChartPreset"><option value="risk">Riesgo 5A / retorno 5A</option><option value="pricing">TER / score</option><option value="custom">Personalizada</option></select></label><label>Eje X<select id="reportChartX">${opts}</select></label><label>Eje Y<select id="reportChartY">${opts}</select></label><label>Tamano de burbuja<select id="reportChartSize"><option value="fixed">Fijo</option>${opts}</select></label></div>`;
        document.getElementById('workspaceInitialReports').prepend(panel);
        document.getElementById('reportChartX').value=initial.x;document.getElementById('reportChartY').value=initial.y;document.getElementById('reportChartSize').value=initial.size;
        panel.addEventListener('change',e=>{if(e.target.dataset.reportBlock)initial.blocks[e.target.dataset.reportBlock]=e.target.checked;
            if(e.target.id==='reportChartPreset'&&e.target.value!=='custom'){initial.x=e.target.value==='pricing'?'ter':'risk5';initial.y=e.target.value==='pricing'?'score':'ret5';document.getElementById('reportChartX').value=initial.x;document.getElementById('reportChartY').value=initial.y;}
            for(const [key,id] of [['x','reportChartX'],['y','reportChartY'],['size','reportChartSize']])initial[key]=document.getElementById(id).value;
            if(['reportChartX','reportChartY'].includes(e.target.id))document.getElementById('reportChartPreset').value='custom';changed();});
        const period=document.createElement('div');period.className='workspace-settings';period.innerHTML='<label>Periodo del informe<select id="managerReportRange"><option value="YTD">YTD</option><option value="1Y">1 año</option><option value="3Y">3 años</option><option value="5Y">5 años</option><option value="ALL">Todo el histórico</option><option value="CUSTOM">Fechas personalizadas</option></select></label><label id="managerStartLabel" hidden>Desde<input id="managerReportStart" type="date"></label><label id="managerEndLabel" hidden>Hasta<input id="managerReportEnd" type="date"></label>';
        document.getElementById('workspaceManagerReports').prepend(period);period.addEventListener('change',()=>{manager.range=document.getElementById('managerReportRange').value;manager.start=document.getElementById('managerReportStart').value;manager.end=document.getElementById('managerReportEnd').value;document.getElementById('managerStartLabel').hidden=manager.range!=='CUSTOM';document.getElementById('managerEndLabel').hidden=manager.range!=='CUSTOM';changed();});
        const aggregatePanel=document.createElement('section');aggregatePanel.className='report-control-panel';
        aggregatePanel.innerHTML=`<h3>Contenido del informe agregado</h3><div class="workspace-report-options">${Object.entries(managerBlocks).map(([key,label])=>`<label><input type="checkbox" data-manager-block="${key}" ${manager.blocks[key]?'checked':''}>${label}</label>`).join('')}</div>`;
        period.after(aggregatePanel);aggregatePanel.addEventListener('change',e=>{if(e.target.dataset.managerBlock){manager.blocks[e.target.dataset.managerBlock]=e.target.checked;changed();}});
        const approval=document.createElement('label');approval.className='approval-policy';approval.innerHTML='<input id="extendApprovedClasses" type="checkbox"> Extender aprobación a las clases de la misma familia identificadas';
        document.getElementById('workspaceData').append(approval);
        approval.addEventListener('change',e=>{extendApproved=e.target.checked;fundRecommendationCache.clear();aggregateRecommendationCache.clear();fundProposalState.rows.forEach(r=>r.cheaperClasses=findCheaperShareClasses(r.current));renderFundProposalPortfolio();renderFundScoringResults();renderAggregateScoringResults();changed();});
        document.getElementById('fundProposalStatus').insertAdjacentHTML('beforebegin','<div class="workspace-tools"><button onclick="InitialAnalysis.add()"><i class="fa-solid fa-plus"></i> Anadir posicion</button><button onclick="InitialAnalysis.normalize()"><i class="fa-solid fa-scale-balanced"></i> Normalizar pesos</button><span id="initialWeightTotal" role="status"></span></div>');
        document.getElementById('fundProposalPortfolioInput').addEventListener('change',e=>{try{e.target.setCustomValidity('');analyzeFundProposalPortfolio();}catch(error){e.target.setCustomValidity(error.message);e.target.reportValidity();}});
    }
    function state(){return JSON.parse(JSON.stringify({initial:options(),manager,extendApproved}));}
    function periodRows(rows){return AnalysisCore.windowRows(rows,manager.range,manager.start,manager.end,manager.asOf);}
    function validatePeriod(){if(manager.range==='CUSTOM'&&(!manager.start||!manager.end||manager.start>manager.end))throw new Error('Indica fechas validas para el informe.');const dates=Object.values(loadedPortfolio?.benchmarks||{}).flatMap(b=>(b.data||[]).map(p=>+new Date(p.date))).filter(Number.isFinite);manager.asOf=dates.length?new Date(dates.reduce((a,b)=>Math.max(a,b))):new Date();}
    const format=(value,key)=>Number.isFinite(value)?value.toFixed(2)+(key==='ter'?'%':''):'-';
    function aggregateComparison(){
        const rows=aggregateScoringResults.filter(r=>r.included!==false).map(r=>({weight:r.position.weight,current:aggregateStaticRecord(r),proposed:aggregateEffectiveRecord(r)}));
        return `<section class="block"><h2>Impacto de los cambios</h2><table><thead><tr><th>Metrica</th><th>Origen</th><th>Propuesta</th><th>Variacion</th><th>Cobertura comparable</th></tr></thead><tbody>${['ter','score'].map(key=>{const v=AnalysisCore.comparison(rows,key);return `<tr><td>${key==='ter'?'TER ponderado':'Score ponderado'}</td><td>${format(v.current,key)}</td><td>${format(v.proposed,key)}</td><td>${Number.isFinite(v.delta)?v.delta.toFixed(2)+(key==='ter'?' pp':''):'-'}</td><td>${(v.coverage*100).toFixed(1)}%</td></tr>`;}).join('')}</tbody></table><p class="method-note">Mismos pesos y posiciones antes/despues. Variacion calculada sobre posiciones con ambas metricas disponibles; score solo con categoria conservada. La media de scores entre categorias es orientativa, no una medida homogenea de rentabilidad/riesgo.</p></section>`;
    }
    function classTable(rows){const opportunities=rows.filter(r=>shareClassAssessment(r.current).all.length);return opportunities.length?`<table><thead><tr><th>Origen</th><th>Comprobacion de clases</th></tr></thead><tbody>${opportunities.map(r=>`<tr><td>${escapeHtml(r.current?.name||r.isin||'-')}<br>${escapeHtml(r.isin||r.current?.isin||'')}</td><td>${shareClassSummary(r.current)}</td></tr>`).join('')}</tbody></table>`:'<p>No se han identificado clases más baratas en el universo cargado.</p>';}
    function aggregateClasses(){return `<section class="block"><h2>Clases equivalentes y costes</h2>${classTable(aggregateScoringResults.filter(r=>r.included!==false).map(r=>({isin:r.position.isin,current:aggregateStaticRecord(r)})))}</section>`;}
    function caption(){const o=options();return `${metrics[o.x]} / ${metrics[o.y]} · tamano: ${o.size==='fixed'?'fijo':metrics[o.size]}`;}
    async function chart(rows){
        const o=options(),traces=[];
        const valid=r=>r&&Number.isFinite(r[o.x])&&Number.isFinite(r[o.y]);
        const selected=rows.flatMap(r=>[r.current,r.proposed]).filter(valid);
        const midpoint=key=>selected.length?(Math.min(...selected.map(r=>r[key]))+Math.max(...selected.map(r=>r[key])))/2:0;
        const categories=[...new Set(rows.flatMap(r=>[r.current?.category,r.proposed?.category]).filter(Boolean))];
        for(const category of categories){
            const peers=(fundUniverseState?.records||[]).filter(r=>r.category===category&&valid(r));
            if(!peers.length)continue;
            const displayed=AnalysisCore.sample(peers,1000),mean=key=>peers.reduce((s,r)=>s+r[key],0)/peers.length;
            traces.push({type:'scatter',mode:'markers',name:`Peer group · ${escapeHtml(category)}${peers.length>1000?' (muestra 1.000)':''}`,x:displayed.map(r=>r[o.x]),y:displayed.map(r=>r[o.y]),text:displayed.map(r=>escapeHtml(`${r.name} · ${r.isin}`)),marker:{size:7,opacity:.25,color:'#94a3b8'},hovertemplate:'%{text}<br>X %{x:.2f}<br>Y %{y:.2f}<extra>%{fullData.name}</extra>'});
            traces.push({type:'scatter',mode:'markers+text',name:`Media categoría · ${escapeHtml(category)}`,x:[mean(o.x)],y:[mean(o.y)],text:[`Media ${escapeHtml(category)}`],textposition:'top center',marker:{size:14,symbol:'diamond',color:'#111827'}});
        }
        for(const [side,label] of [['current','Origen'],['proposed','Propuesta']]){
            const records=[...new Map(rows.map(r=>r[side]).filter(valid).map(r=>[`${r.isin}|${r[o.x]}|${r[o.y]}`,r])).values()];
            for(const r of records){
                const name=escapeHtml(r.name||'Sin nombre').replace(/(.{1,42})(\s|$)/g,'$1<br>').replace(/<br>$/,'');
                const text=`${label} · ${escapeHtml(r.isin)}<br>${name}`;
traces.push({type:'scatter',mode:'markers+text',meta:{financialRole:side==='current'?'origin':'proposal'},name:text,x:[r[o.x]],y:[r[o.y]],text:[text],cliponaxis:false,textfont:{size:18},textposition:`${r[o.y]>midpoint(o.y)?'bottom':'top'} ${r[o.x]<midpoint(o.x)?'right':'left'}`,marker:{color:side==='current'?'#173b63':'#657487',symbol:side==='current'?'circle':'square',size:o.size==='fixed'||!Number.isFinite(r[o.size])?16:Math.max(16,Math.min(32,10+Math.sqrt(Math.abs(r[o.size]))*4))},hovertemplate:'%{text}<br>X %{x:.2f}<br>Y %{y:.2f}<extra></extra>'});
            }
        }
        if(!traces.length)return '';
        const height=1120;
        const div=document.createElement('div');div.style.cssText=`position:fixed;left:-12000px;width:1100px;height:${height}px`;document.body.append(div);
        try{await FinancialVisuals.newPlot(div,traces,{font:{size:18},xaxis:{title:metrics[o.x],automargin:true},yaxis:{title:metrics[o.y],automargin:true},margin:{t:70,l:100,r:70,b:Math.min(440,160+Math.ceil(traces.length/2)*44)},legend:{orientation:'h',x:0,y:-.17,font:{size:18},entrywidth:450,entrywidthmode:'pixels'}},{staticPlot:true});return await Plotly.toImage(div,{format:'png',width:1100,height,scale:2});}finally{Plotly.purge(div);div.remove();}
    }
    function figure(image,title){return image?`<figure><figcaption>${escapeHtml(title)}</figcaption><img src="${image}" alt="${escapeHtml(title)}"></figure>`:'<p>Sin datos suficientes para los ejes seleccionados.</p>';}
    async function generateInitial(){
        const rows=fundProposalState.rows||[];
        const invalid=document.querySelector('#workspaceProposal :invalid');if(invalid){alert('Corrige los campos no validos en las posiciones antes del informe.');return;}
        if(!rows.length){analyzeFundProposalPortfolio();return fundProposalState.rows.length?generateInitial():undefined;}
        const total=rows.reduce((s,r)=>s+r.weight,0);
        if(rows.some(r=>!isLikelyIsin(r.isin)||!Number.isFinite(r.weight)||r.weight<0)||Math.abs(total-100)>.01){alert('Completa las posiciones y ajusta o normaliza los pesos al 100% antes del informe.');return;}
        if(!Number.isFinite(fundProposalCapital())){alert('Introduce un AUM valido.');return;}
        const b=options().blocks,parts=[],savings=fundProposalSavingsData();
        setFundProposalBusy('Generando informe inicial...',true);
        const section=(title,html,chartPage=false)=>`<section class="block${chartPage?' report-chart-page':''}"><h2>${escapeHtml(title)}</h2>${html}</section>`;
        parts.push(section('Resumen ejecutivo',`<p>AUM de origen ${formatEur(fundProposalCapital())}. Ahorro TER anual estimado ${formatEur(savings.annualSaving)}.</p><p>El score procede del ranking. Las comparaciones entre categorias no son homogeneas; los ajustes manuales no recalculan una metodologia de rentabilidad/riesgo.</p>`));
        parts.push(`<section class="summary">${[['Score origen',fmtScore(fundProposalWeighted('score','current'))],['Score propuesta',fmtScore(fundProposalWeighted('score','proposed'))],['TER origen',fmtPercentPoint(savings.currentTer)],['TER propuesta',fmtPercentPoint(savings.proposedTer)],['Ahorro 5 anos',formatEur(savings.compounded[4])],['Ahorro 15 anos',formatEur(savings.compounded[14])]].map(([label,value])=>`<div><span>${label}</span><strong>${value}</strong></div>`).join('')}</section>`);
        if(b.positions)parts.push(section('Posiciones de origen',`<table><thead><tr><th>ISIN</th><th>Fondo</th><th>Peso</th><th>Score</th><th>TER</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${escapeHtml(r.isin)}</td><td>${escapeHtml(r.current?.name||'Sin identificar')}</td><td>${r.weight.toFixed(2)}%</td><td>${format(r.current?.score,'score')}</td><td>${format(r.current?.ter,'ter')}</td></tr>`).join('')}</tbody></table>`));
        if(b.changes)parts.push(section('Cambios propuestos',`<table><thead><tr><th>Origen</th><th>Propuesta</th><th>Score origen</th><th>Score propuesta</th><th>TER origen</th><th>TER propuesta</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${escapeHtml(r.current?.name||r.isin)}</td><td>${escapeHtml(r.proposed?.name||'-')}</td><td>${format(r.current?.score,'score')}</td><td>${format(r.proposed?.score,'score')}</td><td>${format(r.current?.ter,'ter')}</td><td>${format(r.proposed?.ter,'ter')}</td></tr>`).join('')}</tbody></table>`));
        if(b.classes)parts.push(section('Clases mas baratas',classTable(rows)));
        if(b.waterfall)parts.push(await ProposalCharts.report('waterfall'));
        if(b.comparison)parts.push(await ProposalCharts.report('pairs'));
        if(b.savings){renderFundProposalSavingsChart();await waitForUiFrame();parts.push(section('Ahorro estimado por TER',figure(await capturePlotlyReportImage('fundProposalSavingsChart'),'Ahorro simple y compuesto')));}
        if(b.overview)parts.push(section('Mapa global de la propuesta',figure(await chart(rows),caption()),true));
        if(b.flows)parts.push(section('Flujos de capital por categorías',figure(await CategoryFlows.image(),'Categorías de origen y propuesta · AUM de la cartera'),true));
        if(b.concentration)parts.push(await ProposalCharts.report('concentration'));
        if(b.details||b.pairs)for(const row of rows){await waitForUiFrame();if(b.details)parts.push(section(`${row.isin} - Analisis de sustitucion`,fundProposalMetricReportTable(row)));if(b.pairs)parts.push(section(`${row.isin} - Comparativa con el universo`,figure(await chart([row]),caption()),true));}
        const manual=[];for(const row of rows)for(const side of ['current','proposed'])for(const [key,value] of Object.entries(row[side]?.manualOverrides||{}))manual.push(`${row.isin} · ${side==='current'?'origen':'propuesta'} · ${key}: ${value===null?'sin dato':value}`);
        if(b.manual&&manual.length)parts.push(section('Ajustes manuales',manual.map(text=>`<p>${escapeHtml(text)}</p>`).join('')));
        const comparison=['ter','score'].map(key=>{const v=AnalysisCore.comparison(rows,key);return `<p>${key.toUpperCase()} comparable: ${format(v.current,key)} / ${format(v.proposed,key)}. Variacion ${Number.isFinite(v.delta)?v.delta.toFixed(2)+(key==='ter'?' pp':''):'-'}. Cobertura ${(v.coverage*100).toFixed(1)}%.</p>`;}).join('');
        if(b.methodology)parts.push(section('Metodologia y cobertura',comparison+'<p>Los datos ausentes no son cero. Ahorro anual = AUM x suma de pesos x diferencia TER / 100; no se calcula un ahorro total sin cobertura completa de TER. El efecto compuesto supone rentabilidad bruta cero, sin impuestos ni costes de transaccion. Menor TER no acredita acceso comercial a una clase.</p>'));
        const body=`<main class="report proposal-report"><header class="cover"><h1>Informe de analisis inicial</h1><p>${new Date().toLocaleDateString('es-ES')}</p></header>${parts.join('')}<footer>Analyzer · Datos del universo y ajustes declarados por el usuario.</footer></main>`;
        fundProposalState.reportBodyHtml=body;fundProposalState.reportHtml=buildFundProposalReportDocumentHtml(body);ReportDesign.preview(document.getElementById('fundProposalReportPreview'),fundProposalState.reportHtml);setFundProposalBusy('Informe inicial generado.',false);
    }
    return {init,state,options,manager,periodRows,validatePeriod,aggregateComparison,aggregateClasses,generateInitial,get extendApproved(){return extendApproved;}};
})();
ReportControls.init();
