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
    function commonSeries(input,range='ALL'){
        if(input.length<1||input.length>maxAssets)throw new Error(`Selecciona entre 1 y ${maxAssets} activos.`);
        const sources=input.map(item=>({ticker:item.ticker,points:clean(item.data)}));
        if(sources.some(s=>s.points.length<3))throw new Error('Cada activo necesita al menos tres precios validos.');
        const rank={C:0,D:0,W:1,M:2,Q:3,A:4};
        const freq=sources.map(s=>finance.frequency(s.points)).sort((a,b)=>rank[b]-rank[a])[0];
        const maps=sources.map(s=>{const map=new Map();s.points.forEach(p=>map.set(bucket(p.date,freq),p));return map;});
        let rows=[...maps[0]].filter(([key])=>maps.every(map=>map.has(key))).map(([key])=>({date:new Date(Math.max(...maps.map(map=>+map.get(key).date))),prices:maps.map(map=>map.get(key).price)})).sort((a,b)=>a.date-b.date);
        if(range!=='ALL'){
            const years=Number(range.slice(0,-1));if(!Number.isFinite(years)||!range.endsWith('Y'))throw new Error('Periodo no valido.');
            const cutoff=new Date(rows.at(-1)?.date||0);cutoff.setUTCFullYear(cutoff.getUTCFullYear()-years);rows=rows.filter(row=>row.date>=cutoff);
        }
        if(rows.length<3)throw new Error('No hay suficientes fechas comunes para comparar los activos.');
        return {rows,frequency:freq};
    }
    function metrics(rows,index,freq){
        const prices=rows.map(row=>row.prices[index]),returns=prices.slice(1).map((p,i)=>p/prices[i]-1),years=(rows.at(-1).date-rows[0].date)/86400000/365.25;
        const total=prices.at(-1)/prices[0]-1,annual=years>=1?Math.pow(1+total,1/years)-1:NaN;
        const vol=finance.stdev(returns)*Math.sqrt(periods[freq]||252);
        let peak=0,drawdown=0;const drawdowns=prices.map(price=>{peak=Math.max(peak,price);const value=price/peak-1;drawdown=Math.min(drawdown,value);return value;});
        return {total,annual,vol,drawdown,drawdowns,sharpe:finance.sharpe(returns,freq,0)};
    }
    function compare(input,range='ALL'){
        const {rows,frequency}=commonSeries(input,range);
        return {rows,frequency,assets:input.map((item,index)=>({...item,color:colors[index],base100:rows.map(row=>row.prices[index]/rows[0].prices[index]*100),...metrics(rows,index,frequency)}))};
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
        panel.innerHTML=`<div class="workspace-heading"><div><h3>Comparar activos</h3></div></div><div class="workspace-settings multi-asset-controls"><div id="multiAssetTickerList" class="multi-asset-ticker-list"></div><button type="button" id="multiAssetAdd" title="Anadir activo"><i class="fa-solid fa-plus" aria-hidden="true"></i> Anadir activo</button><label>Periodo<select id="multiAssetRange"><option value="ALL">Todo el historico comun</option><option value="5Y">5 anos</option><option value="3Y">3 anos</option><option value="1Y">1 ano</option></select></label><button type="button" id="multiAssetLoad"><i class="fa-solid fa-chart-line" aria-hidden="true"></i> Comparar</button></div><p id="multiAssetStatus" role="status" class="workspace-status"></p><div class="multi-asset-charts"><div id="multiAssetBaseChart"></div><div id="multiAssetDrawdownChart"></div><div id="multiAssetScatterChart"></div></div><div class="proposal-chart-scroll"><table class="wide-report-table multi-asset-table"><thead><tr><th>Activo</th><th>Divisa</th><th>Retorno periodo</th><th>Retorno anualizado</th><th>Volatilidad anualizada</th><th>Caida maxima</th><th>Sharpe (rf 0%)</th><th>Observaciones</th></tr></thead><tbody id="multiAssetTableBody"></tbody></table></div><p class="workspace-context">Mismas fechas para todos los activos; precios base 100. Las diferencias de divisa y los cierres no ajustados pueden distorsionar la comparacion. El retorno anualizado solo se muestra con al menos un ano de historia comun.</p>`;
        let loaded=[];
        const status=panel.querySelector('#multiAssetStatus');
        const tickerList=panel.querySelector('#multiAssetTickerList');
        function addTicker(){
            const count=tickerList.children.length;if(count>=maxAssets)return;
            const row=document.createElement('div');row.className='multi-asset-ticker-row';
            row.innerHTML=`<label>Activo ${count+1}<input data-multi-ticker="${count}" placeholder="Ticker Yahoo"></label><button type="button" data-multi-remove title="Quitar activo" aria-label="Quitar activo ${count+1}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>`;
            tickerList.append(row);panel.querySelector('#multiAssetAdd').disabled=tickerList.children.length>=maxAssets;
        }
        addTicker();addTicker();
        panel.querySelector('#multiAssetAdd').addEventListener('click',addTicker);
        tickerList.addEventListener('click',event=>{const button=event.target.closest('[data-multi-remove]');if(!button)return;
            button.parentElement.remove();[...tickerList.children].forEach((row,index)=>{row.querySelector('label').firstChild.textContent=`Activo ${index+1}`;row.querySelector('input').dataset.multiTicker=index;row.querySelector('button').setAttribute('aria-label',`Quitar activo ${index+1}`);});
            panel.querySelector('#multiAssetAdd').disabled=false;
        });
        function show(result){
            const fmt=value=>Number.isFinite(value)?`${(value*100).toFixed(2)}%`:'-';
            panel.querySelector('#multiAssetTableBody').innerHTML=result.assets.map(asset=>`<tr><td><span class="multi-asset-key" style="background:${asset.color}"></span>${escapeHtml(asset.ticker)}</td><td>${escapeHtml(asset.currency||'-')}</td><td class="${asset.total>0?'good':asset.total<0?'bad':''}">${fmt(asset.total)}</td><td class="${asset.annual>0?'good':asset.annual<0?'bad':''}">${fmt(asset.annual)}</td><td>${fmt(asset.vol)}</td><td class="${asset.drawdown<0?'bad':''}">${fmt(asset.drawdown)}</td><td>${Number.isFinite(asset.sharpe)?asset.sharpe.toFixed(2):'-'}</td><td>${result.rows.length}</td></tr>`).join('');
            const x=result.rows.map(row=>row.date),line=asset=>({x,mode:'lines',name:asset.ticker,line:{color:asset.color,width:2.3}});
            const legendRows=Math.ceil(result.assets.length/4),chartHeight=Math.max(390,300+legendRows*24),marginBottom=55+legendRows*24;
            for(const id of ['multiAssetBaseChart','multiAssetDrawdownChart'])panel.querySelector(`#${id}`).style.height=`${chartHeight}px`;
            const legend={orientation:'h',x:0,y:-.18,font:{size:11}};
            FinancialVisuals.newPlot('multiAssetBaseChart',result.assets.map(asset=>({...line(asset),y:asset.base100})),{title:'Evolucion base 100',yaxis:{title:'Base 100'},margin:{t:44,l:56,r:20,b:marginBottom},legend},{responsive:true});
            FinancialVisuals.newPlot('multiAssetDrawdownChart',result.assets.map(asset=>({...line(asset),y:asset.drawdowns.map(v=>v*100)})),{title:'Caida desde maximo',yaxis:{title:'%'},margin:{t:44,l:56,r:20,b:marginBottom},legend},{responsive:true});
            const scatter=new Map();
            result.assets.forEach(asset=>{const x=asset.vol*100,y=asset.total*100,key=`${x.toFixed(2)}|${y.toFixed(2)}`;
                if(!scatter.has(key))scatter.set(key,{x,y,names:[],color:asset.color});scatter.get(key).names.push(asset.ticker);
            });
            const points=[...scatter.values()],axis=(values,floor,nonnegative=false)=>{const low=Math.min(...values),high=Math.max(...values),pad=Math.max(floor,(high-low)*.2);return [nonnegative?Math.max(0,low-pad):low-pad,high+pad];};
            FinancialVisuals.newPlot('multiAssetScatterChart',points.map(point=>({x:[point.x],y:[point.y],text:[point.names.join(', ')],mode:'markers+text',textposition:'top center',name:point.names.join(', '),marker:{color:point.color,size:15}})),{title:'Riesgo anualizado vs retorno del periodo',xaxis:{title:'Volatilidad anualizada (%)',range:axis(points.map(point=>point.x),.5,true),tickformat:'.1f'},yaxis:{title:'Retorno del periodo (%)',range:axis(points.map(point=>point.y),1),tickformat:'.1f'},margin:{t:44,l:65,r:20,b:60},showlegend:false},{responsive:true});
            const currencies=new Set(result.assets.map(a=>a.currency).filter(Boolean)),unadjusted=result.assets.filter(a=>a.priceType==='close');
            status.textContent=`${result.rows.length} fechas comunes · ${result.rows[0].date.toISOString().slice(0,10)} a ${result.rows.at(-1).date.toISOString().slice(0,10)}.${currencies.size>1?' Aviso: divisas distintas sin convertir.':''}${unadjusted.length?` Aviso: ${unadjusted.map(a=>a.ticker).join(', ')} usa cierre no ajustado.`:''}`;
        }
        panel.querySelector('#multiAssetLoad').addEventListener('click',async()=>{
            const tickers=[...panel.querySelectorAll('[data-multi-ticker]')].map(input=>input.value.trim().toUpperCase()).filter(Boolean);
            if(tickers.length<1||tickers.length>maxAssets||new Set(tickers).size!==tickers.length){status.textContent=`Introduce entre 1 y ${maxAssets} tickers diferentes.`;return;}
            if(tickers.some(ticker=>!/^[A-Z0-9^.=\-]{1,32}$/.test(ticker))){status.textContent='Revisa el formato de los tickers Yahoo.';return;}
            const button=panel.querySelector('#multiAssetLoad');button.disabled=true;status.textContent=`Cargando historicos de ${tickers.join(', ')}...`;
            try{
                const end=new Date(),start=new Date(end);start.setUTCFullYear(start.getUTCFullYear()-12);
                loaded=[];for(let offset=0;offset<tickers.length;offset+=4){
                    const batch=tickers.slice(offset,offset+4);
                    loaded.push(...await Promise.all(batch.map(async ticker=>({ticker,data:await fetchYahooData(ticker,start.toISOString().slice(0,10),end.toISOString().slice(0,10)),currency:MarketData.metadata.get(ticker)?.currency||'',priceType:MarketData.metadata.get(ticker)?.priceType||''}))));
                    status.textContent=`Historicos cargados: ${loaded.length} de ${tickers.length}.`;
                }
                show(compare(loaded,panel.querySelector('#multiAssetRange').value));
            }catch(error){status.textContent=`No se ha completado la comparacion: ${error.message}`;}finally{button.disabled=false;}
        });
        panel.querySelector('#multiAssetRange').addEventListener('change',()=>{if(!loaded.length)return;try{show(compare(loaded,panel.querySelector('#multiAssetRange').value));}catch(error){status.textContent=error.message;}});
    }
    return {commonSeries,compare,init};
});
if(typeof document!=='undefined')MultiAssetCompare.init();
