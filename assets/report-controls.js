const ReportControls=(()=>{
    const metrics={risk5:'Riesgo 5A (%)',ret5:'Retorno 5A (%)',ter:'TER (%)',score:'Score',risk3:'Riesgo 3A (%)',ret3:'Retorno 3A (%)',risk1:'Riesgo 1A (%)',ret1:'Retorno 1A (%)',aum:'AUM'};
    const blocks={waterfall:'Cascada de ahorro anual',comparison:'Origen y propuesta: TER / score',concentration:'Concentración por gestora y categoría',positions:'Tabla de posiciones',changes:'Tabla de cambios',classes:'Clases mas baratas',details:'Detalle de metricas',savings:'Grafica de ahorro',overview:'Comparacion global',pairs:'Graficas por sustitucion',flows:'Flujos de categorías (AUM)',manual:'Ajustes manuales',methodology:'Metodología y cobertura',sources:'Origen de los datos'};
    const initial={blocks:Object.fromEntries(Object.keys(blocks).map(k=>[k,true])),includeProposal:true,x:'risk5',y:'ret5',size:'ter'};
    const managerBlocks={valueForMoney:'TER y score frente a peers',concentration:'Concentración por gestora y categoría',opportunities:'Mapa de oportunidades (uso interno)',summary:'Resumen ejecutivo',impact:'Cambios de TER y score',classes:'Clases más baratas',positions:'Posiciones',changes:'Sustituciones propuestas',exposure:'Exposición por bloques',santa:'Análisis Santalucía',comparisons:'Comparativas por benchmark',methodology:'Metodología y cobertura',sources:'Origen de los datos'};
    const manager={range:'YTD',start:'',end:'',blocks:Object.fromEntries(Object.keys(managerBlocks).map(k=>[k,k!=='opportunities']))};
    let extendApproved=false;
    function options(){const charts=document.getElementById('reportIncludeCharts')?.checked!==false,details=document.getElementById('reportIncludeDetails')?.checked!==false;return {...initial,blocks:{...initial.blocks,waterfall:charts&&initial.blocks.waterfall,comparison:charts&&initial.blocks.comparison,concentration:charts&&initial.blocks.concentration,flows:charts&&initial.blocks.flows,savings:charts&&initial.blocks.savings,overview:charts&&initial.blocks.overview,pairs:charts&&details&&initial.blocks.pairs,details:details&&initial.blocks.details}};}
    function changed(){invalidatePortfolioReports();portfolioWorkflowRefresh();}
    function init(){
        ProposalCharts.init();
        ProposalPortfolio.init();
        AggregatePeerTable.init();
        for(const id of ['fundProposalTableBody','fundScoringTableBody','aggregatePositionsTableBody']){
            const table=document.getElementById(id)?.closest('table');if(!table)continue;table.classList.add('scoring-comparison-table');
            table.querySelectorAll('th').forEach(th=>{if(['Acción','Recomendaciones'].includes(th.textContent.trim()))th.textContent='Clases y alternativas';});
        }
        const panel=document.createElement('section');panel.dataset.workspaceOnly='initial';panel.className='report-control-panel';
        const opts=Object.entries(metrics).map(([k,v])=>`<option value="${k}">${v}</option>`).join('');
        panel.innerHTML=`<h3>Contenido del informe inicial</h3><div class="workspace-report-options">${Object.entries(blocks).map(([k,v])=>`<label><input type="checkbox" data-report-block="${k}" checked>${v}</label>`).join('')}</div><div class="workspace-settings"><label>Comparacion<select id="reportChartPreset"><option value="risk">Riesgo 5A / retorno 5A</option><option value="pricing">TER / score</option><option value="custom">Personalizada</option></select></label><label>Eje X<select id="reportChartX">${opts}</select></label><label>Eje Y<select id="reportChartY">${opts}</select></label><label>Tamano de burbuja<select id="reportChartSize"><option value="fixed">Fijo</option>${opts}</select></label></div>`;
        document.getElementById('workspaceInitialReports').prepend(panel);
        panel.insertAdjacentHTML('afterbegin','<label><input id="reportCompareProposal" type="checkbox" checked> Incluir fondos propuestos en el informe</label>');
        document.getElementById('reportCompareProposal').addEventListener('change',e=>{initial.includeProposal=e.target.checked;changed();});
        const quality=document.createElement('details');quality.className='quality-explanation';quality.innerHTML='<summary>Calidad: estrellas y metodología</summary><p></p>';quality.querySelector('p').textContent=QualityCore.methodology;document.getElementById('workspaceData').before(quality);
        for(const th of document.querySelectorAll('#section-cartera th'))if(/score/i.test(th.textContent)){th.textContent=th.textContent.replace(/score/gi,'Calidad');th.title=QualityCore.methodology;}
        for(const id of ['proposalCurrentScore','proposalNewScore','aggregateWeightedScore','fundWeightedScore']){const label=document.getElementById(id)?.previousElementSibling;if(label)label.textContent=label.textContent.replace(/score/gi,'Calidad');}
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
    const format=(value,key)=>key==='score'?QualityCore.label(value):Number.isFinite(value)?value.toFixed(2)+(key==='ter'?'%':''):'-';
    function aggregateComparison(){
        const rows=aggregateScoringResults.filter(r=>r.included!==false).map(r=>({weight:r.position.weight,current:aggregateStaticRecord(r),proposed:aggregateEffectiveRecord(r)}));
        return `<section class="block"><h2>Impacto de los cambios</h2><table><thead><tr><th>Metrica</th><th>Origen</th><th>Propuesta</th><th>Variacion</th><th>Cobertura comparable</th></tr></thead><tbody>${['ter','score'].map(key=>{const v=AnalysisCore.comparison(rows,key);return `<tr><td>${key==='ter'?'TER ponderado':'Score ponderado'}</td><td>${format(v.current,key)}</td><td>${format(v.proposed,key)}</td><td>${Number.isFinite(v.delta)?v.delta.toFixed(2)+(key==='ter'?' pp':''):'-'}</td><td>${(v.coverage*100).toFixed(1)}%</td></tr>`;}).join('')}</tbody></table><p class="method-note">Mismos pesos y posiciones antes/despues. Variacion calculada sobre posiciones con ambas metricas disponibles; score solo con categoria conservada. La media de scores entre categorias es orientativa, no una medida homogenea de rentabilidad/riesgo.</p></section>`;
    }
    function classTable(rows){const opportunities=rows.filter(r=>shareClassAssessment(r.current).all.length);return opportunities.length?`<table><thead><tr><th>Origen</th><th>Comprobacion de clases</th></tr></thead><tbody>${opportunities.map(r=>`<tr><td>${escapeHtml(r.current?.name||r.isin||'-')}<br>${escapeHtml(r.isin||r.current?.isin||'')}</td><td>${shareClassSummary(r.current)}</td></tr>`).join('')}</tbody></table>`:'<p>No se han identificado clases más baratas en el universo cargado.</p>';}
    function aggregateClasses(){return `<section class="block"><h2>Clases equivalentes y costes</h2>${classTable(aggregateScoringResults.filter(r=>r.included!==false).map(r=>({isin:r.position.isin,current:aggregateStaticRecord(r)})))}</section>`;}
    function caption(){const o=options();return `${metrics[o.x]} / ${metrics[o.y]} · tamaño: ${o.size==='fixed'?'fijo':metrics[o.size]+'. Escala común para origen, propuesta y peers; magnitud absoluta, mínimo visible y tamaño neutro si falta el dato. Medias: diamantes de referencia.'}`;}
    async function chart(rows){
        const o=options(),traces=[];
        const valid=r=>r&&Number.isFinite(r[o.x])&&Number.isFinite(r[o.y]);
        const selected=rows.flatMap(r=>[r.current,r.proposed]).filter(valid);
        const overview=rows.length>3;
        const midpoint=key=>selected.length?(Math.min(...selected.map(r=>r[key]))+Math.max(...selected.map(r=>r[key])))/2:0;
        const categories=[...new Set(rows.flatMap(r=>[r.current?.category,r.proposed?.category]).filter(Boolean))];
        const universe=(fundUniverseState?.records||[]).filter(r=>categories.includes(r.category)&&valid(r));
        const maxSize=[...selected,...universe].reduce((max,r)=>Number.isFinite(r[o.size])?Math.max(max,Math.abs(r[o.size])):max,0);
        const size=r=>o.size==='fixed'?14:Number.isFinite(r[o.size])?Math.max(5,38*Math.sqrt(Math.abs(r[o.size])/(maxSize||1))):8;
        const displayed=[...new Map(categories.flatMap(category=>AnalysisCore.sample(universe.filter(r=>r.category===category),1000)).map(r=>[r.isin,r])).values()];
        if(displayed.length)traces.push({type:'scatter',mode:'markers',name:`Peer group · ${categories.map(escapeHtml).join(' + ')}${displayed.length<universe.length?' (muestra)':''}`,x:displayed.map(r=>r[o.x]),y:displayed.map(r=>r[o.y]),text:displayed.map(r=>escapeHtml(`${r.name} · ${r.isin} · ${r.category}`)),marker:{size:displayed.map(size),opacity:.25,color:'#94a3b8'},hovertemplate:'%{text}<br>X %{x:.2f}<br>Y %{y:.2f}<extra>%{fullData.name}</extra>'});
        for(const category of categories){
            const peers=universe.filter(r=>r.category===category);
            if(!peers.length)continue;
            const mean=key=>peers.reduce((s,r)=>s+r[key],0)/peers.length;
            traces.push({type:'scatter',mode:'markers',name:`Media categoría · ${escapeHtml(category)}`,x:[mean(o.x)],y:[mean(o.y)],marker:{size:14,symbol:'diamond',color:'#111827'}});
        }
        for(const [side,label] of [['current','Origen'],['proposed','Propuesta']]){
            const records=[...new Map(rows.map(r=>r[side]).filter(valid).map(r=>[`${r.isin}|${r[o.x]}|${r[o.y]}`,r])).values()];
            for(const r of records){
                const name=escapeHtml(r.name||'Sin nombre').replace(/(.{1,42})(\s|$)/g,'$1<br>').replace(/<br>$/,'');
                const text=`${label} · ${escapeHtml(r.isin)}<br>${name}`;
traces.push({type:'scatter',mode:'markers+text',meta:{financialRole:side==='current'?'origin':'proposal'},name:text,x:[r[o.x]],y:[r[o.y]],text:[records.length>3?`${label} · ${escapeHtml(r.name).slice(0,32)}`:text],cliponaxis:false,textfont:{size:records.length>3?12:17},textposition:`${side==='current'?'top':'bottom'} ${r[o.x]<midpoint(o.x)?'right':'left'}`,marker:{color:side==='current'?'#173b63':'#657487',symbol:side==='current'?'circle':'square',size:size(r)},hovertemplate:'%{text}<br>X %{x:.2f}<br>Y %{y:.2f}<extra></extra>'});
                if(overview){const trace=traces[traces.length-1];trace.name=label;trace.showlegend=r===records[0];trace.legendgroup=side;}
            }
        }
        if(!traces.length)return '';
        const height=selected.length<=2?700:900+Math.min(350,Math.ceil(traces.length/2)*35);
        const div=document.createElement('div');div.style.cssText=`position:fixed;left:-12000px;width:1100px;height:${height}px`;document.body.append(div);
        try{await FinancialVisuals.newPlot(div,traces,{font:{size:17},xaxis:{title:metrics[o.x],automargin:true},yaxis:{title:metrics[o.y],automargin:true},margin:{t:40,l:95,r:65,b:Math.min(430,80+Math.ceil(traces.length/2)*52)},legend:{orientation:'h',x:0,y:height===700?-.25:-.13,font:{size:14},entrywidth:400,entrywidthmode:'pixels'}},{staticPlot:true});return await Plotly.toImage(div,{format:'png',width:1100,height,scale:2});}finally{Plotly.purge(div);div.remove();}
    }
    function figure(image,title){return image?`<figure><figcaption>${escapeHtml(title)}</figcaption><img src="${image}" alt="${escapeHtml(title)}"></figure>`:'<p>Sin datos suficientes para los ejes seleccionados.</p>';}
    function chartNotes(rows){
        const o=options(),notes=new Set();
        for(const row of rows)for(const [side,label] of [['current','Origen'],['proposed','Propuesta']]){
            if(!(side in row))continue;
            const record=row[side],missing=[...new Set([o.x,o.y,...(o.size==='fixed'?[]:[o.size])])].filter(key=>!Number.isFinite(record?.[key]));
            if(missing.length)notes.add(`${label}: ${record?.name||row.isin||'Sin identificar'} (${record?.isin||row.isin||'-'}), sin dato de ${missing.map(key=>metrics[key]).join(', ')}. ${!Number.isFinite(record?.[o.x])||!Number.isFinite(record?.[o.y])?'No representado en la gráfica.':'Burbuja de tamaño neutro.'}`);
        }
        return [...notes].map(note=>`<p class="method-note chart-data-note">${escapeHtml(note)}</p>`).join('');
    }
    function independentComparisons(origins,targets){
        const groups=origins.map(origin=>({title:`${origin.isin} · Origen y peers de su categoría`,rows:[{isin:origin.isin,current:origin.current},...targets.filter(t=>origin.current?.category&&t.record.category===origin.current.category).map(t=>({isin:t.record.isin,proposed:t.record}))]}));
        for(const target of targets.filter(t=>!origins.some(o=>o.current?.category&&o.current.category===t.record.category)))groups.push({title:`${target.record.isin} · Propuesta y peers de su categoría`,rows:[{isin:target.record.isin,proposed:target.record}]});
        return groups;
    }
    async function generateInitial(){
        if(!options().includeProposal)return generateOriginOnly();
        if(ProposalPortfolio.independent){try{ProposalPortfolio.syncOrigin();}catch(error){alert('Origen: '+error.message);return;}}
        const origins=fundProposalState.rows||[];
        let rows;try{rows=ProposalPortfolio.rows();}catch(error){alert(error.message);return;}
        const invalid=document.querySelector('#workspaceProposal :invalid');if(invalid){alert('Corrige los campos no validos en las posiciones antes del informe.');return;}
        if(!rows.length){analyzeFundProposalPortfolio();return fundProposalState.rows.length?generateInitial():undefined;}
        const total=rows.reduce((s,r)=>s+r.weight,0);
        if(rows.some(r=>!isLikelyIsin(r.isin)||!Number.isFinite(r.weight)||r.weight<0)||Math.abs(total-100)>.01){alert('Completa las posiciones y ajusta o normaliza los pesos al 100% antes del informe.');return;}
        if(!Number.isFinite(fundProposalCapital())){alert('Introduce un AUM valido.');return;}
        const b=options().blocks,parts=[],savings=fundProposalSavingsData();
        setFundProposalBusy('Generando informe inicial...',true);
        const section=(title,html,chartPage=false,keepTogether=false)=>`<section class="block${chartPage?' report-chart-page':''}${keepTogether?' report-keep-together':''}"><h2>${escapeHtml(title)}</h2>${html}</section>`;
        parts.push(section('Resumen ejecutivo',`<p>AUM de origen ${formatEur(fundProposalCapital())}. Ahorro TER anual estimado ${formatEur(savings.annualSaving)}.</p><p>El score procede del ranking. Las comparaciones entre categorias no son homogeneas; los ajustes manuales no recalculan una metodologia de rentabilidad/riesgo.</p>`));
        parts.push(section('Cobertura de métricas',`<p>TER origen ${(ProposalPortfolio.weighted('ter','current').coverage*100).toFixed(1)}%; TER propuesta ${(ProposalPortfolio.weighted('ter','proposed').coverage*100).toFixed(1)}%. Score origen ${(ProposalPortfolio.weighted('score','current').coverage*100).toFixed(1)}%; score propuesta ${(ProposalPortfolio.weighted('score','proposed').coverage*100).toFixed(1)}%. Medias sobre el peso con datos, orientativas si mezclan categorías. Sin cobertura TER completa en ambos lados no se estima ahorro total.</p>`));
        if(ProposalPortfolio.independent)parts.push(section('Cartera propuesta independiente',`<p>${origins.length} fondos de origen y ${ProposalPortfolio.targetRows().length} fondos propuestos. ${ProposalPortfolio.note}</p>`));
        parts.push(`<section class="summary">${[['Score origen',fmtScore(fundProposalWeighted('score','current'))],['Score propuesta',fmtScore(fundProposalWeighted('score','proposed'))],['TER origen',fmtPercentPoint(savings.currentTer)],['TER propuesta',fmtPercentPoint(savings.proposedTer)],['Ahorro 5 anos',formatEur(savings.compounded[4])],['Ahorro 15 anos',formatEur(savings.compounded[14])]].map(([label,value])=>`<div><span>${label}</span><strong>${value}</strong></div>`).join('')}</section>`);
        if(b.positions)parts.push(section('Posiciones de origen',`<table><thead><tr><th>ISIN</th><th>Fondo</th><th>Peso</th><th>Score</th><th>TER</th></tr></thead><tbody>${origins.map(r=>`<tr><td>${escapeHtml(r.isin)}</td><td>${escapeHtml(r.current?.name||'Sin identificar')}</td><td>${r.weight.toFixed(2)}%</td><td>${format(r.current?.score,'score')}</td><td>${format(r.current?.ter,'ter')}</td></tr>`).join('')}</tbody></table>`));
        if(b.changes&&ProposalPortfolio.independent)parts.push(section('Composición propuesta',`<table><thead><tr><th>ISIN</th><th>Fondo</th><th>Peso</th><th>Score</th><th>TER</th></tr></thead><tbody>${ProposalPortfolio.targetRows().map(r=>`<tr><td>${escapeHtml(r.record.isin)}</td><td>${escapeHtml(r.record.name)}</td><td>${r.weight.toFixed(2)}%</td><td>${format(r.record.score,'score')}</td><td>${format(r.record.ter,'ter')}</td></tr>`).join('')}</tbody></table>`));
        else if(b.changes)parts.push(section('Cambios propuestos',`<table><thead><tr><th>Origen</th><th>Propuesta</th><th>Score origen</th><th>Score propuesta</th><th>TER origen</th><th>TER propuesta</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${escapeHtml(r.current?.name||r.isin)}</td><td>${escapeHtml(r.proposed?.name||'-')}</td><td>${format(r.current?.score,'score')}</td><td>${format(r.proposed?.score,'score')}</td><td>${format(r.current?.ter,'ter')}</td><td>${format(r.proposed?.ter,'ter')}</td></tr>`).join('')}</tbody></table>`));
        if(b.classes)parts.push(section('Clases mas baratas',classTable(origins)));
        if(b.details)parts.push(section('Leyenda de cuartiles',`<table><tr>${['Q1 · Mejor 25%','Q2 · 25–50%','Q3 · 50–75%','Q4 · Último 25%'].map((label,i)=>`<td class="q${i+1}">${label}</td>`).join('')}</tr></table><p>Comparación dentro de la categoría de cada fondo, no entre categorías. Mayor retorno y score es mejor; menor TER y riesgo es mejor. En caídas, se favorece la menor pérdida. Sin dato: sin color. El cuartil no garantiza una rentabilidad positiva.</p>`));
        if(b.waterfall&&!ProposalPortfolio.independent)parts.push(await ProposalCharts.report('waterfall'));
        if(b.comparison&&!ProposalPortfolio.independent)parts.push(await ProposalCharts.report('pairs'));
        if(b.savings){renderFundProposalSavingsChart();await waitForUiFrame();parts.push(section('Ahorro estimado por TER',figure(await capturePlotlyReportImage('fundProposalSavingsChart'),'Ahorro simple y compuesto')));}
        if(b.overview&&!ProposalPortfolio.independent)parts.push(section('Mapa global de la propuesta',figure(await chart(rows),caption())+chartNotes(rows),true));
        if(b.flows)parts.push(section('Flujos de capital por categorías',(ProposalPortfolio.independent?`<p>${ProposalPortfolio.note}</p>`:'')+figure(await CategoryFlows.image(),'Categorías de origen y propuesta · AUM de la cartera'),true));
        if(b.concentration)parts.push(await ProposalCharts.report('concentration'));
        if(ProposalPortfolio.independent){
            const detailed=new Set();
            for(const group of independentComparisons(origins,ProposalPortfolio.targetRows())){
                if(b.overview||b.pairs)parts.push(section(group.title,figure(await chart(group.rows),caption())+chartNotes(group.rows),true));
                if(b.details)for(const row of group.rows){const key=(row.current?'current':'proposed')+row.isin;if(!detailed.has(key)){parts.push(section(`${row.isin} · Métricas`,fundProposalMetricReportTable(row),false,true));detailed.add(key);}}
            }
        }else if(b.details||b.pairs)for(const row of rows){await waitForUiFrame();const detail=b.details?fundProposalMetricReportTable(row):'';if(b.pairs)parts.push(section(`${row.isin} - Comparativa con el universo`,figure(await chart([row]),caption())+chartNotes([row])+detail,true));else if(b.details)parts.push(section(`${row.isin} - Analisis de sustitucion`,detail));}
        const manual=[];for(const row of rows)for(const side of ['current','proposed'])for(const [key,value] of Object.entries(row[side]?.manualOverrides||{}))manual.push(`${row.isin} · ${side==='current'?'origen':'propuesta'} · ${key==='score'?'score técnico':key}: ${value===null?'sin dato':value}`);
        if(b.manual&&manual.length)parts.push(section('Ajustes manuales',manual.map(text=>`<p>${escapeHtml(text)}</p>`).join('')));
        const comparison=['ter','score'].map(key=>{if(ProposalPortfolio.independent){const a=ProposalPortfolio.weighted(key,'current'),b=ProposalPortfolio.weighted(key,'proposed');return `<p>${key.toUpperCase()} ponderado origen / propuesta: ${format(a.value,key)} / ${format(b.value,key)}. Cobertura ${(a.coverage*100).toFixed(1)}% / ${(b.coverage*100).toFixed(1)}%. Son composiciones independientes, no sustituciones uno a uno.</p>`;}const v=AnalysisCore.comparison(rows,key);return `<p>${key.toUpperCase()} comparable: ${format(v.current,key)} / ${format(v.proposed,key)}. Variacion ${Number.isFinite(v.delta)?v.delta.toFixed(2)+(key==='ter'?' pp':''):'-'}. Cobertura ${(v.coverage*100).toFixed(1)}%.</p>`;}).join('');
        if(b.methodology)parts.push(section('Metodologia y cobertura',comparison+'<p>Los datos ausentes no son cero. Ahorro anual = AUM x suma de pesos x diferencia TER / 100; no se calcula un ahorro total sin cobertura completa de TER. El efecto compuesto supone rentabilidad bruta cero, sin impuestos ni costes de transaccion. Menor TER no acredita acceso comercial a una clase.</p>'));
        const body=`<main class="report proposal-report"><header class="cover"><h1>Informe de analisis inicial</h1><p>${new Date().toLocaleDateString('es-ES')}</p></header>${parts.join('')}<footer>Analyzer · Datos del universo y ajustes declarados por el usuario.</footer></main>`;
        fundProposalState.reportBodyHtml=body;fundProposalState.reportHtml=buildFundProposalReportDocumentHtml(body);ReportDesign.preview(document.getElementById('fundProposalReportPreview'),fundProposalState.reportHtml);setFundProposalBusy('Informe inicial generado.',false);
    }
    async function generateOriginOnly(){
        ProposalPortfolio.syncOrigin();
        const rows=fundProposalState.rows.map(r=>({isin:r.isin,current:r.current,weight:r.weight})),b=options().blocks;
        if(!rows.length||rows.some(r=>!isLikelyIsin(r.isin)||!Number.isFinite(r.weight)||r.weight<0)||Math.abs(rows.reduce((s,r)=>s+r.weight,0)-100)>.01)throw new Error('Identifica las posiciones de origen y ajusta sus pesos al 100%.');
        const parts=[],section=(title,html)=>`<section class="block"><h2>${escapeHtml(title)}</h2>${html}</section>`;
        parts.push(section('Diagnóstico de origen','<p>Fondos originales frente a la media de su categoría y peers. No se incluyen alternativas ni estimaciones de ahorro.</p>'));
        if(b.positions)parts.push(section('Posiciones de origen',`<table><tr><th>ISIN</th><th>Fondo</th><th>Peso</th><th>Calidad</th><th>TER</th></tr>${rows.map(r=>`<tr><td>${escapeHtml(r.isin)}</td><td>${escapeHtml(r.current?.name||'Sin identificar')}</td><td>${r.weight.toFixed(2)}%</td><td>${format(r.current?.score,'score')}</td><td>${format(r.current?.ter,'ter')}</td></tr>`).join('')}</table>`));
        for(const row of rows){
            if(b.overview||b.pairs||b.comparison)parts.push(`<section class="block report-origin-chart"><h2>${escapeHtml(row.isin)} · Origen y universo</h2>${figure(await chart([row]),caption())}${chartNotes([row])}</section>`);
            if(b.details){const peers=(fundUniverseState?.records||[]).filter(r=>row.current?.category&&r.category===row.current.category);parts.push(section(`${row.isin} · Métricas y categoría`,`<table><tr><th>Métrica</th><th>Origen</th><th>Media categoría</th><th>Datos disponibles</th></tr>${['score','ter','risk5','ret5'].map(key=>{const values=peers.map(r=>r[key]).filter(Number.isFinite),mean=values.length?values.reduce((s,v)=>s+v,0)/values.length:NaN;return `<tr><td>${escapeHtml(metrics[key])}</td><td>${format(row.current?.[key],key)}</td><td>${format(mean,key)}</td><td>${values.length}</td></tr>`;}).join('')}</table><p>Media por métrica sobre los registros disponibles de la misma categoría. Los datos ausentes no se consideran cero.</p>`));}
        }
        const body=`<main class="report proposal-report"><header class="cover"><h1>Informe de análisis inicial</h1></header>${parts.join('')}<footer>Analyzer · Diagnóstico de origen</footer></main>`;
        fundProposalState.reportBodyHtml=body;fundProposalState.reportHtml=buildFundProposalReportDocumentHtml(body);ReportDesign.preview(document.getElementById('fundProposalReportPreview'),fundProposalState.reportHtml);setFundProposalBusy('Informe de origen generado.',false);
    }
    return {init,state,options,manager,periodRows,validatePeriod,aggregateComparison,aggregateClasses,generateInitial,chart,chartNotes,independentComparisons,get extendApproved(){return extendApproved;}};
})();
ReportControls.init();
