const ProposalCharts=(()=>{
    const titles={waterfall:'Cascada de ahorro anual',pairs:'Origen y propuesta: TER y score',concentration:'Concentración por gestora y categoría',opportunities:'Mapa de oportunidades · Uso interno'};
    const blue=FinancialVisuals.colors.blue,gray=FinancialVisuals.colors.gray;
    const text=value=>escapeHtml(String(value||''));
    const label=value=>text(String(value||'').length>56?String(value).slice(0,53)+'…':value).replace(/(.{1,28})(\s|$)/g,'$1<br>').replace(/<br>$/,'');
    function aggregateRows(){return (aggregateScoringResults.length?aggregateScoringResults:aggregatePositionsState.aggregated.map(position=>({position}))).filter(r=>r.included!==false);}
    function model(kind,scope){
        const rows=fundProposalState.rows||[];
        if(kind==='waterfall')return ProposalChartCore.savings(rows,fundProposalCapital());
        if(kind==='pairs')return ProposalChartCore.pairs(rows);
        if(kind==='concentration'){
            let source=rows,note='Pesos de cartera; no mide el solapamiento de activos subyacentes.';
            if(scope==='aggregate'){
                const active=aggregateRows();
                if(!active.length||active.some(r=>!Number.isFinite(r.position.amount)||r.position.amount<0||r.position.amountCount!==r.position.rows))throw new Error('Se necesitan contravalores completos para mostrar la concentración del patrimonio.');
                source=active.map(r=>({weight:r.position.amount,current:aggregateStaticRecord(r),proposed:aggregateEffectiveRecord(r)}));note='Sobre patrimonio incluido, con los mismos importes antes y después; no mide el solapamiento subyacente.';
            }else ProposalChartCore.weights(source);
            return {manager:ProposalChartCore.concentration(source,'manager'),category:ProposalChartCore.concentration(source,'category'),note};
        }
        if(!aggregatePositionsState.hasAmounts)throw new Error('Carga posiciones con contravalor para calcular oportunidades en euros.');
        return ProposalChartCore.opportunities(aggregateRows().map(r=>{const current=aggregateStaticRecord(r);return {position:r.position,current,alternative:shareClassAssessment(current).all[0]};}));
    }
    function build(kind,data,report=false){
        const font=report?19:13,base={font:{size:font},margin:{t:75,l:100,r:50,b:100},legend:{orientation:'h',y:1.13},xaxis:{automargin:true},yaxis:{automargin:true}},traces=[];
        let note='',height=report?1000:530;
        if(kind==='waterfall'){
            if(!data.items.length)throw new Error('No hay posiciones con TER de origen y propuesta disponibles.');
            const sorted=data.items.slice().sort((a,b)=>Math.abs(b.value)-Math.abs(a.value)),items=sorted.slice(0,10);
            if(sorted.length>10)items.push({name:`Resto (${sorted.length-10} posiciones)`,value:sorted.slice(10).reduce((s,r)=>s+r.value,0)});
            const partial=data.missing>0;
            traces.push({type:'waterfall',x:items.map((r,i)=>`${i+1}. ${label(r.name)}`).concat(partial?'Subtotal conocido':'Ahorro neto'),y:items.map(r=>r.value).concat(0),measure:items.map(()=>'relative').concat('total'),text:items.map(r=>formatEur(r.value)).concat(formatEur(data.total)),textposition:'outside',increasing:{marker:{color:FinancialVisuals.colors.positive}},decreasing:{marker:{color:FinancialVisuals.colors.negative}},totals:{marker:{color:blue}},connector:{line:{color:'#c5ced6'}},customdata:items.map(r=>text(r.proposed||'Varias sustituciones')).concat(''),hovertemplate:'%{x}<br>%{customdata}<br>%{text}<extra></extra>'});
            base.yaxis.title='Ahorro anual acumulado (€)';base.margin.b=170;
            note=`Cobertura TER: ${data.coverage.toFixed(1)}%. ${partial?`${data.missing} posiciones sin ambos TER: se muestra un subtotal, no el ahorro total.`:'Estimación con AUM constante, sin impuestos ni costes de transacción.'}`;
        }else if(kind==='pairs'){
            if(!data.length)throw new Error('Introduce posiciones para comparar.');
            height=Math.max(report?850:480,data.length*70+220);
            base.margin.l=report?280:240;base.xaxis={domain:[0,.43],title:'TER (%)',automargin:true};base.xaxis2={domain:[.6,1],title:'Score',anchor:'y2',automargin:true};
            base.yaxis={tickvals:data.map((_,i)=>i),ticktext:data.map((r,i)=>`${i+1}. ${label(r.name)}`),range:[data.length-.3,-.7],automargin:true};base.yaxis2={range:[data.length-.3,-.7],anchor:'x2',showticklabels:false};
            for(const [metric,axis] of [['ter',''],['score','2']]){
                data.forEach((r,i)=>{if(r[metric].every(v=>v!==null))traces.push({type:'scatter',x:r[metric],y:[i,i],xaxis:'x'+axis,yaxis:'y'+axis,mode:'lines',line:{color:'#c5ced6',width:3},meta:{financialRole:'connector'},showlegend:false,hoverinfo:'skip'});});
                for(const [index,name,color] of [[0,'Origen',blue],[1,'Propuesta',gray]])traces.push({type:'scatter',xaxis:'x'+axis,yaxis:'y'+axis,x:data.map(r=>r[metric][index]),y:data.map((_,i)=>i),name,legendgroup:name,showlegend:metric==='ter',mode:'markers',marker:{color,size:13,symbol:index?'diamond':'circle'},meta:{financialRole:index?'proposal':'origin'},customdata:data.map(r=>`${text(r.name)} → ${text(r.proposed)}`),hovertemplate:'%{customdata}<br>%{x:.2f}<extra>%{fullData.name}</extra>'});
            }
            note='Score solo para categorías comparables. Un punto ausente indica datos no disponibles o no comparables, nunca cero.';
            for(const trace of traces.filter(t=>t.name)){trace.mode='markers+text';trace.text=trace.x.map(v=>v===null?'':v.toFixed(2)+(trace.xaxis==='x'?'%':''));trace.textposition=trace.name==='Origen'?'top center':'bottom center';trace.textfont={size:report?16:12};trace.cliponaxis=false;}
        }else if(kind==='concentration'){
            height=Math.max(report?950:500,Math.max(data.manager.length,data.category.length)*55+210);
            base.margin.l=report?270:230;base.xaxis={domain:[0,.4],range:[0,110],title:'Peso por gestora (%)'};base.xaxis2={domain:[.65,1],range:[0,110],title:'Peso por categoría (%)',anchor:'y2'};
            base.yaxis={autorange:'reversed',automargin:true};base.yaxis2={autorange:'reversed',anchor:'x2',automargin:true};base.barmode='group';
            for(const [field,axis] of [['manager',''],['category','2']])for(const [side,name] of [['current','Origen'],['proposed','Propuesta']])traces.push({type:'bar',orientation:'h',xaxis:'x'+axis,yaxis:'y'+axis,x:data[field].map(r=>r[side]),y:data[field].map(r=>label(r.label)),name,legendgroup:name,offsetgroup:name,showlegend:field==='manager',meta:{financialRole:side==='current'?'origin':'proposal'},text:data[field].map(r=>`${r[side].toFixed(1)}%`),textposition:'outside',cliponaxis:false,hovertemplate:'%{y}: %{x:.2f}%<extra>%{fullData.name}</extra>'});
            note=data.note;
        }else{
            if(!data.points.length)throw new Error(`No hay oportunidades de menor TER con contravalor completo.${data.omitted?` ${data.omitted} posiciones sin importe completo.`:''}`);
            const maxSize=data.points.reduce((s,p)=>Math.max(s,p.clients||0),1);
            traces.push({type:'scatter',mode:'markers',name:'Oportunidades',x:data.points.map(p=>p.amount),y:data.points.map(p=>p.saving),marker:{color:blue,opacity:.7,size:data.sizedByClients?data.points.map(p=>p.clients):data.points.map(()=>20),...(data.sizedByClients?{sizemode:'area',sizeref:2*maxSize/70**2,sizemin:8}:{})},customdata:data.points.map(p=>`${text(p.name)} (${text(p.isin)})<br>Clase candidata: ${text(p.alternative)}<br>${p.clients===null?'Identificadores no completos':p.clients+' identificadores cliente/cuenta'}`),hovertemplate:'%{customdata}<br>Patrimonio: %{x:,.2f} €<br>Ahorro: %{y:,.2f} €/año<extra></extra>'});
            base.xaxis.title='Importe agregado (€)';base.yaxis.title='Ahorro anual potencial (€)';base.xaxis.rangemode='tozero';base.yaxis.rangemode='tozero';base.showlegend=false;
            if(report){traces[0].mode='markers+text';traces[0].text=data.points.map((_,i)=>String(i+1));traces[0].textposition='top center';traces[0].cliponaxis=false;}
            note=`Uso interno. ${data.sizedByClients?'Área proporcional a identificadores de cliente/cuenta por fondo (no sumables entre fondos).':'Tamaño uniforme: recuentos de cliente/cuenta incompletos.'} ${data.omitted} posiciones omitidas por importe incompleto. Verificar equivalencia y acceso a la clase; las oportunidades no son órdenes de sustitución.`;
        }
        return {data:traces,layout:base,height,note};
    }
    function mount(scope,kind,before){
        if(document.getElementById(`proposal-${scope}-${kind}`))return;
        const section=document.createElement('section');section.className='proposal-chart-section';section.innerHTML=`<h3>${titles[kind]}</h3><p id="proposal-${scope}-${kind}-status" role="status"></p><div class="proposal-chart-scroll"><div class="proposal-chart" id="proposal-${scope}-${kind}"></div></div>`;
        before.before(section);
    }
    function init(){
        const flows=document.querySelector('.category-flows-section');
        mount('initial','waterfall',flows);mount('initial','pairs',flows);mount('initial','concentration',flows.nextElementSibling||flows);
        const table=document.getElementById('aggregatePositionsTableBody').closest('.mb-5');
        mount('aggregate','concentration',table);mount('aggregate','opportunities',table);
    }
    function render(scope){
        for(const kind of scope==='initial'?['waterfall','pairs','concentration']:['concentration','opportunities']){
            const el=document.getElementById(`proposal-${scope}-${kind}`);if(!el||!el.getClientRects().length)continue;
            try{const chart=build(kind,model(kind,scope));el.style.height=`${chart.height}px`;document.getElementById(el.id+'-status').textContent=chart.note;FinancialVisuals.newPlot(el,chart.data,chart.layout,{responsive:true,displayModeBar:false});}
            catch(error){if(window.Plotly)Plotly.purge(el);el.replaceChildren();el.style.height='0px';document.getElementById(el.id+'-status').textContent=error.message;}
        }
    }
    async function report(kind,scope='initial'){
        let value;try{value=model(kind,scope);}catch(error){return `<section class="block"><h2>${titles[kind]}</h2><p>${text(error.message)}</p></section>`;}
        const chunks=kind==='pairs'?Array.from({length:Math.ceil(value.length/12)},(_,i)=>value.slice(i*12,i*12+12)):kind==='concentration'?Array.from({length:Math.ceil(Math.max(value.manager.length,value.category.length)/10)},(_,i)=>({...value,manager:value.manager.slice(i*10,i*10+10),category:value.category.slice(i*10,i*10+10)})):[value],sections=[];
        for(const [i,chunk] of chunks.entries()){
            let chart;try{chart=build(kind,chunk,true);}catch(error){sections.push(`<section class="block"><h2>${titles[kind]}</h2><p>${text(error.message)}</p></section>`);continue;}
            if(scope==='aggregate')chart.height=720;
            const el=document.createElement('div'),width=scope==='aggregate'?1500:1200;el.style.cssText=`position:fixed;left:-12000px;width:${width}px;height:${chart.height}px`;document.body.append(el);
            try{await FinancialVisuals.newPlot(el,chart.data,chart.layout,{staticPlot:true});const img=await Plotly.toImage(el,{format:'png',width,height:chart.height,scale:2});sections.push(`<section class="block report-chart-page"><h2>${titles[kind]}${chunks.length>1?` (${i+1}/${chunks.length})`:''}</h2><p>${text(chart.note)}</p><figure><img src="${img}" alt="${titles[kind]}"></figure></section>`);}finally{Plotly.purge(el);el.remove();}
        }
        if(kind==='opportunities'&&value.points.length)sections.push(`<section class="block report-chart-page"><h2>Detalle de oportunidades · Uso interno</h2><table><thead><tr><th>N.º</th><th>ISIN</th><th>Fondo / clase candidata</th><th>Importe</th><th>Ahorro anual</th></tr></thead><tbody>${value.points.map((p,i)=>`<tr><td>${i+1}</td><td>${text(p.isin)}</td><td>${text(p.name)}<br>${text(p.alternative)}</td><td>${formatEur(p.amount)}</td><td>${formatEur(p.saving)}</td></tr>`).join('')}</tbody></table></section>`);
        return sections.join('')||`<section class="block"><h2>${titles[kind]}</h2><p>Sin posiciones para comparar.</p></section>`;
    }
    const timers={};
    function schedule(scope){clearTimeout(timers[scope]);timers[scope]=setTimeout(()=>render(scope),60);}
    return {init,render,schedule,report,model,build};
})();
