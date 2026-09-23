(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ProposalAllocation=factory();})(globalThis,function(){
    const category=r=>String(r?.category||'').trim().toLowerCase();
    function validate(rows,label){
        if(!rows.length||rows.some(r=>!r.record||!Number.isFinite(r.weight)||r.weight<0)||Math.abs(rows.reduce((s,r)=>s+r.weight,0)-100)>.01)throw new Error(`${label}: identifica los fondos y ajusta los pesos al 100%.`);
    }
    function allocate(origin,target){
        validate(origin,'Origen');validate(target,'Propuesta');
        const copy=rows=>{const total=rows.reduce((s,r)=>s+r.weight,0);return rows.map(r=>({...r,remaining:r.weight*100/total}));};
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
