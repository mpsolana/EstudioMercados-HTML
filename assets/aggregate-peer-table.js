const AggregatePeerTable=(()=>{
    const note='Selección efectiva y TER manual, si existe. Media simple de otros ISIN de la misma categoría con TER y score disponibles; se excluye el propio ISIN. Peers indica válidos/total. Menos de 3 peers: muestra reducida. No es una recomendación ni una ratio score/TER; el score no se compara entre categorías.';
    let universeRef,peerIndex;
    function rows(){
        const universe=fundUniverseState?.records||[];if(universe!==universeRef){universeRef=universe;peerIndex=PeerValue.index(universe);}
        const source=aggregateScoringResults.length?aggregateScoringResults:aggregatePositionsState.aggregated.map(position=>({position}));
        return source.filter(r=>r.included!==false).map(r=>{const record=aggregateEffectiveRecord(r)||{isin:r.position.isin,name:r.position.name};return {record,original:r.position.isin,manual:Number.isFinite(r.manualTer),...PeerValue.compare(record,peerIndex)};});
    }
    const number=v=>Number.isFinite(v)?v.toFixed(2):'-';
    const delta=v=>Number.isFinite(v)?(v>0?'+':'')+v.toFixed(2):'-';
    function table(){return `<table class="wide-report-table"><colgroup>${[11,20,13,6,6,6,6,6,6,6,14].map(n=>`<col style="width:${n}%">`).join('')}</colgroup><thead><tr>${['ISIN','Fondo','Categoría','TER %','Media TER %','Δ TER pp','Calidad','Calidad media peers','Δ score técnico','Peers','Coste y calidad relativa'].map(label=>`<th>${label}</th>`).join('')}</tr></thead><tbody>${rows().map(r=>`<tr><td>${escapeHtml(r.record.isin||r.original)}${r.record.isin!==r.original?`<br><small>Origen: ${escapeHtml(r.original)}</small>`:''}</td><td>${escapeHtml(r.record.name||'-')}${r.manual?'<br><small>TER manual</small>':''}</td><td>${escapeHtml(r.record.category||'-')}</td><td>${number(r.record.ter)}</td><td>${number(r.meanTer)}</td><td>${delta(r.deltaTer)}</td><td>${QualityCore.label(r.record.score)}</td><td>${QualityCore.label(r.meanScore)}</td><td>${delta(r.deltaScore)}</td><td>${r.count}/${r.total}</td><td>${r.assessment}</td></tr>`).join('')||'<tr><td colspan="11">Carga y analiza las posiciones agregadas.</td></tr>'}</tbody></table>`;}
    function init(){const section=document.createElement('section');section.id='aggregatePeerValue';section.className='proposal-chart-section';document.getElementById('aggregatePositionsTableBody').closest('.mb-5').after(section);render();}
    function render(){const section=document.getElementById('aggregatePeerValue');if(section)section.innerHTML=`<h3>TER y score frente a peers · Value for money</h3><p>${note}</p><div class="proposal-chart-scroll">${table()}</div>`;}
    function report(){return `<section class="block"><h2>TER y score frente a peers</h2><p>${note}</p>${table()}</section>`;}
    return {init,render,report,rows};
})();
