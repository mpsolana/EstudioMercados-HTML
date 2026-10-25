const PortfolioWorkspace = { scope: 'data', step: 'diagnosis', tool: 'main', revision: 1, snapshots: {}, engine: 'audit-1' };
let initialRatePositions=[];
let initialRateResults=[];
let initialSimpleRateResults=[];
const defaultRateScenarios=()=>[{name:'Favorable',rate:-50,spread:-25,enabled:true},{name:'Neutral',rate:0,spread:0,enabled:true},{name:'Subida de tipos',rate:50,spread:0,enabled:true},{name:'Crédito',rate:0,spread:50,enabled:true},{name:'Tensión conjunta',rate:50,spread:50,enabled:true}];
let initialRateScenarios=defaultRateScenarios();
function renderInitialRateScenarioEditor(){
    const body=document.querySelector('#initialRateScenarioEditor');if(!body)return;
    body.innerHTML=initialRateScenarios.map((row,index)=>`<tr><td><input data-rate-scenario="${index}" data-rate-scenario-field="enabled" type="checkbox" ${row.enabled?'checked':''} aria-label="Activar ${escapeHtml(row.name)}"></td><td><input data-rate-scenario="${index}" data-rate-scenario-field="name" value="${escapeHtml(row.name)}" aria-label="Nombre del escenario ${index+1}"></td><td><input data-rate-scenario="${index}" data-rate-scenario-field="rate" type="number" min="-2000" max="2000" step="25" value="${row.rate}" aria-label="Tipos en pb de ${escapeHtml(row.name)}"></td><td><input data-rate-scenario="${index}" data-rate-scenario-field="spread" type="number" min="-2000" max="2000" step="25" value="${row.spread}" aria-label="Spread en pb de ${escapeHtml(row.name)}"></td></tr>`).join('');
}
async function exportInitialRateSensitivity(format){
    const panel=document.getElementById('workspaceInitialRates');
    if(!initialRateResults.length)throw new Error('Completa los datos y calcula los escenarios antes de exportar.');
    const get=id=>panel.querySelector('#'+id)?.value||'',currency=portfolioCalculationSettings().currency;
    const headers=['Escenario','Tipos (pb)','Spreads (pb)','Impacto tipos RF (%)','Impacto crédito RF (%)','Carry RF (%)','Impacto RF (%)','Impacto cartera (%)','Impacto cartera (importe)','Valor cartera estimado'];
    const rows=initialRateResults.map(row=>[row.name,row.rate,row.spread,row.rates*100,row.credit*100,row.carry*100,row.rfReturn*100,row.portfolioReturn*100,row.change,row.portfolioValue]);
    const simpleHeaders=['Tipos (pb)','Impacto RF (%)','Impacto RF (EUR)','Impacto cartera (%)','Valor estimado'];
    const simpleRows=initialSimpleRateResults.map(row=>[row.changeBps,row.rfReturn*100,row.change,row.portfolioReturn*100,row.portfolioValue]);
    if(format==='xlsx'){
        if(!window.XLSX)throw new Error('Excel no está disponible.');
        const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([headers,...rows]),'Escenarios');
        XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([simpleHeaders,...simpleRows]),'Sensibilidad simple');
        XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Parámetro','Valor'],['Fecha',new Date().toLocaleDateString('es-ES')],['Divisa',currency],['Importe cartera',get('initialRateAmount')],['Valor RF',get('initialRateRfAmount')],['RF (%)',get('initialRateWeight')],['Duración tipos (años)',get('initialRateDuration')],['Spread duration (años)',get('initialSpreadDuration')],['YTM (%)',get('initialRateYtm')],['Horizonte (meses)',get('initialRateHorizon')],['Carry incluido',panel.querySelector('#initialRateCarry').checked?'Sí':'No'],['Cobertura granular',panel.querySelector('#initialRateCoverage')?.textContent||'Modo agregado'],['Metodología',panel.querySelector('#initialRateMethod').textContent]]),'Hipótesis');
        if(panel.querySelector('#initialRateMode').value==='positions'&&initialRatePositions.length)XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['ISIN','Fondo','Peso cartera (%)','Duración tipos','Spread duration','YTM (%)','Fuente'],...initialRatePositions.map(row=>[row.isin,row.name,row.weight,Number.isFinite(row.rateDuration)?row.rateDuration:'',Number.isFinite(row.spreadDuration)?row.spreadDuration:'',Number.isFinite(row.ytmPct)?row.ytmPct:'',row.source])]),'Posiciones RF');
        if(panel.querySelector('#initialRateAdjustedResult')?.textContent&&get('initialRateAdjustedWeight'))XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Parámetro','Valor'],['Peso RF propuesto (%)',get('initialRateAdjustedWeight')],['Duración tipos propuesta',get('initialRateAdjustedDuration')],['Spread duration propuesta',get('initialRateAdjustedSpread')],['YTM propuesta (%)',get('initialRateAdjustedYtm')],['Comparación',panel.querySelector('#initialRateAdjustedResult').textContent]]),'Cartera ajustada');
        XLSX.writeFile(book,'Sensibilidad-RF.xlsx');return;
    }
    const figures=[];
    for(const id of ['initialRateScenarioChart','initialSimpleRateChart','initialRateCurve','initialSpreadCurve','initialCombinedHeat','initialRateWaterfall']){
        const node=panel.querySelector('#'+id);if(node?.data?.length)figures.push(`<figure><img src="${await Plotly.toImage(node,{format:'png',width:900,height:430,scale:1.5})}" alt="${escapeHtml(node.layout?.title?.text||id)}"></figure>`);
    }
    const table=`<table class="wide-report-table"><thead><tr>${headers.map(label=>`<th>${escapeHtml(label)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(value=>`<td>${escapeHtml(typeof value==='number'?value.toFixed(2):value)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    const simpleTable=`<table class="wide-report-table"><thead><tr>${simpleHeaders.map(label=>`<th>${escapeHtml(label)}</th>`).join('')}</tr></thead><tbody>${simpleRows.map(row=>`<tr>${row.map(value=>`<td>${escapeHtml(typeof value==='number'?value.toFixed(2):value)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    const positions=panel.querySelector('#initialRateMode').value==='positions'&&initialRatePositions.length?`<section><h2>Posiciones de renta fija y fuentes</h2><table class="wide-report-table"><thead><tr><th>ISIN</th><th>Fondo</th><th>Peso (%)</th><th>Duración tipos</th><th>Spread duration</th><th>YTM (%)</th><th>Fuente</th></tr></thead><tbody>${initialRatePositions.map(row=>`<tr><td>${escapeHtml(row.isin)}</td><td>${escapeHtml(row.name)}</td><td>${row.weight.toFixed(2)}</td><td>${Number.isFinite(row.rateDuration)?row.rateDuration:'Pendiente'}</td><td>${Number.isFinite(row.spreadDuration)?row.spreadDuration:'Pendiente'}</td><td>${Number.isFinite(row.ytmPct)?row.ytmPct:'Pendiente'}</td><td>${escapeHtml(row.source)}</td></tr>`).join('')}</tbody></table></section>`:'';
    const html=`<html><body class="report manager-report"><header><h1>Sensibilidad de la renta fija</h1><p>Tipos de interés y crédito · ${new Date().toLocaleDateString('es-ES')} · ${escapeHtml(currency)}</p></header><section><h2>Resumen ejecutivo</h2><p>${escapeHtml(panel.querySelector('#initialRateExecutive').textContent)}</p></section><section><h2>Hipótesis</h2><p>Importe ${escapeHtml(get('initialRateAmount'))} · RF ${escapeHtml(get('initialRateWeight'))}% · duración tipos ${escapeHtml(get('initialRateDuration'))} · spread duration ${escapeHtml(get('initialSpreadDuration')||'pendiente')} · carry ${panel.querySelector('#initialRateCarry').checked?'incluido':'excluido'}</p><p>${escapeHtml(panel.querySelector('#initialRateMode').value==='positions'?panel.querySelector('#initialRateCoverage')?.textContent||'Datos granulares pendientes':'Modo agregado; sensibilidades introducidas por el usuario')}</p></section><section><h2>Sensibilidad simple a tipos</h2><p>Shock paralelo instantáneo, sin carry ni crédito.</p>${simpleTable}</section><section><h2>Escenarios</h2>${table}</section>${positions}${get('initialRateAdjustedWeight')?`<section><h2>Cartera ajustada</h2><p>${escapeHtml(panel.querySelector('#initialRateAdjustedResult')?.textContent||'Pendiente')}</p></section>`:''}<section><h2>Desglose visual</h2>${figures.join('')}</section><footer><p>${escapeHtml(panel.querySelector('#initialRateMethod').textContent)}</p></footer></body></html>`;
    await ReportDesign.downloadPdf(html,'Sensibilidad-RF.pdf');
}
function renderInitialRatePositions(){
    const panel=document.getElementById('workspaceInitialRates'),body=panel?.querySelector('#initialRatePositionsBody');if(!body)return;
    body.innerHTML=initialRatePositions.map((row,index)=>`<tr><td>${escapeHtml(row.isin)}<br><small>${escapeHtml(row.name)}</small></td><td>${row.weight.toFixed(2)}%</td>${[['rateDuration','Duración tipos'],['spreadDuration','Spread duration'],['ytmPct','YTM']].map(([field,label])=>`<td><input type="number" step="0.01" min="0" data-rate-position="${index}" data-rate-field="${field}" aria-label="${label} ${escapeHtml(row.isin)}" value="${Number.isFinite(row[field])?row[field]:''}"></td>`).join('')}<td>${escapeHtml(row.source)}</td><td data-position-impact="${index}" data-impact-field="rates">—</td><td data-position-impact="${index}" data-impact-field="credit">—</td></tr>`).join('')||'<tr><td colspan="8">Sin posiciones RF identificadas en origen.</td></tr>';
}
function updateInitialRatePositionMetrics(){
    const panel=document.getElementById('workspaceInitialRates'),amount=Number(panel?.querySelector('#initialRateAmount')?.value);
    if(!(amount>0)||!initialRatePositions.length)return;
    let summary;
    try{summary=RateSensitivity.weightedPositions(initialRatePositions.map(row=>({...row,value:amount*row.weight/100})),amount);}
    catch(error){panel.querySelector('#initialRateCoverage').textContent=error.message;return;}
    for(const [id,value] of [['initialRateRfAmount',summary.rfAmount],['initialRateWeight',summary.rfWeightPct],['initialRateDuration',summary.rateDuration],['initialSpreadDuration',summary.spreadDuration],['initialRateYtm',summary.ytmPct]])panel.querySelector('#'+id).value=Number.isFinite(value)?Number(value.toFixed(4)):'';
    const coverage=field=>initialRatePositions.reduce((sum,row)=>sum+(Number.isFinite(row[field])?row.weight:0),0)/Math.max(summary.rfWeightPct,1)*100;
    panel.querySelector('#initialRateCoverage').textContent=`${initialRatePositions.length} posiciones RF · cobertura duración tipos ${coverage('rateDuration').toFixed(1)}% · spread duration ${coverage('spreadDuration').toFixed(1)}% · YTM ${coverage('ytmPct').toFixed(1)}%. Las filas excluidas del origen por clasificación desconocida deben verificarse.`;
}
function importInitialRatePositions(){
    const rows=ProposalPortfolio.originRows();
    initialRatePositions=rows.filter(row=>{
        const isin=row.record?.isin,classification=OverviewPanel?.state?.categories?.get(isin)?.type;
        return classification==='RF'||classification!=='RV'&&typeof isFixedIncomeFund==='function'&&isFixedIncomeFund(row.record);
    }).map(row=>{
        const isin=row.record.isin,metric=GdcModel.state.rfMetrics[`F:${isin}`]||{};
        return {isin,name:row.record.name||isin,weight:Number(row.weight),rateDuration:Number.isFinite(metric.duration)?metric.duration:NaN,spreadDuration:NaN,ytmPct:Number.isFinite(metric.ytm)?metric.ytm:NaN,source:Number.isFinite(metric.duration)||Number.isFinite(metric.ytm)?'Base RF; fecha no registrada':'Pendiente'};
    });
    renderInitialRatePositions();updateInitialRatePositionMetrics();renderInitialRateSensitivity();
}
function renderSimpleRateSensitivity(amount,rfWeightPct,duration,currency){
    const panel=document.getElementById('workspaceInitialRates'),chart=panel?.querySelector('#initialSimpleRateChart'),body=panel?.querySelector('#initialSimpleRateBody');if(!chart||!body)return;
    const shocks=[-200,-100,-50,0,50,100,200],rows=shocks.map(changeBps=>RateSensitivity.scenario({amount,rfWeightPct,duration,changeBps}));
    initialSimpleRateResults=rows;
    const money=value=>new Intl.NumberFormat('es-ES',{style:'currency',currency,maximumFractionDigits:2}).format(value);
    body.innerHTML=rows.map(row=>`<tr><td class="num">${row.changeBps>0?'+':''}${row.changeBps} pb</td><td class="num">${(row.rfReturn*100).toFixed(2)}%</td><td class="num ${row.change>=0?'good':'bad'}">${money(row.change)}</td><td class="num">${(row.portfolioReturn*100).toFixed(2)}%</td><td class="num">${money(row.portfolioValue)}</td></tr>`).join('');
    if(window.Plotly)FinancialVisuals.newPlot(chart,[{type:'bar',x:rows.map(row=>row.changeBps),y:rows.map(row=>row.portfolioReturn*100),marker:{color:rows.map(row=>row.portfolioReturn>=0?'#287d6b':'#ad535b')},hovertemplate:'Shock %{x:+} pb<br>Impacto cartera %{y:.2f}%<extra></extra>'}],{title:'Sensibilidad simple a tipos · sin spreads ni carry',xaxis:{title:'Movimiento paralelo de tipos (pb)'},yaxis:{title:'Impacto cartera (%)',zeroline:true},margin:{t:48,l:64,r:20,b:62},paper_bgcolor:'#fff',plot_bgcolor:'#fff'},{responsive:true});
}
function clearSimpleRateSensitivity(){
    initialSimpleRateResults=[];
    const panel=document.getElementById('workspaceInitialRates'),chart=panel?.querySelector('#initialSimpleRateChart');
    panel?.querySelector('#initialSimpleRateBody')?.replaceChildren();
    if(chart){if(chart.data&&window.Plotly)Plotly.purge(chart);chart.replaceChildren();}
}
function renderInitialRateSensitivity(){
    const panel=document.getElementById('workspaceInitialRates');if(!panel)return;
    const read=id=>{const value=panel.querySelector(`#${id}`).value.trim();return value===''?NaN:Number(value.replace(',','.'));};
    const amount=read('initialRateAmount'),rfWeightPct=read('initialRateWeight'),rfAmount=read('initialRateRfAmount'),duration=read('initialRateDuration'),spreadDuration=read('initialSpreadDuration'),rateBps=read('initialRateShock'),spreadBps=read('initialSpreadShock'),ytmPct=read('initialRateYtm'),horizonMonths=read('initialRateHorizon'),includeCarry=panel.querySelector('#initialRateCarry')?.checked;
    const status=panel.querySelector('#initialRateStatus'),body=panel.querySelector('#initialRateBody'),chart=panel.querySelector('#initialRateScenarioChart');
    const currency=portfolioCalculationSettings().currency;
    const money=value=>new Intl.NumberFormat('es-ES',{style:'currency',currency,maximumFractionDigits:0}).format(value);
    if(![amount,rfWeightPct,duration].every(Number.isFinite)||amount<=0||rfWeightPct<0||rfWeightPct>100||duration<0||duration>100){
        initialRateResults=[];clearSimpleRateSensitivity();status.textContent='Introduce un importe positivo, el peso de RF (0–100%) y su duración modificada ponderada.';body.replaceChildren();if(chart.data&&window.Plotly)Plotly.purge(chart);chart.replaceChildren();return;
    }
    if(Number.isFinite(rfAmount)&&(rfAmount<0||rfAmount>amount||Math.abs(rfAmount-amount*rfWeightPct/100)>Math.max(.01,amount*.000001))){initialRateResults=[];clearSimpleRateSensitivity();status.textContent='El valor de RF no puede superar el total y debe coincidir con el peso RF.';body.replaceChildren();return;}
    const hasSpread=Number.isFinite(spreadDuration);
    const scenarios=[...initialRateScenarios.filter(row=>row.enabled&&row.name&&Number.isFinite(row.rate)&&Number.isFinite(row.spread)).map(row=>[row.name,row.rate,row.spread]),['Personalizado',rateBps,spreadBps]].filter(([, ,spread])=>hasSpread||spread===0);
    if(!scenarios.length){initialRateResults=[];clearSimpleRateSensitivity();status.textContent='Activa al menos un escenario sin spread o indica la spread duration.';body.replaceChildren();return;}
    let rows;
    try{rows=scenarios.map(([name,rate,spread])=>({name,rate,spread,...RateSensitivity.combinedScenario({amount,rfWeightPct,rateDuration:duration,spreadDuration,rateBps:rate,spreadBps:spread,ytmPct,horizonMonths,includeCarry})}));}
    catch(error){initialRateResults=[];clearSimpleRateSensitivity();status.textContent=error.message;body.replaceChildren();if(chart.data&&window.Plotly)Plotly.purge(chart);chart.replaceChildren();return;}
    initialRateResults=rows;
    const selected=rows.at(-1),pct=value=>(value*100).toFixed(2)+'%';
    status.textContent=`RF: ${money(selected.rfAmount)} · duración tipos: ${duration.toFixed(2)} años · duración crédito: ${hasSpread?spreadDuration.toFixed(2)+' años':'pendiente; solo se muestran escenarios de tipos'}. ${includeCarry?'Carry estimado incluido; no es rentabilidad garantizada.':'Impacto instantáneo sin carry.'}`;
    const executive=panel.querySelector('#initialRateExecutive');
    if(executive)executive.textContent=`La cartera tiene ${rfWeightPct.toFixed(1)}% en renta fija. En el escenario ${selected.name.toLowerCase()} (${selected.rate>0?'+':''}${selected.rate} pb en tipos y ${selected.spread>0?'+':''}${selected.spread} pb en crédito), el impacto estimado sería ${pct(selected.rates)} por tipos y ${pct(selected.credit)} por spreads sobre la renta fija; equivale a ${pct(selected.portfolioReturn)} de la cartera (${money(selected.change)}). ${includeCarry?`Se añade un carry aproximado de ${pct(selected.carry)} en ${horizonMonths} meses; la TIR no asegura ese retorno.`:'No se incluye carry.'} Es una sensibilidad, no una previsión ni una recomendación. ${Math.max(Math.abs(selected.rate),Math.abs(selected.spread))>200?'El shock es amplio y puede aumentar el error de la aproximación lineal.':''}`;
    for(const cell of panel.querySelectorAll('[data-position-impact]')){
        const row=initialRatePositions[Number(cell.dataset.positionImpact)],factor=cell.dataset.impactField==='rates'?'rateDuration':'spreadDuration',shock=cell.dataset.impactField==='rates'?selected.rate:selected.spread,value=shock===0?0:Number.isFinite(row?.[factor])?amount*row.weight/100*(-row[factor]*shock/10000):NaN;
        cell.textContent=Number.isFinite(value)?money(value):'Pendiente';
    }
    const adjusted=panel.querySelector('#initialRateAdjustedResult'),adjustedValues=['initialRateAdjustedWeight','initialRateAdjustedDuration','initialRateAdjustedSpread','initialRateAdjustedYtm'].map(read);
    if(adjusted){if(adjustedValues.slice(0,3).every(Number.isFinite)&&(!includeCarry||Number.isFinite(adjustedValues[3]))){
        try{const proposal=RateSensitivity.combinedScenario({amount,rfWeightPct:adjustedValues[0],rateDuration:adjustedValues[1],spreadDuration:adjustedValues[2],rateBps:selected.rate,spreadBps:selected.spread,ytmPct:adjustedValues[3],horizonMonths,includeCarry});adjusted.textContent=`Escenario ${selected.name}: actual ${pct(selected.portfolioReturn)} (${money(selected.change)}); ajustada ${pct(proposal.portfolioReturn)} (${money(proposal.change)}). Diferencia ${(proposal.portfolioReturn-selected.portfolioReturn)*100>=0?'+':''}${((proposal.portfolioReturn-selected.portfolioReturn)*100).toFixed(2)} pp. El ajuste puede alterar el carry, el potencial de revalorización si bajan tipos, la liquidez y el riesgo de reinversión; no es una recomendación.`;}catch(error){adjusted.textContent=error.message;}
    }else adjusted.textContent='Introduce peso RF, duración de tipos y spread duration propuestos para comparar con el mismo shock. Si incluyes carry, indica también YTM propuesta.';}
    body.innerHTML=rows.map(row=>`<tr><td>${row.name}<small> ${row.rate>0?'+':''}${row.rate} / ${row.spread>0?'+':''}${row.spread} pb</small></td><td>${pct(row.rates)}</td><td>${pct(row.credit)}</td><td>${pct(row.carry)}</td><td class="${row.rfReturn>=0?'good':'bad'}">${pct(row.rfReturn)}</td><td class="${row.portfolioReturn>=0?'good':'bad'}">${pct(row.portfolioReturn)} · ${money(row.change)}</td></tr>`).join('');
    renderSimpleRateSensitivity(amount,rfWeightPct,duration,currency);
    if(!window.Plotly)return;
    const colors=['#297aa2','#8093a3','#bd7053','#ae6251','#983f45','#183f66'];
    FinancialVisuals.newPlot(chart,[{type:'bar',x:rows.map(row=>({'Favorable':'Favorable','Neutral':'Neutral','Subida de tipos':'Tipos +50','Crédito':'Crédito +50','Tensión conjunta':'Tensión','Personalizado':'Personal.'}[row.name]||row.name)),y:rows.map(row=>row.portfolioReturn*100),marker:{color:rows.map(row=>row.portfolioReturn>0?'#287d6b':row.portfolioReturn<0?'#ad535b':'#8999a7')},hovertemplate:'Impacto cartera: %{y:.2f}%<extra></extra>'}],{title:'Impacto por escenario',yaxis:{title:'Cartera (%)',zeroline:true},margin:{t:45,l:65,r:20,b:85},showlegend:false,paper_bgcolor:'#fff',plot_bgcolor:'#fff'},{responsive:true});
    const range=[1,2,3,4,5],shocks=[-50,-25,0,25,50];
    for(const [id,field,shockField,title] of [['initialRateCurve','rateDuration','rateBps','Riesgo de tipos'],['initialSpreadCurve','spreadDuration','spreadBps','Riesgo de crédito']]){
        const target=panel.querySelector('#'+id);if(!target)continue;
        if(field==='spreadDuration'&&!Number.isFinite(spreadDuration)){target.textContent='Indica spread duration para analizar el crédito.';continue;}
        FinancialVisuals.newPlot(target,shocks.map((shock,i)=>({type:'scatter',mode:'lines+markers',name:`${shock>0?'+':''}${shock} pb`,x:range,y:range.map(d=>RateSensitivity.combinedScenario({amount,rfWeightPct,rateDuration:field==='rateDuration'?d:duration,spreadDuration:field==='spreadDuration'?d:spreadDuration,rateBps:field==='rateDuration'?shock:0,spreadBps:field==='spreadDuration'?shock:0}).portfolioReturn*100),line:{color:colors[i],width:2}})),{title,xaxis:{title:'Duración (años)'},yaxis:{title:'Impacto cartera (%)'},height:340,margin:{t:50,l:65,r:20,b:70},legend:{orientation:'h',y:-.3},paper_bgcolor:'#fff',plot_bgcolor:'#fff'},{responsive:true});
    }
    const heat=panel.querySelector('#initialCombinedHeat');
    if(heat){if(!hasSpread)heat.textContent='El mapa combinado requiere spread duration explícita.';else {const z=range.map(rateD=>range.map(spreadD=>RateSensitivity.combinedScenario({amount,rfWeightPct,rateDuration:rateD,spreadDuration:spreadD,rateBps,spreadBps}).portfolioReturn*100)),bound=Math.max(.01,...z.flat().map(Math.abs));FinancialVisuals.newPlot(heat,[{type:'heatmap',x:range,y:range,z,zmin:-bound,zmax:bound,colorscale:[[0,'#a24a50'],[.5,'#f7fafc'],[1,'#237d91']],hovertemplate:'Duración tipos %{y}<br>Duración crédito %{x}<br>Impacto cartera %{z:.2f}%<extra></extra>'}],{title:'Riesgo combinado',xaxis:{title:'Spread duration (años)'},yaxis:{title:'Duración de tipos (años)'},height:400,margin:{t:50,l:70,r:20,b:65},paper_bgcolor:'#fff',plot_bgcolor:'#fff'},{responsive:true});}}
    const waterfall=panel.querySelector('#initialRateWaterfall');
    if(waterfall)FinancialVisuals.newPlot(waterfall,[{type:'waterfall',x:['Tipos','Spreads','Carry','Impacto total'],y:[selected.rateAmount,selected.creditAmount,selected.carryAmount,0],measure:['relative','relative','relative','total'],increasing:{marker:{color:'#287b89'}},decreasing:{marker:{color:'#ae6251'}},totals:{marker:{color:selected.change<0?'#ad535b':'#287d6b'}}}],{title:'Contribuciones',yaxis:{title:`Impacto (${currency})`},height:360,margin:{t:50,l:70,r:20,b:75},paper_bgcolor:'#fff',plot_bgcolor:'#fff'},{responsive:true});
}
function portfolioWorkspaceReady(){return Boolean(fundUniverseState?.records?.length || fundPortfolioRows?.length || GdcModel.state.models.length);}
function portfolioWorkspaceWarning(){
    const scope=PortfolioWorkspace.scope,tool=PortfolioWorkspace.tool;
    if(scope==='data')return portfolioWorkspaceReady()?'':'Carga el ranking del universo o el Excel de cartera modelo para empezar.';
    const missing=[];
    if(['initial','aggregate','screener','model'].includes(scope)&&!fundUniverseState?.records?.length)missing.push('ranking del universo');
    if(scope==='initial'&&!fundPortfolioRows?.length&&!fundProposalState?.rows?.length)missing.push('cartera modelo u origen manual');
    if(scope==='individual'&&tool==='main'&&!loadedPortfolio?.portfolioData?.length)missing.push('Maestro con históricos posis/prices o cartera Yahoo');
    if(scope==='individual'&&tool==='scoring'&&!fundPortfolioRows?.length)missing.push('cartera modelo');
    if(scope==='individual'&&tool==='scoring'&&!fundUniverseState?.records?.length)missing.push('ranking del universo');
    if(scope==='individual'&&tool==='funds'&&!fundUniverseState?.records?.length)missing.push('ranking del universo');
    if(scope==='individual'&&tool==='funds'&&!Object.keys(loadedPortfolio?.priceSeries||{}).length)missing.push('Maestro con históricos posis/prices o cartera Yahoo');
    if(scope==='individual'&&tool==='assets'&&!loadedPortfolio?.portfolioData?.length)missing.push('Maestro con históricos posis/prices o cartera Yahoo');
    if(scope==='aggregate'&&!aggregatePositionsState.rows.length)missing.push('posiciones agregadas');
    if(scope==='aggregate'&&tool==='massive'&&!Object.keys(loadedPortfolio?.priceSeries||{}).length)missing.push('Maestro con históricos posis/prices');
    if(scope==='model'&&!GdcModel.state.models.length)missing.push('Excel GDC en Carga de datos');
    if(scope==='comparison'&&!PortfolioCompare.state.sources.some(Boolean))return 'Añade una cartera Excel, un activo Yahoo o una cartera Yahoo para iniciar la comparativa.';
    return missing.length?`Para completar esta vista, carga: ${missing.join(' y ')}.`:'';
}
function portfolioCalculationSettings() {
    const value = (id, fallback) => document.getElementById(id)?.value ?? fallback;
    return { rebalance: value('portfolioRebalance', 'period'), costBps: Number(value('portfolioCostBps', 0)), riskFreeAnnual: Number(value('portfolioRiskFree', 0)) / 100, currency: value('portfolioBaseCurrency', 'EUR'), pricesInBase: document.getElementById('portfolioPricesInBase')?.checked || false, frequencyOverride: value('portfolioDataFrequency','auto'), simulation: { method:value('mcMethod','normal'), seed:Number(value('mcSeed',12345)), initialShock:Number(value('mcStress',0)) } };
}
function portfolioHistoryStale() {
    if (!loadedPortfolio?.calculationSettings) return false;
    const current = portfolioCalculationSettings();
    return ['rebalance','costBps','currency','pricesInBase','frequencyOverride'].some(key => !(key==='pricesInBase'&&loadedPortfolio.priceSource==='yahoo')&&current[key] !== loadedPortfolio.calculationSettings[key]);
}
function openYahooPortfolioAnalysis(){
    if(!loadedPortfolio?.analysisReady){document.getElementById('portfolioNotice').textContent='Carga y analiza la cartera Yahoo antes de abrir el análisis individual.';return;}
    switchSection('individual');document.querySelector('[data-individual-mode="single"]')?.click();
}
async function portfolioConvertCurrencies(seriesMap, entries, start, end) {
    const settings = portfolioCalculationSettings();
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
    EfficientFrontierView.invalidateIfChanged();
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
        document.getElementById('workspaceContext').textContent=w.scope==='model'?'GDC/GICI · carteras modelo · revisión mensual':'Comparativa de carteras · históricos comunes';
        document.getElementById('workspaceQuality').hidden=false;
        document.getElementById('workspaceQuality').textContent=w.scope==='model'?`Universo: ${fundUniverseState?.records?.length||0} fondos · Modelos: ${GdcModel.state.models.length} · Historicos: segun cobertura disponible.`:'Las series se comparan en fechas comunes y con los mismos supuestos de rebalanceo y costes.';
        setTimeout(()=>window.dispatchEvent(new Event('resize')),50);
        return;
    }
    const steps = w.scope === 'initial' ? ['proposal','metrics','rates','report'] : w.scope === 'individual' ? ['diagnosis','frontier','report'] : w.scope === 'screener' ? ['diagnosis'] : ['diagnosis','report'];
    if (!steps.includes(w.step)) w.step = steps[0];
    if (w.scope === 'screener') w.tool = 'screener';
    document.querySelectorAll('[data-workspace-panel]').forEach(el => el.hidden = true);
    const show = id => { const el = document.getElementById(id); if (el) { el.hidden = false; el.classList.remove('hidden'); } };
    if(w.scope==='individual'&&w.step==='diagnosis'&&['main','yahoo'].includes(w.tool))show('workspaceIndividualSetup');
    if (w.step === 'diagnosis') show(w.tool === 'aggregate' ? 'workspaceAggregate' : `portfolioSubtabContent-${w.tool}`);
    if (w.step === 'proposal' && w.scope === 'initial') show('workspaceProposal');
    if (w.step === 'metrics' && w.scope === 'initial') show('workspaceUniverseMetrics');
    if (w.step === 'frontier' && w.scope === 'individual') {show('workspaceIndividualFrontier');EfficientFrontierView.benchmarks();}
    if (w.step === 'rates' && w.scope === 'initial') show('workspaceInitialRates');
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
        if (b.dataset.workspaceStep === 'frontier') b.textContent = '02 Riesgo y rentabilidad';
        if (b.dataset.workspaceStep === 'rates') b.textContent = '03 Sensibilidad tipos';
        if (b.dataset.workspaceStep === 'report') b.textContent = w.scope === 'initial' ? '04 Informe' : w.scope==='individual'?'03 Informe':'02 Informe';
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
    if(w.scope==='initial'&&w.step==='rates')renderInitialRateSensitivity();
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
    shell.querySelector('.workspace-scope').insertAdjacentHTML('beforeend','<button data-workspace-scope="model">GDC/GICI · Cartera modelo</button>');
    shell.querySelector('.workspace-scope').insertAdjacentHTML('beforeend','<button data-workspace-scope="comparison">Comparativa de carteras</button>');
    shell.insertAdjacentHTML('beforeend','<section id="workspaceInitialReports" class="workspace-panel" data-workspace-panel></section>');
    shell.querySelector('[data-workspace-step="report"]').insertAdjacentHTML('beforebegin','<button data-workspace-step="metrics">02 Comparativa universo</button>');
    shell.querySelector('[data-workspace-step="report"]').insertAdjacentHTML('beforebegin','<button data-workspace-step="frontier">03 Riesgo y rentabilidad</button>');
    shell.querySelector('[data-workspace-step="report"]').insertAdjacentHTML('beforebegin','<button data-workspace-step="rates">03 Sensibilidad tipos</button>');
    const ratesPanel=document.createElement('section');ratesPanel.id='workspaceInitialRates';ratesPanel.className='workspace-panel initial-rates';ratesPanel.dataset.workspacePanel='';ratesPanel.innerHTML='<h3>Sensibilidad de renta fija: tipos y crédito</h3><div class="workspace-settings"><label>Importe total de cartera<input id="initialRateAmount" type="number" min="0" step="1000" placeholder="Importe"></label><label>Peso de renta fija (%)<input id="initialRateWeight" type="number" min="0" max="100" step="0.1" placeholder="0–100"></label><label>Duración modificada / tipos de RF (años)<input id="initialRateDuration" type="number" min="0" max="100" step="0.1" placeholder="Años"></label><label>Escenario adicional (pb)<input id="initialRateCustom" type="number" min="-1000" max="1000" step="25" placeholder="Opcional"></label></div><p id="initialRateStatus" class="workspace-status" role="status"></p><div id="initialRateScenarioChart" class="initial-rate-chart"></div><div class="proposal-chart-scroll"><table class="wide-report-table initial-rate-table"><thead><tr><th>Movimiento de tipos</th><th>RF (%)</th><th>Impacto RF</th><th>Cartera (%)</th><th>Valor estimado</th></tr></thead><tbody id="initialRateBody"></tbody></table></div><p class="workspace-context">ΔPrecio RF ≈ − duración modificada × Δrentabilidad exigida. Se aplica al importe de RF; el resto de la cartera se mantiene constante. Escenario paralelo e instantáneo, sin convexidad, cupones, cambios de diferenciales, divisa ni reacción de otros activos. Para movimientos grandes o bonos con opciones, la aproximación puede desviarse.</p>';root.append(ratesPanel);
    ratesPanel.querySelector('.workspace-context').id='initialRateMethod';
    ratesPanel.querySelector('#initialRateCustom').closest('label').remove();
    ratesPanel.querySelector('.workspace-settings').insertAdjacentHTML('beforeend','<label>Spread duration (años)<input id="initialSpreadDuration" type="number" min="0" max="100" step="0.1" placeholder="Sin dato"></label><label>Shock tipos (pb)<input id="initialRateShock" type="number" min="-2000" max="2000" step="25" value="50"></label><label>Shock spreads (pb)<input id="initialSpreadShock" type="number" min="-2000" max="2000" step="25" value="50"></label><label>YTM anual (%)<input id="initialRateYtm" type="number" step="0.01" placeholder="Opcional"></label><label>Horizonte (meses)<input id="initialRateHorizon" type="number" min="1" max="120" step="1" value="12"></label><label><input id="initialRateCarry" type="checkbox"> Incluir carry/TIR</label>');
    ratesPanel.querySelector('.workspace-settings').insertAdjacentHTML('beforebegin','<div class="workspace-settings"><label>Modo<select id="initialRateMode"><option value="aggregate">RF agregada</option><option value="positions">Posición por posición</option></select></label><button type="button" id="initialRateImport">Cargar RF del origen</button></div><div id="initialRatePositionSection" hidden><p id="initialRateCoverage" class="workspace-status">Carga origen y revisa duración y crédito por posición.</p><div class="proposal-chart-scroll"><table class="wide-report-table"><thead><tr><th>ISIN / fondo</th><th>Peso cartera</th><th>Duración tipos</th><th>Spread duration</th><th>YTM (%)</th><th>Fuente</th><th>Tipos €</th><th>Crédito €</th></tr></thead><tbody id="initialRatePositionsBody"></tbody></table></div></div>');
    ratesPanel.dataset.rateAudience='client';
    ratesPanel.querySelector('.workspace-settings').insertAdjacentHTML('afterbegin','<label>Vista<select id="initialRateAudience"><option value="client">Cliente</option><option value="analyst">Analista</option></select></label>');
    ratesPanel.querySelector('#initialRateAmount').closest('label').insertAdjacentHTML('afterend','<label>Valor de renta fija<input id="initialRateRfAmount" type="number" min="0" step="1000" placeholder="Calculado desde peso"></label>');
    ratesPanel.querySelector('#initialRateAudience').addEventListener('change',event=>{ratesPanel.dataset.rateAudience=event.target.value;});
    ratesPanel.querySelector('#initialRateImport').addEventListener('click',()=>{ratesPanel.querySelector('#initialRateMode').value='positions';ratesPanel.querySelector('#initialRatePositionSection').hidden=false;importInitialRatePositions();});
    ratesPanel.querySelector('#initialRateMode').addEventListener('change',event=>{ratesPanel.querySelector('#initialRatePositionSection').hidden=event.target.value!=='positions';if(event.target.value==='positions'){ratesPanel.dataset.rateAudience='analyst';ratesPanel.querySelector('#initialRateAudience').value='analyst';if(!initialRatePositions.length)importInitialRatePositions();}});
    ratesPanel.addEventListener('input',event=>{const id=event.target.id,amount=Number(ratesPanel.querySelector('#initialRateAmount').value);if(['initialRateAmount','initialRateWeight','initialRateRfAmount'].includes(id)&&ratesPanel.querySelector('#initialRateMode').value==='aggregate'&&amount>0){if(id==='initialRateRfAmount'){const rf=Number(event.target.value);ratesPanel.querySelector('#initialRateWeight').value=event.target.value===''?'':Number((rf/amount*100).toFixed(6));}else{const weight=Number(ratesPanel.querySelector('#initialRateWeight').value);ratesPanel.querySelector('#initialRateRfAmount').value=ratesPanel.querySelector('#initialRateWeight').value===''?'':Number((amount*weight/100).toFixed(4));}}if(id==='initialRateAmount'&&ratesPanel.querySelector('#initialRateMode').value==='positions')updateInitialRatePositionMetrics();if(!event.target.matches('[data-rate-position]'))return;const row=initialRatePositions[Number(event.target.dataset.ratePosition)],value=event.target.value.trim();if(row){row[event.target.dataset.rateField]=value===''?NaN:Number(value);row.source='Manual (sesión)';}updateInitialRatePositionMetrics();});
    ratesPanel.querySelector('.initial-rate-table thead tr').innerHTML='<th>Escenario (tipos / spread)</th><th>Tipos RF</th><th>Crédito RF</th><th>Carry RF</th><th>Impacto RF</th><th>Impacto cartera</th>';
    ratesPanel.querySelector('#initialRateStatus').insertAdjacentHTML('afterend','<p id="initialRateExecutive" class="workspace-context"></p>');
    ratesPanel.querySelector('#initialRateExecutive').insertAdjacentHTML('afterend','<div class="rate-advanced"><h4>Escenarios de análisis</h4><div class="proposal-chart-scroll"><table class="wide-report-table"><thead><tr><th>Activo</th><th>Nombre</th><th>Tipos (pb)</th><th>Spread (pb)</th></tr></thead><tbody id="initialRateScenarioEditor"></tbody></table></div><button type="button" id="initialRateResetScenarios">Restablecer escenarios</button></div>');
    ratesPanel.querySelector('#initialRateResetScenarios').closest('.rate-advanced').insertAdjacentHTML('afterend','<div class="rate-advanced"><h4>Comparación de sensibilidad: cartera ajustada</h4><div class="workspace-settings"><label>RF propuesta (%)<input id="initialRateAdjustedWeight" type="number" min="0" max="100" step="0.1" placeholder="0–100"></label><label>Duración tipos propuesta<input id="initialRateAdjustedDuration" type="number" min="0" step="0.1" placeholder="Años"></label><label>Spread duration propuesta<input id="initialRateAdjustedSpread" type="number" min="0" step="0.1" placeholder="Años"></label><label>YTM propuesta (%)<input id="initialRateAdjustedYtm" type="number" step="0.01" placeholder="Si hay carry"></label></div><p id="initialRateAdjustedResult" class="workspace-context"></p></div>');
    renderInitialRateScenarioEditor();
    ratesPanel.querySelector('#initialRateResetScenarios').addEventListener('click',()=>{initialRateScenarios=defaultRateScenarios();renderInitialRateScenarioEditor();renderInitialRateSensitivity();});
    ratesPanel.addEventListener('change',event=>{const input=event.target.closest('[data-rate-scenario]');if(!input)return;const row=initialRateScenarios[Number(input.dataset.rateScenario)],field=input.dataset.rateScenarioField;if(!row)return;const value=field==='enabled'?input.checked:field==='name'?input.value.trim():input.value===''?NaN:Number(input.value);if(['rate','spread'].includes(field)&&(!Number.isFinite(value)||Math.abs(value)>2000)){ratesPanel.querySelector('#initialRateStatus').textContent='El shock debe estar entre -2000 y +2000 pb.';return;}row[field]=value;renderInitialRateSensitivity();});
    ratesPanel.querySelector('#initialRateStatus').insertAdjacentHTML('afterend','<div class="workspace-tools"><button type="button" data-rate-export="xlsx"><i class="fa-solid fa-file-excel" aria-hidden="true"></i> Descargar Excel</button><button type="button" data-rate-export="pdf"><i class="fa-solid fa-file-pdf" aria-hidden="true"></i> Descargar PDF</button></div>');
    ratesPanel.addEventListener('click',event=>{const button=event.target.closest('[data-rate-export]');if(!button)return;exportInitialRateSensitivity(button.dataset.rateExport).catch(error=>{ratesPanel.querySelector('#initialRateStatus').textContent=error.message;});});
    ratesPanel.querySelector('#initialRateScenarioChart').insertAdjacentHTML('afterend','<div class="rate-visual-grid"><div id="initialRateCurve"></div><div id="initialSpreadCurve"></div><div id="initialCombinedHeat"></div><div id="initialRateWaterfall"></div></div>');
    ratesPanel.querySelector('#initialRateScenarioChart').insertAdjacentHTML('beforebegin','<section class="rate-simple"><h4>Sensibilidad simple a tipos</h4><p class="workspace-context">Shock paralelo e instantáneo; muestra solo el efecto de duración modificada en RF. Sin diferenciales, carry ni cambios en el resto de la cartera.</p><div id="initialSimpleRateChart" class="initial-rate-chart"></div><div class="proposal-chart-scroll"><table class="wide-report-table"><thead><tr><th>Movimiento tipos</th><th>RF (%)</th><th>Impacto RF (EUR)</th><th>Cartera (%)</th><th>Valor estimado</th></tr></thead><tbody id="initialSimpleRateBody"></tbody></table></div></section>');
    ratesPanel.querySelector('#initialRateMethod').textContent='Estimación de primer orden: tipos y spreads se modelan por separado en pb; el resto de activos permanece constante. La duración modificada mide sensibilidad al rendimiento propio y puede diferir de la duración frente a la curva libre de riesgo; verifica esta aproximación en crédito y bonos con opciones. El carry, si se activa, es YTM anual × meses/12 y no es una rentabilidad garantizada. No se incluyen convexidad, cupones, impagos, liquidez, divisa ni reacción de otros activos. Los escenarios son hipótesis, no previsiones.';
    ratesPanel.addEventListener('input',renderInitialRateSensitivity);
    window.addEventListener('resize',()=>{if(ratesPanel.hidden)return;for(const chart of ratesPanel.querySelectorAll('.js-plotly-plot'))requestAnimationFrame(()=>Plotly.Plots.resize(chart));});
    const frontierPanel=document.createElement('section');frontierPanel.id='workspaceIndividualFrontier';frontierPanel.className='workspace-panel initial-frontier';frontierPanel.dataset.workspacePanel='';root.append(frontierPanel);EfficientFrontierView.init(frontierPanel);
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
    importGrid.classList.remove('xl:grid-cols-3');importGrid.firstElementChild.classList.remove('xl:col-span-2');
    const portfolioInfo=document.getElementById('portfolioInfo');individualSetup.append(portfolioInfo);
    importGrid.querySelector('h3').textContent='Formato alternativo de cartera';
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
    const giciInput=document.getElementById('giciPriorFile');
    const giciCard=document.createElement('div');giciCard.className='min-w-0 border border-slate-200 bg-slate-50 p-3';
    giciCard.innerHTML='<div class="text-[11px] uppercase font-bold text-slate-500">GICI · comité mensual</div><div id="scoringDataStatus-gici" role="status" aria-live="polite" class="text-sm font-bold text-slate-800 mt-2 break-words">Pendiente</div><label class="inline-flex items-center gap-1 mt-3 px-3 py-2 bg-blue-700 text-white rounded text-xs font-bold cursor-pointer"><i class="fa-solid fa-file-excel" aria-hidden="true"></i>Subir Excel</label>';
    giciCard.querySelector('label').append(giciInput);giciInput.hidden=true;giciInput.style.display='none';
    upload.querySelector('.grid').append(giciCard);
    const masterCard=document.getElementById('fundPortfolioFileInput').closest('.min-w-0');
    masterCard.querySelector('div').textContent='Maestro · cartera individual';
    masterCard.querySelector('[id="scoringDataStatus-portfolio"]').insertAdjacentHTML('afterend','<p class="workspace-master-note">ISIN y peso para scoring; posis/prices, bench y bench categ para históricos y comparativas.</p><p id="masterHistoryStatus" class="workspace-master-note" role="status">Históricos pendientes</p>');
    const basePricesLabel=document.getElementById('portfolioPricesInBase').closest('label');
    basePricesLabel.classList.add('workspace-master-base');basePricesLabel.title='Necesario para calcular históricos propios del Maestro sin convertir divisa dos veces.';
    masterCard.append(basePricesLabel);
    const frequencyLabel=document.getElementById('portfolioDataFrequency').closest('div');
    frequencyLabel.classList.add('workspace-master-frequency');masterCard.append(frequencyLabel);
    const alternate=document.createElement('details');alternate.className='workspace-master-alternate';alternate.innerHTML='<summary>Otro formato: backtest o evolución real</summary>';
    alternate.append(importGrid);masterCard.append(alternate);
    upload.querySelector('.grid').classList.replace('xl:grid-cols-5','xl:grid-cols-4');
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
    root.addEventListener('input', event => { if (!event.target.closest('[data-compact-fund-panel],#portfolioSubtabContent-screener,#assetAllocationWeights,.initial-metric-input,.aggregate-score-input,#workspacePortfolioCompare,#workspaceModel,#workspaceInitialRates')) { invalidatePortfolioReports(); portfolioWorkflowRefresh(); } });
    const originalScoring=window.runFundScoringAnalysis;
    window.runFundScoringAnalysis=(...args)=>PortfolioLoading.track(originalScoring(...args));
    for (const name of ['importFundUniverseFile','importApprovedFundsFile','importFundScoringPortfolioFile','importAggregatePositionsFile','importAssetClassScreenerFile','importPortfolioExcel']) {
        const original = window[name]; window[name] = async (...args) => { invalidatePortfolioReports(); try { return await PortfolioLoading.run(async()=>{const result=await original(...args);if(['importPortfolioExcel','importFundScoringPortfolioFile'].includes(name)&&portfolioAnalysisPromise)await portfolioAnalysisPromise;await PortfolioLoading.settled();await PortfolioLoading.phase(90,'Actualizando estado de las vistas…');if(['importPortfolioExcel','importFundScoringPortfolioFile'].includes(name))GdcModel.render();portfolioWorkflowRefresh();return result;}); } catch(error) { alert(error.message); } };
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
