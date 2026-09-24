(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PeerValue=factory();})(globalThis,function(){
    const key=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,' ');
    function index(records){
        const categories=new Map(),seen=new Set();
        for(const r of records){const cat=key(r.category),isin=String(r.isin||'').toUpperCase();if(!cat||!isin||seen.has(isin))continue;seen.add(isin);
            if(!categories.has(cat))categories.set(cat,{total:0,count:0,ter:0,score:0,records:new Map()});
            const group=categories.get(cat);group.total++;group.records.set(isin,r);
            if(Number.isFinite(r.ter)&&r.ter>=0&&Number.isFinite(r.score)){group.count++;group.ter+=r.ter;group.score+=r.score;}
        }return categories;
    }
    function compare(record,categories){
        const group=categories.get(key(record?.category)),own=group?.records.get(String(record?.isin||'').toUpperCase());
        const ownComplete=own&&Number.isFinite(own.ter)&&own.ter>=0&&Number.isFinite(own.score),count=(group?.count||0)-(ownComplete?1:0),total=(group?.total||0)-(own?1:0);
        const meanTer=count?((group?.ter||0)-(ownComplete?own.ter:0))/count:NaN,meanScore=count?((group?.score||0)-(ownComplete?own.score:0))/count:NaN;
        const deltaTer=Number.isFinite(record?.ter)&&record.ter>=0?record.ter-meanTer:NaN,deltaScore=Number.isFinite(record?.score)?record.score-meanScore:NaN;
        let assessment='Sin métricas comparables';
        if(Number.isFinite(deltaTer)&&Number.isFinite(deltaScore))assessment=count<3?'Muestra reducida':Math.abs(deltaTer)<1e-10&&Math.abs(deltaScore)<1e-10?'En la media':deltaTer<=1e-10&&deltaScore>=-1e-10?'Menor coste / mejor score':deltaTer>=-1e-10&&deltaScore<=1e-10?'Mayor coste / menor score':deltaTer>0?'Mayor coste / mayor score':'Menor coste / menor score';
        return {count,total,meanTer,meanScore,deltaTer,deltaScore,assessment};
    }
    return {index,compare};
});
