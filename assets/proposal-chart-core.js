(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ProposalChartCore=factory();})(globalThis,function(){
    const key=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,' ');
    function weights(rows){
        if(!rows.length||rows.some(r=>!Number.isFinite(r.weight)||r.weight<0))throw new Error('Completa los pesos de la cartera.');
        const total=rows.reduce((s,r)=>s+r.weight,0);
        if(Math.abs(total-100)>.01)throw new Error('Los pesos deben sumar 100%.');
        return rows.filter(r=>r.weight>0);
    }
    function savings(rows,capital){
        if(!Number.isFinite(capital)||capital<=0)throw new Error('Introduce un AUM de cartera mayor que cero.');
        const active=weights(rows),valid=active.filter(r=>[r.current?.ter,r.proposed?.ter].every(v=>Number.isFinite(v)&&v>=0));
        const items=valid.map(r=>({isin:r.isin,name:r.current.name||r.isin,proposed:r.proposed.name||r.proposed.isin,value:capital*r.weight/100*(r.current.ter-r.proposed.ter)/100}));
        return {items,total:items.reduce((s,r)=>s+r.value,0),coverage:valid.reduce((s,r)=>s+r.weight,0),missing:active.length-valid.length};
    }
    function pairs(rows){return rows.filter(r=>r.weight>0).map(r=>({isin:r.isin,name:r.current?.name||r.isin,proposed:r.proposed?.name||'Sin propuesta',ter:[r.current?.ter,r.proposed?.ter].map(v=>Number.isFinite(v)&&v>=0?v:null),score:r.current?.category&&key(r.current.category)===key(r.proposed?.category)?[r.current?.score,r.proposed?.score].map(v=>Number.isFinite(v)?v:null):[null,null]}));}
    function concentration(rows,field){
        const active=rows.filter(r=>Number.isFinite(r.weight)&&r.weight>0),total=active.reduce((s,r)=>s+r.weight,0),groups=new Map();
        if(!total)throw new Error('No hay patrimonio o pesos válidos para representar.');
        for(const row of active)for(const side of ['current','proposed']){
            const label=String(row[side]?.[field]||'').trim()||(field==='manager'?'Gestora sin identificar':'Sin categoría'),id=key(label);
            if(!groups.has(id))groups.set(id,{label,current:0,proposed:0});groups.get(id)[side]+=row.weight/total*100;
        }
        return [...groups.values()].sort((a,b)=>Math.max(b.current,b.proposed)-Math.max(a.current,a.proposed)||a.label.localeCompare(b.label));
    }
    function opportunities(entries){
        let omitted=0;const points=[];
        for(const {position:p,current,alternative} of entries){
            if(!p||!Number.isFinite(p.amount)||p.amount<=0||p.amountCount!==p.rows||!p.rows){omitted++;continue;}
            if(!current||!alternative||!Number.isFinite(current.ter)||!Number.isFinite(alternative.ter)||current.ter<=alternative.ter)continue;
            const clients=Number.isFinite(p.clientCount)&&p.clientCount>0&&p.accountCount===p.rows?p.clientCount:null;
            points.push({isin:p.isin,name:current.name||p.name||p.isin,alternative:alternative.name||alternative.isin,amount:p.amount,saving:p.amount*(current.ter-alternative.ter)/100,clients});
        }
        return {points,omitted,sizedByClients:points.length>0&&points.every(p=>p.clients!==null)};
    }
    return {weights,savings,pairs,concentration,opportunities};
});
