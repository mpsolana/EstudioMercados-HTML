(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ProposalAllocation=factory();})(globalThis,function(){
    const category=r=>String(r?.category||'').trim().toLowerCase();
    function validate(rows,label){
        if(!rows.length)throw new Error(`${label}: no hay posiciones cargadas.`);
        if(rows.some(r=>!Number.isFinite(r.weight)||r.weight<0))throw new Error(`${label}: hay pesos vacíos, negativos o no válidos.`);
        const total=rows.reduce((s,r)=>s+r.weight,0);
        if(Math.abs(total-100)>.01)throw new Error(`${label}: los pesos suman ${total.toFixed(2)}%; deben sumar 100%. Revisa la unidad de los pesos o normalízalos.`);
        if(rows.some(r=>r.weight>0&&!r.record))throw new Error(`${label}: identifica los fondos con peso positivo.`);
    }
    function allocate(origin,target){
        validate(origin,'Origen');validate(target,'Propuesta');
        const copy=rows=>{const total=rows.reduce((s,r)=>s+r.weight,0);return rows.filter(r=>r.weight>0).map(r=>({...r,remaining:r.weight*100/total}));};
        const sources=copy(origin),destinations=copy(target),flows=[];
        // Retain common holdings, then categories; remaining flows are illustrative, not orders.
        for(const match of [(a,b)=>a.isin===b.isin,(a,b)=>category(a)&&category(a)===category(b),()=>true]){
            for(const a of sources)for(const b of destinations){
                if(a.remaining<1e-9||b.remaining<1e-9||!match(a.record,b.record))continue;
                const weight=Math.min(a.remaining,b.remaining);a.remaining-=weight;b.remaining-=weight;
                flows.push({isin:a.record.isin,weight,current:a.record,proposed:b.record});
            }
        }
        return flows;
    }
    return {allocate,validate};
});
