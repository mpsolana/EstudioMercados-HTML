const PortfolioCompare=(()=>{
    const state={sources:[null,null],clones:[],result:null};
    let panel;
    const esc=value=>escapeHtml(String(value??''));
    function importedModel(){
        if(!loadedPortfolio?.portfolioData?.length)throw new Error('Carga antes una cartera individual con históricos.');
        const source=loadedPortfolio.priceSeries||{},series={};
        for(const entry of loadedPortfolio.entries||[]){
            const item=source[entry.ticker]||source[entry.ticker?.toUpperCase()];
            if(item)series[entry.ticker]=item.data||item;
        }
        const entries=(loadedPortfolio.entries||[]).map(entry=>({ticker:entry.ticker,weight:entry.weight,name:entry.name}));
        const direct=entries.every(entry=>series[entry.ticker]?.length>=3)?null:loadedPortfolio.portfolioData;
        return {name:'Cartera actual',entries,series,direct,source:loadedPortfolio.sourceLabel||'Cartera individual',benchmarks:loadedPortfolio.benchmarks||{}};
    }
    function parseWorkbook(workbook,name,label){
        const weights=findSheet(workbook,['weights','pesos','cartera scoring','cartera'])||workbook.SheetNames[0];
        if(!weights)throw new Error(`${name}: falta una hoja de posiciones.`);
        const entries=sheetRows(workbook,weights).map(row=>({ticker:String(firstValue(row,['ticker','symbol','ticker yahoo','isin','codigo','codigo activo'])||'').trim().toUpperCase(),weight:parseNumber(firstValue(row,['weight','peso','allocation','target'])),name:String(firstValue(row,['name','nombre','fondo','activo'])||'').trim()})).filter(entry=>entry.ticker);
        if(!entries.length)throw new Error(`${name}: no hay posiciones con identificador y peso.`);
        const invalid=entries.findIndex(entry=>!Number.isFinite(entry.weight)||entry.weight<0);
        if(invalid>=0)throw new Error(`${name}: revisa el peso de ${entries[invalid].ticker} en ${weights}.`);
        const normalized=FinanceCore.normalizeWeights(entries);
        const priceSheet=findSheet(workbook,['prices','precios','historicos','historico','nav']);
        if(!priceSheet)throw new Error(`${name}: falta la hoja prices con históricos por ticker o ISIN.`);
        const series=priceSheetToSeriesMap(workbook,priceSheet,normalized);
        for(const entry of normalized)if((series[entry.ticker]||[]).length<3)throw new Error(`${name}: faltan tres precios válidos de ${entry.ticker} en ${priceSheet}.`);
        return {name:label,entries:normalized,series,source:name,benchmarks:benchmarkSheetToSeriesMap(workbook,findSheet(workbook,['bench','benchmark','benchmarks']))};
    }
    function benchmarks(){
        const map=new Map();state.sources.forEach((source,index)=>{if(!source)return;for(const [key,value] of Object.entries(source.benchmarks||{}))map.set(`${index}:${key}`,{ticker:key,label:`${source.name} · ${value.label||key}`,data:value.data||value});});
        return map;
    }
    function renderSources(){
        for(let index=0;index<2;index++)panel.querySelector(`#portfolioCompareSource${index}`).textContent=state.sources[index]?`${state.sources[index].source} · ${state.sources[index].entries.length} posiciones`:'Pendiente';
        panel.querySelector('#portfolioCompareCloneAdd').disabled=!state.sources[0]||Boolean(state.sources[0]?.direct);
        panel.querySelector('#portfolioCompareCloneNote').textContent=state.sources[0]?.direct?'La cartera cargada solo conserva NAV agregado: para crear clones se necesita el histórico de cada posición.':'';
        const selected=panel.querySelector('#portfolioCompareBenchmark').value,select=panel.querySelector('#portfolioCompareBenchmark');
        select.innerHTML='<option value="">Sin benchmark</option>'+[...benchmarks()].map(([key,value])=>`<option value="${esc(key)}">${esc(value.label)}</option>`).join('');
        if(benchmarks().has(selected))select.value=selected;
        renderClones();
    }
    function renderClones(){
        panel.querySelector('#portfolioCompareClones').innerHTML=state.clones.map((clone,index)=>`<div class="portfolio-compare-clone"><div class="portfolio-compare-clone-head"><label>Nombre<input data-clone-name="${index}" value="${esc(clone.name)}"></label><button type="button" data-clone-remove="${index}" title="Eliminar clon" aria-label="Eliminar clon"><i class="fa-solid fa-trash" aria-hidden="true"></i></button></div><div class="portfolio-compare-weights">${clone.entries.map((entry,row)=>`<label>${esc(entry.name||entry.ticker)} <small>${esc(entry.ticker)}</small><input type="number" min="0" step="0.1" data-clone-weight="${index}:${row}" value="${(entry.weight*100).toFixed(2)}"></label>`).join('')}</div></div>`).join('');
    }
    function addClone(){
        const source=state.sources[0];if(!source||source.direct||state.clones.length>=8)return;
        state.clones.push({name:`Clon ${state.clones.length+1}`,entries:source.entries.map(entry=>({...entry})),series:source.series});renderClones();
        panel.querySelector('#portfolioCompareCloneAdd').disabled=state.clones.length>=8;
    }
    async function importSlot(index,file){
        if(!file)return;
        const status=panel.querySelector('#portfolioCompareStatus');status.textContent=`Leyendo ${file.name}...`;
        try{state.sources[index]=parseWorkbook(await readWorkbook(file),file.name,index?'Cartera B':'Cartera A');if(index===0)state.clones=[];state.result=null;renderSources();status.textContent=`${file.name} importado. Pulsa Comparar carteras.`;}
        catch(error){status.textContent=error.message;}
    }
    function compare(){
        const status=panel.querySelector('#portfolioCompareStatus'),models=state.sources.filter(Boolean).concat(state.clones);
        if(!models.length){status.textContent='Carga al menos una cartera con históricos.';return;}
        const settings={rebalance:panel.querySelector('#portfolioCompareRebalance').value,costBps:Number(panel.querySelector('#portfolioCompareCost').value)},rate=Number(panel.querySelector('#portfolioCompareRiskFree').value)/100;
        try{
            const built=PortfolioCompareCore.build(models,settings),selected=benchmarks().get(panel.querySelector('#portfolioCompareBenchmark').value);
            const result=MultiAssetCompare.compare(built.assets,panel.querySelector('#portfolioCompareRange').value,rate,selected||null);
            state.result=result;status.textContent=MultiAssetCompare.renderResults(panel,result,'portfolioCompare')+` · ${models.length} cartera(s). Series expresadas en la misma moneda y con tratamiento comparable: verificar antes de interpretar diferencias.`;
        }catch(error){status.textContent=error.message;}
    }
    function init(){
        panel=document.getElementById('workspacePortfolioCompare');if(!panel)return;
        panel.innerHTML=`<div class="workspace-heading"><div><h3>Comparativa de carteras</h3></div></div><div class="portfolio-compare-imports"><label>Cartera A <input id="portfolioCompareFile0" type="file" accept=".xlsx,.xls"></label><p id="portfolioCompareSource0">Pendiente</p><button type="button" id="portfolioCompareLoaded"><i class="fa-solid fa-arrow-right-to-bracket" aria-hidden="true"></i> Usar cartera individual cargada</button><label>Cartera B <input id="portfolioCompareFile1" type="file" accept=".xlsx,.xls"></label><p id="portfolioCompareSource1">Pendiente</p></div><p class="workspace-context">Excel: hoja weights, pesos o cartera con ticker o ISIN y peso, más hoja prices con fecha y una columna de precios por posición. La hoja bench es opcional. Los históricos de cada posición son necesarios para crear clones.</p><div class="workspace-tools"><button type="button" id="portfolioCompareCloneAdd" disabled><i class="fa-solid fa-copy" aria-hidden="true"></i> Añadir clon de A</button></div><p id="portfolioCompareCloneNote" class="workspace-context"></p><div id="portfolioCompareClones"></div><div class="workspace-settings portfolio-compare-settings"><label>Periodo<select id="portfolioCompareRange"><option value="ALL">Todo el histórico común</option><option value="5Y">5 años</option><option value="3Y">3 años</option><option value="1Y">1 año</option></select></label><label>Rebalanceo<select id="portfolioCompareRebalance"><option value="monthly">Mensual</option><option value="period">Cada observación</option><option value="hold">Comprar y mantener</option></select></label><label>Coste por volumen (pb)<input id="portfolioCompareCost" type="number" min="0" step="1" value="0"></label><label>Tasa libre de riesgo anual (%)<input id="portfolioCompareRiskFree" type="number" min="-99" step="0.1" value="0"></label><label>Benchmark Excel<select id="portfolioCompareBenchmark"><option value="">Sin benchmark</option></select></label><button type="button" id="portfolioCompareRun"><i class="fa-solid fa-chart-line" aria-hidden="true"></i> Comparar carteras</button></div><p id="portfolioCompareStatus" class="workspace-status" role="status"></p>${MultiAssetCompare.resultsHtml('portfolioCompare')}`;
        for(let index=0;index<2;index++)panel.querySelector(`#portfolioCompareFile${index}`).addEventListener('change',event=>importSlot(index,event.target.files?.[0]));
        panel.querySelector('#portfolioCompareLoaded').addEventListener('click',()=>{try{state.sources[0]=importedModel();state.clones=[];renderSources();panel.querySelector('#portfolioCompareStatus').textContent='Cartera individual disponible para comparar.';}catch(error){panel.querySelector('#portfolioCompareStatus').textContent=error.message;}});
        panel.querySelector('#portfolioCompareCloneAdd').addEventListener('click',addClone);
        panel.querySelector('#portfolioCompareClones').addEventListener('change',event=>{const target=event.target;if(target.dataset.cloneName!==undefined)state.clones[Number(target.dataset.cloneName)].name=target.value.trim()||`Clon ${Number(target.dataset.cloneName)+1}`;if(target.dataset.cloneWeight!==undefined){const [clone,row]=target.dataset.cloneWeight.split(':').map(Number);state.clones[clone].entries[row].weight=Number(target.value)/100;}});
        panel.querySelector('#portfolioCompareClones').addEventListener('click',event=>{const button=event.target.closest('[data-clone-remove]');if(!button)return;state.clones.splice(Number(button.dataset.cloneRemove),1);renderClones();panel.querySelector('#portfolioCompareCloneAdd').disabled=false;});
        panel.querySelector('#portfolioCompareRun').addEventListener('click',compare);
        for(const id of ['portfolioCompareRange','portfolioCompareRiskFree','portfolioCompareBenchmark'])panel.querySelector(`#${id}`).addEventListener('change',()=>{if(state.result)compare();});
        renderSources();
    }
    return {init,state,parseWorkbook,compare};
})();
