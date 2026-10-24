const MarketDrawdown=(()=>{
    const day=86400000;
    function analyze(points){
        const series=(points||[]).filter(item=>Number.isFinite(item.price)&&item.price>0&&Number.isFinite(+new Date(item.date))).map(item=>({date:new Date(item.date),price:item.price})).sort((a,b)=>a.date-b.date);
        if(series.length<2)return null;
        let peak=series[0],trough=series[0],max={depth:0,peak:series[0],trough:series[0],recovery:null},episode=null;
        const curve=[];
        for(const point of series){
            if(point.price>=peak.price){
                if(episode&&+max.peak.date===+episode.peak.date&&+max.trough.date===+episode.trough.date)max={...max,recovery:point};
                peak=point;trough=point;episode=null;
            }else{
                if(point.price<trough.price)trough=point;
                const depth=trough.price/peak.price-1;
                episode={depth,peak,trough,recovery:null};
                if(depth<max.depth)max=episode;
            }
            curve.push({date:point.date,drawdown:point.price/peak.price-1});
        }
        const recovered=Boolean(max.recovery),days=Math.round(((max.recovery||series.at(-1)).date-max.trough.date)/day);
        return {depth:max.depth,peak:max.peak.date,trough:max.trough.date,recovery:max.recovery?.date||null,recovered,days,curve};
    }
    function render(groups){
        const select=document.getElementById('marketDrawdownGroup'),scatter=document.getElementById('marketDrawdownScatter'),history=document.getElementById('marketDrawdownHistory'),note=document.getElementById('marketDrawdownNote');
        if(!select||!scatter||!history||!window.Plotly)return;
        const type=select.value,source=groups[type]||[],rows=source.map(item=>({...item,summary:analyze(item.data)})).filter(item=>item.summary&&item.summary.depth<0);
        const completed=rows.filter(item=>item.summary.recovered),open=rows.filter(item=>!item.summary.recovered);
        const trace=(items,name,color,symbol)=>({type:'scatter',mode:'markers+text',name,x:items.map(item=>-item.summary.depth*100),y:items.map(item=>item.summary.days),text:items.map(item=>item.name),textposition:'top center',textfont:{size:10},customdata:items.map(item=>item.ticker),marker:{size:11,color,symbol,line:{color:'#fff',width:1}},hovertemplate:'%{text} (%{customdata})<br>Caída máxima: %{x:.1f}%<br>Días desde mínimo: %{y}<extra>'+name+'</extra>'});
        FinancialVisuals.newPlot(scatter,[trace(completed,'Recuperada','#075aa3','circle'),trace(open,'Aún sin recuperar','#8598aa','diamond-open')],{title:'Caída máxima y tiempo desde el mínimo',xaxis:{title:'Drawdown máximo (%)'},yaxis:{title:'Días naturales hasta recuperación / observación'},height:440,margin:{t:60,l:65,r:25,b:80},legend:{orientation:'h',y:-.25},paper_bgcolor:'#fff',plot_bgcolor:'#fff'},{responsive:true});
        const top=[...rows].sort((a,b)=>a.summary.depth-b.summary.depth).slice(0,10);
        FinancialVisuals.newPlot(history,top.map((item,index)=>({type:'scatter',mode:'lines',name:`${item.name} (${item.ticker})`,x:item.summary.curve.map(point=>point.date),y:item.summary.curve.map(point=>point.drawdown*100),line:{width:1.7,color:['#075aa3','#627f9c','#3e9ad0','#354f67','#118273','#8598aa','#2278aa','#765b8b','#a66f48','#596a79'][index]}})),{title:'Evolución del drawdown · 10 mayores caídas',yaxis:{title:'Desde máximo previo (%)',ticksuffix:'%'},hovermode:'x unified',height:440,margin:{t:60,l:65,r:25,b:90},legend:{orientation:'h',y:-.25},paper_bgcolor:'#fff',plot_bgcolor:'#fff'},{responsive:true});
        note.textContent=`${rows.length} series con histórico; ${open.length} caídas máximas siguen abiertas. El eje vertical mide días naturales desde el mínimo hasta recuperar el máximo anterior; para episodios abiertos muestra días transcurridos, no una recuperación prevista. Comparación descriptiva: las fechas de inicio y longitudes de serie pueden diferir.`;
    }
    return {analyze,render};
})();
if(typeof module!=='undefined')module.exports=MarketDrawdown;
