const EfficientFrontierView=(()=>{
    let panel,result=null,signature='',historySeries=null,expected={};
    const format=value=>Number.isFinite(value)?value.toFixed(2)+'%':'-';
    const label=month=>`${Math.floor(month/12)}-${String(month%12+1).padStart(2,'0')}`;
    const sourceSignature=()=>JSON.stringify({origin:ProposalPortfolio.originRows().map(r=>[r.record?.isin,r.record?.originSource?.proxyIsin,r.weight]),proposal:ProposalPortfolio.targetRows().map(r=>[r.record?.isin,r.weight]),history:loadedPortfolio?.sourceLabel});
    function invalidate(){result=null;signature='';historySeries=null;if(panel){const chart=panel.querySelector('#initialFrontierChart');if(chart._fullLayout&&window.Plotly)Plotly.purge(chart);chart.replaceChildren();panel.querySelector('#initialFrontierSummary').replaceChildren();panel.querySelector('#initialFrontierStatus').textContent='Datos modificados. Calcula de nuevo la frontera.';}}
    function invalidateIfChanged(){if(result&&(signature!==sourceSignature()||historySeries!==loadedPortfolio?.priceSeries))invalidate();}
    function benchmarks(){
        const select=panel.querySelector('#initialFrontierBenchmark'),selected=select.value;
        select.innerHTML='<option value="">Sin benchmark</option>'+Object.entries(loadedPortfolio?.benchmarks||{}).map(([id,series])=>`<option value="${escapeHtml(id)}">${escapeHtml(series.label||id)}</option>`).join('');
        if(loadedPortfolio?.benchmarks?.[selected])select.value=selected;
    }
    function assumptions(assets){
        const container=panel.querySelector('#initialFrontierAssumptions');
        container.hidden=panel.querySelector('#initialFrontierMode').value!=='assumptions';
        container.querySelector('tbody').innerHTML=assets.map(asset=>`<tr><td>${escapeHtml(asset.key)}<br><small>${escapeHtml(asset.name)}</small></td><td>${format(asset.historicalReturn)}</td><td><input type="number" step="0.1" data-frontier-expected="${escapeHtml(asset.key)}" aria-label="Retorno esperado anual de ${escapeHtml(asset.key)}" value="${Number.isFinite(expected[asset.key])?expected[asset.key]:asset.historicalReturn.toFixed(2)}"></td></tr>`).join('');
    }
    function traces(data){
        const path=data.frontier,markers=[
            {name:'Origen',point:data.actual,color:'#195995',symbol:'circle',role:'origin'},
            {name:'Propuesta',point:data.proposed,color:'#63717f',symbol:'diamond',role:'proposal'}
        ];
        if(data.benchmark)markers.push({name:'Benchmark',point:data.benchmark,color:'#27826b',symbol:'square'});
        return [
            {type:'scatter',mode:'lines',name:'Frontera factible',x:path.map(p=>p.risk),y:path.map(p=>p.ret),line:{color:'#153e67',width:3},hovertemplate:'Riesgo %{x:.2f}%<br>Retorno %{y:.2f}%<extra>Frontera</extra>'},
            ...markers.map(({name,point,color,symbol,role})=>({type:'scatter',mode:'markers+text',name,meta:role?{financialRole:role}:{},text:[name],textposition:name==='Origen'?'bottom left':name==='Propuesta'?'top right':'top left',x:[point.risk],y:[point.ret],marker:{size:15,color,symbol,line:{color:'#fff',width:2}},hovertemplate:`${name}<br>Riesgo %{x:.2f}%<br>Retorno %{y:.2f}%<extra></extra>`}))
        ];
    }
    async function calculate(){
        if(!panel)return;
        const status=panel.querySelector('#initialFrontierStatus');
        status.textContent='Calculando frontera con históricos comunes…';
        await new Promise(resolve=>setTimeout(resolve,0));
        try{
            benchmarks();
            const mode=panel.querySelector('#initialFrontierMode').value,benchmarkId=panel.querySelector('#initialFrontierBenchmark').value;
            const data=EfficientFrontierCore.calculate({
                origin:ProposalPortfolio.originRows(),proposal:ProposalPortfolio.targetRows(),
                series:loadedPortfolio?.priceSeries||{},mode,expected,maxWeight:Number(panel.querySelector('#initialFrontierMaxWeight').value),
                benchmark:benchmarkId?loadedPortfolio?.benchmarks?.[benchmarkId]:null
            });
            result=data;signature=sourceSignature();historySeries=loadedPortfolio?.priceSeries;
            assumptions(data.assets);
            await FinancialVisuals.newPlot(panel.querySelector('#initialFrontierChart'),traces(data),{
                xaxis:{title:'Volatilidad anualizada (%)',rangemode:'tozero',automargin:true},
                yaxis:{title:mode==='assumptions'?'Retorno supuesto anual (%)':'Retorno medio histórico anual (%)',automargin:true},
                margin:{t:36,l:70,r:24,b:70},legend:{orientation:'h',y:-.2},paper_bgcolor:'#fff',plot_bgcolor:'#fff',hovermode:'closest'
            },{responsive:true});
            const row=(name,p)=>`<tr><th scope="row">${name}</th><td>${format(p.ret)}</td><td>${format(p.risk)}</td><td>${p.feasible===false?'Fuera del límite por serie':Number.isFinite(p.gap)?p.gap.toFixed(2)+' pp':'No comparable'}</td></tr>`;
            panel.querySelector('#initialFrontierSummary').innerHTML=`<table class="wide-report-table"><thead><tr><th>Cartera</th><th>Retorno anual</th><th>Riesgo anual</th><th>Brecha a frontera</th></tr></thead><tbody>${row('Origen',data.actual)}${row('Propuesta',data.proposed)}${data.benchmark?row('Benchmark',data.benchmark):''}</tbody></table>`;
            status.textContent=`${data.months.length-1} retornos mensuales comunes · ${label(data.months[0])} a ${label(data.months.at(-1))} · ${data.assets.length} series · límite ${(data.cap*100).toFixed(0)}% por serie.${benchmarkId&&!data.benchmark?' Benchmark sin cobertura completa en el mismo periodo; omitido.':''}`;
        }catch(error){invalidate();status.textContent=error.message;}
    }
    async function reportSection(){
        if(!result||signature!==sourceSignature()||historySeries!==loadedPortfolio?.priceSeries)throw new Error('Calcula de nuevo la frontera con la cartera vigente o desmarca este apartado del informe.');
        const image=await Plotly.toImage(panel.querySelector('#initialFrontierChart'),{format:'png',width:1000,height:550,scale:1.5});
        return `<section class="block report-chart-page"><h2>Riesgo y rentabilidad · frontera eficiente</h2><figure><img src="${image}" alt="Origen y propuesta frente a la frontera eficiente"></figure>${panel.querySelector('#initialFrontierSummary').innerHTML}<p class="method-note">${escapeHtml(panel.querySelector('#initialFrontierStatus').textContent)} Media aritmética y covarianza muestral de retornos mensuales anualizadas sobre el mismo periodo. ${result.mode==='assumptions'?'Los retornos son hipótesis introducidas por el usuario; la covarianza es histórica.':'Retornos medios históricos, no previsiones.'} Optimización media-varianza sin cortos, totalmente invertida y con límite por serie histórica. Brecha: retorno adicional teórico a riesgo igual o menor bajo los mismos supuestos. No incluye impuestos, costes de transacción ni restricciones de perfil; estar en la frontera no garantiza mejores resultados futuros.</p></section>`;
    }
    function init(element){
        panel=element;
panel.innerHTML=`<h3>Riesgo y rentabilidad</h3><div class="workspace-settings initial-frontier-controls"><label>Modelo<select id="initialFrontierMode"><option value="historical">Histórico común</option><option value="assumptions">Hipótesis de retornos</option></select></label><label>Límite por serie (%)<input id="initialFrontierMaxWeight" type="number" min="1" max="100" step="1" value="100"></label><label>Benchmark opcional<select id="initialFrontierBenchmark"><option value="">Sin benchmark</option></select></label><button type="button" id="initialFrontierCalculate"><i class="fa-solid fa-chart-scatter" aria-hidden="true"></i> Calcular</button></div><p id="initialFrontierStatus" class="workspace-status" role="status">Carga origen, propuesta e históricos de ambos en el Excel Maestro para calcular.</p><div id="initialFrontierAssumptions" hidden><h4>Retornos anuales supuestos</h4><div class="proposal-chart-scroll"><table class="wide-report-table"><thead><tr><th>Serie</th><th>Media histórica</th><th>Supuesto anual (%)</th></tr></thead><tbody></tbody></table></div></div><div id="initialFrontierChart" class="initial-frontier-chart"></div><div id="initialFrontierSummary"></div><p class="workspace-context">Mismas fechas mensuales para todos los fondos. En «Hipótesis» se editan retornos; riesgos y correlaciones siguen siendo históricos. La frontera no incluye límites por categoría o perfil y no constituye una recomendación automática.</p>`;
        panel.querySelector('#initialFrontierCalculate').addEventListener('click',calculate);
        panel.querySelector('#initialFrontierMode').addEventListener('change',()=>{invalidate();panel.querySelector('#initialFrontierAssumptions').hidden=panel.querySelector('#initialFrontierMode').value!=='assumptions';});
        panel.querySelector('#initialFrontierMaxWeight').addEventListener('change',invalidate);
        panel.querySelector('#initialFrontierBenchmark').addEventListener('change',invalidate);
        panel.addEventListener('change',event=>{const input=event.target.closest('[data-frontier-expected]');if(!input)return;expected[input.dataset.frontierExpected]=input.value===''?NaN:input.valueAsNumber;invalidate();});
        window.addEventListener('resize',()=>{if(result&&!panel.hidden)requestAnimationFrame(()=>Plotly.Plots.resize(panel.querySelector('#initialFrontierChart')));});
    }
    return {init,calculate,invalidate,invalidateIfChanged,reportSection,benchmarks,get result(){return result;}};
})();
