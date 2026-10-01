const PortfolioCompare=(()=>{
    const state={sources:[null,null],clones:[],result:null};
    let panel;
    const esc=value=>escapeHtml(String(value??''));
    const yahooCache=new Map();
    const presets={permanent:{name:'Permanente · ejemplo ETF',assets:[['VTI',25],['TLT',25],['IAU',25],['SGOV',25]]},equal:{name:'Naive 1/N · ejemplo ETF',assets:[['VTI',25],['VXUS',25],['BND',25],['IAU',25]]},allweather:{name:'All Seasons · proxy ETF',assets:[['VTI',30],['TLT',40],['IEF',15],['IAU',7.5],['PDBC',7.5]]},bogleheads:{name:'Bogleheads · tres fondos ETF',assets:[['VTI',40],['VXUS',20],['BND',40]]}};
    function sourceCard(index){return `<div class="portfolio-compare-source"><label>Cartera ${index+1} · Excel<input id="portfolioCompareFile${index}" data-compare-file="${index}" type="file" accept=".xlsx,.xls"></label><p id="portfolioCompareSource${index}">Pendiente</p>${index>1?`<button type="button" data-compare-remove="${index}" title="Quitar fuente" aria-label="Quitar cartera ${index+1}"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>`:''}</div>`;}
    function nextSlot(){let index=state.sources.findIndex(source=>!source);if(index<0){index=state.sources.length;if(index>=20)throw new Error('La comparativa admite hasta 20 carteras.');state.sources.push(null);}if(!panel.querySelector(`#portfolioCompareSource${index}`))panel.querySelector('#portfolioCompareImports').insertAdjacentHTML('beforeend',sourceCard(index));return index;}
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
        state.sources.forEach((source,index)=>{const el=panel.querySelector(`#portfolioCompareSource${index}`);if(el)el.textContent=source?`${source.name} · ${source.entries.length} posiciones`:'Pendiente';});
        panel.querySelector('#portfolioCompareCloneAdd').disabled=!state.sources[0]||Boolean(state.sources[0]?.direct)||(state.sources[0]?.yahoo&&!Object.keys(state.sources[0].series).length);
        panel.querySelector('#portfolioCompareCloneNote').textContent=state.sources[0]?.direct?'La cartera cargada solo conserva NAV agregado: para crear clones se necesita el histórico de cada posición.':'';
        const selected=panel.querySelector('#portfolioCompareBenchmark').value,select=panel.querySelector('#portfolioCompareBenchmark');
        select.innerHTML='<option value="">Sin benchmark</option>'+[...benchmarks()].map(([key,value])=>`<option value="${esc(key)}">${esc(value.label)}</option>`).join('');
        if(benchmarks().has(selected))select.value=selected;
        renderClones();
        if(PortfolioWorkspace.scope==='comparison'){
            const warning=document.getElementById('workspaceMissingData');
            warning.textContent=portfolioWorkspaceWarning();warning.hidden=!warning.textContent;
        }
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
        try{state.sources[index]=parseWorkbook(await readWorkbook(file),file.name,`Cartera ${index+1}`);if(index===0)state.clones=[];state.result=null;renderSources();status.textContent=`${file.name} importado. Pulsa Comparar carteras.`;}
        catch(error){status.textContent=error.message;}
    }
    function yahooRow(ticker='',weight=''){return `<div class="portfolio-compare-yahoo-row"><label>Ticker Yahoo<input data-yahoo-ticker placeholder="VTI" value="${esc(ticker)}"></label><label>Peso (%)<input data-yahoo-weight type="number" min="0" step="0.01" value="${esc(weight)}"></label><button type="button" data-yahoo-remove title="Quitar activo" aria-label="Quitar activo"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></div>`;}
    function yahooEntries(){
        const entries=[...panel.querySelectorAll('.portfolio-compare-yahoo-row')].map(row=>({ticker:row.querySelector('[data-yahoo-ticker]').value.trim().toUpperCase(),weight:Number(row.querySelector('[data-yahoo-weight]').value)/100})).filter(entry=>entry.ticker);
        if(!entries.length||entries.some(entry=>!/^[A-Z0-9^.=\-]{1,32}$/.test(entry.ticker)||!Number.isFinite(entry.weight)||entry.weight<=0))throw new Error('Revisa los tickers y pesos positivos de la cartera Yahoo.');
        if(new Set(entries.map(entry=>entry.ticker)).size!==entries.length)throw new Error('No repitas un ticker dentro de la misma cartera.');
        return FinanceCore.normalizeWeights(entries);
    }
    function addYahooModel(entries,name){const index=nextSlot();const used=new Set(state.sources.filter(Boolean).map(source=>source.name));let label=name,ordinal=2;while(used.has(label))label=`${name} ${ordinal++}`;state.sources[index]={name:label,entries,series:{},source:'Yahoo Finance',yahoo:true};state.result=null;renderSources();panel.querySelector('#portfolioCompareStatus').textContent=`${label} añadida. Sus históricos se cargarán al comparar.`;}
    async function resolveYahoo(models,status){
        const end=new Date(),start=new Date(end);start.setUTCFullYear(start.getUTCFullYear()-12);
        const tickers=[...new Set(models.filter(model=>model.yahoo).flatMap(model=>model.entries.map(entry=>entry.ticker)))];
        for(let i=0;i<tickers.length;i++){
            const ticker=tickers[i];status.textContent=`Cargando Yahoo ${i+1} de ${tickers.length}: ${ticker}`;
            if(!yahooCache.has(ticker))yahooCache.set(ticker,await fetchYahooData(ticker,start.toISOString().slice(0,10),end.toISOString().slice(0,10)));
        }
        models.filter(model=>model.yahoo).forEach(model=>{model.series=Object.fromEntries(model.entries.map(entry=>[entry.ticker,yahooCache.get(entry.ticker)]));});
    }
    async function compare(){
        const status=panel.querySelector('#portfolioCompareStatus'),models=state.sources.filter(Boolean).concat(state.clones);
        if(!models.length){status.textContent='Carga al menos una cartera con históricos.';return;}
        const run=panel.querySelector('#portfolioCompareRun');run.disabled=true;
        const settings={rebalance:panel.querySelector('#portfolioCompareRebalance').value,costBps:Number(panel.querySelector('#portfolioCompareCost').value)},rate=Number(panel.querySelector('#portfolioCompareRiskFree').value)/100;
        try{
            const rateInput=panel.querySelector('#portfolioCompareRiskFree').value;if(rateInput.trim()===''||!Number.isFinite(rate)||rate<=-1)throw new Error('Revisa la tasa libre de riesgo.');
            await resolveYahoo(models,status);
            renderSources();
            const built=PortfolioCompareCore.build(models,settings),selected=benchmarks().get(panel.querySelector('#portfolioCompareBenchmark').value);
            const result=MultiAssetCompare.compare(built.assets,panel.querySelector('#portfolioCompareRange').value,rate,selected||null);
            state.result=result;status.textContent=MultiAssetCompare.renderResults(panel,result,'portfolioCompare')+` · ${models.length} cartera(s). Series expresadas en la misma moneda y con tratamiento comparable: verificar antes de interpretar diferencias.`;
        }catch(error){status.textContent=error.message;}finally{run.disabled=false;}
    }
    function init(){
        panel=document.getElementById('workspacePortfolioCompare');if(!panel)return;
        panel.innerHTML=`<div class="workspace-heading"><div><h3>Comparativa de carteras</h3></div></div><div id="portfolioCompareImports" class="portfolio-compare-imports">${sourceCard(0)}${sourceCard(1)}</div><div class="workspace-tools"><button type="button" id="portfolioCompareAddExcel"><i class="fa-solid fa-plus" aria-hidden="true"></i> Añadir cartera Excel</button><button type="button" id="portfolioCompareLoaded"><i class="fa-solid fa-arrow-right-to-bracket" aria-hidden="true"></i> Añadir cartera individual cargada</button></div><p class="workspace-context">Excel: hoja weights, pesos o cartera con ticker o ISIN y peso, más hoja prices con fecha y una columna de precios por posición. La hoja bench es opcional.</p><div class="portfolio-compare-yahoo"><div class="workspace-settings"><label>Activo Yahoo<input id="portfolioCompareYahooTicker" placeholder="VTI"></label><button type="button" id="portfolioCompareAddTicker"><i class="fa-solid fa-plus" aria-hidden="true"></i> Añadir activo</button></div><div class="workspace-settings"><label>Ejemplo editable<select id="portfolioComparePreset"><option value="">Cartera vacía</option><option value="permanent">Permanente · Harry Browne</option><option value="equal">Naive 1/N</option><option value="allweather">All Seasons · proxy</option><option value="bogleheads">Bogleheads · tres fondos</option></select></label><label>Nombre de la cartera<input id="portfolioCompareYahooName" value="Cartera Yahoo"></label></div><div id="portfolioCompareYahooRows"></div><div class="workspace-tools"><button type="button" id="portfolioCompareYahooAddRow"><i class="fa-solid fa-plus" aria-hidden="true"></i> Añadir posición</button><button type="button" id="portfolioCompareAddYahoo"><i class="fa-solid fa-arrow-right-to-bracket" aria-hidden="true"></i> Añadir cartera Yahoo</button></div><p class="workspace-context">Ejemplos de ETF estadounidenses en USD, orientativos y editables; no replican exactamente las estrategias originales. Verifica divisa, disponibilidad y ajustes de precios.</p></div><div class="workspace-tools"><button type="button" id="portfolioCompareCloneAdd" disabled><i class="fa-solid fa-copy" aria-hidden="true"></i> Añadir clon de A</button></div><p id="portfolioCompareCloneNote" class="workspace-context"></p><div id="portfolioCompareClones"></div><div class="workspace-settings portfolio-compare-settings"><label>Periodo<select id="portfolioCompareRange"><option value="ALL">Todo el histórico común</option><option value="5Y">5 años</option><option value="3Y">3 años</option><option value="1Y">1 año</option></select></label><label>Rebalanceo<select id="portfolioCompareRebalance"><option value="monthly">Mensual</option><option value="period">Cada observación</option><option value="hold">Comprar y mantener</option></select></label><label>Coste por volumen (pb)<input id="portfolioCompareCost" type="number" min="0" step="1" value="0"></label><label>Tasa libre de riesgo anual (%)<input id="portfolioCompareRiskFree" type="number" min="-99" step="0.1" value="0"></label><label>Benchmark Excel<select id="portfolioCompareBenchmark"><option value="">Sin benchmark</option></select></label><button type="button" id="portfolioCompareRun"><i class="fa-solid fa-chart-line" aria-hidden="true"></i> Comparar carteras</button></div><p id="portfolioCompareStatus" class="workspace-status" role="status"></p>${MultiAssetCompare.resultsHtml('portfolioCompare')}`;
        panel.querySelector('#portfolioCompareImports').addEventListener('change',event=>{if(event.target.dataset.compareFile!==undefined)importSlot(Number(event.target.dataset.compareFile),event.target.files?.[0]);});
        panel.querySelector('#portfolioCompareImports').addEventListener('click',event=>{const button=event.target.closest('[data-compare-remove]');if(!button)return;const index=Number(button.dataset.compareRemove);state.sources[index]=null;button.closest('.portfolio-compare-source').remove();renderSources();});
        panel.querySelector('#portfolioCompareAddExcel').addEventListener('click',()=>{let index=state.sources.length;if(index>=20){index=state.sources.findIndex((source,i)=>!source&&!panel.querySelector(`#portfolioCompareSource${i}`));if(index<0){panel.querySelector('#portfolioCompareStatus').textContent='La comparativa admite hasta 20 carteras.';return;}}else state.sources.push(null);panel.querySelector('#portfolioCompareImports').insertAdjacentHTML('beforeend',sourceCard(index));});
        panel.querySelector('#portfolioCompareLoaded').addEventListener('click',()=>{try{const index=nextSlot();state.sources[index]=importedModel();if(index===0)state.clones=[];renderSources();panel.querySelector('#portfolioCompareStatus').textContent='Cartera individual disponible para comparar.';}catch(error){panel.querySelector('#portfolioCompareStatus').textContent=error.message;}});
        panel.querySelector('#portfolioCompareAddTicker').addEventListener('click',()=>{try{const ticker=panel.querySelector('#portfolioCompareYahooTicker').value.trim().toUpperCase();if(!/^[A-Z0-9^.=\-]{1,32}$/.test(ticker))throw new Error('Introduce un ticker Yahoo válido.');addYahooModel([{ticker,weight:1}],ticker);}catch(error){panel.querySelector('#portfolioCompareStatus').textContent=error.message;}});
        panel.querySelector('#portfolioComparePreset').addEventListener('change',event=>{const preset=presets[event.target.value];panel.querySelector('#portfolioCompareYahooName').value=preset?.name||'Cartera Yahoo';panel.querySelector('#portfolioCompareYahooRows').innerHTML=(preset?.assets||[]).map(([ticker,weight])=>yahooRow(ticker,weight)).join('');});
        panel.querySelector('#portfolioCompareYahooAddRow').addEventListener('click',()=>panel.querySelector('#portfolioCompareYahooRows').insertAdjacentHTML('beforeend',yahooRow()));
        panel.querySelector('#portfolioCompareYahooRows').addEventListener('click',event=>event.target.closest('[data-yahoo-remove]')?.closest('.portfolio-compare-yahoo-row')?.remove());
        panel.querySelector('#portfolioCompareAddYahoo').addEventListener('click',()=>{try{addYahooModel(yahooEntries(),panel.querySelector('#portfolioCompareYahooName').value.trim()||'Cartera Yahoo');}catch(error){panel.querySelector('#portfolioCompareStatus').textContent=error.message;}});
        panel.querySelector('#portfolioCompareCloneAdd').addEventListener('click',addClone);
        panel.querySelector('#portfolioCompareClones').addEventListener('change',event=>{const target=event.target;if(target.dataset.cloneName!==undefined)state.clones[Number(target.dataset.cloneName)].name=target.value.trim()||`Clon ${Number(target.dataset.cloneName)+1}`;if(target.dataset.cloneWeight!==undefined){const [clone,row]=target.dataset.cloneWeight.split(':').map(Number);state.clones[clone].entries[row].weight=Number(target.value)/100;}});
        panel.querySelector('#portfolioCompareClones').addEventListener('click',event=>{const button=event.target.closest('[data-clone-remove]');if(!button)return;state.clones.splice(Number(button.dataset.cloneRemove),1);renderClones();panel.querySelector('#portfolioCompareCloneAdd').disabled=false;});
        panel.querySelector('#portfolioCompareRun').addEventListener('click',compare);
        for(const id of ['portfolioCompareRange','portfolioCompareRiskFree','portfolioCompareBenchmark'])panel.querySelector(`#${id}`).addEventListener('change',()=>{if(state.result)compare();});
        renderSources();
    }
    return {init,state,parseWorkbook,compare};
})();
