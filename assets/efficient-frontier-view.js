const EfficientFrontierView=(()=>{
    let panel,result=null,signature='',expected={};
    const format=value=>Number.isFinite(value)?value.toFixed(2)+'%':'-';
    const label=month=>`${Math.floor(month/12)}-${String(month%12+1).padStart(2,'0')}`;
    const prices=()=>window.masterPriceSeries||{};
    const sourceRows=()=>(typeof fundPortfolioRows==='undefined'?[]:fundPortfolioRows).map(row=>({record:{isin:row.isin,name:row.name||row.isin},weight:Number(row.weight)}));
    const sourceSignature=()=>{const series=prices();return JSON.stringify({portfolio:sourceRows().map(r=>[r.record.isin,r.weight]),masterVersion:window.masterPriceVersion||0,series:Object.keys(series).map(key=>[key,series[key]?.data?.length])});};
    function invalidate(){result=null;signature='';if(panel){for(const id of ['initialFrontierChart','initialFrontierCorrelationChart','initialFrontierRollingChart']){const chart=panel.querySelector('#'+id);if(chart?._fullLayout&&window.Plotly)Plotly.purge(chart);chart?.replaceChildren();}for(const id of ['initialFrontierSummary','initialFrontierWeights'])panel.querySelector('#'+id).replaceChildren();for(const id of ['initialFrontierObjectiveNote','initialFrontierCorrelationNote','initialFrontierRollingNote'])panel.querySelector('#'+id).textContent='';panel.querySelector('#initialFrontierStatus').textContent='Datos modificados. Calcula de nuevo la frontera.';}}
    function invalidateIfChanged(){if(result&&signature!==sourceSignature())invalidate();}
    function benchmarks(){
        const select=panel.querySelector('#initialFrontierBenchmark'),selected=select.value;
        select.innerHTML='<option value="">Sin benchmark</option>'+Object.entries(window.masterBenchmarks||{}).map(([id,series])=>`<option value="${escapeHtml(id)}">${escapeHtml(series.label||id)}</option>`).join('');
        if(window.masterBenchmarks?.[selected])select.value=selected;
    }
    function assumptions(assets){
        const container=panel.querySelector('#initialFrontierAssumptions');
        container.hidden=panel.querySelector('#initialFrontierMode').value!=='assumptions';
        container.querySelector('tbody').innerHTML=assets.map(asset=>`<tr><td>${escapeHtml(asset.key)}<br><small>${escapeHtml(asset.name)}</small></td><td>${format(asset.historicalReturn)}</td><td><input type="number" step="0.1" data-frontier-expected="${escapeHtml(asset.key)}" aria-label="Retorno esperado anual de ${escapeHtml(asset.key)}" value="${Number.isFinite(expected[asset.key])?expected[asset.key]:asset.historicalReturn.toFixed(2)}"></td></tr>`).join('');
    }
    function selectedPoint(data){return panel.querySelector('#initialFrontierObjective').value==='sameReturn'?data.sameReturn:data.sameRisk;}
    function traces(data){
        const path=data.frontier,target=selectedPoint(data),markers=[
            {name:'Cartera actual',point:data.actual,color:'#075aa3',symbol:'circle'},
            {name:'Equal weight',point:data.equalWeight,color:'#168270',symbol:'diamond'},
            {name:'Mínima varianza',point:data.minimumVariance,color:'#b07735',symbol:'square'},
            {name:'Cartera de mercado (proxy tangente)',point:data.market,color:'#755e8c',symbol:'triangle-up'}
        ];
        if(target)markers.push({name:'Objetivo eficiente',point:target,color:'#b34348',symbol:'star'});
        if(data.benchmark)markers.push({name:'Benchmark',point:data.benchmark,color:'#52687a',symbol:'cross'});
        return [
            {type:'scatter',mode:'lines+markers',name:'Frontera factible',x:path.map(p=>p.risk),y:path.map(p=>p.ret),line:{color:'#153e67',width:2},marker:{size:5,color:'#153e67'},hovertemplate:'Riesgo %{x:.2f}%<br>Retorno %{y:.2f}%<extra>Frontera</extra>'},
            {type:'scatter',mode:'markers+text',name:'Activos individuales',x:data.assets.map(asset=>asset.individual.risk),y:data.assets.map(asset=>asset.individual.ret),text:data.assets.map(asset=>asset.name.length>20?`${asset.name.slice(0,19)}…`:asset.name),customdata:data.assets.map(asset=>`${asset.name} (${asset.key})`),textposition:data.assets.map((_,i)=>i%2?'bottom right':'top left'),textfont:{size:10,color:'#586d80'},cliponaxis:false,marker:{size:7,color:'#a7b5c0'},hovertemplate:'%{customdata}<br>Riesgo %{x:.2f}%<br>Retorno %{y:.2f}%<extra></extra>'},
            ...markers.filter(item=>item.point).map(({name,point,color,symbol},i)=>({type:'scatter',mode:'markers+text',name,x:[point.risk],y:[point.ret],text:[name==='Benchmark'?data.benchmarkLabel||name:name],textposition:i%2?'bottom right':'top left',textfont:{size:10,color},cliponaxis:false,marker:{size:name==='Objetivo eficiente'?15:12,color,symbol,line:{color:'#fff',width:1.5}},hovertemplate:`${name}<br>Riesgo %{x:.2f}%<br>Retorno %{y:.2f}%<extra></extra>`}))
        ];
    }
    async function renderResult(){
        if(!result)return;
        const data=result,target=selectedPoint(data),objective=panel.querySelector('#initialFrontierObjective').value;
        await FinancialVisuals.newPlot(panel.querySelector('#initialFrontierChart'),traces(data),{
            xaxis:{title:'Volatilidad anualizada (%)',rangemode:'tozero',automargin:true},
            yaxis:{title:data.mode==='assumptions'?'Retorno supuesto anual (%)':'Retorno medio histórico anual (%)',automargin:true},
            margin:{t:65,l:75,r:100,b:115},legend:{orientation:'h',y:-.28},paper_bgcolor:'#fff',plot_bgcolor:'#fff',hovermode:'closest'
        },{responsive:true});
        const row=(name,p)=>p?`<tr><th scope="row">${name}</th><td>${format(p.ret)}</td><td>${format(p.risk)}</td><td>${p.feasible===false?'Fuera del límite':Number.isFinite(p.gap)?p.gap.toFixed(2)+' pp':'—'}</td></tr>`:'';
        panel.querySelector('#initialFrontierSummary').innerHTML=`<table class="wide-report-table"><thead><tr><th>Cartera</th><th>Retorno anual</th><th>Riesgo anual</th><th>Brecha a frontera</th></tr></thead><tbody>${row('Actual',data.actual)}${row('Objetivo eficiente',target)}${row('Equal weight',data.equalWeight)}${row('Mínima varianza',data.minimumVariance)}${row('Mercado · proxy tangente',data.market)}${row('Benchmark',data.benchmark)}</tbody></table>`;
        panel.querySelector('#initialFrontierObjectiveNote').textContent=target?objective==='sameReturn'?'El objetivo mantiene la rentabilidad anual de la cartera actual y minimiza la volatilidad con el mismo universo y límite por activo.':'El objetivo maximiza la rentabilidad esperada sin superar la volatilidad de la cartera actual. Puede lograrlo con menos riesgo.':objective==='sameReturn'?'No existe una cartera en la rama eficiente con exactamente la rentabilidad actual bajo el límite por activo. La cartera de mínima varianza puede ofrecer mayor rentabilidad con menos riesgo.':'No existe cartera eficiente bajo el techo de riesgo actual y el límite por activo.';
        panel.querySelector('#initialFrontierWeights').innerHTML=target?`<table class="wide-report-table"><thead><tr><th>Activo</th><th>Actual</th><th>Objetivo</th><th>Diferencia</th></tr></thead><tbody>${data.assets.map((asset,i)=>`<tr><th scope="row">${escapeHtml(asset.name)}<br><small>${escapeHtml(asset.key)}</small></th><td>${(data.actual.weights[i]*100).toFixed(2)}%</td><td>${(target.weights[i]*100).toFixed(2)}%</td><td>${((target.weights[i]-data.actual.weights[i])*100)>=0?'+':''}${((target.weights[i]-data.actual.weights[i])*100).toFixed(2)} pp</td></tr>`).join('')}</tbody></table>`:'';
    }
    function correlationPairs(data){
        const left=panel.querySelector('#initialFrontierCorrLeft'),right=panel.querySelector('#initialFrontierCorrRight');
        const options=data.assets.map((asset,i)=>`<option value="${i}">${escapeHtml(asset.name)} · ${escapeHtml(asset.key)}</option>`).join('');
        left.innerHTML=options;right.innerHTML=options;left.value='0';right.value='1';
    }
    function renderCorrelations(){
        if(!result)return;
        const data=result,annual=data.annualCorrelation,heat=panel.querySelector('#initialFrontierCorrelationChart'),rolling=panel.querySelector('#initialFrontierRollingChart');
        panel.querySelector('#initialFrontierCorrelationNote').textContent=annual?`${annual.years} rentabilidades anuales no solapadas, calculadas con cierres de diciembre comunes. Correlación descriptiva; muestra reducida si hay pocos años.`:'Se necesitan al menos cinco cierres de diciembre comunes para la matriz anual; no se sustituye por correlación mensual.';
        if(annual)FinancialVisuals.newPlot(heat,[{type:'heatmap',z:annual.matrix,x:data.assets.map(asset=>asset.key),y:data.assets.map(asset=>asset.key),zmin:-1,zmax:1,colorscale:[[0,'#123b68'],[.5,'#7da8c7'],[1,'#fff']],text:annual.matrix.map(row=>row.map(value=>Number.isFinite(value)?value.toFixed(2):'—')),texttemplate:'%{text}',hovertemplate:'%{y} / %{x}: %{z:.2f}<extra></extra>',colorbar:{title:'ρ'}}],{height:Math.max(360,data.assets.length*30+105),margin:{t:45,l:95,r:25,b:95},yaxis:{autorange:'reversed',automargin:true},xaxis:{automargin:true},paper_bgcolor:'#fff',plot_bgcolor:'#fff'},{responsive:true});
        else {if(heat.data)Plotly.purge(heat);heat.replaceChildren();}
        const left=Number(panel.querySelector('#initialFrontierCorrLeft').value),right=Number(panel.querySelector('#initialFrontierCorrRight').value);
        if(left===right){panel.querySelector('#initialFrontierRollingNote').textContent='Elige dos activos distintos.';if(rolling.data)Plotly.purge(rolling);rolling.replaceChildren();return;}
        const points=data.rollingCorrelation(left,right,24);
        panel.querySelector('#initialFrontierRollingNote').textContent=`Correlación móvil de 24 retornos mensuales comunes entre ${data.assets[left].key} y ${data.assets[right].key}. No es la correlación anual de la matriz.`;
        FinancialVisuals.newPlot(rolling,[{type:'scatter',mode:'lines',x:points.map(item=>new Date(Math.floor(item.month/12),item.month%12,1)),y:points.map(item=>Number.isFinite(item.value)?item.value:null),line:{color:'#075aa3',width:2},hovertemplate:'%{x|%Y-%m}: %{y:.2f}<extra></extra>'}],{title:'Evolución de la correlación',yaxis:{title:'ρ',range:[-1,1]},height:340,margin:{t:48,l:55,r:25,b:55},paper_bgcolor:'#fff',plot_bgcolor:'#fff'},{responsive:true});
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
                origin:sourceRows(),proposal:sourceRows(),
                series:prices(),mode,expected,minWeight:Number(panel.querySelector('#initialFrontierMinWeight').value),maxWeight:Number(panel.querySelector('#initialFrontierMaxWeight').value),
                benchmark:benchmarkId?window.masterBenchmarks?.[benchmarkId]:null,
                riskFreeAnnual:Number(panel.querySelector('#initialFrontierRiskFree').value)/100
            });
            data.benchmarkLabel=panel.querySelector('#initialFrontierBenchmark').selectedOptions[0]?.textContent||'Benchmark';result=data;signature=sourceSignature();
            assumptions(data.assets);
            await renderResult();correlationPairs(data);renderCorrelations();
            status.textContent=`${data.months.length-1} retornos mensuales comunes · ${label(data.months[0])} a ${label(data.months.at(-1))} · ${data.assets.length} series · peso por serie ${(data.floor*100).toFixed(0)}–${(data.cap*100).toFixed(0)}%.${benchmarkId?(data.benchmark?` Benchmark: ${data.benchmark.months-1} retornos mensuales comunes; puede cubrir un periodo más corto.`:' Benchmark omitido: requiere al menos 36 retornos mensuales consecutivos comunes.') : ''}`;
        }catch(error){invalidate();status.textContent=error.message;}
    }
    async function reportSection(){
        if(!result||signature!==sourceSignature())throw new Error('Calcula de nuevo la frontera con el Maestro vigente.');
        const image=await Plotly.toImage(panel.querySelector('#initialFrontierChart'),{format:'png',width:1000,height:550,scale:1.5});
        return `<section class="block report-chart-page"><h2>Riesgo y rentabilidad · frontera eficiente</h2><figure><img src="${image}" alt="Cartera individual frente a la frontera eficiente"></figure>${panel.querySelector('#initialFrontierSummary').innerHTML}<p class="method-note">${escapeHtml(panel.querySelector('#initialFrontierObjectiveNote').textContent)}</p>${panel.querySelector('#initialFrontierWeights').innerHTML}<p class="method-note">${escapeHtml(panel.querySelector('#initialFrontierStatus').textContent)} Media aritmética y covarianza muestral de retornos mensuales anualizadas sobre el mismo periodo. ${result.mode==='assumptions'?'Los retornos son hipótesis introducidas por el usuario; la covarianza es histórica.':'Retornos medios históricos, no previsiones.'} Optimización media-varianza sin cortos, totalmente invertida y con límite por serie histórica. Brecha: retorno adicional teórico a riesgo igual o menor bajo los mismos supuestos. No incluye impuestos, costes de transacción ni restricciones de perfil; estar en la frontera no garantiza mejores resultados futuros.</p></section>`;
    }
    function init(element){
        panel=element;
panel.innerHTML=`<h3>Riesgo y rentabilidad</h3><div class="workspace-settings initial-frontier-controls"><label>Modelo<select id="initialFrontierMode"><option value="historical">Histórico común</option><option value="assumptions">Hipótesis de retornos</option></select></label><label>Objetivo eficiente<select id="initialFrontierObjective"><option value="sameRisk">Máximo retorno con riesgo actual</option><option value="sameReturn">Mínimo riesgo con retorno actual</option></select></label><label>Peso mínimo por serie (%)<input id="initialFrontierMinWeight" type="number" min="0" max="100" step="1" value="0"></label><label>Peso máximo por serie (%)<input id="initialFrontierMaxWeight" type="number" min="1" max="100" step="1" value="100"></label><label>Tasa libre de riesgo anual (%)<input id="initialFrontierRiskFree" type="number" step="0.1" value="0"></label><label>Benchmark opcional<select id="initialFrontierBenchmark"><option value="">Sin benchmark</option></select></label><button type="button" id="initialFrontierCalculate"><i class="fa-solid fa-chart-scatter" aria-hidden="true"></i> Calcular</button></div><p id="initialFrontierStatus" class="workspace-status" role="status">Carga el Maestro con posiciones, pesos y hoja prices/posis para calcular.</p><div id="initialFrontierAssumptions" hidden><h4>Retornos anuales supuestos</h4><div class="proposal-chart-scroll"><table class="wide-report-table"><thead><tr><th>Serie</th><th>Media histórica</th><th>Supuesto anual (%)</th></tr></thead><tbody></tbody></table></div></div><div id="initialFrontierChart" class="initial-frontier-chart"></div><div id="initialFrontierSummary" class="proposal-chart-scroll"></div><p id="initialFrontierObjectiveNote" class="workspace-context"></p><h4>Pesos actuales y objetivo</h4><div id="initialFrontierWeights" class="proposal-chart-scroll"></div><h4>Correlación anual entre activos</h4><p id="initialFrontierCorrelationNote" class="workspace-context"></p><div class="proposal-chart-scroll"><div id="initialFrontierCorrelationChart" class="frontier-correlation-chart"></div></div><div class="workspace-settings"><label>Activo 1<select id="initialFrontierCorrLeft"></select></label><label>Activo 2<select id="initialFrontierCorrRight"></select></label></div><p id="initialFrontierRollingNote" class="workspace-context"></p><div id="initialFrontierRollingChart" class="frontier-rolling-chart"></div><p class="workspace-context">La cartera actual usa los pesos del Maestro y cierres mensuales comunes de prices/posis. «Equal weight» y la mínima varianza son referencias; la «cartera de mercado» es solo una proxy tangente de este universo con la tasa libre de riesgo indicada, no la cartera de mercado real. Los activos individuales pueden superar el límite por serie. En «Hipótesis» se editan retornos; riesgos y correlaciones siguen siendo históricos. La frontera no incluye límites por categoría o perfil y no constituye una recomendación automática.</p>`;
        panel.querySelector('#initialFrontierRiskFree').value=document.getElementById('portfolioRiskFree')?.value||'0';
        panel.querySelector('#initialFrontierCalculate').addEventListener('click',calculate);
        panel.querySelector('#initialFrontierMode').addEventListener('change',()=>{invalidate();panel.querySelector('#initialFrontierAssumptions').hidden=panel.querySelector('#initialFrontierMode').value!=='assumptions';});
        panel.querySelector('#initialFrontierMaxWeight').addEventListener('change',invalidate);
        panel.querySelector('#initialFrontierMinWeight').addEventListener('change',invalidate);
        panel.querySelector('#initialFrontierRiskFree').addEventListener('change',invalidate);
        panel.querySelector('#initialFrontierBenchmark').addEventListener('change',invalidate);
        panel.querySelector('#initialFrontierObjective').addEventListener('change',renderResult);
        panel.querySelector('#initialFrontierCorrLeft').addEventListener('change',renderCorrelations);
        panel.querySelector('#initialFrontierCorrRight').addEventListener('change',renderCorrelations);
        panel.addEventListener('change',event=>{const input=event.target.closest('[data-frontier-expected]');if(!input)return;expected[input.dataset.frontierExpected]=input.value===''?NaN:input.valueAsNumber;invalidate();});
        window.addEventListener('resize',()=>{if(result&&!panel.hidden)requestAnimationFrame(()=>Plotly.Plots.resize(panel.querySelector('#initialFrontierChart')));});
    }
    return {init,calculate,invalidate,invalidateIfChanged,reportSection,benchmarks,get result(){return result;}};
})();
