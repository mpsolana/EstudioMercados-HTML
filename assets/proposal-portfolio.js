const ProposalPortfolio=(()=>{
    let independent=false,targets=[];
    const note='Asignación ilustrativa: primero fondos comunes, después misma categoría y finalmente el resto. No representa órdenes de traspaso. Se conserva el AUM total.';
    function originRows(){return fundProposalState.rows.map(r=>({record:r.current||fundUniverseState?.isinIndex.get(r.isin)||{isin:r.isin,name:r.isin,unidentified:true},weight:r.weight}));}
    function rows(){return independent?ProposalAllocation.allocate(originRows(),targets):fundProposalState.rows;}
    function weighted(metric,side){
        const positions=side==='current'?originRows():targetRows(),total=positions.reduce((s,r)=>s+r.weight,0);
        const result=FinanceCore.weighted(positions.map(r=>({weight:r.weight,record:r.record})),metric,'record');
        return {...result,value:positions.length&&positions.every(r=>Number.isFinite(r.weight)&&r.weight>=0)&&Math.abs(total-100)<=.01?result.value:NaN};
    }
    function syncOrigin(){
        const text=document.getElementById('fundProposalPortfolioInput').value.trim();
        if(text)fundProposalState.rows=InitialAnalysis.reconcile(parseFundProposalInput(text));
        for(const row of fundProposalState.rows)if(!row.current){const record=fundUniverseState?.isinIndex.get(row.isin);if(record){row.current=record;row.missing=false;row.cheaperClasses=findCheaperShareClasses(record);}}
    }
    function safeRows(){try{return rows();}catch{return [];}}
    function targetRows(){return independent?targets:fundProposalState.rows.map(r=>({record:r.proposed,weight:r.weight}));}
    function changed(){invalidatePortfolioReports();renderFundProposalPortfolio();portfolioWorkflowRefresh();}
    function mode(value){independent=value==='independent';changed();}
    function importText(){
        try{
            const input=document.getElementById('proposalTargetInput').value.trim(),byIsin=new Map();
            if(!input)throw new Error('Introduce ISIN y peso porcentual, separados por punto y coma.');
            for(const line of input.split(/\r?\n/).filter(s=>s.trim())){
                const fields=line.trim().split(/[;\t]/);if(fields.length!==2)throw new Error('Formato: ISIN;peso %. Una posición por línea.');
                const isin=normalizeIsin(fields[0]),raw=fields[1].trim().replace(/%$/,'').replace(',','.'),unit=document.getElementById('proposalTargetUnit').value,multiplier=unit==='fraction'&&!fields[1].includes('%')?100:1,weight=raw===''?NaN:Number(raw)*multiplier,record=fundUniverseState?.isinIndex.get(isin);
                if(!record)throw new Error(`ISIN no encontrado en el universo: ${isin}`);
                if(!Number.isFinite(weight)||weight<0||weight>100)throw new Error(`Peso no válido: ${isin}`);
                const previous=byIsin.get(isin);byIsin.set(isin,{record,weight:(previous?.weight||0)+weight});
            }
            targets=[...byIsin.values()];
            try{syncOrigin();}catch(error){changed();document.getElementById('proposalTargetStatus').textContent='Propuesta cargada. Origen: '+error.message;return;}
            changed();
        }catch(error){document.getElementById('proposalTargetStatus').textContent=error.message;}
    }
    function copy(){const grouped=new Map();for(const r of fundProposalState.rows){if(!r.proposed)continue;const previous=grouped.get(r.proposed.isin);grouped.set(r.proposed.isin,{record:{...r.proposed},weight:(previous?.weight||0)+r.weight});}targets=[...grouped.values()];changed();}
    function add(isin){const record=fundUniverseState?.isinIndex.get(isin);if(!record)return;if(targets.some(r=>r.record.isin===isin)){document.getElementById('proposalTargetStatus').textContent='El fondo ya está en la propuesta.';return;}targets.push({record:{...record},weight:0});changed();}
    function edit(index,key,input){if(!input.reportValidity())return;const value=input.value===''?NaN:input.valueAsNumber;if(key==='weight'){if(!Number.isFinite(value))return;targets[index].weight=value;}else{const record=targets[index].record;targets[index].record={...record,[key]:value,manualOverrides:{...record.manualOverrides,[key]:Number.isFinite(value)?value:null}};}changed();}
    function remove(index){targets.splice(index,1);changed();}
    function normalize(){const total=targets.reduce((s,r)=>s+r.weight,0);if(total>0){targets.forEach(r=>r.weight=r.weight/total*100);changed();}}
    function render(){
        const panel=document.getElementById('proposalTargetEditor');if(!panel)return;
        panel.hidden=!independent;document.getElementById('proposalMode').value=independent?'independent':'paired';
        const table=document.getElementById('fundProposalTableBody').closest('table');table.classList.toggle('independent-origin',independent);
        document.getElementById('proposalTargetBody').innerHTML=targets.map((r,i)=>`<tr><td>${escapeHtml(r.record.isin)}</td><td>${escapeHtml(r.record.name)}</td><td>${escapeHtml(r.record.category||'-')}</td>${['weight','ter','score'].map(key=>`<td><input aria-label="${key} destino ${i+1}" type="number" step="any" ${key!=='score'?'min="0"':''} ${key==='weight'?'max="100"':key==='ter'?'max="99.99"':''} value="${Number.isFinite(key==='weight'?r.weight:r.record[key])?(key==='weight'?r.weight:r.record[key]):''}" onchange="ProposalPortfolio.edit(${i},'${key}',this)"></td>`).join('')}<td><button title="Eliminar fondo" aria-label="Eliminar fondo" onclick="ProposalPortfolio.remove(${i})"><i class="fa-solid fa-trash"></i></button></td></tr>`).join('');
        document.getElementById('proposalTargetPicker').innerHTML=renderCompactFundCombobox(fundUniverseState?.records||[],isin=>`ProposalPortfolio.add('${isin}')`,'Añadir ISIN o fondo del universo',{id:'proposalIndependentPicker'});
        let message=`${fundProposalState.rows.length} fondos de origen → ${targets.length} fondos propuestos · Peso origen ${fundProposalState.rows.reduce((s,r)=>s+r.weight,0).toFixed(2)}% · Peso destino ${targets.reduce((s,r)=>s+r.weight,0).toFixed(2)}%.`;
        if(independent)message+=` Cobertura TER origen ${(weighted('ter','current').coverage*100).toFixed(1)}%, propuesta ${(weighted('ter','proposed').coverage*100).toFixed(1)}%. Score ponderado orientativo; no comparar categorías distintas.`;
        try{rows();}catch(error){message+=' '+error.message;}
        document.getElementById('proposalTargetStatus').textContent=message;
        if(independent)document.getElementById('fundProposalStatus').textContent=message;
    }
    function init(){
        const section=document.createElement('section');section.className='proposal-target-section';
        section.innerHTML=`<label>Construcción de la propuesta <select id="proposalMode" onchange="ProposalPortfolio.mode(this.value)"><option value="paired">Sustitución por fondo</option><option value="independent">Cartera propuesta independiente</option></select></label><div id="proposalTargetEditor" hidden><h3>Cartera propuesta</h3><label>ISIN y peso (%)<textarea id="proposalTargetInput" rows="4" placeholder="ES0000000001;25%"></textarea></label><div class="workspace-tools"><button onclick="ProposalPortfolio.importText()">Cargar propuesta</button><button onclick="ProposalPortfolio.copy()">Copiar selección actual</button><button onclick="ProposalPortfolio.normalize()">Normalizar pesos</button></div><div id="proposalTargetPicker"></div><p id="proposalTargetStatus" role="status"></p><div class="proposal-chart-scroll"><table><thead><tr><th>ISIN</th><th>Fondo</th><th>Categoría</th><th>Peso %</th><th>TER %</th><th>Score</th><th></th></tr></thead><tbody id="proposalTargetBody"></tbody></table></div><p class="method-note">${note}</p></div>`;
        document.getElementById('fundProposalStatus').before(section);
        document.getElementById('proposalTargetInput').parentElement.insertAdjacentHTML('beforebegin','<label>Unidad del peso pegado<select id="proposalTargetUnit"><option value="percent">Porcentaje (25 = 25%)</option><option value="fraction">Fracción (0,25 = 25%)</option></select></label>');
        render();
    }
    return {init,rows,safeRows,originRows,weighted,syncOrigin,targetRows,mode,importText,copy,add,edit,remove,normalize,render,note,get independent(){return independent;}};
})();
