const FinancialEducation=(()=>{
    const C=FinancialEducationCore;
    let root;
    const eur=value=>new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(value);
    const pct=value=>`${value.toFixed(2)}%`;
    const field=(id,label,value,min,max,step='1')=>`<label>${label}<input id="${id}" type="number" value="${value}" min="${min}" max="${max}" step="${step}"></label>`;
    const get=id=>Number(root.querySelector('#'+id).value);
    const graph=(id,traces,layout)=>FinancialVisuals.newPlot(root.querySelector('#'+id),traces,{height:350,margin:{t:25,r:30,b:55,l:65},paper_bgcolor:'#fff',plot_bgcolor:'#fff',font:{color:'#334155',size:12},...layout},{responsive:true,displayModeBar:false});
    const line=(name,x,y,color)=>({type:'scatter',mode:'lines',name,x,y,line:{color,width:2.5},hovertemplate:'%{x}: %{y:,.2f}<extra>'+name+'</extra>'});
    function updateGrowth(){
        const initial=get('eduCapital'),rate=get('eduReturn')/100,years=get('eduYears'),monthly=get('eduMonthly');
        if(initial<0||monthly<0||years<1||years>60||rate<=-1){root.querySelector('#eduGrowthNote').textContent='Revisa los parámetros.';return;}
        let balance=initial,total=initial;const points=[balance],principal=[total];
        const monthlyRate=Math.pow(1+rate,1/12)-1;
        for(let year=1;year<=years;year++){for(let month=0;month<12;month++){balance=balance*(1+monthlyRate)+monthly;total+=monthly;}points.push(balance);principal.push(total);}
        const x=Array.from({length:years+1},(_,i)=>i);
        graph('eduGrowthChart',[line('Capital acumulado',x,points,'#075aa3'),line('Aportaciones',x,principal,'#8fa2b2')],{xaxis:{title:'Años'},yaxis:{title:'EUR',tickformat:',.0f'},legend:{orientation:'h',y:-.25}});
        root.querySelector('#eduGrowthNote').textContent=`Capital final ${eur(balance)} · aportado ${eur(total)} · crecimiento ${eur(balance-total)}. Aportación al final de cada mes; rentabilidad anual constante, capitalización mensual; antes de impuestos e inflación.`;
    }
    function updateDiversification(){
        try{
            const rows=C.diversification({count:get('eduCount'),volatility:get('eduVolatility'),correlation:get('eduCorrelation')});
            const threshold=get('eduThreshold'),floor=get('eduVolatility')*Math.sqrt(get('eduCorrelation'));
            const elbow=rows.find((row,index)=>index>0&&rows[index-1].risk-row.risk<=threshold);
            graph('eduDiversificationChart',[line('Riesgo de la cartera',rows.map(r=>r.count),rows.map(r=>r.risk),'#075aa3'),{type:'scatter',mode:'lines',name:'Riesgo común no diversificable',x:[1,rows.length],y:[floor,floor],line:{color:'#899aa8',dash:'dash'},hovertemplate:'Riesgo común: %{y:.2f}%<extra></extra>'}],{xaxis:{title:'Número de activos iguales',dtick:Math.max(1,Math.floor(rows.length/10))},yaxis:{title:'Volatilidad anual (%)'},legend:{orientation:'h',y:-.24}});
            const last=rows.at(-1),previous=rows.at(-2),gain=previous?previous.risk-last.risk:0;
            root.querySelector('#eduDiversificationNote').textContent=`Con ${last.count} activos: ${pct(last.risk)} de volatilidad teórica. Añadir el último reduce ${pct(gain)} puntos. ${elbow?`Desde ${elbow.count} activos la mejora marginal baja de ${pct(threshold)} pp según este supuesto.`:'No se alcanza el umbral marginal dentro del rango mostrado.'} No existe un número universal óptimo: depende de covarianzas, pesos, solapamiento, costes y objetivo del cliente. Modelo de activos homogéneos, igual ponderación y correlación común no negativa.`;
        }catch(error){root.querySelector('#eduDiversificationNote').textContent=error.message;}
    }
    function updateDuration(){
        const price=get('eduBondPrice'),duration=get('eduDuration'),move=get('eduRateMove');
        if(price<=0||duration<0||duration>30){root.querySelector('#eduDurationNote').textContent='Revisa precio y duración.';return;}
        const shifts=[-3,-2,-1,0,1,2,3],values=shifts.map(shift=>price*(1-duration*shift/100));
        graph('eduDurationChart',[{type:'bar',x:shifts.map(x=>`${x>0?'+':''}${x} pp`),y:values,marker:{color:shifts.map(x=>x<0?'#07866f':x>0?'#ae4d53':'#075aa3')}}],{xaxis:{title:'Cambio de TIR'},yaxis:{title:'Precio estimado'}});
        root.querySelector('#eduDurationNote').textContent=`Para ${move>0?'+':''}${pct(move)} pp, cambio aproximado ${pct(-duration*move)} y precio ${eur(price*(1-duration*move/100))}. ΔP/P ≈ −Dmod·Δy, con Δy en decimales. Aproximación lineal: ignora convexidad, spread, cupones y cambios de flujos; no sustituye el cálculo exacto de un bono.`;
    }
    function updateIrr(){
        const investment=get('eduIrrInvestment'),annual=get('eduIrrAnnual'),end=get('eduIrrEnd'),years=get('eduIrrYears');
        const flows=[-investment,...Array.from({length:years},(_,i)=>annual+(i===years-1?end:0))];
        const value=C.irr(flows);
        root.querySelector('#eduIrrNote').textContent=value===null?'No hay una TIR única calculable con estos flujos.':`TIR anual de los flujos: ${pct(value*100)}. Incluye el desembolso inicial, cobros anuales al cierre y valor residual al final. La TIR no describe el riesgo, ni garantiza reinversión a esa tasa; con varios cambios de signo puede haber múltiples soluciones.`;
        graph('eduIrrChart',[{type:'bar',x:flows.map((_,i)=>`Año ${i}`),y:flows,marker:{color:flows.map(x=>x<0?'#ae4d53':'#075aa3')}}],{yaxis:{title:'Flujo de caja (EUR)'}});
    }
    function updateTax(){
        const note=root.querySelector('#eduTaxNote');
        try{
            const input={capital:get('taxCapital'),basis:get('taxBasis'),years:get('taxYears'),annualReturn:get('taxReturn')/100,fundFee:get('taxFundFee')/100,taxableFee:get('taxOtherFee')/100,dividendYield:get('taxDividend')/100,realizedFraction:get('taxRealized')/100,taxRate:get('taxRate')/100,transition:root.querySelector('#taxTransition').checked};
            const {fund,taxable}=C.comparison(input),difference=fund.netFinal-taxable.netFinal;
            graph('eduTaxChart',[line('Fondo traspasable',fund.rows.map(r=>r.year),fund.rows.map(r=>r.value),'#075aa3'),line('Vehículo con ventas gravadas',taxable.rows.map(r=>r.year),taxable.rows.map(r=>r.value),'#7d909f')],{xaxis:{title:'Años'},yaxis:{title:'Valor antes de liquidación (EUR)'},legend:{orientation:'h',y:-.25}});
            root.querySelector('#eduTaxResults').innerHTML=`<table><thead><tr><th>Escenario</th><th>Valor previo a salida</th><th>Impuesto anual acumulado</th><th>Impuesto inicial</th><th>Impuesto salida</th><th>Neto final</th></tr></thead><tbody><tr><th>Fondo traspasable</th><td>${eur(fund.grossFinal)}</td><td>${eur(fund.annualTax)}</td><td>${eur(fund.initialTax)}</td><td>${eur(fund.exitTax)}</td><td>${eur(fund.netFinal)}</td></tr><tr><th>ETF / acciones</th><td>${eur(taxable.grossFinal)}</td><td>${eur(taxable.annualTax)}</td><td>—</td><td>${eur(taxable.exitTax)}</td><td>${eur(taxable.netFinal)}</td></tr></tbody></table>`;
            note.textContent=`Diferencia neta estimada a favor del fondo: ${eur(difference)}. Es la diferencia total bajo los costes, dividendos y ventas introducidos; no atribuye todo el resultado al diferimiento. En ETF de acumulación sin ventas intermedias ni distribuciones, no se imputa impuesto anual por revalorización. El cambio inicial desde acciones/ETF realiza la plusvalía positiva indicada por la base fiscal.`;
        }catch(error){note.textContent=error.message;root.querySelector('#eduTaxResults').replaceChildren();}
    }
    function init(element){
        root=element;
        root.innerHTML=`<div class="edu-heading"><h2>Educación financiera</h2><p>Modelos interactivos para explorar decisiones de gestión patrimonial</p></div><nav class="edu-tabs" aria-label="Temas de educación financiera"><button data-edu-tab="growth" class="active">Interés compuesto</button><button data-edu-tab="diversification">Diversificación</button><button data-edu-tab="duration">Duración</button><button data-edu-tab="irr">TIR</button><button data-edu-tab="tax">Optimización fiscal</button></nav>
        <section class="edu-pane active" data-edu-pane="growth"><h3>Interés compuesto y aportaciones</h3><div class="edu-controls">${field('eduCapital','Capital inicial (EUR)',100000,0,1000000000)}${field('eduMonthly','Aportación mensual (EUR)',500,0,10000000)}${field('eduReturn','Rentabilidad anual (%)',5,-99,100,'.1')}${field('eduYears','Horizonte (años)',20,1,60)}</div><div id="eduGrowthChart" class="edu-chart"></div><p id="eduGrowthNote" class="edu-note"></p></section>
        <section class="edu-pane" data-edu-pane="diversification"><h3>Diversificación y solapamiento</h3><div class="edu-controls">${field('eduCount','Número de activos',30,1,100)}${field('eduVolatility','Volatilidad individual (%)',20,0,100,'.1')}${field('eduCorrelation','Correlación común (0–1)',.35,0,1,'.05')}${field('eduThreshold','Mejora marginal mínima (pp)',.1,0,10,'.01')}</div><div id="eduDiversificationChart" class="edu-chart"></div><p id="eduDiversificationNote" class="edu-note"></p><p class="edu-caption">La parte idiosincrásica cae al añadir activos independientes; la parte común de mercado persiste. Más fondos con posiciones solapadas pueden aportar poca diversificación adicional. Para carteras reales utiliza la matriz de correlaciones y la frontera eficiente del Maestro.</p></section>
        <section class="edu-pane" data-edu-pane="duration"><h3>Sensibilidad de renta fija</h3><div class="edu-controls">${field('eduBondPrice','Valor de la posición (EUR)',100000,1,1000000000)}${field('eduDuration','Duración modificada (años)',5,0,30,'.1')}${field('eduRateMove','Movimiento de tipos (pp)',1,-10,10,'.25')}</div><div id="eduDurationChart" class="edu-chart"></div><p id="eduDurationNote" class="edu-note"></p></section>
        <section class="edu-pane" data-edu-pane="irr"><h3>Tasa interna de retorno</h3><div class="edu-controls">${field('eduIrrInvestment','Desembolso inicial (EUR)',100000,1,1000000000)}${field('eduIrrAnnual','Cobro anual (EUR)',5000,0,1000000000)}${field('eduIrrEnd','Valor residual (EUR)',100000,0,1000000000)}${field('eduIrrYears','Años',10,1,60)}</div><div id="eduIrrChart" class="edu-chart"></div><p id="eduIrrNote" class="edu-note"></p></section>
        <section class="edu-pane" data-edu-pane="tax"><h3>Fondos traspasables frente a ETF y acciones</h3><p class="edu-caption">Modelo de IRPF español para valorar el diferimiento por traspaso de fondos elegibles y el posible coste de un cambio inmediato desde acciones/ETF. Los tipos y costes son supuestos editables, no una liquidación tributaria.</p><div class="edu-controls"><label>Situación<select id="taxClientMode"><option value="existing">Cartera existente</option><option value="prospect">Prospecto sin plusvalía previa</option></select></label>${field('taxCapital','Valor actual / inversión (EUR)',100000,1,1000000000)}${field('taxBasis','Coste fiscal actual (EUR)',80000,0,1000000000)}${field('taxYears','Horizonte (años)',15,1,60)}${field('taxReturn','Rentabilidad anual bruta (%)',6,-99,100,'.1')}${field('taxRate','Tipo efectivo sobre ganancias (%)',25,0,100,'.1')}${field('taxFundFee','Coste anual fondo (%)',.8,0,99,'.05')}${field('taxOtherFee','Coste anual ETF / acciones (%)',.2,0,99,'.05')}${field('taxRealized','Posición vendida cada año (%)',20,0,100,'1')}${field('taxDividend','Distribución anual (% del valor)',0,0,100,'.1')}<label class="edu-check"><input id="taxTransition" type="checkbox"> Traspasar ahora desde acciones/ETF al fondo (venta gravada)</label></div><div id="eduTaxChart" class="edu-chart"></div><div id="eduTaxResults" class="edu-table"></div><p id="eduTaxNote" class="edu-note"></p><p class="edu-caption">El diferimiento del art. 94 LIRPF exige cumplir sus requisitos: traspaso entre IIC elegibles sin puesta a disposición del importe. Los ETF cotizados quedan excluidos con carácter general; hay regímenes transitorios que requieren revisión. En este modelo se gravan solo ganancias positivas realizadas y distribuciones positivas; no se modelan compensación de pérdidas, FIFO por lotes, escalas, retenciones, divisas, patrimonio ni situación personal. Rentabilidad constante y reinversión de distribuciones netas. La venta inicial paga sobre valor menos coste fiscal, si existe plusvalía. La optimización de reembolsos por plusvalías fiscales importadas queda pendiente.</p><p class="edu-sources"><a href="https://www.boe.es/buscar/act.php?id=BOE-A-2006-20764" target="_blank" rel="noopener noreferrer">LIRPF, art. 94 · BOE</a><a href="https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/manuales-practicos/irpf-2025/c11-ganancias-perdidas-patrimoniales/determinacion-importe-ganancias-perdidas-patrimon-especificas/transmisiones-reembolsos-acciones-iic/regimen-especial-diferimiento-tributacion.html" target="_blank" rel="noopener noreferrer">Guía AEAT de diferimiento y ETF</a></p></section>`;
        const update={growth:updateGrowth,diversification:updateDiversification,duration:updateDuration,irr:updateIrr,tax:updateTax};
        const resize=()=>requestAnimationFrame(()=>{const chart=root.querySelector('.edu-pane.active .edu-chart');if(chart?._fullLayout&&window.Plotly)Plotly.Plots.resize(chart);});
        root.querySelectorAll('[data-edu-tab]').forEach(button=>button.addEventListener('click',()=>{const tab=button.dataset.eduTab;root.querySelectorAll('[data-edu-tab]').forEach(item=>item.classList.toggle('active',item===button));root.querySelectorAll('[data-edu-pane]').forEach(item=>item.classList.toggle('active',item.dataset.eduPane===tab));requestAnimationFrame(()=>{update[tab]();resize();});}));
        let existingBasis=root.querySelector('#taxBasis').value;
        root.querySelector('#taxClientMode').addEventListener('change',event=>{const prospect=event.target.value==='prospect',basis=root.querySelector('#taxBasis'),transition=root.querySelector('#taxTransition');if(prospect){existingBasis=basis.value;basis.value=root.querySelector('#taxCapital').value;transition.checked=false;}else basis.value=existingBasis;basis.disabled=prospect;transition.disabled=prospect;updateTax();});
        root.addEventListener('input',event=>{if(event.target.id==='taxCapital'&&root.querySelector('#taxClientMode').value==='prospect')root.querySelector('#taxBasis').value=event.target.value;const pane=event.target.closest('[data-edu-pane]');if(pane)update[pane.dataset.eduPane]();});
        window.addEventListener('resize',resize);
        document.getElementById('section-btn-ayuda')?.addEventListener('click',resize);
        updateGrowth();
    }
    return {init};
})();
document.addEventListener('DOMContentLoaded',()=>{const host=document.getElementById('financialEducation');if(host)FinancialEducation.init(host);});
