(function(root,factory){
    const core=factory(root.FinanceCore||require('./finance-core.js'));
    if(typeof module==='object'&&module.exports)module.exports=core;
    else root.MultiAssetCompare=core;
})(globalThis,function(finance){
    const periods=finance.annualPeriods;
    const colors=['#164e78','#6b7785','#168270','#b47736','#a34d59','#654c91','#427fa4','#806b39','#548467','#a06597','#315f68','#994f35','#798144','#515eae','#be7080','#407b89','#916b57','#637d9e','#798a71','#a078b1'];
    const maxAssets=20;
    const clean=series=>(series||[]).filter(p=>p&&Number.isFinite(+new Date(p.date))&&Number.isFinite(p.price)&&p.price>0).map(p=>({date:new Date(p.date),price:p.price})).sort((a,b)=>a.date-b.date);
    function bucket(date,freq){
        const y=date.getUTCFullYear(),m=date.getUTCMonth();
        if(freq==='A')return String(y);
        if(freq==='Q')return `${y}-Q${Math.floor(m/3)+1}`;
        if(freq==='M')return `${y}-${String(m+1).padStart(2,'0')}`;
        if(freq==='W'){const monday=new Date(Date.UTC(y,m,date.getUTCDate()-(date.getUTCDay()+6)%7));return monday.toISOString().slice(0,10);}
        return date.toISOString().slice(0,10);
    }
    function commonSeries(input,range='ALL',maxCount=maxAssets){
        if(input.length<1||input.length>maxCount)throw new Error(`Selecciona entre 1 y ${maxAssets} activos.`);
        const sources=input.map(item=>({ticker:item.ticker,points:clean(item.data)}));
        if(sources.some(s=>s.points.length<3))throw new Error('Cada activo necesita al menos tres precios validos.');
        const rank={C:0,D:0,W:1,M:2,Q:3,A:4};
        const freq=sources.map(s=>finance.frequency(s.points)).sort((a,b)=>rank[b]-rank[a])[0];
        const maps=sources.map(s=>{const map=new Map();s.points.forEach(p=>map.set(bucket(p.date,freq),p));return map;});
        let rows=[...maps[0]].filter(([key])=>maps.every(map=>map.has(key))).map(([key])=>({date:new Date(Math.max(...maps.map(map=>+map.get(key).date))),prices:maps.map(map=>map.get(key).price)})).sort((a,b)=>a.date-b.date);
        if(range!=='ALL'){
            const years=Number(range.slice(0,-1));if(!Number.isFinite(years)||!range.endsWith('Y'))throw new Error('Periodo no valido.');
            const last=rows.at(-1)?.date;if(!last)throw new Error('No hay fechas comunes para comparar.');
            const day=Math.min(last.getUTCDate(),new Date(Date.UTC(last.getUTCFullYear()-years,last.getUTCMonth()+1,0)).getUTCDate());
            const cutoff=new Date(Date.UTC(last.getUTCFullYear()-years,last.getUTCMonth(),day));
            const base=rows.filter(row=>row.date<=cutoff).at(-1),freq=finance.frequency(rows.map(row=>({date:row.date,price:row.prices[0]})));
            const grace={C:7,D:7,W:14,M:45,Q:105,A:380}[freq]||7;
            if(!base||(cutoff-base.date)/86400000>grace)throw new Error(`No hay ${years} años completos de histórico común.`);
            rows=[base,...rows.filter(row=>row.date>cutoff)];
        }
        if(rows.length<3)throw new Error('No hay suficientes fechas comunes para comparar los activos.');
        return {rows,frequency:finance.frequency(rows.map(row=>({date:row.date,price:row.prices[0]})))};
    }
    function horizonReturns(rows,index,freq){
        const last=rows.at(-1),end=last.date,grace={C:7,D:7,W:14,M:45,Q:105,A:380}[freq]||7;
        const shift=months=>{const first=new Date(Date.UTC(end.getUTCFullYear(),end.getUTCMonth()-months,1));const day=Math.min(end.getUTCDate(),new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate());first.setUTCDate(day);return first;};
        const value=(cutoff,annualized=false)=>{const base=rows.filter(row=>row.date<=cutoff).at(-1);if(!base||(cutoff-base.date)/86400000>grace)return NaN;
            const total=last.prices[index]/base.prices[index]-1,years=(end-base.date)/86400000/365.25;
            return annualized&&years>0?(1+total)**(1/years)-1:total;
        };
        const yearStart=new Date(Date.UTC(end.getUTCFullYear(),0,1));
        const prevYear=rows.filter(row=>row.date<yearStart).at(-1);
        return {ytd:prevYear&&(yearStart-prevYear.date)/86400000<=grace?last.prices[index]/prevYear.prices[index]-1:NaN,
            sixMonths:value(shift(6)),oneYear:value(shift(12)),threeYears:value(shift(36),true),fiveYears:value(shift(60),true),sinceStart:last.prices[index]/rows[0].prices[index]-1};
    }
    function benchmarkMetrics(rows,index,benchmarkIndex,freq,rfAnnual){
        if(benchmarkIndex<0)return {beta:NaN,alpha:NaN};
        const asset=rows.slice(1).map((row,i)=>row.prices[index]/rows[i].prices[index]-1);
        const bench=rows.slice(1).map((row,i)=>row.prices[benchmarkIndex]/rows[i].prices[benchmarkIndex]-1);
        if(asset.length<3)return {beta:NaN,alpha:NaN};
        const assetMean=finance.mean(asset),benchMean=finance.mean(bench);
        const centered=bench.map(value=>value-benchMean),denominator=centered.reduce((sum,value)=>sum+value*value,0);
        if(denominator<=1e-14)return {beta:NaN,alpha:NaN};
        const beta=centered.reduce((sum,value,i)=>sum+value*(asset[i]-assetMean),0)/denominator;
        const annualPeriods=periods[freq]||252,rfPeriod=(1+rfAnnual)**(1/annualPeriods)-1;
        return {beta,alpha:(assetMean-rfPeriod-beta*(benchMean-rfPeriod))*annualPeriods};
    }
    function metrics(rows,index,freq,rfAnnual=0){
        const prices=rows.map(row=>row.prices[index]),returns=prices.slice(1).map((p,i)=>p/prices[i]-1),years=(rows.at(-1).date-rows[0].date)/86400000/365.25;
        const total=prices.at(-1)/prices[0]-1,annual=years>=1?Math.pow(1+total,1/years)-1:NaN;
        const vol=finance.stdev(returns)*Math.sqrt(periods[freq]||252);
        let peak=0,peakIndex=0,drawdown=0,worstPeak=0,worstTrough=0;
        const drawdowns=prices.map((price,i)=>{if(price>peak){peak=price;peakIndex=i;}const value=price/peak-1;if(value<drawdown){drawdown=value;worstPeak=peakIndex;worstTrough=i;}return value;});
        const recoveredAt=drawdown<0?prices.findIndex((price,i)=>i>worstTrough&&price>=prices[worstPeak]):-1;
        const recoveryDays=drawdown<0?(recoveredAt<0?null:Math.round((rows[recoveredAt].date-rows[worstPeak].date)/86400000)):0;
        return {total,annual,vol,drawdown,drawdowns,recoveryDays,sharpe:finance.sharpe(returns,freq,rfAnnual)};
    }
    function correlations(rows,count){
        const returns=Array.from({length:count},(_,index)=>rows.slice(1).map((row,i)=>row.prices[index]/rows[i].prices[index]-1));
        return returns.map((left,i)=>returns.map((right,j)=>{
            if(i===j)return 1;
            const lm=finance.mean(left),rm=finance.mean(right);
            const covariance=left.reduce((sum,value,k)=>sum+(value-lm)*(right[k]-rm),0);
            const lv=left.reduce((sum,value)=>sum+(value-lm)**2,0),rv=right.reduce((sum,value)=>sum+(value-rm)**2,0);
            return lv>1e-20&&rv>1e-20?Math.max(-1,Math.min(1,covariance/Math.sqrt(lv*rv))):null;
        }));
    }
    function compare(input,range='ALL',riskFreeAnnual=0,benchmark=null){
        if(input.length<1||input.length>maxAssets)throw new Error(`Selecciona entre 1 y ${maxAssets} activos.`);
        if(!Number.isFinite(riskFreeAnnual)||riskFreeAnnual<=-1)throw new Error('La tasa libre de riesgo anual debe ser superior a -100%.');
        const all=input.concat(benchmark?[benchmark]:[]),full=commonSeries(all,'ALL',maxAssets+1),{rows,frequency}=range==='ALL'?full:commonSeries(all,range,maxAssets+1);
        const benchmarkIndex=benchmark?input.length:-1;
        const assets=input.map((item,index)=>({...item,color:colors[index],base100:rows.map(row=>row.prices[index]/rows[0].prices[index]*100),...metrics(rows,index,frequency,riskFreeAnnual),...benchmarkMetrics(rows,index,benchmarkIndex,frequency,riskFreeAnnual),horizons:horizonReturns(full.rows,index,full.frequency)}));
        const benchmarkAsset=benchmark?{...benchmark,base100:rows.map(row=>row.prices[benchmarkIndex]/rows[0].prices[benchmarkIndex]*100),...metrics(rows,benchmarkIndex,frequency,riskFreeAnnual),horizons:horizonReturns(full.rows,benchmarkIndex,full.frequency)}:null;
        return {rows,frequency,assets,benchmark:benchmarkAsset,riskFreeAnnual,correlations:correlations(rows,input.length)};
    }
    function resultsHtml(prefix){
        return `<div class="multi-asset-charts"><div id="${prefix}BaseChart"></div><div id="${prefix}DrawdownChart"></div><div id="${prefix}ScatterChart"></div></div><div class="proposal-chart-scroll"><table class="wide-report-table multi-asset-table"><thead><tr><th>Activo</th><th>Divisa</th><th>Retorno periodo</th><th>Retorno anualizado</th><th>Volatilidad anualizada</th><th>Caída máxima</th><th>Recuperación caída máxima</th><th id="${prefix}SharpeHead">Sharpe</th><th>Beta</th><th>Alfa anual</th><th>Observaciones</th></tr></thead><tbody id="${prefix}TableBody"></tbody></table></div><h4 class="multi-asset-section-title">Rentabilidad por plazo</h4><div class="proposal-chart-scroll"><table class="wide-report-table multi-asset-table"><thead><tr><th>Activo</th><th>YTD</th><th>6 meses</th><th>1 año</th><th>3 años anualizada</th><th>5 años anualizada</th><th>Desde inicio</th></tr></thead><tbody id="${prefix}HorizonBody"></tbody></table></div><h4 class="multi-asset-section-title">Correlación de retornos</h4><div class="proposal-chart-scroll"><div id="${prefix}CorrelationChart" class="multi-asset-correlation"></div></div><p class="workspace-context">Las métricas y correlaciones usan retornos emparejados del periodo elegido. Recuperación: días naturales desde el máximo anterior a la peor caída hasta volver a ese nivel; «No recuperado» si no ocurre dentro del periodo. La tabla de plazos usa todo el histórico común. YTD, 6 meses, 1 año y desde inicio son acumulados; 3 y 5 años, anualizados. Sin historia completa se muestra «—». Sharpe usa la tasa anual indicada. Alfa de Jensen se anualiza aritméticamente frente al benchmark. Divisas distintas o cierres no ajustados pueden distorsionar la comparación.</p>`;
    }
    function renderResults(panel,result,prefix='multiAsset'){
        const el=suffix=>panel.querySelector(`#${prefix}${suffix}`),fmt=value=>Number.isFinite(value)?`${(value*100).toFixed(2)}%`:'-',signed=value=>Number.isFinite(value)?value>0?'good':value<0?'bad':'':'';
        const safe=value=>typeof escapeHtml==='function'?escapeHtml(String(value??'')):String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
        el('SharpeHead').textContent=`Sharpe (rf ${(result.riskFreeAnnual*100).toFixed(2)}%)`;
        el('TableBody').innerHTML=result.assets.map(asset=>`<tr><td><span class="multi-asset-key" style="background:${asset.color}"></span>${safe(asset.ticker)}</td><td>${safe(asset.currency||'-')}</td><td class="${signed(asset.total)}">${fmt(asset.total)}</td><td class="${signed(asset.annual)}">${fmt(asset.annual)}</td><td>${fmt(asset.vol)}</td><td class="${signed(asset.drawdown)}">${fmt(asset.drawdown)}</td><td>${asset.recoveryDays===null?'No recuperado':`${asset.recoveryDays} días`}</td><td>${Number.isFinite(asset.sharpe)?asset.sharpe.toFixed(2):'-'}</td><td>${Number.isFinite(asset.beta)?asset.beta.toFixed(2):'-'}</td><td class="${signed(asset.alpha)}">${fmt(asset.alpha)}</td><td>${result.rows.length}</td></tr>`).join('');
        const horizonRow=(asset,isBenchmark=false)=>`<tr><td><span class="multi-asset-key" style="background:${isBenchmark?'#263746':asset.color}"></span>${safe(asset.ticker)}${isBenchmark?' (benchmark)':''}</td>${['ytd','sixMonths','oneYear','threeYears','fiveYears','sinceStart'].map(key=>`<td class="${signed(asset.horizons[key])}">${fmt(asset.horizons[key])}</td>`).join('')}</tr>`;
        el('HorizonBody').innerHTML=result.assets.map(asset=>horizonRow(asset)).join('')+(result.benchmark&&!result.assets.some(asset=>asset.ticker===result.benchmark.ticker)?horizonRow(result.benchmark,true):'');
        const x=result.rows.map(row=>row.date),line=asset=>({x,mode:'lines',name:asset.ticker,line:{color:asset.color,width:2.3}});
        const hasExtra=result.benchmark&&!result.assets.some(asset=>asset.ticker===result.benchmark.ticker);
        const legendRows=Math.ceil((result.assets.length+(hasExtra?1:0))/4),chartHeight=Math.max(390,300+legendRows*24),marginBottom=55+legendRows*24;
        for(const suffix of ['BaseChart','DrawdownChart'])el(suffix).style.height=`${chartHeight}px`;
        const legend={orientation:'h',x:0,y:-.18,font:{size:11}};
        const benchmarkTrace=hasExtra?[{...line({...result.benchmark,color:'#263746'}),line:{color:'#263746',width:2.4,dash:'dash'},name:`${result.benchmark.ticker} (benchmark)`,base100:result.benchmark.base100,drawdowns:result.benchmark.drawdowns}]:[];
        const chartAssets=result.assets.concat(benchmarkTrace);
        FinancialVisuals.newPlot(`${prefix}BaseChart`,chartAssets.map(asset=>({...line(asset),line:asset.line||line(asset).line,name:asset.name||asset.ticker,y:asset.base100})),{title:'Evolución base 100',yaxis:{title:'Base 100'},margin:{t:44,l:56,r:20,b:marginBottom},legend},{responsive:true});
        FinancialVisuals.newPlot(`${prefix}DrawdownChart`,chartAssets.map(asset=>({...line(asset),line:asset.line||line(asset).line,name:asset.name||asset.ticker,y:asset.drawdowns.map(v=>v*100)})),{title:'Caída desde máximo',yaxis:{title:'%'},margin:{t:44,l:56,r:20,b:marginBottom},legend},{responsive:true});
        const scatter=new Map();result.assets.forEach(asset=>{const x=asset.vol*100,y=asset.total*100,key=`${x.toFixed(2)}|${y.toFixed(2)}`;if(!scatter.has(key))scatter.set(key,{x,y,names:[],color:asset.color});scatter.get(key).names.push(asset.ticker);});
        const points=[...scatter.values()];if(hasExtra)points.push({x:result.benchmark.vol*100,y:result.benchmark.total*100,names:[`${result.benchmark.ticker} (benchmark)`],color:'#263746',symbol:'diamond'});
        const axis=(values,floor,nonnegative=false)=>{const low=Math.min(...values),high=Math.max(...values),pad=Math.max(floor,(high-low)*.2);return [nonnegative?Math.max(0,low-pad):low-pad,high+pad];};
        FinancialVisuals.newPlot(`${prefix}ScatterChart`,points.map(point=>({x:[point.x],y:[point.y],text:[point.names.join(', ')],mode:'markers+text',textposition:'top center',name:point.names.join(', '),marker:{color:point.color,size:15,symbol:point.symbol||'circle'}})),{title:'Riesgo anualizado vs retorno del periodo',xaxis:{title:'Volatilidad anualizada (%)',range:axis(points.map(point=>point.x),.5,true),tickformat:'.1f'},yaxis:{title:'Retorno del periodo (%)',range:axis(points.map(point=>point.y),1),tickformat:'.1f'},margin:{t:44,l:65,r:20,b:60},showlegend:false},{responsive:true});
        const names=result.assets.map(asset=>asset.ticker);
        el('CorrelationChart').style.height=`${Math.max(350,Math.min(880,120+names.length*33))}px`;
        FinancialVisuals.newPlot(`${prefix}CorrelationChart`,[{type:'heatmap',x:names,y:names,z:result.correlations,zmin:-1,zmax:1,zmid:0,colorscale:[[0,'#a94c55'],[.5,'#f2f5f7'],[1,'#164e78']],hovertemplate:'%{y} / %{x}: %{z:.2f}<extra></extra>',colorbar:{title:'ρ'},text:result.correlations.map(row=>row.map(value=>value===null?'—':value.toFixed(2))),texttemplate:'%{text}',textfont:{size:names.length>12?9:11}}],{margin:{t:24,l:Math.min(220,Math.max(90,...names.map(name=>name.length*7))),r:50,b:Math.min(180,Math.max(80,...names.map(name=>name.length*6)))},xaxis:{side:'bottom',tickangle:names.length>5?-45:0,automargin:true},yaxis:{autorange:'reversed',automargin:true}},{responsive:true});
        const all=result.assets.concat(result.benchmark?[result.benchmark]:[]),currencies=new Set(all.map(asset=>asset.currency).filter(Boolean)),unadjusted=all.filter(asset=>asset.priceType==='close');
        return `${result.rows.length} fechas comunes · ${result.rows[0].date.toISOString().slice(0,10)} a ${result.rows.at(-1).date.toISOString().slice(0,10)}.${result.benchmark?` Benchmark: ${result.benchmark.ticker}.`:''}${currencies.size>1?' Aviso: divisas distintas sin convertir.':''}${unadjusted.length?` Aviso: ${[...new Set(unadjusted.map(asset=>asset.ticker))].join(', ')} usa cierre no ajustado.`:''}`;
    }
    function init(){
        const section=document.getElementById('section-individual'),single=section?.querySelector(':scope > .container');if(!single)return;
        const nav=document.createElement('nav');nav.className='individual-mode-tabs';nav.setAttribute('aria-label','Vistas de analisis individual');
        nav.innerHTML='<button type="button" data-individual-mode="single" aria-pressed="true">Analisis de activo</button><button type="button" data-individual-mode="compare" aria-pressed="false">Comparar activos</button>';
        const panel=document.createElement('div');panel.id='individualComparePanel';panel.className='individual-compare-panel';panel.hidden=true;
        single.before(nav);single.after(panel);
        nav.addEventListener('click',event=>{const button=event.target.closest('[data-individual-mode]');if(!button)return;
            const compare=button.dataset.individualMode==='compare';single.hidden=compare;panel.hidden=!compare;
            nav.querySelectorAll('button').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
            setTimeout(()=>window.dispatchEvent(new Event('resize')),50);
        });
        panel.innerHTML=`<div class="workspace-heading"><div><h3>Comparar activos</h3></div></div><div class="workspace-settings multi-asset-controls"><div id="multiAssetTickerList" class="multi-asset-ticker-list"></div><button type="button" id="multiAssetAdd" title="Añadir activo"><i class="fa-solid fa-plus" aria-hidden="true"></i> Añadir activo</button><label>Periodo<select id="multiAssetRange"><option value="ALL">Todo el histórico común</option><option value="5Y">5 años</option><option value="3Y">3 años</option><option value="1Y">1 año</option></select></label><label>Tasa libre de riesgo anual (%)<input id="multiAssetRiskFree" type="number" min="-99.99" step="0.1" value="0"></label><label>Benchmark<select id="multiAssetBenchmark"><option value="">Sin benchmark</option><option value="CUSTOM">Otro ticker Yahoo</option></select></label><label id="multiAssetBenchmarkCustomLabel" hidden>Ticker del benchmark<input id="multiAssetBenchmarkCustom" placeholder="Ticker Yahoo"></label><button type="button" id="multiAssetLoad"><i class="fa-solid fa-chart-line" aria-hidden="true"></i> Comparar</button></div><p id="multiAssetStatus" role="status" class="workspace-status"></p><div class="multi-asset-charts"><div id="multiAssetBaseChart"></div><div id="multiAssetDrawdownChart"></div><div id="multiAssetScatterChart"></div></div><div class="proposal-chart-scroll"><table class="wide-report-table multi-asset-table"><thead><tr><th>Activo</th><th>Divisa</th><th>Retorno periodo</th><th>Retorno anualizado</th><th>Volatilidad anualizada</th><th>Caída máxima</th><th id="multiAssetSharpeHead">Sharpe</th><th>Beta</th><th>Alfa anual</th><th>Observaciones</th></tr></thead><tbody id="multiAssetTableBody"></tbody></table></div><h4 class="multi-asset-section-title">Rentabilidad por plazo</h4><div class="proposal-chart-scroll"><table class="wide-report-table multi-asset-table"><thead><tr><th>Activo</th><th>YTD</th><th>6 meses</th><th>1 año</th><th>3 años anualizada</th><th>5 años anualizada</th><th>Desde inicio</th></tr></thead><tbody id="multiAssetHorizonBody"></tbody></table></div><p class="workspace-context">Todos los activos y el benchmark usan fechas comunes. La tabla de plazos utiliza el histórico común completo; las demás métricas usan el periodo elegido. YTD, 6 meses, 1 año y desde inicio son acumulados; 3 y 5 años, anualizados. Sin historia completa para un plazo se muestra «—». Sharpe usa la tasa anual indicada. Alfa es el intercepto de Jensen anualizado aritméticamente frente al benchmark seleccionado; beta y alfa usan retornos emparejados del periodo elegido. Las divisas distintas y los cierres no ajustados pueden distorsionar la comparación.</p>`;
        panel.querySelector('#multiAssetTickerList').insertAdjacentHTML('afterend','<div class="multi-asset-import-actions"><button type="button" id="multiAssetAddPortfolio"><i class="fa-solid fa-briefcase" aria-hidden="true"></i> Añadir cartera importada</button><label>Benchmark del Excel<select id="multiAssetExcelBench"><option value="">Seleccionar</option></select></label><button type="button" id="multiAssetAddExcelBench"><i class="fa-solid fa-plus" aria-hidden="true"></i> Añadir bench</button></div>');
        panel.querySelector('#multiAssetSharpeHead').insertAdjacentHTML('beforebegin','<th>Recuperación caída máxima</th>');
        panel.querySelector('.multi-asset-table').closest('.proposal-chart-scroll').insertAdjacentHTML('afterend','<h4 class="multi-asset-section-title">Correlación de retornos</h4><div class="proposal-chart-scroll"><div id="multiAssetCorrelationChart" class="multi-asset-correlation"></div></div>');
        let loaded=[],loadedBenchmark=null;
        const status=panel.querySelector('#multiAssetStatus');
        const tickerList=panel.querySelector('#multiAssetTickerList');
        const benchmarkSelect=panel.querySelector('#multiAssetBenchmark');
        const excelBench=panel.querySelector('#multiAssetExcelBench');
        const importedBenchmarks=()=>typeof loadedPortfolio==='object'&&loadedPortfolio?.benchmarks||{};
        function refreshImportedOptions(){
            const selected=excelBench.value;
            excelBench.innerHTML='<option value="">Seleccionar</option>'+Object.keys(importedBenchmarks()).map(key=>`<option value="${escapeHtml(key)}">${escapeHtml(key)}</option>`).join('');
            if(Object.hasOwn(importedBenchmarks(),selected))excelBench.value=selected;
            updateBenchmarkOptions();
        }
        function updateBenchmarkOptions(){
            const selected=benchmarkSelect.value;
            benchmarkSelect.innerHTML='<option value="">Sin benchmark</option>'+[...panel.querySelectorAll('[data-multi-ticker]')].map(input=>input.value.trim().toUpperCase()).filter(Boolean).map(ticker=>`<option value="${escapeHtml(ticker)}">${escapeHtml(ticker)}</option>`).join('')+Object.keys(importedBenchmarks()).map(key=>`<option value="${escapeHtml(`BENCH:${key.toUpperCase()}`)}">Excel · ${escapeHtml(key)}</option>`).join('')+'<option value="CUSTOM">Otro ticker Yahoo</option>';
            benchmarkSelect.value=[...benchmarkSelect.options].some(option=>option.value===selected)?selected:'';
        }
        function addTicker(value=''){
            const count=tickerList.children.length;if(count>=maxAssets)return;
            const row=document.createElement('div');row.className='multi-asset-ticker-row';
            row.innerHTML=`<label>Activo ${count+1}<input data-multi-ticker="${count}" placeholder="Ticker Yahoo" value="${escapeHtml(value)}" ${value?'readonly':''}></label><button type="button" data-multi-remove title="Quitar activo" aria-label="Quitar activo ${count+1}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>`;
            tickerList.append(row);panel.querySelector('#multiAssetAdd').disabled=tickerList.children.length>=maxAssets;updateBenchmarkOptions();
        }
        addTicker();addTicker();
        panel.querySelector('#multiAssetAdd').addEventListener('click',()=>addTicker());
        panel.querySelector('#multiAssetAddPortfolio').addEventListener('click',()=>{if(!loadedPortfolio?.portfolioData?.length){status.textContent='Carga primero la cartera individual y su histórico.';return;}addTicker('CARTERA IMPORTADA');});
        panel.querySelector('#multiAssetAddExcelBench').addEventListener('click',()=>{if(!excelBench.value){status.textContent='Elige un benchmark de la hoja bench.';return;}addTicker(`BENCH:${excelBench.value.toUpperCase()}`);});
        excelBench.addEventListener('focus',refreshImportedOptions);
        nav.addEventListener('click',refreshImportedOptions);
        tickerList.addEventListener('click',event=>{const button=event.target.closest('[data-multi-remove]');if(!button)return;
            button.parentElement.remove();[...tickerList.children].forEach((row,index)=>{row.querySelector('label').firstChild.textContent=`Activo ${index+1}`;row.querySelector('input').dataset.multiTicker=index;row.querySelector('button').setAttribute('aria-label',`Quitar activo ${index+1}`);});
            panel.querySelector('#multiAssetAdd').disabled=false;updateBenchmarkOptions();
        });
        tickerList.addEventListener('input',updateBenchmarkOptions);
        benchmarkSelect.addEventListener('change',()=>{panel.querySelector('#multiAssetBenchmarkCustomLabel').hidden=benchmarkSelect.value!=='CUSTOM';if(loaded.length)panel.querySelector('#multiAssetLoad').click();});
        function show(result){status.textContent=renderResults(panel,result,'multiAsset');}
        function renderCurrent(){
            if(!loaded.length)return;
            try{const value=panel.querySelector('#multiAssetRiskFree').value,rate=value.trim()===''?NaN:Number(value.replace(',','.'))/100;
                show(compare(loaded,panel.querySelector('#multiAssetRange').value,rate,loadedBenchmark));
            }catch(error){status.textContent=error.message;}
        }
        panel.querySelector('#multiAssetLoad').addEventListener('click',async()=>{
            const tickers=[...panel.querySelectorAll('[data-multi-ticker]')].map(input=>input.value.trim().toUpperCase()).filter(Boolean);
            const imported=ticker=>ticker==='CARTERA IMPORTADA'||ticker.startsWith('BENCH:');
            if(tickers.length<1||tickers.length>maxAssets||new Set(tickers).size!==tickers.length){status.textContent=`Introduce entre 1 y ${maxAssets} tickers diferentes.`;return;}
            if(tickers.some(ticker=>!imported(ticker)&&!/^[A-Z0-9^.=\-]{1,32}$/.test(ticker))){status.textContent='Revisa el formato de los tickers Yahoo.';return;}
            const choice=benchmarkSelect.value,benchmarkTicker=choice==='CUSTOM'?panel.querySelector('#multiAssetBenchmarkCustom').value.trim().toUpperCase():choice;
            if(choice==='CUSTOM'&&!benchmarkTicker){status.textContent='Introduce el ticker Yahoo del benchmark.';return;}
            if(benchmarkTicker&&!imported(benchmarkTicker)&&!/^[A-Z0-9^.=\-]{1,32}$/.test(benchmarkTicker)){status.textContent='Revisa el ticker Yahoo del benchmark.';return;}
            const rateInput=panel.querySelector('#multiAssetRiskFree').value,rate=rateInput.trim()===''?NaN:Number(rateInput.replace(',','.'))/100;
            if(!Number.isFinite(rate)||rate<=-1){status.textContent='Introduce una tasa libre de riesgo anual superior a -100%.';return;}
            const button=panel.querySelector('#multiAssetLoad');button.disabled=true;status.textContent=`Cargando historicos de ${tickers.join(', ')}...`;
            try{
                const end=new Date(),start=new Date(end);start.setUTCFullYear(start.getUTCFullYear()-12);
                const previous=new Map(loaded.concat(loadedBenchmark?[loadedBenchmark]:[]).map(item=>[item.ticker,item]));
                const getAsset=async ticker=>{
                    if(ticker==='CARTERA IMPORTADA'){
                        if(!loadedPortfolio?.portfolioData?.length||portfolioHistoryStale())throw new Error('Reimporta la cartera individual con los supuestos actuales.');
                        return {ticker,data:loadedPortfolio.portfolioData,currency:loadedPortfolio.calculationSettings?.currency||''};
                    }
                    if(ticker.startsWith('BENCH:')){
                        const key=Object.keys(importedBenchmarks()).find(value=>value.toUpperCase()===ticker.slice(6));
                        if(!key)throw new Error(`No se encuentra ${ticker} en la hoja bench de la cartera cargada.`);
                        return {ticker,data:importedBenchmarks()[key].data||importedBenchmarks()[key]};
                    }
                    return previous.get(ticker)||{ticker,data:await fetchYahooData(ticker,start.toISOString().slice(0,10),end.toISOString().slice(0,10)),currency:MarketData.metadata.get(ticker)?.currency||'',priceType:MarketData.metadata.get(ticker)?.priceType||''};
                };
                const next=[];for(let offset=0;offset<tickers.length;offset+=4){
                    const batch=tickers.slice(offset,offset+4);
                    next.push(...await Promise.all(batch.map(getAsset)));
                    status.textContent=`Historicos cargados: ${next.length} de ${tickers.length}.`;
                }
                const nextBenchmark=benchmarkTicker?(next.find(item=>item.ticker===benchmarkTicker)||await getAsset(benchmarkTicker)):null;
                const result=compare(next,panel.querySelector('#multiAssetRange').value,rate,nextBenchmark);
                loaded=next;loadedBenchmark=nextBenchmark;show(result);
            }catch(error){status.textContent=`No se ha completado la comparacion: ${error.message}`;}finally{button.disabled=false;}
        });
        panel.querySelector('#multiAssetRange').addEventListener('change',renderCurrent);
        panel.querySelector('#multiAssetRiskFree').addEventListener('input',renderCurrent);
    }
    return {commonSeries,compare,resultsHtml,renderResults,init};
});
if(typeof document!=='undefined')MultiAssetCompare.init();
