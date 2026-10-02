const GdcModel=(()=>{
    const core=ModelPortfolioCore;
    const state={models:[],selected:0,source:'',benchmarks:{},benchmarkMeta:{},prices:{},fundNames:{},maxTe:NaN,historyComparable:false,reportHtml:'',history:[],historyHtml:''};
    let panel,peerIndex,peerSource,rankingCache=new Map(),universeCache=new Map(),rankSource,renderedAllocation='';
    const esc=value=>escapeHtml(String(value??''));
    const fmt=value=>Number.isFinite(value)?value.toFixed(2):'-';
    const profileLabel=name=>({'muy_conservador':'Muy cons.','prudente':'Prudente','equilibrado':'Equilibr.','decidido':'Decidido','muy_arriesgado':'Muy arr.'})[core.profile(name)]||String(name).replace(/^Cartera estrat[eé]gica\s*/i,'').slice(0,14);
    const metricPct=value=>Number.isFinite(value)?`${fmt(value)}%`:'-';
    const pct=value=>Number.isFinite(value)?`${(value*100).toFixed(2)}%`:'Pendiente';
    function invalidateReport(){state.reportHtml='';state.history=[];state.historyHtml='';const preview=panel?.querySelector('#gdcReportPreview');if(preview)preview.textContent='Datos modificados. Genera un nuevo informe.';}
    function model(){return state.models[state.selected];}
    function records(){return fundUniverseState?.records||[];}
    function shortlist(row){
        const source=records();if(source!==rankSource){rankSource=source;rankingCache.clear();universeCache.clear();peerIndex=null;}
        const key=row.subcategories.map(core.key).join('|');if(!rankingCache.has(key))rankingCache.set(key,core.rank(source,row.subcategories));
        return rankingCache.get(key);
    }
    function categoryUniverse(row){
        const source=records();if(source!==rankSource){rankSource=source;rankingCache.clear();universeCache.clear();peerIndex=null;}
        const key=row.subcategories.map(core.key).join('|');if(!universeCache.has(key))universeCache.set(key,core.fullRank(source,row.subcategories));
        return universeCache.get(key);
    }
    function record(isin){return fundUniverseState?.isinIndex?.get(isin)||null;}
    function fundName(isin){return state.fundNames[normalizeIsin(isin)]||record(isin)?.name||'';}
    function benchmarkInfo(ticker){
        const key=String(ticker||'').toUpperCase(),source=Object.keys(state.benchmarkMeta).length?state.benchmarkMeta:loadedPortfolio?.benchCategories||{};
        const found=Object.entries(source).find(([name])=>name.toUpperCase()===key)?.[1]||{};
        return {ticker:key,name:found.name||key,category:found.assetClass||found.category||''};
    }
    function peers(fund){if(!fund)return null;if(!peerIndex||peerSource!==records()){peerSource=records();peerIndex=PeerValue.index(peerSource);}return PeerValue.compare(fund,peerIndex);}
    function categoryBenchmarks(){return core.benchmarkIndex(Object.keys(state.benchmarkMeta).length?state.benchmarkMeta:loadedPortfolio?.benchCategories||{});}
    function benchmarkTickers(row){
        const index=categoryBenchmarks(),generic=core.key(row.generic);
        if(index.has(generic))return index.get(generic);
        const compact=value=>core.key(value).replace(/[^a-z0-9]/g,'');
        const variants=[...index].filter(([category])=>compact(category)===compact(generic));
        if(variants.length===1)return variants[0][1];
        return row.subcategories.flatMap(category=>index.get(core.key(category))||[]);
    }
    function benchmarkNames(row){const metadata=Object.keys(state.benchmarkMeta).length?state.benchmarkMeta:loadedPortfolio?.benchCategories||{};
        return [...new Set(benchmarkTickers(row).map(ticker=>`${metadata[ticker]?.name||ticker} (${ticker})`))];
    }
    function allocation(){return core.allocation(model());}
    function fundHistories(){return {...Object.fromEntries(Object.entries(loadedPortfolio?.priceSeries||{}).map(([key,item])=>[key.toUpperCase(),item.data||item])),...state.prices};}
    function positions(row,side){
        const source=side==='current'||row.keepCurrent?row.currentPositions:row.proposedPositions;
        return (source||[]).map(item=>({...item,weight:row.portfolioWeight*item.share/100,fund:record(item.isin)}));
    }
    function effectiveRows(){return (model()?.rows||[]).map(row=>({...row,current:positions(row,'current'),proposed:positions(row,'proposed')}));}
    function proposalRows(rows=effectiveRows()){
        return rows.flatMap(row=>row.proposed.filter(item=>item.weight>0).map(item=>({generic:row.generic,weight:item.weight,selectedIsin:item.isin,selected:item.fund,benchmark:benchmarkTickers(row)[0]||''})));
    }
    function teResult(){
        if(Math.abs(allocation().portfolioTotal-100)>.05)return {value:NaN,reason:'Los pesos de la cartera no suman 100%.'};
        const rows=effectiveRows().filter(row=>row.portfolioWeight>0),flat=proposalRows(rows);
        if(rows.some(row=>!row.proposed.length))return {value:NaN,reason:'Faltan propuestas en categorias con peso.'};
        if(flat.some(row=>!row.selected))return {value:NaN,reason:'Hay fondos propuestos sin match en el universo.'};
        return core.trackingError(flat,fundHistories(),{...loadedPortfolio?.benchmarks,...state.benchmarks});
    }
    function coverage(rows,key){return FinanceCore.weighted(rows.flatMap(row=>row.proposed.map(item=>({weight:item.weight,[key]:item.fund?.[key]}))),key);}
    function statusText(rows){
        const values=allocation(),selected=rows.flatMap(row=>row.proposed).filter(item=>item.fund&&item.weight>0).length,te=teResult();
        const limit=state.maxTe;
        const teText=Number.isFinite(te.value)?`Tracking error ${pct(te.value)} (${te.months} cierres mensuales comunes)`:`Tracking error pendiente: ${te.reason}`;
        const verdict=!state.historyComparable?'Comparabilidad de divisa y series sin confirmar.':Number.isFinite(te.value)&&Number.isFinite(limit)?te.value<=limit?'Dentro del limite configurado.':'Supera el limite configurado.':'Sin validacion de limite.';
        const band=values.band?`Banda RV ${values.band[0]}–${values.band[1]}% · neutral ${values.neutral.toFixed(2)}% · cartera ${values.portfolioRv.toFixed(2)}%${values.portfolioRv<values.band[0]-1e-6||values.portfolioRv>values.band[1]+1e-6?' (FUERA DE BANDA)':' (dentro de banda)'}.`:'Perfil sin banda RV asignada.';
        const neutralNote=values.band&&Math.abs(values.benchmarkRv-values.neutral)>.05?` La RV del benchmark (${values.benchmarkRv.toFixed(2)}%) no coincide con el punto neutral; revisa el Excel y la clasificación de categorías.`:'';
        const unknown=values.unknown.length?` Clasifica RV/RF/Otros: ${values.unknown.join(', ')}.`:'';
        return `${rows.length} categorias · ${selected} fondos identificados · benchmark ${values.benchmarkTotal.toFixed(2)}% · cartera ${values.portfolioTotal.toFixed(2)}%. ${band}${neutralNote}${unknown} ${teText}. ${verdict}`;
    }
    function loadWorkbook(workbook,fileName){
        const sheet=findSheet(workbook,['Carteras Modelo']);if(!sheet)return false;
        const grid=XLSX.utils.sheet_to_json(workbook.Sheets[sheet],{header:1,defval:null,raw:true});
        state.models=core.parseGrid(grid);state.selected=0;state.source=fileName;state.historyComparable=false;state.fundNames={};
        const comparable=panel?.querySelector('#gdcComparable');if(comparable)comparable.checked=false;
        state.benchmarkMeta=benchmarkCategorySheetToMap(workbook,findSheet(workbook,['bench categ','bench category','benchmark categ']));
        if(!Object.keys(state.benchmarkMeta).length)state.benchmarkMeta=loadedPortfolio?.benchCategories||{};
        state.benchmarks=benchmarkSheetToSeriesMap(workbook,findSheet(workbook,['bench','benchmark','benchmarks']));
        state.prices=Object.fromEntries(Object.entries(benchmarkSheetToSeriesMap(workbook,findSheet(workbook,['prices','precios','historicos','historico','posis']))).map(([key,value])=>[key.toUpperCase(),value.data]));
        if(findSheet(workbook,['Asignacion'])||findSheet(workbook,['GDC Estado']))loadPriorWorkbook(workbook);
        else {invalidateReport();render();}
        return true;
    }
    function select(index,isin,slot=0){
        const row=model()?.rows[index];if(!row)return;
        const value=normalizeIsin(isin);if(value&&row.proposedPositions.some((item,i)=>item.isin===value&&i!==slot)){panel.querySelector('#gdcStatus').textContent='Ese ISIN ya esta en la categoria.';return;}
        const refreshHistory=state.history.length>0;
        if(!row.proposedPositions[slot])row.proposedPositions.push({isin:'',share:100});
        row.proposedPositions[slot].isin=value;row.keepCurrent=false;invalidateReport();render();if(refreshHistory)runHistory();
    }
    function current(index,value){
        const row=model()?.rows[index];if(!row)return;
        const isins=String(value).split(/[;,\s]+/).map(normalizeIsin).filter(Boolean);
        row.currentPositions=core.equalPositions(isins);if(row.keepCurrent)row.proposedPositions=row.currentPositions.map(item=>({...item}));invalidateReport();setTimeout(render,0);
    }
    function addPosition(index){
        const row=model()?.rows[index];if(!row)return;
        const used=new Set(row.proposedPositions.map(item=>item.isin)),next=categoryUniverse(row).find(item=>!used.has(item.isin));
        if(!next){panel.querySelector('#gdcStatus').textContent='No quedan fondos de esta categoria en el universo.';return;}
        row.proposedPositions=core.equalPositions([...row.proposedPositions.map(item=>item.isin),next.isin]);row.keepCurrent=false;invalidateReport();render();
    }
    function removePosition(index,slot){const row=model()?.rows[index];if(!row)return;row.proposedPositions.splice(slot,1);row.proposedPositions=core.normalizePositions(row.proposedPositions);row.keepCurrent=false;invalidateReport();render();}
    function positionWeight(index,slot,value){
        const row=model()?.rows[index];if(!row)return;
        try{row.proposedPositions=core.setShare(row.proposedPositions,slot,Number(String(value).replace(',','.')));row.keepCurrent=false;invalidateReport();render();}
        catch(error){panel.querySelector('#gdcStatus').textContent=error.message;}
    }
    function keepCurrent(index,enabled){
        const row=model()?.rows[index];if(!row)return;
        row.keepCurrent=enabled;if(enabled&&row.currentPositions.length)row.proposedPositions=row.currentPositions.map(item=>({...item}));
        invalidateReport();render();
    }
    function portfolioWeight(index,value){
        const row=model()?.rows[index],weight=Number(String(value).replace(',','.'));
        if(!row||!Number.isFinite(weight)||weight<0||weight>100){panel.querySelector('#gdcStatus').textContent='El peso de cartera debe estar entre 0% y 100%.';return;}
        row.portfolioWeight=weight;invalidateReport();render();
    }
    function normalizeAllocation(){
        const rows=model()?.rows||[],total=rows.reduce((sum,row)=>sum+row.portfolioWeight,0);
        if(!(total>0)){panel.querySelector('#gdcStatus').textContent='Introduce pesos positivos antes de normalizar.';return;}
        rows.forEach(row=>row.portfolioWeight=row.portfolioWeight/total*100);invalidateReport();render();
    }
    function populateUniverse(select,query=''){
        const [index,slot]=select.dataset.gdcUniverse.split(':').map(Number),row=model()?.rows[index];if(!row)return;
        const selected=row.proposedPositions[slot]?.isin||'',needle=String(query).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
        const matches=categoryUniverse(row).filter(fund=>!needle||`${fund.isin} ${fund.name||''}`.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(needle)).slice(0,80);
        const fragment=document.createDocumentFragment();fragment.append(new Option(needle?'Resultados · elegir fondo':'Universo · buscar o elegir',''));
        if(selected&&!matches.some(fund=>fund.isin===selected)){const fund=record(selected);fragment.append(new Option(`${selected} · ${fund?.name||'-'} (selección actual)`,selected));}
        for(const fund of matches)fragment.append(new Option(`${fund.isin} · ${fund.name||'-'} · ${fund.category||'-'} · TER ${fmt(fund.ter)}% · score ${fmt(fund.score)}`,fund.isin));
        select.replaceChildren(fragment);select.value=selected&&[...select.options].some(option=>option.value===selected)?selected:'';
    }
    function rowHtml(row,index){
        const options=shortlist(row),proposed=positions(row,'proposed'),currentFunds=positions(row,'current');
        const list=options.map((item,i)=>`<tr><td>${i+1}</td><td>${esc(item.name)}<br><small>${esc(item.isin)}</small></td><td>${QualityCore.withTechnical(item.score,true)}</td><td>${fmt(item.ter)}%</td><td>${fmt(item.ret5)}%</td><td>${fmt(item.risk5)}%</td></tr>`).join('');
        const slots=row.proposedPositions.length?row.proposedPositions:[{isin:'',share:100}];
        const controls=slots.map((item,slot)=>{
            const top=options.map((fund,i)=>`<option value="${esc(fund.isin)}" ${fund.isin===item.isin?'selected':''}>${i+1}. ${esc(fund.isin)} · ${esc(fund.name)} · ${esc(fund.category)} · TER ${fmt(fund.ter)}%</option>`).join('');
            const outside=item.isin&&!options.some(fund=>fund.isin===item.isin)?`<option value="${esc(item.isin)}" selected>${esc(item.isin)} · ${esc(record(item.isin)?.name||'Fuera del top 5')}</option>`:'';
            return `<div class="gdc-proposal-line"><span class="gdc-proposal-number">${slot+1}</span><div><select aria-label="Top 5 para ${esc(row.generic)}, fondo ${slot+1}" data-gdc-select="${index}:${slot}"><option value="">Top 5 · elegir fondo</option>${outside}${top}</select><input type="search" class="gdc-universe-search" data-gdc-universe-search="${index}:${slot}" aria-label="Buscar por ISIN o nombre en ${esc(row.generic)}" placeholder="Buscar ISIN o nombre en el universo"><select aria-label="Universo completo para ${esc(row.generic)}, fondo ${slot+1}" data-gdc-universe="${index}:${slot}"><option value="${esc(item.isin||'')}">${item.isin?`${esc(item.isin)} · ${esc(record(item.isin)?.name||'-')}`:'Universo · buscar o elegir'}</option></select></div><label>Dentro de categoría (%)<input type="number" min="0" max="100" step="0.01" value="${fmt(item.share)}" data-gdc-weight="${index}:${slot}" ${row.keepCurrent?'disabled':''}></label><button type="button" data-gdc-remove="${index}:${slot}" title="Quitar fondo" aria-label="Quitar fondo ${slot+1}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></div>`;
        }).join('');
        const currentTer=weightedMetric(currentFunds,'ter').value,currentScore=weightedMetric(currentFunds,'score').value;
        const info=proposed.map(item=>`<div>${esc(item.fund?.name||item.isin)}<br>${QualityCore.withTechnical(item.fund?.score,true)} · TER ${fmt(item.fund?.ter)}% · ${fmt(item.weight)}% cartera${Number.isFinite(currentTer)&&Number.isFinite(item.fund?.ter)?`<br><small>TER vs actual ${fmt(item.fund.ter-currentTer)} pp</small>`:''}${Number.isFinite(currentScore)&&Number.isFinite(item.fund?.score)?`<br><small>Score vs actual ${fmt(item.fund.score-currentScore)}</small>`:''}</div>`).join('');
        const peersHtml=proposed.map(item=>{const peer=peers(item.fund);return `<div>${esc(item.fund?.category||'-')}<br>Calidad ${fmt(peer?.meanScore)} · TER ${fmt(peer?.meanTer)}%</div>`;}).join('');
        return `<tr><td><b>${esc(row.generic)}</b><br><small>${row.subcategories.map(esc).join(' · ')}</small><select class="gdc-asset-type" data-gdc-asset-type="${index}" aria-label="Tipo de activo ${esc(row.generic)}"><option value="RV" ${row.assetType==='RV'?'selected':''}>RV</option><option value="RF" ${row.assetType==='RF'?'selected':''}>RF</option><option value="Otros" ${row.assetType==='Otros'?'selected':''}>Otros</option></select></td><td class="gdc-benchmark-name">${benchmarkNames(row).map(esc).join('<br>')||'Sin índice asociado'}</td><td>${fmt(row.weight)}%</td><td><input class="gdc-portfolio-weight" type="number" min="0" max="100" step="0.01" value="${fmt(row.portfolioWeight)}" data-gdc-portfolio-weight="${index}" aria-label="Peso de cartera ${esc(row.generic)}">%</td><td><textarea class="gdc-current" rows="${Math.max(2,Math.min(4,currentFunds.length))}" aria-label="ISIN actuales ${esc(row.generic)}" data-gdc-current="${index}" placeholder="Un ISIN por línea">${esc(currentFunds.map(item=>item.isin).join('\n'))}</textarea><small>${currentFunds.map(item=>`${esc(item.fund?.name||item.isin)} · ${fmt(item.share)}%`).join('<br>')}</small></td><td><label class="gdc-keep-current"><input type="checkbox" data-gdc-keep="${index}" ${row.keepCurrent?'checked':''} ${!currentFunds.length?'disabled':''}> Mantener posiciones actuales</label>${controls}<button type="button" data-gdc-add="${index}" ${row.keepCurrent?'disabled':''}><i class="fa-solid fa-plus" aria-hidden="true"></i> Añadir fondo</button><details><summary>Ver los 5 mejores</summary><table class="gdc-top-table"><thead><tr><th>#</th><th>Fondo</th><th>Calidad</th><th>TER</th><th>Ret 5A</th><th>Riesgo 5A</th></tr></thead><tbody>${list||'<tr><td colspan="6">Sin fondos scoreados para estas categorías.</td></tr>'}</tbody></table></details></td><td class="gdc-position-summary">${info||'-'}</td><td class="gdc-position-summary">${peersHtml||'-'}</td></tr>`;
    }
    function render(){
        if(!panel)return;const selected=model();
        if(rankSource&&rankSource!==records())invalidateReport();
        panel.querySelector('#gdcModels').innerHTML=state.models.map((item,index)=>`<option value="${index}" ${index===state.selected?'selected':''}>${esc(item.name)}</option>`).join('');
        panel.querySelector('#gdcSource').textContent=state.source?`Benchmark importado: ${state.source}`:'Importa el Excel de cartera modelo con la hoja Carteras Modelo.';
        panel.querySelector('#gdcControls').hidden=!selected;panel.querySelector('#gdcBody').innerHTML=selected?selected.rows.map(rowHtml).join(''):'';
        if(!selected)return;
        const values=allocation(),profileSelect=panel.querySelector('#gdcProfile');
        profileSelect.innerHTML='<option value="">Asignar perfil</option>'+[['muy_conservador','Muy Conservador'],['prudente','Prudente'],['equilibrado','Equilibrado'],['decidido','Decidido'],['muy_arriesgado','Muy Arriesgado']].map(([id,label])=>`<option value="${id}" ${selected.profile===id?'selected':''}>${label}</option>`).join('');
        const inBand=values.band&&values.portfolioRv>=values.band[0]-1e-6&&values.portfolioRv<=values.band[1]+1e-6;
        panel.querySelector('#gdcAllocationSummary').innerHTML=`<div><span>RV benchmark</span><strong>${fmt(values.benchmarkRv)}%</strong></div><div><span>RV cartera</span><strong>${fmt(values.portfolioRv)}%</strong></div><div><span>Banda permitida</span><strong>${values.band?`${values.band[0]}–${values.band[1]}%`:'Sin perfil'}</strong></div><div><span>Punto neutral</span><strong>${fmt(values.neutral)}%</strong></div><div><span>Estado</span><strong class="${values.band?(inBand?'good':'bad'):''}">${values.band?(inBand?'Dentro de banda':'Fuera de banda'):'Asignar perfil'}</strong></div><div><span>Total cartera</span><strong class="${Math.abs(values.portfolioTotal-100)>.05?'bad':''}">${fmt(values.portfolioTotal)}%</strong></div>`;
        const marker=panel.querySelector('#gdcRvMarker'),neutral=panel.querySelector('#gdcRvNeutral'),band=panel.querySelector('#gdcRvBand');
        marker.style.left=`${Math.max(0,Math.min(100,values.portfolioRv))}%`;marker.title=`Cartera: ${fmt(values.portfolioRv)}% RV`;
        neutral.hidden=!values.band;neutral.style.left=`${values.neutral}%`;
        band.hidden=!values.band;if(values.band){band.style.left=`${values.band[0]}%`;band.style.width=`${values.band[1]-values.band[0]}%`;}
        const rows=effectiveRows(),score=coverage(rows,'score'),ter=coverage(rows,'ter');
        const status=panel.querySelector('#gdcStatus'),te=teResult();
        status.textContent=`${statusText(rows)} Calidad ponderada ${fmt(score.value)} (cobertura ${(score.coverage*100).toFixed(0)}%); TER ponderado ${fmt(ter.value)}% (cobertura ${(ter.coverage*100).toFixed(0)}%).`;
        status.classList.toggle('gdc-te-breach',Boolean(te&&state.historyComparable&&Number.isFinite(te.value)&&Number.isFinite(state.maxTe)&&te.value>state.maxTe));
        status.classList.toggle('gdc-te-ok',Boolean(te&&state.historyComparable&&Number.isFinite(te.value)&&Number.isFinite(state.maxTe)&&te.value<=state.maxTe));
        const chartSignature=JSON.stringify({selected:state.selected,models:state.models.map(item=>({name:item.name,rows:item.rows.map(row=>[row.generic,row.weight,row.portfolioWeight,row.assetType])}))});
        if(window.Plotly&&chartSignature!==renderedAllocation){
            renderedAllocation=chartSignature;
            const active=rows.filter(row=>row.weight>0||row.portfolioWeight>0),names=active.map(row=>row.generic);
            FinancialVisuals.newPlot('gdcWeightChart',[{type:'bar',name:'Benchmark',meta:{financialRole:'proposal'},x:names,y:active.map(row=>row.weight)},{type:'bar',name:'Cartera',meta:{financialRole:'origin'},x:names,y:active.map(row=>row.portfolioWeight)}],{title:window.innerWidth<700?'Pesos por categoría':`Pesos por categoría · ${profileLabel(selected.name)}`,barmode:'group',yaxis:{title:'Peso (%)'},margin:{t:48,l:54,r:20,b:Math.max(95,Math.min(170,names.reduce((max,name)=>Math.max(max,name.length*5),0)))},legend:{orientation:'h',y:-.3}},{responsive:true});
            const deviations=active.map(row=>row.portfolioWeight-row.weight);
            FinancialVisuals.newPlot('gdcDeviationChart',[{type:'bar',name:'Sobreponderación',meta:{financialRole:'origin'},x:names,y:deviations.map(value=>value>0?value:null)},{type:'bar',name:'Infraponderación',meta:{financialRole:'proposal'},x:names,y:deviations.map(value=>value<0?value:null)}],{title:'Desviación frente al benchmark',barmode:'relative',yaxis:{title:'Puntos porcentuales',zeroline:true,zerolinecolor:'#435365'},margin:{t:48,l:54,r:20,b:Math.max(95,Math.min(170,names.reduce((max,name)=>Math.max(max,name.length*5),0)))},legend:{orientation:'h',y:-.3}},{responsive:true});
            const profiles=state.models.map(item=>profileLabel(item.name)),fullNames=state.models.map(item=>item.name),summaries=state.models.map(core.allocation);
            FinancialVisuals.newPlot('gdcProfileOverviewChart',[['RV','portfolioRv'],['RF','portfolioRf'],['Otros','portfolioOther']].map(([name,key])=>({type:'bar',name,x:profiles,y:summaries.map(item=>item[key]),customdata:fullNames,hovertemplate:'%{customdata}<br>'+name+': %{y:.2f}%<extra></extra>'})),{title:'Asignación RV / RF / Otros por perfil',barmode:'stack',yaxis:{title:'Peso (%)',range:[0,105]},xaxis:{tickfont:{size:10}},margin:{t:50,l:54,r:20,b:95},legend:{orientation:'h',y:-.3}},{responsive:true});
            const generics=[...new Set(state.models.flatMap(item=>item.rows.map(row=>row.generic)))];
            const categoryColors=['#1268a3','#13a89e','#8057a7','#df8842','#ce5871','#408d5e','#5376c5','#ae8f2c','#587f99','#a556a1','#287f87','#bb6547'];
            FinancialVisuals.newPlot('gdcCategoryOverviewChart',generics.map((name,index)=>({type:'bar',name,marker:{color:categoryColors[index%categoryColors.length]},x:profiles,y:state.models.map(item=>item.rows.find(row=>row.generic===name)?.portfolioWeight||0),customdata:fullNames,hovertemplate:'%{customdata}<br>'+name+': %{y:.2f}%<extra></extra>'})),{title:'Categorías genéricas por perfil',barmode:'stack',yaxis:{title:'Peso (%)',range:[0,105]},xaxis:{tickfont:{size:10}},margin:{t:50,l:54,r:20,b:Math.max(115,Math.min(210,90+generics.length*13))},legend:{orientation:'h',y:-.3}},{responsive:true});
        }
    }
    function exportExcel(){
        if(!state.models.length||!window.XLSX)return;
        const book=XLSX.utils.book_new(),date=new Date().toISOString().slice(0,10);
        const add=(name,grid)=>XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(grid),name);
        const original=state.models[0].rows;
        add('Carteras Modelo',[['Categoria','Subcategoria',...state.models.map(item=>item.name)],...original.map(row=>[row.generic,row.subcategories.join('; '),...state.models.map(item=>item.rows.find(candidate=>candidate.id===row.id)?.weight||0)])]);
        const summary=[['Comité GDC · benchmark frente a cartera'],['Fecha',date],['Barras: █ RV · ▒ RF · ░ Otros; cada símbolo representa aproximadamente 2 puntos porcentuales'],[],['Perfil','Banda RV','Neutral RV (%)','RV benchmark (%)','RV cartera (%)','RF cartera (%)','Otros cartera (%)','Peso total cartera (%)','Estado','RV / RF / Otros · cartera']];
        const allocationRows=[['Modelo','Categoria GDC','Peso benchmark (%)','Peso cartera (%)','Tipo activo','Perfil RV']];
        const monthly=[['Modelo','Categoria GDC','ISIN','Peso dentro categoria (%)','Peso categoria cartera (%)','Peso benchmark (%)','Fecha','Nombre fondo']];
        const usedNames=new Set(['resumen','carteras modelo','gdc estado','gdc nombres','asignacion']),profileSheets=[];
        const tabName=name=>{const base=String(name||'Perfil').replace(/[\\/?*\[\]:]/g,' ').trim().slice(0,26)||'Perfil';let candidate=base,n=2;while(usedNames.has(candidate.toLowerCase()))candidate=`${base.slice(0,26-String(n).length-1)} ${n++}`;usedNames.add(candidate.toLowerCase());return candidate;};
        state.models.forEach(portfolio=>{
            const values=core.allocation(portfolio),band=values.band,inside=band&&values.portfolioRv>=band[0]-1e-6&&values.portfolioRv<=band[1]+1e-6;
            const bar='█'.repeat(Math.round(values.portfolioRv/2))+'▒'.repeat(Math.round(values.portfolioRf/2))+'░'.repeat(Math.round(values.portfolioOther/2));
            summary.push([portfolio.name,band?`${band[0]}–${band[1]}%`:'Sin asignar',Number.isFinite(values.neutral)?values.neutral:'',values.benchmarkRv,values.portfolioRv,values.portfolioRf,values.portfolioOther,values.portfolioTotal,band?(inside?'Dentro de banda':'Fuera de banda'):'Sin perfil',bar]);
            const detail=[['Perfil',portfolio.name],['Fecha',date],['Fuente benchmark',state.source],['Banda RV',band?`${band[0]}–${band[1]}%`:'Sin asignar'],['Neutral RV (%)',Number.isFinite(values.neutral)?values.neutral:''],['RV benchmark (%)',values.benchmarkRv],['RV cartera (%)',values.portfolioRv],['Peso total cartera (%)',values.portfolioTotal],[],['Categoria GDC','Subcategorias Morningstar','Indice Morningstar','Tipo activo','Benchmark (%)','Cartera (%)','Desviacion (pp)','ISIN actual(es)','ISIN seleccionado','Fondo seleccionado','Peso dentro categoria (%)','Peso cartera fondo (%)','TER (%)','Score']];
            portfolio.rows.forEach(row=>{
                allocationRows.push([portfolio.name,row.generic,row.weight,row.portfolioWeight,row.assetType,portfolio.profile]);
                const selectedPositions=row.keepCurrent?row.currentPositions:row.proposedPositions;
                selectedPositions.filter(item=>item.isin).forEach(item=>monthly.push([portfolio.name,row.generic,item.isin,item.share,row.portfolioWeight,row.weight,date,fundName(item.isin)]));
                const entries=selectedPositions.length?selectedPositions:[{isin:'',share:0}];
                entries.forEach(item=>{const fund=record(item.isin);detail.push([row.generic,row.subcategories.join('; '),benchmarkNames(row).join('; '),row.assetType,row.weight,row.portfolioWeight,row.portfolioWeight-row.weight,row.currentPositions.map(position=>position.isin).join('; '),item.isin,fundName(item.isin),item.share,row.portfolioWeight*item.share/100,fund?.ter??'',fund?.score??'']);});
            });
            profileSheets.push([tabName(portfolio.name),detail]);
        });
        const categories=original.map(row=>row.generic);
        summary.push([],['Categorías genéricas · barra apilada por perfil'],['Leyenda',...categories.map((name,index)=>`${String.fromCharCode(65+index%26)} = ${name}`)],['Perfil','Barra apilada',...categories]);
        state.models.forEach(portfolio=>summary.push([portfolio.name,categories.map((name,index)=>String.fromCharCode(65+index%26).repeat(Math.round((portfolio.rows.find(row=>row.generic===name)?.portfolioWeight||0)/2))).join(''),...categories.map(name=>portfolio.rows.find(row=>row.generic===name)?.portfolioWeight||0)]));
        summary.push([],['Asignacion por categoria generica · benchmark frente a cartera'],['Perfil','Categoria','Tipo','Benchmark (%)','Cartera (%)','Desviacion (pp)','Barra cartera']);
        state.models.forEach(portfolio=>portfolio.rows.forEach(row=>summary.push([portfolio.name,row.generic,row.assetType,row.weight,row.portfolioWeight,row.portfolioWeight-row.weight,'█'.repeat(Math.round(row.portfolioWeight/2))])));
        add('Resumen',summary);profileSheets.forEach(([name,grid])=>add(name,grid));add('Asignacion',allocationRows);add('GDC Estado',monthly);
        if(Object.keys(state.fundNames).length)add('GDC Nombres',[['ISIN','Nombre fondo'],...Object.entries(state.fundNames)]);
        const meta=Object.entries(state.benchmarkMeta).filter(([ticker])=>ticker===ticker.toUpperCase());
        if(meta.length)add('bench categ',[['ticker','name','asset class'],...meta.map(([ticker,item])=>[ticker,item.name,item.assetClass])]);
        const addHistory=(name,source)=>{const tickers=Object.keys(source),dates=[...new Set(tickers.flatMap(ticker=>(source[ticker]?.data||source[ticker]||[]).map(point=>new Date(point.date).toISOString().slice(0,10))))].sort();if(!dates.length)return;
            const maps=tickers.map(ticker=>new Map((source[ticker]?.data||source[ticker]||[]).map(point=>[new Date(point.date).toISOString().slice(0,10),point.price])));
            add(name,[['date',...tickers],...dates.map(day=>[day,...maps.map(map=>map.get(day)??null)])]);
        };
        addHistory('bench',state.benchmarks);addHistory('prices',state.prices);
        XLSX.writeFile(book,`GDC_comite_${date}.xlsx`);
    }
    function loadPriorWorkbook(workbook){
        const base=findSheet(workbook,['Carteras Modelo']);
        if(base){
            state.models=core.parseGrid(XLSX.utils.sheet_to_json(workbook.Sheets[base],{header:1,defval:null,raw:true}));
            state.selected=0;state.source='Excel GDC importado';state.fundNames={};
            state.benchmarkMeta=benchmarkCategorySheetToMap(workbook,findSheet(workbook,['bench categ','bench category','benchmark categ']));
            state.benchmarks=benchmarkSheetToSeriesMap(workbook,findSheet(workbook,['bench','benchmark','benchmarks']));
            state.prices=Object.fromEntries(Object.entries(benchmarkSheetToSeriesMap(workbook,findSheet(workbook,['prices','precios','historicos','historico','posis']))).map(([key,value])=>[key.toUpperCase(),value.data]));
        }
        else if(!state.models.length)throw new Error('El Excel GDC necesita la hoja Carteras Modelo.');
        const sheet=findSheet(workbook,['GDC Estado']),allocationSheet=findSheet(workbook,['Asignacion']);
        if(!sheet&&!allocationSheet){invalidateReport();render();return {positions:0,weights:0,baseOnly:true};}
        const namesSheet=findSheet(workbook,['GDC Nombres']);
        for(const item of namesSheet?sheetRows(workbook,namesSheet):[]){const isin=normalizeIsin(firstValue(item,['ISIN'])),name=String(firstValue(item,['Nombre fondo'])||'').trim();if(isin&&name)state.fundNames[isin]=name;}
        const groups=new Map();
        for(const item of sheet?sheetRows(workbook,sheet):[]){
            const name=String(firstValue(item,['Modelo'])||''),category=String(firstValue(item,['Categoria GDC'])||''),isin=normalizeIsin(firstValue(item,['ISIN']));
            const share=parseNumber(firstValue(item,['Peso dentro categoria (%)']));
            if(!name||!category||!isin||!Number.isFinite(share)||share<0)continue;
            const key=`${core.key(name)}|${core.key(category)}`;if(!groups.has(key))groups.set(key,[]);
            const savedName=String(firstValue(item,['Nombre fondo','Fondo seleccionado','Nombre'])||'').trim();
            if(savedName&&!record(isin)&&!state.fundNames[isin])state.fundNames[isin]=savedName;
            groups.get(key).push({isin,share});
        }
        let count=0,weights=0;
        for(const item of allocationSheet?sheetRows(workbook,allocationSheet):[]){
            const name=String(firstValue(item,['Modelo'])||''),category=String(firstValue(item,['Categoria GDC'])||'');
            const portfolio=state.models.find(candidate=>core.key(candidate.name)===core.key(name)),row=portfolio?.rows.find(candidate=>core.key(candidate.generic)===core.key(category));
            if(!row)continue;
            const weight=parseNumber(firstValue(item,['Peso cartera (%)']));
            if(!Number.isFinite(weight)||weight<0||weight>100)continue;
            row.portfolioWeight=weight;
            const type=String(firstValue(item,['Tipo activo'])||'');if(['RV','RF','Otros'].includes(type))row.assetType=type;
            const profile=String(firstValue(item,['Perfil RV'])||'');if(core.bands[profile])portfolio.profile=profile;
            weights++;
        }
        state.models.forEach(portfolio=>portfolio.rows.forEach(row=>{
            const previous=groups.get(`${core.key(portfolio.name)}|${core.key(row.generic)}`);if(!previous?.length)return;
            const unique=new Map();previous.forEach(item=>unique.set(item.isin,(unique.get(item.isin)||0)+item.share));
            const total=[...unique.values()].reduce((sum,value)=>sum+value,0);if(!(total>0))return;
            row.currentPositions=[...unique].map(([isin,share])=>({isin,share:share/total*100}));
            row.proposedPositions=row.currentPositions.map(item=>({...item}));row.keepCurrent=true;count+=row.currentPositions.length;
        }));
        if(!count&&!weights)throw new Error('No hay modelos y categorias coincidentes con las carteras cargadas.');
        invalidateReport();render();return {positions:count,weights};
    }
    async function importPriorFile(){
        const file=document.getElementById('gdcPriorFile')?.files?.[0];if(!file)return;
        try{const result=loadPriorWorkbook(await readWorkbook(file));state.source=file.name;render();renderScoringDataStatus();PortfolioWorkspace.scope='model';portfolioWorkflowRefresh();panel.querySelector('#gdcStatus').textContent=result.baseOnly?'Benchmark GDC cargado. Añade las posiciones y pesos de cartera para preparar el primer comité.':`${result.positions} posiciones anteriores y ${result.weights} pesos de categoria cargados. Revisa la banda RV y genera la nueva propuesta.`;document.getElementById('scoringDataStatus-gdc').textContent=file.name;}
        catch(error){panel.querySelector('#gdcStatus').textContent=error.message;document.getElementById('scoringDataStatus-gdc').textContent=`Error: ${error.message}`;}
        finally{const input=document.getElementById('gdcPriorFile');if(input)input.value='';}
    }
    function weightedMetric(items,key){return FinanceCore.weighted(items.map(item=>({weight:item.share,[key]:item.fund?.[key]})),key);}
    async function allocationPieImage(rows){
        if(!window.Plotly)return '';
        const active=rows.filter(row=>row.portfolioWeight>0);if(!active.length)return '';
        const chart=document.createElement('div');chart.style.cssText='position:fixed;left:-12000px;width:900px;height:520px';document.body.append(chart);
        try{
            await FinancialVisuals.newPlot(chart,[{type:'pie',labels:active.map(row=>row.generic),values:active.map(row=>row.portfolioWeight),hole:.38,textinfo:'label+percent',textposition:'outside',automargin:true,marker:{colors:['#164e78','#657d92','#168270','#9aa8b4','#776b92','#b47736','#427fa4','#548467','#a06597','#637d9e']}}],{title:'Asignación actual por categoría genérica',margin:{t:50,l:90,r:90,b:35},showlegend:false},{staticPlot:true});
            return await Plotly.toImage(chart,{format:'png',width:900,height:520}).catch(()=>'');
        }finally{Plotly.purge(chart);chart.remove();}
    }
    async function peerReportSection(row,item){
        const fund=item.fund,peer=peers(fund);
        const cohort=[...(peerIndex?.get(core.key(fund?.category))?.records.values()||[])].filter(candidate=>String(candidate.isin).toUpperCase()!==String(fund?.isin).toUpperCase()&&Number.isFinite(candidate.ter)&&candidate.ter>=0&&Number.isFinite(candidate.score));
        const metricMean=key=>{const valid=cohort.map(candidate=>candidate[key]).filter(Number.isFinite);return {value:valid.length?valid.reduce((sum,value)=>sum+value,0)/valid.length:NaN,count:valid.length};};
        const ret=metricMean('ret5'),risk=metricMean('risk5');
        let image='';
        if(fund&&Number.isFinite(fund.ter)&&Number.isFinite(fund.score)&&window.Plotly){
            const traces=[];
            if(cohort.length)traces.push({x:cohort.map(candidate=>candidate.ter),y:cohort.map(candidate=>candidate.score),mode:'markers',name:'Peers',marker:{color:'#a9b4be',size:6,opacity:.42},hoverinfo:'skip'});
            if(Number.isFinite(peer?.meanTer)&&Number.isFinite(peer?.meanScore))traces.push({x:[peer.meanTer],y:[peer.meanScore],mode:'markers',name:'Media peers',marker:{color:'#526474',size:14,symbol:'diamond'},text:[QualityCore.label(peer.meanScore)],hovertemplate:'Media peers<br>TER %{x:.2f}%<br>Calidad %{text}<extra></extra>'});
            const current=row.current.filter(position=>Number.isFinite(position.fund?.ter)&&Number.isFinite(position.fund?.score));
            if(current.length)traces.push({x:current.map(position=>position.fund.ter),y:current.map(position=>position.fund.score),mode:'markers',name:'Actual',marker:{color:'#7d8a97',size:26,symbol:'circle-open'},meta:{financialRole:'proposal'},text:current.map(position=>QualityCore.label(position.fund.score)),hovertemplate:'Actual<br>TER %{x:.2f}%<br>Calidad %{text}<extra></extra>'});
            traces.push({x:[fund.ter],y:[fund.score],mode:'markers',name:row.keepCurrent?'Sin cambio':'Propuesta',marker:{color:'#164e78',size:17,symbol:'circle'},meta:{financialRole:'origin'},text:[QualityCore.label(fund.score)],hovertemplate:'Fondo seleccionado<br>TER %{x:.2f}%<br>Calidad %{text}<extra></extra>'});
            const chart=document.createElement('div');chart.style.cssText='position:fixed;left:-12000px;width:1000px;height:300px';document.body.append(chart);
            try{await FinancialVisuals.newPlot(chart,traces,{title:'Calidad frente a TER',xaxis:{title:'TER (%)',automargin:true},yaxis:{title:'Calidad (estrellas)',range:[-.25,4.45],zeroline:false,tickvals:[.5,1.5,2.5,3.5,4],ticktext:[1,2,3,4,5].map(n=>'★'.repeat(n))},margin:{t:38,l:95,r:25,b:58},legend:{orientation:'h',y:-.27}},{staticPlot:true});image=await Plotly.toImage(chart,{format:'png',width:1000,height:300}).catch(()=> '');}
            finally{Plotly.purge(chart);chart.remove();}
        }
        const cells=(label,value)=>`<tr><td>${label}</td><td>${value?esc(value.name||'Media de categoría'):'-'}</td><td>${QualityCore.withTechnical(value?.score,true)}</td><td>${metricPct(value?.ter)}</td><td>${metricPct(value?.ret5)}</td><td>${metricPct(value?.risk5)}</td></tr>`;
        const currentSummary={name:row.current.map(position=>position.fund?.name||position.isin).join('; '),score:weightedMetric(row.current,'score').value,ter:weightedMetric(row.current,'ter').value,ret5:weightedMetric(row.current,'ret5').value,risk5:weightedMetric(row.current,'risk5').value};
        const mean={name:`${fund?.category||row.generic} · ${peer?.count||0} peers`,score:peer?.meanScore,ter:peer?.meanTer,ret5:ret.value,risk5:risk.value};
        return `<section class="block report-keep-together gdc-peer-report"><h3>${esc(row.generic)} · ${esc(fund?.name||item.isin)}</h3><p>${esc(item.isin)} · peso en cartera ${fmt(item.weight)}% · ${esc(fund?.category||row.subcategories.join('; '))}</p>${image?`<figure><img src="${image}" alt="Calidad y TER de ${esc(row.generic)} frente a peers"></figure>`:'<p>Sin métricas suficientes para representar la comparación.</p>'}<table class="wide-report-table"><thead><tr><th>Referencia</th><th>Fondo</th><th>Calidad</th><th>TER</th><th>Ret 5A</th><th>Riesgo 5A</th></tr></thead><tbody>${row.keepCurrent?'':cells('Actual',row.current.length?currentSummary:null)}${cells(row.keepCurrent?'Sin cambio':'Propuesta',fund)}${cells('Media peers',mean)}</tbody></table><p class="gdc-peer-coverage">Ret 5A: ${ret.count}/${cohort.length} peers con dato; riesgo 5A: ${risk.count}/${cohort.length}. Las medias se calculan con los peers que tienen cada métrica.</p></section>`;
    }
    async function report(){
        const selected=model();if(!selected)return;
        if(Math.abs(allocation().portfolioTotal-100)>.05)throw new Error('Normaliza los pesos de la cartera al 100% antes de generar el informe.');
        const rows=effectiveRows().filter(row=>row.portfolioWeight>0),values=allocation(),te=teResult(),score=coverage(rows,'score'),ter=coverage(rows,'ter');
        const peerSections=[];for(const row of rows)for(const item of row.proposed)peerSections.push(await peerReportSection(row,item));
        const comparable=rows.map(row=>({weight:row.portfolioWeight,current:weightedMetric(row.current,'ter'),proposed:weightedMetric(row.proposed,'ter')})).filter(item=>item.current.coverage>.999&&item.proposed.coverage>.999);
        const saving=comparable.length?comparable.reduce((sum,item)=>sum+item.weight/100*(item.current.value-item.proposed.value),0):NaN;
        const date=new Date().toLocaleDateString('es-ES');
        const savingText=Number.isFinite(saving)
            ? `Reduccion estimada de TER: ${fmt(saving)} pp; cobertura ${comparable.reduce((sum,item)=>sum+item.weight,0).toFixed(1)}% del modelo. No equivale a un ahorro monetario sin AUM declarado.`
            : 'Reduccion de TER pendiente de informar las posiciones actuales y sus costes.';
        const positions=rows.flatMap(row=>row.proposed.map(item=>`<tr><td>${esc(row.generic)}</td><td>${fmt(row.weight)}%</td><td>${fmt(row.portfolioWeight)}%</td><td>${esc(row.current.map(position=>position.isin).join('; ')||'-')}</td><td>${esc(item.isin)}</td><td>${esc(item.fund?.name||'-')}</td><td>${fmt(item.weight)}%</td><td>${QualityCore.withTechnical(item.fund?.score,true)}</td><td>${metricPct(item.fund?.ter)}</td></tr>`)).join('');
        const metricRows=rows.flatMap(row=>row.proposed.map(item=>`<tr><td>${esc(row.generic)}<br><small>${esc(item.isin)}</small></td><td>${QualityCore.withTechnical(weightedMetric(row.current,'score').value,true)}</td><td>${metricPct(weightedMetric(row.current,'ter').value)}</td><td>${metricPct(weightedMetric(row.current,'ret5').value)}</td><td>${metricPct(weightedMetric(row.current,'risk5').value)}</td><td>${QualityCore.withTechnical(item.fund?.score,true)}</td><td>${metricPct(item.fund?.ter)}</td><td>${metricPct(item.fund?.ret5)}</td><td>${metricPct(item.fund?.risk5)}</td></tr>`)).join('');
        const peerSummary=rows.flatMap(row=>row.proposed.map(item=>{const peer=peers(item.fund),score=item.fund?.score,ter=item.fund?.ter;
            const quality=Number.isFinite(score)&&Number.isFinite(peer?.meanScore)?score-peer.meanScore:NaN;
            const cost=Number.isFinite(ter)&&Number.isFinite(peer?.meanTer)?ter-peer.meanTer:NaN;
            const klass=Number.isFinite(quality)&&Number.isFinite(cost)?quality>=0&&cost<=0?'good':quality<0&&cost>0?'bad':'':'';
            return `<tr><td>${esc(item.isin)}<br><small>${esc(item.fund?.name||'-')}</small></td><td>${esc(item.fund?.category||row.generic)}</td><td>${QualityCore.withTechnical(score,true)}</td><td>${QualityCore.withTechnical(peer?.meanScore,true)}</td><td>${metricPct(ter)}</td><td>${metricPct(peer?.meanTer)}</td><td class="${klass}">${Number.isFinite(quality)?`${quality>=0?'+':''}${fmt(quality)}`:'-'} / ${Number.isFinite(cost)?`${cost>=0?'+':''}${fmt(cost)} pp`:'-'}</td></tr>`;
        })).join('');
        const pie=await allocationPieImage(rows),band=values.band?`${values.band[0]}–${values.band[1]}%`:'Sin perfil asignado';
        const bandStatus=values.band?(values.portfolioRv>=values.band[0]-1e-6&&values.portfolioRv<=values.band[1]+1e-6?'Dentro de banda':'Fuera de banda'):'Pendiente';
        const body=`<div class="report manager-report">
            <header class="cover"><h1>Comité GDC · ${esc(selected.name)}</h1><p>Revision mensual · ${date}</p></header>
            <section class="block"><h2>Resumen de la cartera propuesta</h2><div class="summary gdc-report-summary">
                <div><span>Peso total cartera</span><strong>${fmt(values.portfolioTotal)}%</strong></div>
                <div><span>Calidad ponderada</span><strong>${QualityCore.withTechnical(score.value)}</strong></div>
                <div><span>TER ponderado</span><strong>${fmt(ter.value)}%</strong></div>
                <div><span>Tracking error</span><strong>${pct(te.value)}</strong></div>
            </div><p>${esc(statusText(rows))}</p><p>${savingText}</p></section>
            <section class="block"><h2>Asignación y límites del perfil</h2><table class="wide-report-table"><thead><tr><th>Banda RV</th><th>Punto neutral</th><th>RV benchmark</th><th>RV cartera</th><th>RF cartera</th><th>Otros</th><th>Estado</th></tr></thead><tbody><tr><td>${band}</td><td>${metricPct(values.neutral)}</td><td>${metricPct(values.benchmarkRv)}</td><td>${metricPct(values.portfolioRv)}</td><td>${metricPct(values.portfolioRf)}</td><td>${metricPct(values.portfolioOther)}</td><td>${bandStatus}</td></tr></tbody></table><p>Los pesos de la hoja Carteras Modelo son el benchmark fijo. La banda se comprueba sobre la asignación actual. Las categorías clasificadas como Otros no se imputan a RV ni a RF.</p>${pie?`<figure class="gdc-allocation-pie" style="margin:10px 0;text-align:center"><img style="display:block;width:100%;max-width:900px;height:auto;margin:0 auto" src="${pie}" alt="Distribución de la cartera por categoría genérica"></figure>`:''}</section>
            <section class="block"><h2>Metodología y fuentes</h2><p>Tracking error: desviación estándar de retornos activos mensuales, anualizada con raíz de 12; exige cuatro cierres consecutivos comunes. Rebalanceo mensual; sin costes, impuestos ni cambio de divisa.</p><p>Fuente: ${esc(state.source)}. Score interno 0-4 convertido en 1-5 estrellas; media entre categorías orientativa. Peers Morningstar. Resultados no garantizados.</p></section>
            <section class="block"><h2>Posiciones actuales y propuesta</h2><table class="wide-report-table"><colgroup><col style="width:13%"><col style="width:7%"><col style="width:7%"><col style="width:15%"><col style="width:12%"><col style="width:22%"><col style="width:8%"><col style="width:10%"><col style="width:6%"></colgroup>
                <thead><tr><th>Categoria</th><th>Bench</th><th>Cartera</th><th>ISIN actual(es)</th><th>ISIN seleccionado</th><th>Fondo seleccionado</th><th>Peso fondo</th><th>Calidad</th><th>TER</th></tr></thead>
                <tbody>${positions}</tbody>
            </table></section>
            <section class="block"><h2>Metricas actuales frente a propuestas</h2><table class="wide-report-table">
                <thead><tr><th>Categoria</th><th>Calidad actual</th><th>TER actual</th><th>Ret 5A actual</th><th>Riesgo 5A actual</th><th>Calidad propuesta</th><th>TER propuesto</th><th>Ret 5A propuesto</th><th>Riesgo 5A propuesto</th></tr></thead>
                <tbody>${metricRows}</tbody>
            </table></section>
            <section class="block"><h2>Calidad y costes relativos a peers</h2><p>Cada fondo seleccionado se compara por separado con su categoria Morningstar. Las medias excluyen ese ISIN; los puntos actuales se mantienen aunque no haya cambios.</p></section>${peerSections.join('')}
            <section class="block"><h2>Resumen final frente a peers</h2><table class="wide-report-table"><thead><tr><th>ISIN / fondo final</th><th>Categoría</th><th>Calidad</th><th>Calidad peers</th><th>TER</th><th>TER peers</th><th>Δ Calidad / Δ TER</th></tr></thead><tbody>${peerSummary}</tbody></table><p>Verde: calidad igual o mayor y coste igual o menor que la media. Rojo: calidad menor y coste mayor. Los casos mixtos se muestran sin color.</p></section>
        </div>`;
        const reportDoc=new DOMParser().parseFromString(body,'text/html');
        state.reportHtml=`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"></head><body>${reportDoc.body.innerHTML}</body></html>`;
        ReportDesign.preview(panel.querySelector('#gdcReportPreview'),state.reportHtml);
    }
    function historyRows(){
        const prices=fundHistories(),benchmarks={...loadedPortfolio?.benchmarks,...state.benchmarks};
        const find=(source,key)=>source[key]||Object.entries(source).find(([ticker])=>ticker.toLowerCase()===key.toLowerCase())?.[1];
        return effectiveRows().flatMap(row=>row.proposed.filter(item=>item.weight>0).map(item=>{
            const ticker=String(benchmarkTickers(row)[0]||'').toUpperCase(),fund=find(prices,item.isin),bench=find(benchmarks,ticker);
            if(!fund||!bench)return {row,item,ticker,reason:!ticker?'Índice sin mapear':!fund?'Falta histórico del fondo':'Falta histórico del índice'};
            try{return {row,item,ticker,result:MultiAssetCompare.compare([{ticker:item.isin,name:fundName(item.isin)||item.isin,data:fund.data||fund}], 'ALL',0,{ticker,name:benchmarkInfo(ticker).name,data:bench.data||bench})};}
            catch(error){return {row,item,ticker,reason:error.message};}
        }));
    }
    const horizonKeys=['oneMonth','threeMonths','ytd','sixMonths','oneYear','threeYears','fiveYears','sinceStart'];
    const horizonLabels=['1M','3M','YTD','6M','1A','3A anual','5A anual','Inicio'];
    function horizonAlpha(result,key){
        const asset=result?.assets[0],direct=asset?.horizonAlphas?.[key];if(Number.isFinite(direct))return {value:direct,excess:false};
        if(!['oneMonth','threeMonths'].includes(key))return {value:NaN,excess:false};
        const fund=asset?.horizons?.[key],bench=result?.benchmark?.horizons?.[key];
        return {value:Number.isFinite(fund)&&Number.isFinite(bench)?fund-bench:NaN,excess:true};
    }
    function historyDetail(entry){
        const result=entry.result;if(!result)return '';
        const fund=result.assets[0],bench=result.benchmark,info=benchmarkInfo(entry.ticker),metric=value=>Number.isFinite(value)?`${(value*100).toFixed(2)}%`:'-',name=fundName(entry.item.isin)||entry.item.isin;
        const metrics=[['Fondo',name,entry.item.isin,fund],['Índice',info.name,info.ticker,bench]].map(([kind,label,id,item])=>`<tr><td>${esc(kind)} · ${esc(label)}<br><small>${esc(id)}</small></td><td>${metric(item?.total)}</td><td>${metric(item?.annual)}</td><td>${metric(item?.vol)}</td><td>${metric(item?.drawdown)}</td><td>${Number.isFinite(item?.sharpe)?fmt(item.sharpe):'-'}</td><td>${kind==='Fondo'&&Number.isFinite(item?.beta)?fmt(item.beta):'-'}</td><td>${kind==='Fondo'?metric(item?.alpha):'-'}</td></tr>`).join('');
        const returns=[['Fondo',fund],['Índice',bench]].map(([label,item])=>`<tr><th>${esc(label)}</th>${horizonKeys.map(key=>`<td>${metric(item?.horizons?.[key])}</td>`).join('')}</tr>`).join('');
        const alphas=horizonKeys.map(key=>{const item=horizonAlpha(result,key);return `<td class="${Number.isFinite(item.value)?item.value>=0?'good':'bad':''}" title="${item.excess?'Exceso de retorno acumulado; histórico insuficiente para alfa de Jensen':'Alfa de Jensen anualizada'}">${metric(item.value)}${item.excess&&Number.isFinite(item.value)?'*':''}</td>`;}).join('');
        return `<h4>Métricas frente al índice</h4><table class="wide-report-table gdc-history-detail-table"><thead><tr><th>Serie</th><th>Ret. periodo</th><th>Ret. anual</th><th>Vol.</th><th>Caída máx.</th><th>Sharpe</th><th>Beta</th><th>Alfa anual</th></tr></thead><tbody>${metrics}</tbody></table><h4>Rentabilidad y alfa por plazo</h4><table class="wide-report-table gdc-history-detail-table"><thead><tr><th>Serie</th>${horizonLabels.map(label=>`<th>${label}</th>`).join('')}</tr></thead><tbody>${returns}<tr class="gdc-alpha-row"><th>Alfa / exceso fondo–índice</th>${alphas}</tr></tbody></table><p class="gdc-peer-coverage">* En plazos cortos sin cuatro retornos emparejados, se muestra exceso acumulado de retorno, no alfa de Jensen.</p>`;
    }
    function historicalTable(forReport=false){
        const metric=value=>Number.isFinite(value)?`${(value*100).toFixed(2)}%`:'-';
        if(forReport){
            const metrics=state.history.map(({row,item,ticker,result,reason})=>{const asset=result?.assets[0],info=benchmarkInfo(ticker);return `<tr><td>${esc(fundName(item.isin)||item.isin)}<br><small>${esc(item.isin)}</small></td><td>${esc(row.generic)}</td><td>${esc(info.name)}<br><small>${esc(info.ticker)}</small></td><td>${metric(asset?.total)}</td><td>${metric(asset?.annual)}</td><td>${metric(asset?.vol)}</td><td class="${Number.isFinite(asset?.alpha)?asset.alpha>=0?'good':'bad':''}">${metric(asset?.alpha)}</td><td>${Number.isFinite(asset?.beta)?fmt(asset.beta):'-'}</td><td>${metric(asset?.drawdown)}</td><td>${esc(reason||'Comparable')}</td></tr>`;}).join('');
            return `<table class="wide-report-table gdc-history-report-table"><thead><tr><th>Fondo / ISIN</th><th>Categoría</th><th>Índice / ticker</th><th>Ret. periodo</th><th>Ret. anual</th><th>Vol.</th><th>Alfa anual</th><th>Beta</th><th>Caída máx.</th><th>Estado</th></tr></thead><tbody>${metrics}</tbody></table>`;
        }
        return `<table class="wide-report-table gdc-history-table"><thead><tr><th>Fondo / ISIN</th><th>Categoría GDC</th><th>Índice Morningstar</th><th>Periodo común</th><th>Ret. periodo</th><th>Ret. anual</th><th>Vol.</th><th>Alfa anual</th><th>Alfa/exceso 1M</th><th>Alfa/exceso 3M</th><th>Alfa 6M</th><th>Alfa YTD</th><th>Beta</th><th>Caída máx.</th><th>Estado</th></tr></thead><tbody>${state.history.map(({row,item,ticker,result,reason})=>{const asset=result?.assets[0],info=benchmarkInfo(ticker),name=fundName(item.isin);return `<tr><td>${name?esc(name):forReport?esc(item.isin):`<input class="gdc-history-name" data-gdc-history-name="${esc(item.isin)}" aria-label="Nombre de ${esc(item.isin)}" placeholder="Añadir nombre del fondo">`}<br><small>${esc(item.isin)}</small></td><td>${esc(row.generic)}<br><small>${esc(row.subcategories.join('; '))}</small></td><td>${esc(info.name||'-')}<br><small>${esc(info.ticker||'-')}${info.category?` · ${esc(info.category)}`:''}</small></td><td>${result?`${result.rows[0].date.toISOString().slice(0,10)} a ${result.rows.at(-1).date.toISOString().slice(0,10)}`:'-'}</td><td>${metric(asset?.total)}</td><td>${metric(asset?.annual)}</td><td>${metric(asset?.vol)}</td><td class="${Number.isFinite(asset?.alpha)?asset.alpha>=0?'good':'bad':''}">${metric(asset?.alpha)}</td>${['oneMonth','threeMonths','sixMonths','ytd'].map(key=>{const value=horizonAlpha(result,key).value;return `<td class="${Number.isFinite(value)?value>=0?'good':'bad':''}">${metric(value)}</td>`;}).join('')}<td>${Number.isFinite(asset?.beta)?fmt(asset.beta):'-'}</td><td>${metric(asset?.drawdown)}</td><td>${esc(reason||'Comparable')}</td></tr>`;}).join('')}</tbody></table>`;
    }
    function runHistory(){
        if(!model())throw new Error('Carga primero una cartera modelo.');
        state.history=historyRows();state.historyHtml='';
        const select=panel.querySelector('#gdcHistorySelect'),previous=select.value;
        select.innerHTML=state.history.map(({item,ticker},index)=>`<option value="${index}">${esc(fundName(item.isin)||item.isin)} · ${esc(item.isin)} / ${esc(benchmarkInfo(ticker).name||'sin índice')} (${esc(ticker)})</option>`).join('');
        if([...select.options].some(option=>option.value===previous))select.value=previous;
        panel.querySelector('#gdcHistoryTable').innerHTML=historicalTable();
        showHistory();
        panel.querySelector('#gdcHistoryStatus').textContent=`${state.history.filter(item=>item.result).length}/${state.history.length} fondos comparables. Se usan fechas comunes y retornos según la frecuencia detectada; sin conversión automática de divisa.`;
    }
    function showHistory(){
        const selected=state.history[Number(panel.querySelector('#gdcHistorySelect').value)],container=panel.querySelector('#gdcHistoryCharts');
        container.innerHTML='';if(!selected?.result){container.textContent=selected?.reason||'Sin comparación disponible.';return;}
        container.innerHTML=MultiAssetCompare.resultsHtml('gdcHistorical');
        MultiAssetCompare.renderResults(container,selected.result,'gdcHistorical',{rollingPair:true,showBenchmarkMetrics:true});
        const horizon=container.querySelector('#gdcHistoricalHorizonBody');
        const cells=horizonKeys.map(key=>{const item=horizonAlpha(selected.result,key),value=item.value;return `<td class="${Number.isFinite(value)?value>=0?'good':'bad':''}" title="${item.excess?'Exceso de retorno acumulado':'Alfa de Jensen anualizada'}">${Number.isFinite(value)?`${(value*100).toFixed(2)}%${item.excess?'*':''}`:'-'}</td>`;}).join('');
        horizon.insertAdjacentHTML('beforeend',`<tr class="gdc-alpha-row"><th>Alfa / exceso · ${esc(fundName(selected.item.isin)||selected.item.isin)} frente a ${esc(benchmarkInfo(selected.ticker).name)} (${esc(selected.ticker)})</th>${cells}</tr>`);
        horizon.closest('.proposal-chart-scroll').insertAdjacentHTML('afterend','<p class="gdc-peer-coverage">* Si faltan cuatro retornos emparejados en 1M o 3M se muestra exceso acumulado, no alfa de Jensen.</p>');
    }
    async function historicalReport(){
        if(!state.history.length)runHistory();
        const figures=[];
        for(const entry of state.history.filter(item=>item.result)){
            const result=entry.result,chart=document.createElement('div');chart.style.cssText='position:fixed;left:-12000px;width:950px;height:340px';document.body.append(chart);
            try{const info=benchmarkInfo(entry.ticker),fund=fundName(entry.item.isin)||entry.item.isin;await FinancialVisuals.newPlot(chart,[{x:result.rows.map(row=>row.date),y:result.assets[0].base100,name:`${fund} (${entry.item.isin})`,type:'scatter',mode:'lines',line:{color:'#164e78',width:2.5}},{x:result.rows.map(row=>row.date),y:result.benchmark.base100,name:`${info.name} (${info.ticker})`,type:'scatter',mode:'lines',line:{color:'#78828c',width:2.5}}],{title:`${fund} frente a ${info.name}`,yaxis:{title:'Base 100'},margin:{t:50,l:60,r:20,b:75},legend:{orientation:'h',y:-.2}},{staticPlot:true});
                const image=await Plotly.toImage(chart,{format:'png',width:950,height:340});figures.push(`<section class="block gdc-history-report"><div class="report-keep-together"><h3>${esc(fund)} (${esc(entry.item.isin)}) · ${esc(info.name)} (${esc(info.ticker)})</h3><figure><img style="width:100%;height:auto" src="${image}" alt="Evolución fondo frente a índice"></figure></div>${historyDetail(entry)}</section>`);
            }finally{Plotly.purge(chart);chart.remove();}
        }
        state.historyHtml=`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"></head><body><div class="report manager-report"><header class="cover"><h1>GDC · comparativa histórica</h1><p>${esc(model().name)} · ${new Date().toLocaleDateString('es-ES')}</p></header><section class="block"><h2>Resumen de fondos frente a índices Morningstar</h2>${historicalTable(true)}</section>${figures.join('')}<footer>Retorno y volatilidad anualizados según la frecuencia observada; alfa de Jensen anualizada y beta sobre fechas comunes. En 1M/3M sin cuatro retornos emparejados se muestra exceso de retorno acumulado, no alfa de Jensen. Las series deben ser comparables en divisa y ajustes. Los fondos sin histórico suficiente figuran como pendientes.</footer></div></body></html>`;
        return state.historyHtml;
    }
    function exportHistoryExcel(){
        if(!state.history.length)runHistory();
        const book=XLSX.utils.book_new(),summary=[['Fondo','ISIN','Categoría GDC','Índice Morningstar','Ticker índice','Categoría Morningstar','Inicio','Fin','Retorno periodo (%)','Retorno anual (%)','Volatilidad (%)','Alfa anual (%)','Alfa/exceso 1M (%)','Alfa/exceso 3M (%)','Alfa 6M (%)','Alfa YTD (%)','Beta','Caída máxima (%)','Estado']];
        state.history.forEach((entry,index)=>{const asset=entry.result?.assets[0],rows=entry.result?.rows||[];
            const info=benchmarkInfo(entry.ticker),percent=value=>Number.isFinite(value)?value*100:'';
            summary.push([fundName(entry.item.isin),entry.item.isin,entry.row.generic,info.name,info.ticker,info.category,rows[0]?.date.toISOString().slice(0,10)||'',rows.at(-1)?.date.toISOString().slice(0,10)||'',percent(asset?.total),percent(asset?.annual),percent(asset?.vol),percent(asset?.alpha),...['oneMonth','threeMonths','sixMonths','ytd'].map(key=>percent(horizonAlpha(entry.result,key).value)),Number.isFinite(asset?.beta)?asset.beta:'',percent(asset?.drawdown),entry.reason||'Comparable']);
            if(!rows.length)return;const bench=entry.result.benchmark,grid=[['Rentabilidad / alfa por plazo (%)',...horizonLabels],['Fondo',...horizonKeys.map(key=>percent(asset.horizons[key]))],['Índice',...horizonKeys.map(key=>percent(bench.horizons[key]))],['Alfa / exceso',...horizonKeys.map(key=>percent(horizonAlpha(entry.result,key).value))],[],['Fecha','Fondo base 100','Índice base 100'],...rows.map((row,i)=>[row.date.toISOString().slice(0,10),asset.base100[i],bench.base100[i]])];
            XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(grid),`Fondo ${index+1}`);
        });
        XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(summary),'Resumen');
        XLSX.writeFile(book,`GDC_comparativa_${new Date().toISOString().slice(0,10)}.xlsx`);
    }
    function init(){
        panel=document.getElementById('workspaceModel');if(!panel)return;
        panel.innerHTML=`<div class="workspace-heading"><div><h3>Cartera modelo GDC</h3></div></div><div class="workspace-tools"><label class="gdc-upload">Importar Excel base <input id="gdcFile" type="file" accept=".xlsx,.xls"></label><label class="gdc-upload">Selección del mes anterior <input id="gdcPriorFile" type="file" accept=".xlsx,.xls"></label><select id="gdcModels" aria-label="Cartera modelo"></select><button type="button" id="gdcExport"><i class="fa-solid fa-file-excel" aria-hidden="true"></i> Exportar Excel mensual</button><button type="button" id="gdcReport"><i class="fa-solid fa-file-lines" aria-hidden="true"></i> Generar informe</button><button type="button" id="gdcPdf"><i class="fa-solid fa-file-pdf" aria-hidden="true"></i> Descargar PDF</button></div><p id="gdcSource" class="workspace-context"></p><div id="gdcControls"><div class="gdc-risk-controls"><label class="workspace-context">Limite de tracking error anual (%) <input id="gdcMaxTe" type="number" min="0" step="0.1" placeholder="Sin definir"></label><label class="workspace-context"><input id="gdcComparable" type="checkbox"> Confirmo misma divisa y series comparables (distribuciones/ajustes)</label></div><p id="gdcStatus" class="workspace-status" role="status"></p><div id="gdcWeightChart" class="gdc-weight-chart"></div><div class="proposal-chart-scroll"><table class="wide-report-table gdc-selection-table"><thead><tr><th>Categoria y mapeo</th><th>Peso</th><th>Posiciones actuales</th><th>Selección de fondos</th><th>Propuesta</th><th>Peers</th></tr></thead><tbody id="gdcBody"></tbody></table></div></div><div id="gdcReportPreview"></div>`;
        panel.querySelector('#gdcFile').closest('label').remove();
        panel.querySelector('#gdcStatus').insertAdjacentHTML('beforebegin','<div class="gdc-allocation-controls"><label>Perfil de riesgo<select id="gdcProfile" aria-label="Perfil de riesgo"></select></label><button type="button" id="gdcNormalizeWeights"><i class="fa-solid fa-scale-balanced" aria-hidden="true"></i> Normalizar pesos de cartera</button></div><div id="gdcAllocationSummary" class="gdc-allocation-summary"></div><div class="gdc-band-axis"><span>0% RV</span><div class="gdc-band-track"><div id="gdcRvBand"></div><div id="gdcRvNeutral" title="Punto neutral"></div><div id="gdcRvMarker" title="Cartera"></div></div><span>100% RV</span></div><p class="workspace-context">La banda se controla con los pesos de la cartera. El benchmark importado no cambia. Revisa la clasificación RV/RF/Otros de cada categoría.</p>');
        panel.querySelector('#gdcWeightChart').insertAdjacentHTML('afterend','<div id="gdcDeviationChart" class="gdc-weight-chart"></div>');
        panel.querySelector('.proposal-chart-scroll').insertAdjacentHTML('afterend','<h4 class="gdc-overview-title">Resumen de perfiles</h4><div id="gdcProfileOverviewChart" class="gdc-overview-chart"></div><div id="gdcCategoryOverviewChart" class="gdc-overview-chart"></div>');
        panel.querySelector('.gdc-selection-table thead tr').innerHTML='<th>Categoría genérica y mapeo</th><th>Índice Morningstar</th><th>Benchmark fijo</th><th>Peso cartera</th><th>Posiciones actuales</th><th>Selección de fondos</th><th>Propuesta</th><th>Peers</th>';
        panel.querySelector('#gdcCategoryOverviewChart').insertAdjacentHTML('afterend','<section class="gdc-history"><h4 class="gdc-overview-title">Comparativa de fondos frente a índices</h4><div class="workspace-tools"><button type="button" id="gdcHistoryRun">Comparar fondos</button><select id="gdcHistorySelect" aria-label="Fondo para visualizar"></select><button type="button" id="gdcHistoryPdf">Descargar informe PDF</button><button type="button" id="gdcHistoryExcel">Exportar histórico Excel</button></div><p id="gdcHistoryStatus" class="workspace-status" role="status"></p><div id="gdcHistoryTable" class="proposal-chart-scroll"></div><div id="gdcHistoryCharts"></div></section>');
        panel.querySelector('#gdcHistoryRun').addEventListener('click',()=>{try{runHistory();}catch(error){panel.querySelector('#gdcHistoryStatus').textContent=error.message;}});
        panel.querySelector('#gdcHistoryTable').addEventListener('change',event=>{const input=event.target.closest('[data-gdc-history-name]');if(!input)return;const isin=normalizeIsin(input.dataset.gdcHistoryName),name=input.value.trim();if(name)state.fundNames[isin]=name;else delete state.fundNames[isin];invalidateReport();setTimeout(runHistory,0);});
        panel.querySelector('#gdcHistorySelect').addEventListener('change',showHistory);
        panel.querySelector('#gdcHistoryPdf').addEventListener('click',async()=>{try{await ReportDesign.downloadPdf(await historicalReport(),`GDC_comparativa_${model().name.replace(/[^a-z0-9_-]/gi,'_')}.pdf`);}catch(error){panel.querySelector('#gdcHistoryStatus').textContent=error.message;}});
        panel.querySelector('#gdcHistoryExcel').addEventListener('click',()=>{try{exportHistoryExcel();}catch(error){panel.querySelector('#gdcHistoryStatus').textContent=error.message;}});
        panel.querySelector('#gdcPriorFile').addEventListener('change',importPriorFile);
        panel.querySelector('#gdcModels').addEventListener('change',event=>{state.selected=Number(event.target.value);invalidateReport();render();});
        panel.querySelector('#gdcProfile').addEventListener('change',event=>{model().profile=event.target.value;invalidateReport();render();});
        panel.querySelector('#gdcNormalizeWeights').addEventListener('click',normalizeAllocation);
        panel.querySelector('#gdcMaxTe').addEventListener('change',event=>{state.maxTe=event.target.value===''?NaN:Number(event.target.value)/100;invalidateReport();render();});
        panel.querySelector('#gdcComparable').addEventListener('change',event=>{state.historyComparable=event.target.checked;invalidateReport();render();});
        panel.querySelector('#gdcExport').addEventListener('click',exportExcel);
        panel.querySelector('#gdcReport').addEventListener('click',()=>report().catch(error=>panel.querySelector('#gdcStatus').textContent=error.message));
        panel.querySelector('#gdcPdf').addEventListener('click',async()=>{try{if(!state.reportHtml)await report();if(state.reportHtml)await ReportDesign.downloadPdf(state.reportHtml,`GDC_${model().name.replace(/[^a-z0-9_-]/gi,'_')}.pdf`);}catch(error){panel.querySelector('#gdcStatus').textContent=error.message;}});
        panel.addEventListener('focusin',event=>{if(event.target.dataset.gdcUniverse!==undefined)populateUniverse(event.target,event.target.previousElementSibling?.value||'');});
        panel.addEventListener('input',event=>{const search=event.target.closest('[data-gdc-universe-search]');if(search){const select=search.nextElementSibling;if(select?.dataset.gdcUniverse!==undefined)populateUniverse(select,search.value);}});
        panel.addEventListener('change',event=>{
            const el=event.target,slot=el.dataset.gdcSelect??el.dataset.gdcUniverse??el.dataset.gdcWeight;
            if(slot!==undefined){const [index,position]=slot.split(':').map(Number);if(el.dataset.gdcWeight!==undefined)positionWeight(index,position,el.value);else if(el.dataset.gdcUniverse===undefined||el.value)select(index,el.value,position);}
            else if(el.dataset.gdcCurrent!==undefined)current(Number(el.dataset.gdcCurrent),el.value);
            else if(el.dataset.gdcKeep!==undefined)keepCurrent(Number(el.dataset.gdcKeep),el.checked);
            else if(el.dataset.gdcPortfolioWeight!==undefined)portfolioWeight(Number(el.dataset.gdcPortfolioWeight),el.value);
            else if(el.dataset.gdcAssetType!==undefined){model().rows[Number(el.dataset.gdcAssetType)].assetType=el.value;invalidateReport();render();}
        });
        panel.addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;if(button.dataset.gdcAdd!==undefined)addPosition(Number(button.dataset.gdcAdd));else if(button.dataset.gdcRemove!==undefined){const [index,slot]=button.dataset.gdcRemove.split(':').map(Number);removePosition(index,slot);}});
        render();
    }
    return {init,loadWorkbook,loadPriorWorkbook,render,select,current,state};
})();
