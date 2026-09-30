const GdcModel=(()=>{
    const core=ModelPortfolioCore;
    const state={models:[],selected:0,source:'',benchmarks:{},benchmarkMeta:{},prices:{},maxTe:NaN,historyComparable:false,activeRow:0,reportHtml:''};
    let panel,peerIndex,peerSource,rankingCache=new Map(),rankSource;
    const esc=value=>escapeHtml(String(value??''));
    const fmt=value=>Number.isFinite(value)?value.toFixed(2):'-';
    const metricPct=value=>Number.isFinite(value)?`${fmt(value)}%`:'-';
    const pct=value=>Number.isFinite(value)?`${(value*100).toFixed(2)}%`:'Pendiente';
    function invalidateReport(){state.reportHtml='';const preview=panel?.querySelector('#gdcReportPreview');if(preview)preview.textContent='Datos modificados. Genera un nuevo informe.';}
    function model(){return state.models[state.selected];}
    function records(){return fundUniverseState?.records||[];}
    function shortlist(row){
        const source=records();if(source!==rankSource){rankSource=source;rankingCache.clear();peerIndex=null;}
        const key=row.subcategories.map(core.key).join('|');if(!rankingCache.has(key))rankingCache.set(key,core.rank(source,row.subcategories));
        return rankingCache.get(key);
    }
    function record(isin){return fundUniverseState?.isinIndex?.get(isin)||null;}
    function peers(fund){if(!fund)return null;if(!peerIndex||peerSource!==records()){peerSource=records();peerIndex=PeerValue.index(peerSource);}return PeerValue.compare(fund,peerIndex);}
    function categoryBenchmarks(){return core.benchmarkIndex(Object.keys(state.benchmarkMeta).length?state.benchmarkMeta:loadedPortfolio?.benchCategories||{});}
    function benchmarkLabel(ticker){const meta=state.benchmarkMeta[ticker]||loadedPortfolio?.benchCategories?.[ticker];return meta?.name&&core.key(meta.name)!==core.key(ticker)?`${meta.name} (${ticker})`:ticker;}
    function fundHistories(){return {...Object.fromEntries(Object.entries(loadedPortfolio?.priceSeries||{}).map(([key,item])=>[key.toUpperCase(),item.data||item])),...state.prices};}
    function benchmark(row){
        const selected=record(row.selectedIsin),category=selected?.category||row.subcategories[0];
        return categoryBenchmarks().get(core.key(category))||[];
    }
    function effectiveRows(){return (model()?.rows||[]).map(row=>({...row,current:record(row.currentIsin),selected:record(row.selectedIsin),benchmark:row.benchmark||benchmark(row)[0]||''}));}
    function teResult(){if(Math.abs((model()?.total||0)-100)>.5)return {value:NaN,reason:'Los pesos del modelo no suman 100%.'};const rows=effectiveRows();if(rows.some(row=>!row.selected))return {value:NaN,reason:'Hay fondos propuestos sin match en el universo.'};return core.trackingError(rows,fundHistories(),{...loadedPortfolio?.benchmarks,...state.benchmarks});}
    function coverage(rows,key){const weighted=FinanceCore.weighted(rows.map(row=>({weight:row.weight,[key]:row.selected?.[key]})),key);return weighted;}
    function statusText(rows){
        const total=model()?.total||0,selected=rows.filter(row=>row.selected).length,te=teResult();
        const limit=state.maxTe;
        const teText=Number.isFinite(te.value)?`Tracking error ${pct(te.value)} (${te.months} cierres mensuales comunes)`:`Tracking error pendiente: ${te.reason}`;
        const verdict=!state.historyComparable?'Comparabilidad de divisa y series sin confirmar.':Number.isFinite(te.value)&&Number.isFinite(limit)?te.value<=limit?'Dentro del limite configurado.':'Supera el limite configurado.':'Sin validacion de limite.';
        return `${rows.length} categorias · ${selected} fondos seleccionados · pesos ${total.toFixed(2)}%. ${teText}. ${verdict}`;
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
    function select(index,isin){const row=model()?.rows[index];if(!row)return;row.selectedIsin=isin;row.benchmark='';row.ticker='';invalidateReport();render();}
    function current(index,isin){const row=model()?.rows[index];if(!row)return;row.currentIsin=normalizeIsin(isin);invalidateReport();render();}
    function setBench(index,value){const row=model()?.rows[index];if(!row)return;row.benchmark=value;invalidateReport();render();}
    function setTicker(index,value){const row=model()?.rows[index];if(!row)return;row.ticker=value.trim().toUpperCase();invalidateReport();render();}
    async function loadHistory(index){
        const row=model()?.rows[index];if(!row||!row.ticker||!row.selectedIsin)return;
        const status=panel.querySelector('#gdcStatus');status.textContent=`Descargando historico de ${row.ticker}...`;
        try{const end=new Date(),start=new Date(end);start.setUTCFullYear(start.getUTCFullYear()-12);state.prices[row.selectedIsin]=await fetchYahooData(row.ticker,start.toISOString().slice(0,10),end.toISOString().slice(0,10));invalidateReport();render();}
        catch(error){status.textContent=`No se ha podido cargar ${row.ticker}: ${error.message}`;}
    }
    function history(index){state.activeRow=index;renderHistory();}
    function renderHistory(){
        const row=effectiveRows()[state.activeRow],target=panel.querySelector('#gdcHistory'),label=panel.querySelector('#gdcHistoryLabel');if(!row||!target)return;
        const benchmarks={...loadedPortfolio?.benchmarks,...state.benchmarks},histories=fundHistories(),fund=histories[row.selectedIsin]||histories[row.ticker],bench=benchmarks[row.benchmark]?.data;
        label.textContent=`${row.generic} · ${row.selected?.name||'Sin fondo'} vs ${row.benchmark?benchmarkLabel(row.benchmark):'sin benchmark'}`;
        if(!fund?.length||!bench?.length){target.innerHTML='<p class="workspace-context">Histórico no disponible: carga precios del ISIN o indica un ticker Yahoo y comprueba que exista el índice de esa categoría en la hoja bench.</p>';return;}
        try{const result=MultiAssetCompare.compare([{ticker:row.selected?.name||row.selectedIsin,data:fund},{ticker:row.benchmark,data:bench}]);
            Plotly.purge(target);target.innerHTML='';
            FinancialVisuals.newPlot('gdcHistory',[{x:result.rows.map(r=>r.date),y:result.assets[0].base100,name:row.selected?.name||row.selectedIsin,mode:'lines',line:{color:'#164e78',width:2.4},meta:{financialRole:'origin'}},{x:result.rows.map(r=>r.date),y:result.assets[1].base100,name:benchmarkLabel(row.benchmark),mode:'lines',line:{color:'#6b7785',width:2,dash:'dot'},meta:{financialRole:'proposal'}}],{title:'Evolucion historica base 100',yaxis:{title:'Base 100'},margin:{t:42,l:52,r:20,b:60},legend:{orientation:'h',y:-.2}},{responsive:true});
        }catch(error){target.innerHTML=`<p class="workspace-context">${esc(error.message)}</p>`;}
    }
    function renderPeerChart(rows){
        const target=panel.querySelector('#gdcPeerChart');if(!target)return;
        const traces=[];rows.forEach(row=>{if(!row.selected)return;const peer=peers(row.selected);
            if(Number.isFinite(peer?.meanTer)&&Number.isFinite(peer?.meanScore))traces.push({x:[peer.meanTer],y:[peer.meanScore],mode:'markers',name:`Peers ${row.generic}`,marker:{symbol:'circle-open',size:11},hovertext:`Peers ${row.selected.category}`,meta:{financialRole:'proposal'}});
            if(Number.isFinite(row.selected.ter)&&Number.isFinite(row.selected.score))traces.push({x:[row.selected.ter],y:[row.selected.score],mode:'markers+text',text:[row.generic],textposition:'top center',name:row.selected.name,marker:{size:13},meta:{financialRole:'origin'}});
        });
        if(!traces.length){target.innerHTML='<p class="workspace-context">Selecciona fondos con TER y calidad para comparar con sus peers.</p>';return;}
        Plotly.purge(target);target.innerHTML='';
        FinancialVisuals.newPlot('gdcPeerChart',traces,{title:'Calidad y TER frente a peers de cada categoria',xaxis:{title:'TER (%)'},yaxis:{title:'Calidad tecnica (0-4)'},margin:{t:44,l:60,r:18,b:65},legend:{orientation:'h',y:-.23}},{responsive:true});
    }
    function rowHtml(row,index){
        const options=shortlist(row),fund=record(row.selectedIsin),peer=peers(fund),currentFund=record(row.currentIsin),benchOptions=benchmark(row);
        const optionHtml=options.map((item,i)=>`<option value="${esc(item.isin)}" ${item.isin===row.selectedIsin?'selected':''}>${i+1}. ${esc(item.name)} · ${esc(item.isin)}</option>`).join('');
        const list=options.map((item,i)=>`<tr><td>${i+1}</td><td>${esc(item.name)}<br><small>${esc(item.isin)}</small></td><td>${QualityCore.withTechnical(item.score,true)}</td><td>${fmt(item.ter)}%</td><td>${fmt(item.ret5)}%</td><td>${fmt(item.risk5)}%</td></tr>`).join('');
        return `<tr><td><b>${esc(row.generic)}</b><br><small>${row.subcategories.map(esc).join(' · ')}</small></td><td>${fmt(row.weight)}%</td><td><input class="gdc-current" aria-label="ISIN actual ${esc(row.generic)}" value="${esc(row.currentIsin||'')}" data-gdc-current="${index}" placeholder="ISIN actual"><small>${esc(currentFund?.name||'')}</small></td><td><select aria-label="Fondo propuesto ${esc(row.generic)}" data-gdc-select="${index}"><option value="">Elegir entre los mejores</option>${optionHtml}</select><details><summary>Ver los 5 mejores</summary><table class="gdc-top-table"><thead><tr><th>#</th><th>Fondo</th><th>Calidad</th><th>TER</th><th>Ret 5A</th><th>Riesgo 5A</th></tr></thead><tbody>${list||'<tr><td colspan="6">Sin fondos scoreados para estas categorías.</td></tr>'}</tbody></table></details></td><td>${fund?`${QualityCore.withTechnical(fund.score,true)}<br>TER ${fmt(fund.ter)}%`:''}</td><td>${peer?`Peers ${peer.count}/${peer.total}<br>Calidad ${fmt(peer.meanScore)} · TER ${fmt(peer.meanTer)}%`:'-'}</td><td><select aria-label="Benchmark ${esc(row.generic)}" data-gdc-bench="${index}"><option value="">Sin indice</option>${benchOptions.map(key=>`<option value="${esc(key)}" ${key===(row.benchmark||benchOptions[0])?'selected':''}>${esc(benchmarkLabel(key))}</option>`).join('')}</select><div class="gdc-history-actions"><input aria-label="Ticker Yahoo ${esc(row.generic)}" data-gdc-ticker="${index}" placeholder="Ticker Yahoo" value="${esc(row.ticker||'')}"><button type="button" data-gdc-load="${index}" title="Cargar historico Yahoo"><i class="fa-solid fa-download"></i></button><button type="button" data-gdc-history="${index}" title="Ver historico de esta categoria"><i class="fa-solid fa-chart-line"></i></button></div></td></tr>`;
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
        if(selected&&window.Plotly){FinancialVisuals.newPlot('gdcWeightChart',[{type:'bar',x:rows.map(r=>r.generic),y:rows.map(r=>r.weight),marker:{color:'#164e78'}}],{title:`Pesos · ${selected.name}`,yaxis:{title:'Peso (%)'},margin:{t:42,l:54,r:20,b:95}},{responsive:true});renderPeerChart(rows);renderHistory();}
    }
    function exportExcel(){
        const selected=model();if(!selected||!window.XLSX)return;
        const rows=effectiveRows(),book=XLSX.utils.book_new();
        const te=teResult(),teStatus=!Number.isFinite(te.value)?'No verificable':!state.historyComparable?'Divisa y series sin confirmar':!Number.isFinite(state.maxTe)?'Limite sin definir':te.value<=state.maxTe?'Dentro del limite':'Supera el limite';
        const output=[['Cartera modelo',selected.name],['Fecha',new Date().toISOString().slice(0,10)],['Fuente',state.source],['Peso total (%)',selected.total],['Tracking error',Number.isFinite(te.value)?te.value:null],['Limite TE',Number.isFinite(state.maxTe)?state.maxTe:null],['Estado TE',teStatus],[],['Categoria GDC','Subcategorias Morningstar','Peso (%)','ISIN actual','Fondo actual','TER actual (%)','Calidad actual','ISIN propuesto','Fondo propuesto','TER propuesto (%)','Calidad propuesta','Benchmark','Ticker Yahoo']];
        rows.forEach(row=>output.push([row.generic,row.subcategories.join('; '),row.weight,row.currentIsin||'',row.current?.name||'',row.current?.ter??'',row.current?.score??'',row.selectedIsin||'',row.selected?.name||'',row.selected?.ter??'',row.selected?.score??'',row.benchmark,row.ticker||'']));
        XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(output),'Seleccion');
        XLSX.writeFile(book,`GDC_${selected.name.replace(/[^a-z0-9_-]/gi,'_')}_${new Date().toISOString().slice(0,10)}.xlsx`);
    }
    async function peerReportSection(row){
        const fund=row.selected,peer=peers(fund),current=row.current;
        const cohort=records().filter(item=>item.isin!==fund?.isin&&core.key(item.category)===core.key(fund?.category)&&Number.isFinite(item.ter)&&Number.isFinite(item.score));
        let image='';
        if(fund&&Number.isFinite(fund.ter)&&Number.isFinite(fund.score)&&window.Plotly){
            const traces=[];
            if(cohort.length)traces.push({x:cohort.map(item=>item.ter),y:cohort.map(item=>item.score),mode:'markers',name:'Peers',marker:{color:'#a9b4be',size:6,opacity:.42},meta:{financialRole:'proposal'},hoverinfo:'skip'});
            if(Number.isFinite(peer?.meanTer)&&Number.isFinite(peer?.meanScore))traces.push({x:[peer.meanTer],y:[peer.meanScore],mode:'markers',name:'Media peers',marker:{color:'#6b7785',size:15,symbol:'diamond'}});
            if(Number.isFinite(current?.ter)&&Number.isFinite(current?.score))traces.push({x:[current.ter],y:[current.score],mode:'markers',name:'Actual',marker:{color:'#6b7785',size:15,symbol:'circle'},meta:{financialRole:'proposal'}});
            traces.push({x:[fund.ter],y:[fund.score],mode:'markers',name:'Propuesta',marker:{color:'#164e78',size:17,symbol:'circle'},meta:{financialRole:'origin'}});
            const chart=document.createElement('div');chart.style.cssText='position:fixed;left:-12000px;width:900px;height:275px';document.body.append(chart);
            try{await FinancialVisuals.newPlot(chart,traces,{title:`${row.generic} · calidad frente a TER`,xaxis:{title:'TER (%)',automargin:true},yaxis:{title:'Puntuación técnica (0-4)',range:[0,4.1]},margin:{t:40,l:65,r:25,b:62},legend:{orientation:'h',y:-.3}},{staticPlot:true});image=await Plotly.toImage(chart,{format:'png',width:900,height:275}).catch(()=> '');}
            finally{Plotly.purge(chart);chart.remove();}
        }
        const cells=(label,item)=>`<tr><td>${label}</td><td>${item?esc(item.name||'Media de categoría'):'-'}</td><td>${Number.isFinite(item?.score)?fmt(item.score):'-'}</td><td>${Number.isFinite(item?.ter)?`${fmt(item.ter)}%`:'-'}</td><td>${Number.isFinite(item?.ret5)?`${fmt(item.ret5)}%`:'-'}</td><td>${Number.isFinite(item?.risk5)?`${fmt(item.risk5)}%`:'-'}</td></tr>`;
        const mean={name:`${fund?.category||row.generic} · ${peer?.count||0} peers`,score:peer?.meanScore,ter:peer?.meanTer};
        return `<section class="block report-keep-together"><h3>${esc(row.generic)} · ${esc(fund?.name||'Sin propuesta')}</h3><p>${esc(fund?.isin||'-')} · peso ${fmt(row.weight)}% · ${esc(fund?.category||row.subcategories.join('; '))}</p>${image?`<figure><img src="${image}" alt="Calidad y TER de ${esc(row.generic)} frente a peers"></figure>`:'<p>Sin métricas suficientes para representar la comparación.</p>'}<table class="wide-report-table"><thead><tr><th>Referencia</th><th>Fondo</th><th>Score técnico</th><th>TER</th><th>Ret 5A</th><th>Riesgo 5A</th></tr></thead><tbody>${cells('Actual',current)}${cells('Propuesta',fund)}${cells('Media peers',mean)}</tbody></table></section>`;
    }
    async function report(){
        const selected=model();if(!selected)return;
        const rows=effectiveRows(),te=teResult(),score=coverage(rows,'score'),ter=coverage(rows,'ter');
        const peerSections=[];for(const row of rows)peerSections.push(await peerReportSection(row));
        const comparable=rows.filter(r=>Number.isFinite(r.current?.ter)&&Number.isFinite(r.selected?.ter));
        const saving=comparable.length?comparable.reduce((sum,row)=>sum+row.weight/100*(row.current.ter-row.selected.ter),0):NaN;
        const date=new Date().toLocaleDateString('es-ES');
        const savingText=Number.isFinite(saving)
            ? `Reduccion estimada de TER: ${fmt(saving)} pp; cobertura ${comparable.reduce((sum,row)=>sum+row.weight,0).toFixed(1)}% del modelo. No equivale a un ahorro monetario sin AUM declarado.`
            : 'Reduccion de TER pendiente de informar las posiciones actuales y sus costes.';
        const positions=rows.map(row=>`<tr>
            <td>${esc(row.generic)}</td><td>${fmt(row.weight)}%</td>
            <td>${esc(row.currentIsin||'-')}</td><td>${esc(row.current?.name||'-')}</td>
            <td>${Number.isFinite(row.current?.ter)?`${fmt(row.current.ter)}%`:'-'}</td>
            <td>${esc(row.selectedIsin||'-')}</td><td>${esc(row.selected?.name||'-')}</td>
            <td>${QualityCore.withTechnical(row.selected?.score,true)}</td>
            <td>${Number.isFinite(row.selected?.ter)?`${fmt(row.selected.ter)}%`:'-'}</td>
            <td>${esc(row.benchmark||'-')}</td>
        </tr>`).join('');
        const metricRows=rows.map(row=>`<tr>
            <td>${esc(row.generic)}</td>
            <td>${QualityCore.withTechnical(row.current?.score,true)}</td><td>${metricPct(row.current?.ter)}</td>
            <td>${metricPct(row.current?.ret5)}</td><td>${metricPct(row.current?.risk5)}</td>
            <td>${QualityCore.withTechnical(row.selected?.score,true)}</td><td>${metricPct(row.selected?.ter)}</td>
            <td>${metricPct(row.selected?.ret5)}</td><td>${metricPct(row.selected?.risk5)}</td>
        </tr>`).join('');
        const body=`<div class="report manager-report">
            <header class="cover"><h1>Cartera modelo GDC · ${esc(selected.name)}</h1><p>Revision mensual · ${date}</p></header>
            <section class="block"><h2>Resumen de la cartera propuesta</h2><div class="summary">
                <div><span>Peso total</span><strong>${fmt(selected.total)}%</strong></div>
                <div><span>Calidad ponderada</span><strong>${QualityCore.withTechnical(score.value)}</strong></div>
                <div><span>TER ponderado</span><strong>${fmt(ter.value)}%</strong></div>
                <div><span>Tracking error</span><strong>${pct(te.value)}</strong></div>
            </div><p>${esc(statusText(rows))}</p><p>${savingText}</p></section>
            <section class="block"><h2>Posiciones actuales y propuesta</h2><table class="wide-report-table">
                <thead><tr><th>Categoria</th><th>Peso</th><th>ISIN actual</th><th>Fondo actual</th><th>TER actual</th><th>ISIN propuesto</th><th>Fondo propuesto</th><th>Calidad propuesta</th><th>TER propuesto</th><th>Benchmark</th></tr></thead>
                <tbody>${positions}</tbody>
            </table></section>
            <section class="block"><h2>Metricas actuales frente a propuestas</h2><table class="wide-report-table">
                <thead><tr><th>Categoria</th><th>Calidad actual</th><th>TER actual</th><th>Ret 5A actual</th><th>Riesgo 5A actual</th><th>Calidad propuesta</th><th>TER propuesto</th><th>Ret 5A propuesto</th><th>Riesgo 5A propuesto</th></tr></thead>
                <tbody>${metricRows}</tbody>
            </table></section>
            <section class="block"><h2>Calidad y costes relativos a peers</h2><p>Cada categoria se compara con su propio grupo de fondos Morningstar; los promedios excluyen el ISIN propuesto.</p></section>${peerSections.join('')}
            <footer><p>Tracking error: desviacion estandar muestral de las diferencias mensuales entre la cartera propuesta y el indice compuesto por categorias, anualizada con raiz de 12. Requiere al menos cuatro cierres mensuales comunes de todos los fondos e indices. Rebalanceo mensual a pesos objetivo; no incluye costes, impuestos ni cambio de divisa.</p>
            <p>${esc(state.source)} · Datos de ranking y series importadas/Yahoo. Score tecnico 0-4 y estrellas son indicadores internos; la calidad ponderada entre categorias es orientativa. Cada fondo se evalua frente a sus peers Morningstar. No garantizan resultados futuros.</p></footer>
        </div>`;
        const reportDoc=new DOMParser().parseFromString(body,'text/html');
        state.reportHtml=`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"></head><body>${reportDoc.body.innerHTML}</body></html>`;
        ReportDesign.preview(panel.querySelector('#gdcReportPreview'),state.reportHtml);
    }
    function init(){
        panel=document.getElementById('workspaceModel');if(!panel)return;
        panel.innerHTML=`<div class="workspace-heading"><div><h3>Cartera modelo GDC</h3></div></div><div class="workspace-tools"><label class="gdc-upload">Importar Excel <input id="gdcFile" type="file" accept=".xlsx,.xls"></label><select id="gdcModels" aria-label="Cartera modelo"></select><button type="button" id="gdcExport"><i class="fa-solid fa-file-excel" aria-hidden="true"></i> Exportar Excel</button><button type="button" id="gdcReport"><i class="fa-solid fa-file-lines" aria-hidden="true"></i> Generar informe</button><button type="button" id="gdcPdf"><i class="fa-solid fa-file-pdf" aria-hidden="true"></i> Descargar PDF</button></div><p id="gdcSource" class="workspace-context"></p><div id="gdcControls"><div class="gdc-risk-controls"><label class="workspace-context">Limite de tracking error anual (%) <input id="gdcMaxTe" type="number" min="0" step="0.1" placeholder="Sin definir"></label><label class="workspace-context"><input id="gdcComparable" type="checkbox"> Confirmo misma divisa y series comparables (distribuciones/ajustes)</label></div><p id="gdcStatus" class="workspace-status" role="status"></p><div id="gdcWeightChart" class="gdc-weight-chart"></div><div class="proposal-chart-scroll"><table class="wide-report-table gdc-selection-table"><thead><tr><th>Categoria y mapeo</th><th>Peso</th><th>Posicion actual</th><th>Elegir entre los 5 mejores</th><th>Propuesta</th><th>Peers</th><th>Indice e historico</th></tr></thead><tbody id="gdcBody"></tbody></table></div><div class="gdc-analysis-charts"><div id="gdcPeerChart"></div><div><h4 id="gdcHistoryLabel"></h4><div id="gdcHistory"></div></div></div></div><div id="gdcReportPreview"></div>`;
        panel.querySelector('#gdcFile').addEventListener('change',importFile);
        panel.querySelector('#gdcModels').addEventListener('change',event=>{state.selected=Number(event.target.value);state.activeRow=0;invalidateReport();render();});
        panel.querySelector('#gdcMaxTe').addEventListener('change',event=>{state.maxTe=event.target.value===''?NaN:Number(event.target.value)/100;invalidateReport();render();});
        panel.querySelector('#gdcComparable').addEventListener('change',event=>{state.historyComparable=event.target.checked;invalidateReport();render();});
        panel.querySelector('#gdcExport').addEventListener('click',exportExcel);
        panel.querySelector('#gdcReport').addEventListener('click',()=>report().catch(error=>panel.querySelector('#gdcStatus').textContent=error.message));
        panel.querySelector('#gdcPdf').addEventListener('click',async()=>{if(!state.reportHtml)await report();if(state.reportHtml)await ReportDesign.downloadPdf(state.reportHtml,`GDC_${model().name.replace(/[^a-z0-9_-]/gi,'_')}.pdf`);});
        panel.addEventListener('change',event=>{const el=event.target,index=Number(el.dataset.gdcSelect??el.dataset.gdcCurrent??el.dataset.gdcBench??el.dataset.gdcTicker);if(el.dataset.gdcSelect!==undefined)select(index,el.value);else if(el.dataset.gdcCurrent!==undefined)current(index,el.value);else if(el.dataset.gdcBench!==undefined)setBench(index,el.value);else if(el.dataset.gdcTicker!==undefined)setTicker(index,el.value);});
        panel.addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;if(button.dataset.gdcLoad!==undefined)loadHistory(Number(button.dataset.gdcLoad));if(button.dataset.gdcHistory!==undefined)history(Number(button.dataset.gdcHistory));});
        render();
    }
    return {init,loadWorkbook,render,select,current,history,state};
})();
