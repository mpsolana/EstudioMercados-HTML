const CategoryFlows=(()=>{
    function model(){return AnalysisCore.categoryFlows(fundProposalState.rows||[],fundProposalCapital());}
    function plot(data){
        const colors=new Map(data.categories.map((c,i)=>[c.key,FinancialVisuals.seriesColor(i)]));
        const nodes=[],index=new Map();
        for(const side of ['source','target'])for(const category of data.categories){
            const amount=data.links.filter(l=>l[side]===category.key).reduce((s,l)=>s+l.amount,0);
            if(!amount)continue;
            index.set(`${side}:${category.key}`,nodes.length);nodes.push({...category,side,amount});
        }
        const wrap=text=>escapeHtml(text).replace(/(.{1,28})(\s|$)/g,'$1<br>').replace(/<br>$/,'');
        return {data:[{type:'sankey',arrangement:'snap',orientation:'h',valueformat:'.2f',valuesuffix:' €',
            node:{pad:28,thickness:20,line:{color:'#ffffff',width:1},label:nodes.map(n=>`${wrap(n.label)}<br>${formatEur(n.amount)}`),color:nodes.map(n=>colors.get(n.key)),customdata:nodes.map(n=>`${n.side==='source'?'Origen':'Propuesta'} · ${escapeHtml(n.label)} · ${(n.amount/data.capital*100).toFixed(2)}%`),hovertemplate:'%{customdata}<br>%{value:,.2f} €<extra></extra>'},
            link:{source:data.links.map(l=>index.get(`source:${l.source}`)),target:data.links.map(l=>index.get(`target:${l.target}`)),value:data.links.map(l=>l.amount),color:data.links.map(l=>FinancialVisuals.alpha(colors.get(l.source),.3)),customdata:data.links.map(l=>`${l.weight.toFixed(2)}% de la cartera<br>${l.funds.slice(0,20).map(f=>`${escapeHtml(f.name)} → ${escapeHtml(f.proposed)}: ${formatEur(f.amount)}`).join('<br>')}${l.funds.length>20?`<br>Otros ${l.funds.length-20} fondos`:''}`),hovertemplate:'%{source.label} → %{target.label}<br>%{value:,.2f} €<br>%{customdata}<extra></extra>'}}],
            layout:{font:{size:14},margin:{t:65,b:30,l:25,r:25},annotations:[{text:'Origen',x:0,y:1,yshift:30,xref:'paper',yref:'paper',showarrow:false,xanchor:'left'},{text:'Propuesta',x:1,y:1,yshift:30,xref:'paper',yref:'paper',showarrow:false,xanchor:'right'}]}};
    }
    async function render(){
        const el=document.getElementById('fundProposalCategoryFlows');if(!el||!window.Plotly)return;
        try{const data=model(),chart=plot(data);el.style.height=`${Math.max(520,data.categories.length*80)}px`;await FinancialVisuals.newPlot(el,chart.data,chart.layout,{responsive:true,displayModeBar:false});document.getElementById('categoryFlowsStatus').textContent=`AUM representado: ${formatEur(data.capital)} · ${data.links.length} flujos`;}
        catch(error){Plotly.purge(el);el.replaceChildren();document.getElementById('categoryFlowsStatus').textContent=error.message;}
    }
    async function image(){
        const data=model(),chart=plot(data),el=document.createElement('div'),height=Math.max(1050,data.categories.length*85);el.style.cssText=`position:fixed;left:-12000px;width:1100px;height:${height}px`;document.body.append(el);
        try{await FinancialVisuals.newPlot(el,chart.data,{...chart.layout,font:{size:20}},{staticPlot:true});return await Plotly.toImage(el,{format:'png',width:1100,height,scale:2});}finally{Plotly.purge(el);el.remove();}
    }
    return {render,image,model,plot};
})();
