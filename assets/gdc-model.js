const GdcModel=(()=>{
    const core=ModelPortfolioCore;
    const state={models:[],selected:0,source:'',benchmarks:{},benchmarkMeta:{},prices:{},maxTe:NaN,historyComparable:false,reportHtml:''};
    let panel,peerIndex,peerSource,rankingCache=new Map(),universeCache=new Map(),rankSource;
    const esc=value=>escapeHtml(String(value??''));
    const fmt=value=>Number.isFinite(value)?value.toFixed(2):'-';
    const metricPct=value=>Number.isFinite(value)?`${fmt(value)}%`:'-';
    const pct=value=>Number.isFinite(value)?`${(value*100).toFixed(2)}%`:'Pendiente';
    function invalidateReport(){state.reportHtml='';const preview=panel?.querySelector('#gdcReportPreview');if(preview)preview.textContent='Datos modificados. Genera un nuevo informe.';}
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
    function peers(fund){if(!fund)return null;if(!peerIndex||peerSource!==records()){peerSource=records();peerIndex=PeerValue.index(peerSource);}return PeerValue.compare(fund,peerIndex);}
    function categoryBenchmarks(){return core.benchmarkIndex(Object.keys(state.benchmarkMeta).length?state.benchmarkMeta:loadedPortfolio?.benchCategories||{});}
    function fundHistories(){return {...Object.fromEntries(Object.entries(loadedPortfolio?.priceSeries||{}).map(([key,item])=>[key.toUpperCase(),item.data||item])),...state.prices};}
    function positions(row,side){
        const source=side==='current'||row.keepCurrent?row.currentPositions:row.proposedPositions;
        return (source||[]).map(item=>({...item,weight:row.weight*item.share/100,fund:record(item.isin)}));
    }
    function effectiveRows(){return (model()?.rows||[]).map(row=>({...row,current:positions(row,'current'),proposed:positions(row,'proposed')}));}
    function proposalRows(rows=effectiveRows()){
        const index=categoryBenchmarks();
        return rows.flatMap(row=>row.proposed.map(item=>({generic:row.generic,weight:item.weight,selectedIsin:item.isin,selected:item.fund,benchmark:index.get(core.key(item.fund?.category||row.subcategories[0]))?.[0]||''})));
    }
    function teResult(){
        if(Math.abs((model()?.total||0)-100)>.5)return {value:NaN,reason:'Los pesos del modelo no suman 100%.'};
        const rows=effectiveRows(),flat=proposalRows(rows);
        if(rows.some(row=>!row.proposed.length))return {value:NaN,reason:'Faltan propuestas en algunas categorias.'};
        if(flat.some(row=>!row.selected))return {value:NaN,reason:'Hay fondos propuestos sin match en el universo.'};
        return core.trackingError(flat,fundHistories(),{...loadedPortfolio?.benchmarks,...state.benchmarks});
    }
    function coverage(rows,key){return FinanceCore.weighted(rows.flatMap(row=>row.proposed.map(item=>({weight:item.weight,[key]:item.fund?.[key]}))),key);}
    function statusText(rows){
        const total=model()?.total||0,selected=rows.flatMap(row=>row.proposed).filter(item=>item.fund).length,te=teResult();
        const limit=state.maxTe;
        const teText=Number.isFinite(te.value)?`Tracking error ${pct(te.value)} (${te.months} cierres mensuales comunes)`:`Tracking error pendiente: ${te.reason}`;
        const verdict=!state.historyComparable?'Comparabilidad de divisa y series sin confirmar.':Number.isFinite(te.value)&&Number.isFinite(limit)?te.value<=limit?'Dentro del limite configurado.':'Supera el limite configurado.':'Sin validacion de limite.';
        return `${rows.length} categorias · ${selected} fondos identificados · pesos ${total.toFixed(2)}%. ${teText}. ${verdict}`;
    }
    function loadWorkbook(workbook,fileName){
        const sheet=findSheet(workbook,['Carteras Modelo']);if(!sheet)return false;
        const grid=XLSX.utils.sheet_to_json(workbook.Sheets[sheet],{header:1,defval:null,raw:true});
        state.models=core.parseGrid(grid);state.selected=0;state.source=fileName;state.historyComparable=false;
        const comparable=panel?.querySelector('#gdcComparable');if(comparable)comparable.checked=false;
        state.benchmarkMeta=benchmarkCategorySheetToMap(workbook,findSheet(workbook,['bench categ','bench category','benchmark categ']));
        if(!Object.keys(state.benchmarkMeta).length)state.benchmarkMeta=loadedPortfolio?.benchCategories||{};
        state.benchmarks=benchmarkSheetToSeriesMap(workbook,findSheet(workbook,['bench','benchmark','benchmarks']));
        state.prices=Object.fromEntries(Object.entries(benchmarkSheetToSeriesMap(workbook,findSheet(workbook,['prices','precios','historicos','historico']))).map(([key,value])=>[key.toUpperCase(),value.data]));
        invalidateReport();render();return true;
    }
    async function importFile(){
        const file=panel.querySelector('#gdcFile')?.files?.[0];if(!file)return;
        const status=panel.querySelector('#gdcStatus');status.textContent='Leyendo carteras modelo...';
        try{if(!loadWorkbook(await readWorkbook(file),file.name))throw new Error('No se encontro la hoja Carteras Modelo.');}
        catch(error){status.textContent=error.message;}
    }
    function select(index,isin,slot=0){
        const row=model()?.rows[index];if(!row)return;
        const value=normalizeIsin(isin);if(value&&row.proposedPositions.some((item,i)=>item.isin===value&&i!==slot)){panel.querySelector('#gdcStatus').textContent='Ese ISIN ya esta en la categoria.';return;}
        if(!row.proposedPositions[slot])row.proposedPositions.push({isin:'',share:100});
        row.proposedPositions[slot].isin=value;row.keepCurrent=false;invalidateReport();render();
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
    function populateUniverse(select){
        if(select.dataset.loaded)return;const [index,slot]=select.dataset.gdcUniverse.split(':').map(Number),row=model()?.rows[index];if(!row)return;
        const selected=row.proposedPositions[slot]?.isin||'',fragment=document.createDocumentFragment();
        for(const fund of categoryUniverse(row)){const option=document.createElement('option');option.value=fund.isin;option.textContent=`${fund.isin} · ${fund.name||'-'} · ${fund.category||'-'} · TER ${fmt(fund.ter)}% · score ${fmt(fund.score)}`;fragment.append(option);}
        select.replaceChildren(new Option('Universo completo · elegir fondo',''),fragment);select.value=selected;select.dataset.loaded='true';
    }
    function rowHtml(row,index){
        const options=shortlist(row),proposed=positions(row,'proposed'),currentFunds=positions(row,'current');
        const list=options.map((item,i)=>`<tr><td>${i+1}</td><td>${esc(item.name)}<br><small>${esc(item.isin)}</small></td><td>${QualityCore.withTechnical(item.score,true)}</td><td>${fmt(item.ter)}%</td><td>${fmt(item.ret5)}%</td><td>${fmt(item.risk5)}%</td></tr>`).join('');
        const slots=row.proposedPositions.length?row.proposedPositions:[{isin:'',share:100}];
        const controls=slots.map((item,slot)=>{
            const top=options.map((fund,i)=>`<option value="${esc(fund.isin)}" ${fund.isin===item.isin?'selected':''}>${i+1}. ${esc(fund.isin)} · ${esc(fund.name)} · ${esc(fund.category)} · TER ${fmt(fund.ter)}%</option>`).join('');
            const outside=item.isin&&!options.some(fund=>fund.isin===item.isin)?`<option value="${esc(item.isin)}" selected>${esc(item.isin)} · ${esc(record(item.isin)?.name||'Fuera del top 5')}</option>`:'';
            return `<div class="gdc-proposal-line"><span class="gdc-proposal-number">${slot+1}</span><div><select aria-label="Top 5 para ${esc(row.generic)}, fondo ${slot+1}" data-gdc-select="${index}:${slot}"><option value="">Top 5 · elegir fondo</option>${outside}${top}</select><select aria-label="Universo completo para ${esc(row.generic)}, fondo ${slot+1}" data-gdc-universe="${index}:${slot}"><option value="${esc(item.isin||'')}">${item.isin?`${esc(item.isin)} · ${esc(record(item.isin)?.name||'-')}`:'Universo completo · abrir para buscar'}</option></select></div><label>Dentro de categoría (%)<input type="number" min="0" max="100" step="0.01" value="${fmt(item.share)}" data-gdc-weight="${index}:${slot}" ${row.keepCurrent?'disabled':''}></label><button type="button" data-gdc-remove="${index}:${slot}" title="Quitar fondo" aria-label="Quitar fondo ${slot+1}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></div>`;
        }).join('');
        const info=proposed.map(item=>`<div>${esc(item.fund?.name||item.isin)}<br>${QualityCore.withTechnical(item.fund?.score,true)} · TER ${fmt(item.fund?.ter)}% · ${fmt(item.weight)}% cartera</div>`).join('');
        const peersHtml=proposed.map(item=>{const peer=peers(item.fund);return `<div>${esc(item.fund?.category||'-')}<br>Calidad ${fmt(peer?.meanScore)} · TER ${fmt(peer?.meanTer)}%</div>`;}).join('');
        return `<tr><td><b>${esc(row.generic)}</b><br><small>${row.subcategories.map(esc).join(' · ')}</small></td><td>${fmt(row.weight)}%</td><td><textarea class="gdc-current" rows="${Math.max(2,Math.min(4,currentFunds.length))}" aria-label="ISIN actuales ${esc(row.generic)}" data-gdc-current="${index}" placeholder="Un ISIN por línea">${esc(currentFunds.map(item=>item.isin).join('\n'))}</textarea><small>${currentFunds.map(item=>`${esc(item.fund?.name||item.isin)} · ${fmt(item.share)}%`).join('<br>')}</small></td><td><label class="gdc-keep-current"><input type="checkbox" data-gdc-keep="${index}" ${row.keepCurrent?'checked':''} ${!currentFunds.length?'disabled':''}> Mantener posiciones actuales</label>${controls}<button type="button" data-gdc-add="${index}" ${row.keepCurrent?'disabled':''}><i class="fa-solid fa-plus" aria-hidden="true"></i> Añadir fondo</button><details><summary>Ver los 5 mejores</summary><table class="gdc-top-table"><thead><tr><th>#</th><th>Fondo</th><th>Calidad</th><th>TER</th><th>Ret 5A</th><th>Riesgo 5A</th></tr></thead><tbody>${list||'<tr><td colspan="6">Sin fondos scoreados para estas categorías.</td></tr>'}</tbody></table></details></td><td class="gdc-position-summary">${info||'-'}</td><td class="gdc-position-summary">${peersHtml||'-'}</td></tr>`;
    }
    function render(){
        if(!panel)return;const selected=model();
        if(rankSource&&rankSource!==records())invalidateReport();
        panel.querySelector('#gdcModels').innerHTML=state.models.map((item,index)=>`<option value="${index}" ${index===state.selected?'selected':''}>${esc(item.name)}</option>`).join('');
        panel.querySelector('#gdcSource').textContent=state.source?`Origen: ${state.source}`:'Importa el Excel de cartera scoring con la hoja Carteras Modelo.';
        panel.querySelector('#gdcControls').hidden=!selected;panel.querySelector('#gdcBody').innerHTML=selected?selected.rows.map(rowHtml).join(''):'';
        const rows=effectiveRows(),score=coverage(rows,'score'),ter=coverage(rows,'ter');
        const status=panel.querySelector('#gdcStatus'),te=selected?teResult():null;
        status.textContent=selected?`${statusText(rows)} Calidad ponderada ${fmt(score.value)} (cobertura ${(score.coverage*100).toFixed(0)}%); TER ponderado ${fmt(ter.value)}% (cobertura ${(ter.coverage*100).toFixed(0)}%).`:'';
        status.classList.toggle('gdc-te-breach',Boolean(te&&state.historyComparable&&Number.isFinite(te.value)&&Number.isFinite(state.maxTe)&&te.value>state.maxTe));
        status.classList.toggle('gdc-te-ok',Boolean(te&&state.historyComparable&&Number.isFinite(te.value)&&Number.isFinite(state.maxTe)&&te.value<=state.maxTe));
        if(selected&&window.Plotly)FinancialVisuals.newPlot('gdcWeightChart',[{type:'bar',x:rows.map(r=>r.generic),y:rows.map(r=>r.weight),marker:{color:'#164e78'}}],{title:`Pesos · ${selected.name}`,yaxis:{title:'Peso (%)'},margin:{t:42,l:54,r:20,b:95}},{responsive:true});
    }
    function exportExcel(){
        const selected=model();if(!selected||!window.XLSX)return;
        const rows=effectiveRows(),book=XLSX.utils.book_new();
        const te=teResult(),teStatus=!Number.isFinite(te.value)?'No verificable':!state.historyComparable?'Divisa y series sin confirmar':!Number.isFinite(state.maxTe)?'Limite sin definir':te.value<=state.maxTe?'Dentro del limite':'Supera el limite';
        const output=[['Cartera modelo',selected.name],['Fecha',new Date().toISOString().slice(0,10)],['Fuente',state.source],['Peso total (%)',selected.total],['Tracking error',Number.isFinite(te.value)?te.value:null],['Limite TE',Number.isFinite(state.maxTe)?state.maxTe:null],['Estado TE',teStatus],[],['Categoria GDC','Subcategorias Morningstar','Peso categoria (%)','ISIN actual(es)','ISIN propuesto','Fondo propuesto','Peso dentro categoria (%)','Peso cartera (%)','TER propuesto (%)','Score propuesto']];
        rows.forEach(row=>row.proposed.forEach(item=>output.push([row.generic,row.subcategories.join('; '),row.weight,row.current.map(current=>current.isin).join('; '),item.isin,item.fund?.name||'',item.share,item.weight,item.fund?.ter??'',item.fund?.score??''])));
        XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(output),'Seleccion');
        const monthly=[['Modelo','Categoria GDC','ISIN','Peso dentro categoria (%)','Peso categoria (%)','Fecha']];
        state.models.forEach(portfolio=>portfolio.rows.forEach(row=>{
            const selectedPositions=row.keepCurrent?row.currentPositions:row.proposedPositions;
            selectedPositions.forEach(item=>monthly.push([portfolio.name,row.generic,item.isin,item.share,row.weight,new Date().toISOString().slice(0,10)]));
        }));
        XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(monthly),'GDC Estado');
        XLSX.writeFile(book,`GDC_${selected.name.replace(/[^a-z0-9_-]/gi,'_')}_${new Date().toISOString().slice(0,10)}.xlsx`);
    }
    function loadPriorWorkbook(workbook){
        if(!state.models.length)throw new Error('Importa primero el Excel base con Carteras Modelo.');
        const sheet=findSheet(workbook,['GDC Estado']);if(!sheet)throw new Error('El archivo anterior no contiene la hoja GDC Estado.');
        const groups=new Map();
        for(const item of sheetRows(workbook,sheet)){
            const name=String(firstValue(item,['Modelo'])||''),category=String(firstValue(item,['Categoria GDC'])||''),isin=normalizeIsin(firstValue(item,['ISIN']));
            const share=parseNumber(firstValue(item,['Peso dentro categoria (%)']));
            if(!name||!category||!isin||!Number.isFinite(share)||share<0)continue;
            const key=`${core.key(name)}|${core.key(category)}`;if(!groups.has(key))groups.set(key,[]);
            groups.get(key).push({isin,share});
        }
        let count=0;
        state.models.forEach(portfolio=>portfolio.rows.forEach(row=>{
            const previous=groups.get(`${core.key(portfolio.name)}|${core.key(row.generic)}`);if(!previous?.length)return;
            const unique=new Map();previous.forEach(item=>unique.set(item.isin,(unique.get(item.isin)||0)+item.share));
            const total=[...unique.values()].reduce((sum,value)=>sum+value,0);if(!(total>0))return;
            row.currentPositions=[...unique].map(([isin,share])=>({isin,share:share/total*100}));
            row.proposedPositions=row.currentPositions.map(item=>({...item}));row.keepCurrent=true;count+=row.currentPositions.length;
        }));
        if(!count)throw new Error('No hay modelos y categorias coincidentes con las carteras cargadas.');
        invalidateReport();render();return count;
    }
    async function importPriorFile(){
        const file=panel.querySelector('#gdcPriorFile')?.files?.[0];if(!file)return;
        try{const count=loadPriorWorkbook(await readWorkbook(file));panel.querySelector('#gdcStatus').textContent=`${count} posiciones anteriores cargadas como actuales. Revisa los pesos y genera la nueva propuesta.`;}
        catch(error){panel.querySelector('#gdcStatus').textContent=error.message;}
    }
    function weightedMetric(items,key){return FinanceCore.weighted(items.map(item=>({weight:item.share,[key]:item.fund?.[key]})),key);}
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
            try{await FinancialVisuals.newPlot(chart,traces,{title:`${row.generic} · calidad frente a TER`,xaxis:{title:'TER (%)',automargin:true},yaxis:{title:'Calidad (estrellas)',range:[0,4.15],tickvals:[.5,1.5,2.5,3.5,4],ticktext:[1,2,3,4,5].map(n=>'★'.repeat(n))},margin:{t:38,l:95,r:25,b:58},legend:{orientation:'h',y:-.27}},{staticPlot:true});image=await Plotly.toImage(chart,{format:'png',width:1000,height:300}).catch(()=> '');}
            finally{Plotly.purge(chart);chart.remove();}
        }
        const cells=(label,value)=>`<tr><td>${label}</td><td>${value?esc(value.name||'Media de categoría'):'-'}</td><td>${QualityCore.withTechnical(value?.score,true)}</td><td>${metricPct(value?.ter)}</td><td>${metricPct(value?.ret5)}</td><td>${metricPct(value?.risk5)}</td></tr>`;
        const currentSummary={name:row.current.map(position=>position.fund?.name||position.isin).join('; '),score:weightedMetric(row.current,'score').value,ter:weightedMetric(row.current,'ter').value,ret5:weightedMetric(row.current,'ret5').value,risk5:weightedMetric(row.current,'risk5').value};
        const mean={name:`${fund?.category||row.generic} · ${peer?.count||0} peers`,score:peer?.meanScore,ter:peer?.meanTer,ret5:ret.value,risk5:risk.value};
        return `<section class="block report-keep-together gdc-peer-report"><h3>${esc(row.generic)} · ${esc(fund?.name||item.isin)}</h3><p>${esc(item.isin)} · peso en cartera ${fmt(item.weight)}% · ${esc(fund?.category||row.subcategories.join('; '))}</p>${image?`<figure><img src="${image}" alt="Calidad y TER de ${esc(row.generic)} frente a peers"></figure>`:'<p>Sin métricas suficientes para representar la comparación.</p>'}<table class="wide-report-table"><thead><tr><th>Referencia</th><th>Fondo</th><th>Calidad</th><th>TER</th><th>Ret 5A</th><th>Riesgo 5A</th></tr></thead><tbody>${cells('Actual',row.current.length?currentSummary:null)}${cells(row.keepCurrent?'Sin cambio':'Propuesta',fund)}${cells('Media peers',mean)}</tbody></table><p class="gdc-peer-coverage">Ret 5A: ${ret.count}/${cohort.length} peers con dato; riesgo 5A: ${risk.count}/${cohort.length}. Las medias se calculan con los peers que tienen cada métrica.</p></section>`;
    }
    async function report(){
        const selected=model();if(!selected)return;
        const rows=effectiveRows(),te=teResult(),score=coverage(rows,'score'),ter=coverage(rows,'ter');
        const peerSections=[];for(const row of rows)for(const item of row.proposed)peerSections.push(await peerReportSection(row,item));
        const comparable=rows.map(row=>({weight:row.weight,current:weightedMetric(row.current,'ter'),proposed:weightedMetric(row.proposed,'ter')})).filter(item=>item.current.coverage>.999&&item.proposed.coverage>.999);
        const saving=comparable.length?comparable.reduce((sum,item)=>sum+item.weight/100*(item.current.value-item.proposed.value),0):NaN;
        const date=new Date().toLocaleDateString('es-ES');
        const savingText=Number.isFinite(saving)
            ? `Reduccion estimada de TER: ${fmt(saving)} pp; cobertura ${comparable.reduce((sum,item)=>sum+item.weight,0).toFixed(1)}% del modelo. No equivale a un ahorro monetario sin AUM declarado.`
            : 'Reduccion de TER pendiente de informar las posiciones actuales y sus costes.';
        const positions=rows.flatMap(row=>row.proposed.map(item=>`<tr><td>${esc(row.generic)}</td><td>${fmt(row.weight)}%</td><td>${esc(row.current.map(position=>position.isin).join('; ')||'-')}</td><td>${esc(item.isin)}</td><td>${esc(item.fund?.name||'-')}</td><td>${fmt(item.weight)}%</td><td>${QualityCore.withTechnical(item.fund?.score,true)}</td><td>${metricPct(item.fund?.ter)}</td></tr>`)).join('');
        const metricRows=rows.flatMap(row=>row.proposed.map(item=>`<tr><td>${esc(row.generic)}<br><small>${esc(item.isin)}</small></td><td>${QualityCore.withTechnical(weightedMetric(row.current,'score').value,true)}</td><td>${metricPct(weightedMetric(row.current,'ter').value)}</td><td>${metricPct(weightedMetric(row.current,'ret5').value)}</td><td>${metricPct(weightedMetric(row.current,'risk5').value)}</td><td>${QualityCore.withTechnical(item.fund?.score,true)}</td><td>${metricPct(item.fund?.ter)}</td><td>${metricPct(item.fund?.ret5)}</td><td>${metricPct(item.fund?.risk5)}</td></tr>`)).join('');
        const body=`<div class="report manager-report">
            <header class="cover"><h1>Cartera modelo GDC · ${esc(selected.name)}</h1><p>Revision mensual · ${date}</p></header>
            <section class="block"><h2>Resumen de la cartera propuesta</h2><div class="summary gdc-report-summary">
                <div><span>Peso total</span><strong>${fmt(selected.total)}%</strong></div>
                <div><span>Calidad ponderada</span><strong>${QualityCore.withTechnical(score.value)}</strong></div>
                <div><span>TER ponderado</span><strong>${fmt(ter.value)}%</strong></div>
                <div><span>Tracking error</span><strong>${pct(te.value)}</strong></div>
            </div><p>${esc(statusText(rows))}</p><p>${savingText}</p></section>
            <section class="block"><h2>Posiciones actuales y propuesta</h2><table class="wide-report-table"><colgroup><col style="width:14%"><col style="width:8%"><col style="width:17%"><col style="width:14%"><col style="width:24%"><col style="width:8%"><col style="width:9%"><col style="width:6%"></colgroup>
                <thead><tr><th>Categoria</th><th>Peso cat.</th><th>ISIN actual(es)</th><th>ISIN seleccionado</th><th>Fondo seleccionado</th><th>Peso cartera</th><th>Calidad</th><th>TER</th></tr></thead>
                <tbody>${positions}</tbody>
            </table></section>
            <section class="block"><h2>Metricas actuales frente a propuestas</h2><table class="wide-report-table">
                <thead><tr><th>Categoria</th><th>Calidad actual</th><th>TER actual</th><th>Ret 5A actual</th><th>Riesgo 5A actual</th><th>Calidad propuesta</th><th>TER propuesto</th><th>Ret 5A propuesto</th><th>Riesgo 5A propuesto</th></tr></thead>
                <tbody>${metricRows}</tbody>
            </table></section>
            <section class="block"><h2>Calidad y costes relativos a peers</h2><p>Cada fondo seleccionado se compara por separado con su categoria Morningstar. Las medias excluyen ese ISIN; los puntos actuales se mantienen aunque no haya cambios.</p></section>${peerSections.join('')}
            <footer><p>Tracking error: desviacion estandar de retornos activos mensuales, anualizada con raiz de 12; exige cuatro cierres consecutivos comunes. Rebalanceo mensual; sin costes, impuestos ni cambio de divisa.</p>
            <p>Fuente: ${esc(state.source)}. Score interno 0-4 convertido en 1-5 estrellas; media entre categorias orientativa. Peers Morningstar. Resultados no garantizados.</p></footer>
        </div>`;
        const reportDoc=new DOMParser().parseFromString(body,'text/html');
        state.reportHtml=`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"></head><body>${reportDoc.body.innerHTML}</body></html>`;
        ReportDesign.preview(panel.querySelector('#gdcReportPreview'),state.reportHtml);
    }
    function init(){
        panel=document.getElementById('workspaceModel');if(!panel)return;
        panel.innerHTML=`<div class="workspace-heading"><div><h3>Cartera modelo GDC</h3></div></div><div class="workspace-tools"><label class="gdc-upload">Importar Excel base <input id="gdcFile" type="file" accept=".xlsx,.xls"></label><label class="gdc-upload">Selección del mes anterior <input id="gdcPriorFile" type="file" accept=".xlsx,.xls"></label><select id="gdcModels" aria-label="Cartera modelo"></select><button type="button" id="gdcExport"><i class="fa-solid fa-file-excel" aria-hidden="true"></i> Exportar Excel mensual</button><button type="button" id="gdcReport"><i class="fa-solid fa-file-lines" aria-hidden="true"></i> Generar informe</button><button type="button" id="gdcPdf"><i class="fa-solid fa-file-pdf" aria-hidden="true"></i> Descargar PDF</button></div><p id="gdcSource" class="workspace-context"></p><div id="gdcControls"><div class="gdc-risk-controls"><label class="workspace-context">Limite de tracking error anual (%) <input id="gdcMaxTe" type="number" min="0" step="0.1" placeholder="Sin definir"></label><label class="workspace-context"><input id="gdcComparable" type="checkbox"> Confirmo misma divisa y series comparables (distribuciones/ajustes)</label></div><p id="gdcStatus" class="workspace-status" role="status"></p><div id="gdcWeightChart" class="gdc-weight-chart"></div><div class="proposal-chart-scroll"><table class="wide-report-table gdc-selection-table"><thead><tr><th>Categoria y mapeo</th><th>Peso</th><th>Posiciones actuales</th><th>Selección de fondos</th><th>Propuesta</th><th>Peers</th></tr></thead><tbody id="gdcBody"></tbody></table></div></div><div id="gdcReportPreview"></div>`;
        panel.querySelector('#gdcFile').addEventListener('change',importFile);
        panel.querySelector('#gdcPriorFile').addEventListener('change',importPriorFile);
        panel.querySelector('#gdcModels').addEventListener('change',event=>{state.selected=Number(event.target.value);invalidateReport();render();});
        panel.querySelector('#gdcMaxTe').addEventListener('change',event=>{state.maxTe=event.target.value===''?NaN:Number(event.target.value)/100;invalidateReport();render();});
        panel.querySelector('#gdcComparable').addEventListener('change',event=>{state.historyComparable=event.target.checked;invalidateReport();render();});
        panel.querySelector('#gdcExport').addEventListener('click',exportExcel);
        panel.querySelector('#gdcReport').addEventListener('click',()=>report().catch(error=>panel.querySelector('#gdcStatus').textContent=error.message));
        panel.querySelector('#gdcPdf').addEventListener('click',async()=>{if(!state.reportHtml)await report();if(state.reportHtml)await ReportDesign.downloadPdf(state.reportHtml,`GDC_${model().name.replace(/[^a-z0-9_-]/gi,'_')}.pdf`);});
        panel.addEventListener('focusin',event=>{if(event.target.dataset.gdcUniverse!==undefined)populateUniverse(event.target);});
        panel.addEventListener('change',event=>{
            const el=event.target,slot=el.dataset.gdcSelect??el.dataset.gdcUniverse??el.dataset.gdcWeight;
            if(slot!==undefined){const [index,position]=slot.split(':').map(Number);if(el.dataset.gdcWeight!==undefined)positionWeight(index,position,el.value);else select(index,el.value,position);}
            else if(el.dataset.gdcCurrent!==undefined)current(Number(el.dataset.gdcCurrent),el.value);
            else if(el.dataset.gdcKeep!==undefined)keepCurrent(Number(el.dataset.gdcKeep),el.checked);
        });
        panel.addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;if(button.dataset.gdcAdd!==undefined)addPosition(Number(button.dataset.gdcAdd));else if(button.dataset.gdcRemove!==undefined){const [index,slot]=button.dataset.gdcRemove.split(':').map(Number);removePosition(index,slot);}});
        render();
    }
    return {init,loadWorkbook,loadPriorWorkbook,render,select,current,state};
})();
