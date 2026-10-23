(function(root,factory){
    const api=factory(root.ModelPortfolioCore||require('./model-portfolio-core.js'));
    if(typeof module==='object'&&module.exports)module.exports=api;
    else root.OverviewCore=api;
})(globalThis,function(modelCore){
    const id=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
    const key=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,' ');
    const finite=value=>typeof value==='number'&&Number.isFinite(value)?value:NaN;
    function exposureMix(classification){
        const values=[classification?.eurExpo,classification?.usdExpo,classification?.otherExpo].map(finite);
        if(values.some(value=>!Number.isFinite(value)||value<0))return null;
        const total=values.reduce((sum,value)=>sum+value,0);
        const divisor=Math.abs(total-1)<0.011||Math.abs(total-100)<1.1?total:0;
        return divisor?values.map(value=>value/divisor):null;
    }
    function lookThrough(positions){
        const totals=[0,0,0],invested=positions.reduce((sum,row)=>sum+(Number.isFinite(row.amount)&&row.amount>0?row.amount:0),0);
        let covered=0;
        for(const row of positions){
            if(!Number.isFinite(row.amount)||row.amount<=0)continue;
            const mix=exposureMix(row.classification);if(!mix)continue;
            covered+=row.amount;mix.forEach((share,index)=>totals[index]+=row.amount*share);
        }
        return {eur:totals[0],usd:totals[1],other:totals[2],unknown:Math.max(0,invested-covered),covered,invested};
    }
    function rfWeighted(positions,metrics){
        let weight=0,covered=0,ytm=0,duration=0;
        for(const row of positions){
            if(row.classification?.type!=='RF'||!Number.isFinite(row.amount)||row.amount<=0)continue;
            weight+=row.amount;
            const item=metrics[`F:${id(row.isin)}`];
            if(!Number.isFinite(item?.ytm)||!Number.isFinite(item?.duration))continue;
            covered+=row.amount;ytm+=row.amount*item.ytm;duration+=row.amount*item.duration;
        }
        return {weight,coverage:weight?covered/weight:0,ytm:weight&&covered>=weight-1e-6?ytm/weight:NaN,duration:weight&&covered>=weight-1e-6?duration/weight:NaN};
    }
    const day=value=>{if(value===null||value===undefined||value==='')return null;const date=value instanceof Date?value:new Date(value);return Number.isFinite(+date)?new Date(date.getFullYear(),date.getMonth(),date.getDate()):null;};
    function documentStatus(expiry,hasDocument,today=new Date()){
        if(!hasDocument)return 'sin documento';
        const end=day(expiry),now=day(today);
        if(!end)return 'sin fecha';
        const utc=value=>Date.UTC(value.getFullYear(),value.getMonth(),value.getDate());
        const remaining=Math.round((utc(end)-utc(now))/86400000);
        return remaining<0?'caducado':remaining<=30?'próximo':'vigente';
    }
    function clientIndex(clients){
        const index=new Map();
        for(const client of clients||[])for(const value of [client.account,client.code]){
            const name=id(value);if(!name)continue;
            if(!index.has(name))index.set(name,client);
            else if(index.get(name)!==client)index.set(name,null);
        }
        return index;
    }
    function analyze({positions=[],clients=[],categories=[],modelsByOrg={},cashByAccount={},rfMetrics={},today=new Date()}){
        const categoryMap=new Map(categories.map(row=>[id(row.isin),row]));
        const accounts=new Map(),funds=new Map(),control=clientIndex(clients);
        let invested=0,unclassified=0,invalidAmounts=0;
        for(const position of positions){
            const isin=id(position.isin),account=id(position.account),amount=finite(position.amount);
            if(!isin||!account)continue;
            if(!accounts.has(account))accounts.set(account,{account,accountLabel:position.accountLabel||'',positions:[],invested:0,missingAmount:0,unclassified:0});
            const holder=accounts.get(account),classification=categoryMap.get(isin);
            holder.positions.push({...position,isin,amount,classification});
            if(Number.isFinite(amount)&&amount>=0){holder.invested+=amount;invested+=amount;if(!classification?.generic||!['RV','RF','Otros'].includes(classification.type)){holder.unclassified+=amount;unclassified+=amount;}}
            else {holder.missingAmount++;invalidAmounts++;}
            if(!funds.has(isin))funds.set(isin,{isin,name:position.name||isin,productType:position.productType||'',amount:0,accounts:new Set(),classification});
            const fund=funds.get(isin);fund.accounts.add(account);if(Number.isFinite(amount)&&amount>=0)fund.amount+=amount;
        }
        const results=[...accounts.values()].map(holder=>{
            const client=control.get(holder.account)||control.get(id(holder.accountLabel))||null;
            const organization=String(client?.organization||'').toUpperCase();
            const profile=modelCore.profile(client?.profile||'');
            const band=modelCore.bands[profile]||null;
            const models=modelsByOrg[organization]||[];
            const model=models.find(item=>modelCore.profile(item.profile||item.name)===profile)||null;
            const allocations=new Map();
            for(const position of holder.positions){
                const generic=position.classification?.generic;
                if(!generic||!Number.isFinite(position.amount))continue;
                allocations.set(generic,(allocations.get(generic)||0)+position.amount);
            }
            const reportedCash=Object.prototype.hasOwnProperty.call(cashByAccount,holder.account)?cashByAccount[holder.account]:client?.cash;
            const cashKnown=Number.isFinite(reportedCash)&&reportedCash>=0;
            const cash=cashKnown?reportedCash:0;
            const base=holder.invested+cash;
            const coverage=holder.invested>0?(holder.invested-holder.unclassified)/holder.invested:0;
            const rv=[...holder.positions].reduce((sum,p)=>sum+(p.classification?.type==='RV'&&Number.isFinite(p.amount)?p.amount:0),0);
            const rvPct=base>0?rv/base*100:NaN;
            const verified=Boolean(client&&band&&cashKnown&&holder.invested>0&&holder.missingAmount===0&&holder.unclassified===0);
            const bandPosition=band&&Number.isFinite(rvPct)?(rvPct-band[0])/(band[1]-band[0])*100:NaN;
            const limit=verified?(rvPct<band[0]-1e-8?'bajo mínimo':rvPct>band[1]+1e-8?'excede máximo':'dentro'):'sin verificar';
            const limitReasons=[];
            if(!client)limitReasons.push('cliente sin cruce');
            if(!band)limitReasons.push('perfil sin banda');
            if(!cashKnown)limitReasons.push('efectivo pendiente');
            if(holder.unclassified>0)limitReasons.push('activos sin clasificar');
            if(holder.missingAmount)limitReasons.push('contravalor pendiente');
            const documents=(client?.documents||[]).map(item=>({...item,status:documentStatus(item.expiry,item.present,today)}));
            const kyc=documentStatus(client?.kycExpiry,true,today);
            const suitability=documentStatus(client?.suitabilityExpiry,true,today);
            const esg=documentStatus(client?.esgExpiry,true,today);
            return {...holder,client,organization,profile,band,model,cash,cashKnown,base,coverage,rvPct,bandPosition,limit,limitReasons,allocations,currencyExposure:lookThrough(holder.positions),rf:rfWeighted(holder.positions,rfMetrics),documents,kyc,suitability,esg};
        }).sort((a,b)=>b.invested-a.invested);
        const noControl=results.filter(row=>!row.client).length;
        const unknownCategories=[...funds.values()].filter(fund=>!fund.classification?.generic||!['RV','RF','Otros'].includes(fund.classification.type));
        return {accounts:results,funds:[...funds.values()].sort((a,b)=>b.amount-a.amount),invested,unclassified,invalidAmounts,noControl,unknownCategories,currencyExposure:lookThrough(results.flatMap(row=>row.positions)),breaches:results.filter(row=>['bajo mínimo','excede máximo'].includes(row.limit))};
    }
    return {analyze,documentStatus,clientIndex,id,key,exposureMix,lookThrough,rfWeighted};
});
