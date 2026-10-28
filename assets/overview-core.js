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
        for(const client of clients||[])for(const value of [client.account,client.code,client.name,...(client.valueAccounts||[]),...(client.cashAccounts||[])]){
            const name=id(value);if(!name)continue;
            if(!index.has(name))index.set(name,client);
            else if(index.get(name)!==client)index.set(name,null);
        }
        return index;
    }
    function parseBalanceRows(rows){
        const seen=new Set(),balances=[];
        for(const row of rows||[]){
            const account=String(row['TRANSACTIONAL ACCOUNT']||row.ACCOUNT||'').trim();
            const subaccount=String(row.ACCOUNT||'').trim();
            const currency=String(row.CURRENCY||'').trim().toUpperCase();
            const amount=finite(row.BALANCE);
            if(!account||!subaccount||!/^[A-Z]{3}$/.test(currency)||!Number.isFinite(amount))continue;
            const identity=`${id(subaccount)}|${currency}`;
            if(seen.has(identity))throw new Error(`Saldo duplicado para subcuenta ${subaccount} (${currency}).`);
            seen.add(identity);balances.push({account,subaccount,description:String(row['TRANSACTIONAL ACCOUNT DESCRIPTION']||row['ACCOUNT DESCRIPTION']||'').trim(),currency,amount,date:row['VALUE DATE']||null});
        }
        return balances;
    }
    function matchBalanceAccounts(positions,balances,manual={},clients=[]){
        const positionNames=new Map(),balanceNames=new Map(),positionAccounts=new Set(),balanceAccounts=new Set();
        const control=clientIndex(clients),clientPositions=new Map();
        for(const row of positions){const account=id(row.account),name=id(row.accountLabel);if(!account)continue;positionAccounts.add(account);if(name){if(!positionNames.has(name))positionNames.set(name,new Set());positionNames.get(name).add(account);}}
        for(const row of positions){const client=control.get(id(row.account))||control.get(id(row.accountLabel));if(client){if(!clientPositions.has(client))clientPositions.set(client,new Set());clientPositions.get(client).add(id(row.account));}}
        for(const row of balances){const account=id(row.account),name=id(row.description);if(!account)continue;balanceAccounts.add(account);if(name){if(!balanceNames.has(name))balanceNames.set(name,new Set());balanceNames.get(name).add(account);}}
        const links={};
        for(const account of balanceAccounts)if(positionAccounts.has(account))links[account]=account;
        for(const row of balances){const from=id(row.account);if(links[from])continue;const client=control.get(from)||control.get(id(row.description)),targets=clientPositions.get(client);
            if(client&&targets?.size)links[from]=[...targets].sort()[0];
        }
        for(const [name,source] of balanceNames){const target=positionNames.get(name);if(target?.size!==1)continue;const to=[...target][0];for(const from of source)if(!links[from])links[from]=to;}
        for(const [first,second] of Object.entries(manual)){
            const a=id(first),b=id(second),from=balanceAccounts.has(a)&&positionAccounts.has(b)?a:b,to=from===a?b:a;
            if(positionAccounts.has(to)&&balanceAccounts.has(from))links[from]=to;
        }
        const linked=new Set(Object.values(links));
        const covered=account=>linked.has(account)||[...clientPositions.values()].some(group=>group.has(account)&&[...group].some(item=>linked.has(item)));
        return {links,unmatchedPositions:[...positionAccounts].filter(account=>!covered(account)),unmatchedBalances:[...balanceAccounts].filter(account=>!links[account])};
    }
    function convertBalances(rows,rates){
        const groups=new Map();
        for(const row of rows){const account=id(row.account);if(!groups.has(account))groups.set(account,[]);groups.get(account).push(row);}
        const amounts={},unresolved=[];
        for(const [account,items] of groups){
            let total=0,complete=true;
            for(const item of items){
                const rate=item.currency==='EUR'?1:rates[item.currency];
                if(!Number.isFinite(rate)||rate<=0){if(item.amount!==0){unresolved.push(item);complete=false;}continue;}
                total+=item.amount/rate;
            }
            if(complete)amounts[account]=total;
        }
        return {amounts,unresolved};
    }
    function rvAction(account,safety=2){
        if(!account||!['dentro','bajo mínimo','excede máximo'].includes(account.limit)||!Array.isArray(account.band)||!(account.base>0)||!Number.isFinite(account.rvPct))return null;
        if(account.limit==='dentro')return {direction:'Sin cambio',amount:0,target:account.rvPct};
        const [low,high]=account.band;
        const margin=Math.min(safety,(high-low)/2);
        const target=account.limit==='excede máximo'?high-margin:low+margin;
        return {direction:account.limit==='excede máximo'?'Reducir RV':'Aumentar RV',amount:Math.abs(target-account.rvPct)/100*account.base,target};
    }
    function analyze({positions=[],clients=[],categories=[],modelsByOrg={},cashByAccount={},rfMetrics={},bandsByProfile=modelCore.bands,valuationAligned=true,today=new Date()}){
        const categoryMap=new Map(categories.map(row=>[id(row.isin),row]));
        const accounts=new Map(),funds=new Map(),control=clientIndex(clients),clientKeys=new Map();
        let invested=0,unclassified=0,invalidAmounts=0;
        for(const position of positions){
            const isin=id(position.isin),account=id(position.account),amount=finite(position.amount);
            if(!isin||!account)continue;
            const client=control.get(account)||control.get(id(position.accountLabel))||null;
            if(client&&!clientKeys.has(client))clientKeys.set(client,`CLIENT:${clientKeys.size}`);
            const group=client?clientKeys.get(client):account;
            if(!accounts.has(group))accounts.set(group,{account,accountLabel:position.accountLabel||'',client,accountNumbers:new Set(),positions:[],invested:0,missingAmount:0,unclassified:0});
            const holder=accounts.get(group),classification=categoryMap.get(isin);holder.accountNumbers.add(account);
            holder.positions.push({...position,isin,amount,classification});
            if(Number.isFinite(amount)&&amount>=0){holder.invested+=amount;invested+=amount;if(!classification?.generic||!['RV','RF','Otros'].includes(classification.type)){holder.unclassified+=amount;unclassified+=amount;}}
            else {holder.missingAmount++;invalidAmounts++;}
            if(!funds.has(isin))funds.set(isin,{isin,name:position.name||isin,productType:position.productType||'',amount:0,accounts:new Set(),classification});
            const fund=funds.get(isin);fund.accounts.add(account);if(Number.isFinite(amount)&&amount>=0)fund.amount+=amount;
        }
        const results=[...accounts.values()].map(holder=>{
            const client=holder.client||control.get(holder.account)||control.get(id(holder.accountLabel))||null;
            const organization=String(client?.organization||'').toUpperCase();
            const profile=modelCore.profile(client?.profile||'');
            const band=bandsByProfile[profile]||null;
            const models=modelsByOrg[organization]||[];
            const model=models.find(item=>modelCore.profile(item.profile||item.name)===profile)||null;
            const allocations=new Map();
            const benchmarkAllocations=new Map();
            for(const position of holder.positions){
                const generic=position.classification?.generic;
                if(!Number.isFinite(position.amount))continue;
                if(generic)allocations.set(generic,(allocations.get(generic)||0)+position.amount);
                const benchmark=position.classification?.benchCategory;
                if(benchmark)benchmarkAllocations.set(benchmark,(benchmarkAllocations.get(benchmark)||0)+position.amount);
            }
            const knownCash=[...holder.accountNumbers].filter(account=>Object.prototype.hasOwnProperty.call(cashByAccount,account)).map(account=>cashByAccount[account]);
            const reportedCash=knownCash.length&&knownCash.every(Number.isFinite)?knownCash.reduce((sum,value)=>sum+value,0):client?.cash;
            const cashKnown=Number.isFinite(reportedCash)&&reportedCash>=0;
            const cash=cashKnown?reportedCash:0;
            const base=holder.invested+cash;
            const coverage=holder.invested>0?(holder.invested-holder.unclassified)/holder.invested:0;
            const rv=[...holder.positions].reduce((sum,p)=>sum+(p.classification?.type==='RV'&&Number.isFinite(p.amount)?p.amount:0),0);
            const rvPct=base>0?rv/base*100:NaN;
            const verified=Boolean(client&&band&&cashKnown&&valuationAligned&&holder.invested>0&&holder.missingAmount===0&&holder.unclassified===0);
            const bandPosition=band&&Number.isFinite(rvPct)?(rvPct-band[0])/(band[1]-band[0])*100:NaN;
            const limit=verified?(rvPct<band[0]-1e-8?'bajo mínimo':rvPct>band[1]+1e-8?'excede máximo':'dentro'):'sin verificar';
            const limitReasons=[];
            if(!client)limitReasons.push('cliente sin cruce');
            if(!band)limitReasons.push('perfil sin banda');
            if(!cashKnown)limitReasons.push('efectivo pendiente');
            if(cashKnown&&!valuationAligned)limitReasons.push('fechas de posiciones y saldos sin conciliar');
            if(holder.unclassified>0)limitReasons.push('activos sin clasificar');
            if(holder.missingAmount)limitReasons.push('contravalor pendiente');
            const documents=(client?.documents||[]).map(item=>({...item,status:documentStatus(item.expiry,item.present,today)}));
            const kyc=documentStatus(client?.kycExpiry,true,today);
            const suitability=documentStatus(client?.suitabilityExpiry,true,today);
            const esg=documentStatus(client?.esgExpiry,true,today);
            const house=holder.positions.filter(row=>row.house===true).reduce((sum,row)=>sum+(Number.isFinite(row.amount)?row.amount:0),0);
            const houseUnreviewed=holder.positions.filter(row=>row.house===null||row.house===undefined).reduce((sum,row)=>sum+(Number.isFinite(row.amount)?row.amount:0),0);
            return {...holder,client,organization,profile,band,model,cash,cashKnown,base,coverage,rvPct,bandPosition,limit,limitReasons,allocations,benchmarkAllocations,house,houseUnreviewed,currencyExposure:lookThrough(holder.positions),rf:rfWeighted(holder.positions,rfMetrics),documents,kyc,suitability,esg};
        }).sort((a,b)=>b.invested-a.invested);
        const noControl=results.filter(row=>!row.client).length;
        const unknownCategories=[...funds.values()].filter(fund=>!fund.classification?.generic||!['RV','RF','Otros'].includes(fund.classification.type));
        return {accounts:results,funds:[...funds.values()].sort((a,b)=>b.amount-a.amount),invested,unclassified,invalidAmounts,noControl,unknownCategories,currencyExposure:lookThrough(results.flatMap(row=>row.positions)),breaches:results.filter(row=>['bajo mínimo','excede máximo'].includes(row.limit))};
    }
    return {analyze,documentStatus,clientIndex,id,key,exposureMix,lookThrough,rfWeighted,parseBalanceRows,matchBalanceAccounts,convertBalances,rvAction};
});
