(function(root,factory){
    const core=factory(root.FinanceCore||require('./finance-core.js'));
    if(typeof module==='object'&&module.exports)module.exports=core;
    else root.ModelPortfolioCore=core;
})(globalThis,function(finance){
    const key=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,' ');
    const number=value=>{if(typeof value==='number')return value;if(value===null||value===undefined||value==='')return NaN;return Number(String(value).trim().replace('%','').replace(',','.'));};
    const bands={muy_conservador:[0,15],prudente:[15,30],equilibrado:[30,50],decidido:[50,75],muy_arriesgado:[75,100]};
    function profile(name){const value=key(name);if(/muy\s*(conservador|conservadora)/.test(value))return 'muy_conservador';if(/muy\s*(arriesgado|arriesgada)/.test(value))return 'muy_arriesgado';return Object.keys(bands).find(id=>value.includes(id))||'';}
    function assetType(generic,subcategories=[]){
        const label=key(generic),details=key(subcategories.join(' '));
        if(/(^|\b)(rv|renta variable|equity|acciones|bolsa)(\b|$)/.test(label))return 'RV';
        if(/(^|\b)(rf|renta fija|bonos|bond|deuda|monetario|liquidez)(\b|$)/.test(label))return 'RF';
        if(/(^|\b)(equity|renta variable|acciones)(\b|$)/.test(details))return 'RV';
        if(/(^|\b)(bond|renta fija|bonos|fixed income)(\b|$)/.test(details))return 'RF';
        return 'Otros';
    }
    function allocation(model){
        const rows=model?.rows||[],sum=field=>rows.reduce((total,row)=>total+(Number(row[field])||0),0);
        const byType=(field,type)=>rows.reduce((total,row)=>total+(row.assetType===type?(Number(row[field])||0):0),0);
        const band=bands[model?.profile]||null;
        const portfolioRv=byType('portfolioWeight','RV');
        return {benchmarkTotal:sum('weight'),portfolioTotal:sum('portfolioWeight'),benchmarkRv:byType('weight','RV'),portfolioRv,benchmarkRf:byType('weight','RF'),portfolioRf:byType('portfolioWeight','RF'),benchmarkOther:byType('weight','Otros'),portfolioOther:byType('portfolioWeight','Otros'),band,neutral:band?(band[0]+band[1])/2:NaN,bandPosition:band&&band[1]>band[0]?(portfolioRv-band[0])/(band[1]-band[0])*100:NaN,unknown:rows.filter(row=>row.assetType==='Otros'&&(row.weight>0||row.portfolioWeight>0)).map(row=>row.generic)};
    }
    function parseGrid(grid){
        if(!Array.isArray(grid)||grid.length<2)throw new Error('La hoja Carteras Modelo no contiene categorias y pesos.');
        const header=grid[0]||[],names=header.slice(2).map(v=>String(v||'').trim());
        if(!names.some(Boolean))throw new Error('Faltan nombres de carteras modelo a partir de la columna C.');
        const rows=grid.slice(1).map((cells,index)=>({id:index,generic:String(cells?.[0]||'').trim(),subcategories:String(cells?.[1]||'').split(';').map(v=>v.trim()).filter(Boolean),raw:names.map((_,i)=>number(cells?.[i+2]))})).filter(row=>row.generic&&row.subcategories.length&&row.raw.some(v=>Number.isFinite(v)&&v>=0));
        if(!rows.length)throw new Error('No hay filas validas con categoria, subcategoria y pesos.');
        const models=names.map((name,i)=>{
            if(!name)return null;
            const total=rows.reduce((sum,row)=>sum+(Number.isFinite(row.raw[i])&&row.raw[i]>0?row.raw[i]:0),0),scale=total<=1.5?100:1;
            return {name,profile:profile(name),rows:rows.map(row=>({id:row.id,generic:row.generic,subcategories:row.subcategories,assetType:assetType(row.generic,row.subcategories),weight:(Number.isFinite(row.raw[i])&&row.raw[i]>0?row.raw[i]:0)*scale,portfolioWeight:(Number.isFinite(row.raw[i])&&row.raw[i]>0?row.raw[i]:0)*scale,currentPositions:[],proposedPositions:[],keepCurrent:false})),total:total*scale};
        }).filter(model=>model&&model.total>0);
        if(!models.length)throw new Error('Ninguna cartera modelo tiene pesos positivos.');
        return models;
    }
    function rank(records,subcategories,limit=5){
        const allowed=new Set(subcategories.map(key));
        const best=new Map();
        for(const record of records||[]){if(!record?.isin||!allowed.has(key(record.category))||!Number.isFinite(record.score))continue;
            const previous=best.get(record.isin);if(!previous||record.score>previous.score)best.set(record.isin,record);
        }
        const sorted=[...best.values()].sort((a,b)=>b.score-a.score||(Number.isFinite(a.ter)?a.ter:Infinity)-(Number.isFinite(b.ter)?b.ter:Infinity)||a.isin.localeCompare(b.isin));
        const managers=new Set(),distinct=[];
        for(const record of sorted){const manager=key(record.manager)||`isin:${record.isin}`;if(managers.has(manager))continue;managers.add(manager);distinct.push(record);if(distinct.length>=limit)break;}
        return distinct;
    }
    function fullRank(records,subcategories){
        const allowed=new Set(subcategories.map(key)),best=new Map();
        for(const record of records||[]){if(!record?.isin||!allowed.has(key(record.category)))continue;
            const prior=best.get(record.isin);if(!prior||Number.isFinite(record.score)&&(!Number.isFinite(prior.score)||record.score>prior.score))best.set(record.isin,record);
        }
        return [...best.values()].sort((a,b)=>(Number.isFinite(b.score)?b.score:-Infinity)-(Number.isFinite(a.score)?a.score:-Infinity)||(Number.isFinite(a.ter)?a.ter:Infinity)-(Number.isFinite(b.ter)?b.ter:Infinity)||a.isin.localeCompare(b.isin));
    }
    function equalPositions(isins){
        const unique=[...new Set((isins||[]).map(value=>String(value||'').trim().toUpperCase()).filter(Boolean))];
        return unique.map(isin=>({isin,share:100/unique.length}));
    }
    function normalizePositions(positions){
        const total=(positions||[]).reduce((sum,item)=>sum+Math.max(0,item.share||0),0);
        return total>0?positions.map(item=>({...item,share:Math.max(0,item.share||0)/total*100})):equalPositions(positions.map(item=>item.isin));
    }
    function transferIsins(sourcePositions,targetPositions){
        const isins=[...new Set((sourcePositions||[]).map(item=>String(item.isin||'').trim().toUpperCase()).filter(Boolean))];
        if(!isins.length)return [];
        const old=new Map((targetPositions||[]).map(item=>[String(item.isin||'').trim().toUpperCase(),Math.max(0,Number(item.share)||0)]));
        const newcomers=isins.filter(isin=>!old.has(isin));
        const retained=isins.filter(isin=>old.has(isin));
        if(!retained.length)return equalPositions(isins);
        const base=retained.reduce((sum,isin)=>sum+old.get(isin),0);
        if(!(base>0))return equalPositions(isins);
        const newShare=newcomers.length?100/isins.length:0;
        const remaining=100-newShare*newcomers.length;
        return isins.map(isin=>({isin,share:old.has(isin)?remaining*old.get(isin)/base:newShare}));
    }
    function setShare(positions,index,value){
        if(!positions[index]||!Number.isFinite(value)||value<0||value>100)throw new Error('El peso dentro de la categoria debe estar entre 0% y 100%.');
        if(positions.length===1)return [{...positions[0],share:100}];
        const remainder=100-value,others=positions.reduce((sum,item,i)=>sum+(i===index?0:Math.max(0,item.share||0)),0);
        return positions.map((item,i)=>({...item,share:i===index?value:others>0?remainder*Math.max(0,item.share||0)/others:remainder/(positions.length-1)}));
    }
    function setPortfolioWeight(rows,index,value){
        if(!rows[index]||!Number.isFinite(value)||value<0||value>100)throw new Error('El peso de cartera debe estar entre 0% y 100%.');
        if(rows.length===1){rows[0].portfolioWeight=100;return rows;}
        const target=Math.round(value*100),remaining=10000-target;
        const others=rows.map((row,i)=>({row,i})).filter(item=>item.i!==index);
        let basis=others.map(({row})=>Math.max(0,Number(row.portfolioWeight)||0));
        if(!basis.some(Boolean))basis=others.map(({row})=>Math.max(0,Number(row.weight)||0));
        if(!basis.some(Boolean))basis=others.map(()=>1);
        const total=basis.reduce((sum,item)=>sum+item,0);
        const allocations=basis.map((weight,i)=>({i,exact:remaining*weight/total}));
        const cents=allocations.map(item=>Math.floor(item.exact));
        let leftover=remaining-cents.reduce((sum,item)=>sum+item,0);
        allocations.sort((a,b)=>(b.exact-Math.floor(b.exact))-(a.exact-Math.floor(a.exact))||a.i-b.i);
        for(const item of allocations){if(!leftover)break;cents[item.i]++;leftover--;}
        rows[index].portfolioWeight=target/100;
        others.forEach(({row},i)=>row.portfolioWeight=cents[i]/100);
        return rows;
    }
    function setBandPosition(model,position){
        const rows=model?.rows||[],band=bands[model?.profile];
        if(!band||!Number.isFinite(position)||position<0||position>100)throw new Error('Selecciona un perfil y una posición de banda entre 0% y 100%.');
        if(rows.some(row=>!Number.isFinite(row.portfolioWeight)||row.portfolioWeight<0))throw new Error('Hay pesos de cartera no válidos.');
        const total=rows.reduce((sum,row)=>sum+row.portfolioWeight,0);
        if(!(total>0))throw new Error('No hay posiciones positivas que se puedan ajustar.');
        const groups={RV:[],RF:[],Otros:[]};
        rows.forEach((row,index)=>{if(row.portfolioWeight>0)(groups[row.assetType]||groups.Otros).push(index);});
        const current=rows.map(row=>row.portfolioWeight/total*100),other=groups.Otros.reduce((sum,index)=>sum+current[index],0);
        const rv=band[0]+(band[1]-band[0])*position/100,rf=100-other-rv;
        if(rf< -0.00001)throw new Error('El peso fijo de Otros impide alcanzar esa posición de banda.');
        if(rv>0&&!groups.RV.length||rf>0&&!groups.RF.length)throw new Error('No se puede alcanzar la banda sin activar una categoría que está al 0%.');
        const targets={RV:Math.round(rv*100),Otros:Math.round(other*100)};targets.RF=10000-targets.RV-targets.Otros;
        const cents=Array(rows.length).fill(0);
        for(const [kind,indexes] of Object.entries(groups)){
            const target=targets[kind],basis=indexes.reduce((sum,index)=>sum+current[index],0);
            if(target>0&&!(basis>0))throw new Error('Faltan posiciones positivas para la asignación solicitada.');
            const parts=indexes.map(index=>({index,exact:target*current[index]/basis}));
            parts.forEach(part=>cents[part.index]=Math.floor(part.exact));
            let rest=target-indexes.reduce((sum,index)=>sum+cents[index],0);
            parts.sort((a,b)=>(b.exact-Math.floor(b.exact))-(a.exact-Math.floor(a.exact))||a.index-b.index);
            for(const part of parts){if(!rest)break;cents[part.index]++;rest--;}
        }
        rows.forEach((row,index)=>row.portfolioWeight=cents[index]/100);
        return allocation(model);
    }
    function indexStatistics(points){
        const clean=(points||[]).filter(point=>Number.isFinite(point.price)&&point.price>0&&Number.isFinite(new Date(point.date).getTime())).sort((a,b)=>new Date(a.date)-new Date(b.date));
        const months=new Map();clean.forEach(point=>months.set(new Date(point.date).toISOString().slice(0,7),point));
        const series=[...months.values()],returns=series.slice(1).flatMap((point,i)=>{
            const previous=new Date(series[i].date),current=new Date(point.date);
            return (current.getUTCFullYear()-previous.getUTCFullYear())*12+current.getUTCMonth()-previous.getUTCMonth()===1?[point.price/series[i].price-1]:[];
        });
        if(series.length<13)return {count:series.length,reason:'Se necesitan al menos 13 cierres mensuales.'};
        const first=new Date(series[0].date),last=new Date(series.at(-1).date),years=(last-first)/86400000/365.25;
        if(years<1)return {count:series.length,reason:'Se necesita al menos un año de histórico.'};
        let peak=series[0].price,drawdown=0;
        series.forEach(point=>{peak=Math.max(peak,point.price);drawdown=Math.min(drawdown,point.price/peak-1);});
        const rolling=[];for(let i=12;i<series.length;i++){
            const start=new Date(series[i-12].date),end=new Date(series[i].date),span=(end-start)/86400000/365.25;
            if(span<.9||span>1.1)continue;
            rolling.push({value:series[i].price/series[i-12].price-1,from:start.toISOString().slice(0,10),to:end.toISOString().slice(0,10)});
        }
        return {count:series.length,from:first.toISOString().slice(0,10),to:last.toISOString().slice(0,10),cagr:(series.at(-1).price/series[0].price)**(1/years)-1,vol:returns.length>=12?finance.stdev(returns)*Math.sqrt(12):NaN,drawdown,rollingMin:rolling.reduce((a,b)=>!a||b.value<a.value?b:a,null),rollingMax:rolling.reduce((a,b)=>!a||b.value>a.value?b:a,null)};
    }
    function projection(expectedReturn,expectedRisk,riskFree=0){
        if(!Number.isFinite(expectedReturn)||!Number.isFinite(expectedRisk)||expectedRisk<0||!Number.isFinite(riskFree))return {min:NaN,max:NaN,sharpe:NaN};
        return {min:Math.max(-1,expectedReturn-1.96*expectedRisk),max:expectedReturn+1.96*expectedRisk,sharpe:expectedRisk>0?(expectedReturn-riskFree)/expectedRisk:NaN};
    }
    function rfSummary(model,benchmarks,metrics){
        const collect=side=>{let weight=0,covered=0,ytm=0,duration=0;
            for(const row of model?.rows||[]){if(row.assetType!=='RF')continue;
                const entries=side==='benchmark'?(benchmarks(row)||[]).slice(0,1).map(id=>({id,weight:row.weight})):(row.keepCurrent?row.currentPositions:row.proposedPositions).map(item=>({id:item.isin,weight:row.portfolioWeight*item.share/100}));
                if(side==='portfolio'&&!entries.length&&row.portfolioWeight>0)weight+=row.portfolioWeight;
                if(side==='benchmark'&&!entries.length&&row.weight>0)weight+=row.weight;
                for(const entry of entries){if(!(entry.weight>0))continue;weight+=entry.weight;
                    const item=metrics[`${side==='benchmark'?'B':'F'}:${String(entry.id).toUpperCase()}`];
                    if(Number.isFinite(item?.ytm)&&Number.isFinite(item?.duration)){covered+=entry.weight;ytm+=entry.weight*item.ytm;duration+=entry.weight*item.duration;}
                }
            }
            return {weight,coverage:weight?covered/weight:0,ytm:covered>=weight-1e-6&&weight>0?ytm/weight:NaN,duration:covered>=weight-1e-6&&weight>0?duration/weight:NaN};
        };return {benchmark:collect('benchmark'),portfolio:collect('portfolio')};
    }
    function copyCategoryPositions(models,sourceIndex,rowIndex,kind){
        const source=models[sourceIndex]?.rows[rowIndex];
        if(!source||!['current','proposal'].includes(kind))return 0;
        const sourcePositions=kind==='current'?source.currentPositions:source.proposedPositions;
        if(!sourcePositions)return 0;
        let copied=0;
        models.forEach((portfolio,index)=>{
            if(index===sourceIndex)return;
            const target=portfolio.rows.find(row=>row.id===source.id&&key(row.generic)===key(source.generic));
            if(!target)return;
            if(kind==='current'){
                target.currentPositions=transferIsins(sourcePositions,target.currentPositions);
                if(target.keepCurrent)target.proposedPositions=target.currentPositions.map(item=>({...item}));
            }else if(source.keepCurrent){
                target.keepCurrent=true;
                target.proposedPositions=target.currentPositions.map(item=>({...item}));
            }else{
                target.keepCurrent=false;
                target.proposedPositions=transferIsins(sourcePositions,target.proposedPositions);
            }
            copied++;
        });
        return copied;
    }
    function latestCommitteeViews(entries){
        const normalizeView=value=>({uw:'UW',neutral:'Neutral',ow:'OW'})[String(value||'').trim().toLowerCase()]||'';
        const history=(entries||[]).filter(item=>/^\d{4}-\d{2}-\d{2}$/.test(item.date)&&key(item.category))
            .map(item=>({date:item.date,category:String(item.category).trim(),view:normalizeView(item.view),comment:String(item.comment||'')}));
        const date=history.reduce((latest,item)=>item.date>latest?item.date:latest,'');
        const views={};
        history.filter(item=>item.date===date).forEach(item=>{views[key(item.category)]={view:item.view,comment:item.comment};});
        return {date,views,history};
    }
    function appendCommitteeViews(history,date,categories,views){
        if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('Introduce una fecha de comité válida.');
        const previous=(history||[]).filter(item=>item.date!==date);
        const snapshot=categories.map(category=>{
            const choice=views[key(category)]||{};
            return {date,category,view:['UW','Neutral','OW'].includes(choice.view)?choice.view:'',comment:String(choice.comment||'')};
        });
        return [...previous,...snapshot].sort((a,b)=>a.date.localeCompare(b.date)||key(a.category).localeCompare(key(b.category)));
    }
    function benchmarkIndex(metadata){
        const map=new Map();for(const [ticker,meta] of Object.entries(metadata||{})){
            if(ticker!==ticker.toLowerCase())continue;
            const category=key(meta.assetClass);if(!category)continue;
            if(!map.has(category))map.set(category,[]);
            if(!map.get(category).includes(ticker))map.get(category).push(ticker);
        }return map;
    }
    function monthlyPrices(series){
        const out=new Map();for(const point of series||[]){const date=new Date(point.date),price=Number(point.price);if(!Number.isFinite(+date)||!(price>0))continue;
            const month=date.toISOString().slice(0,7),prior=out.get(month);if(!prior||date>prior.date)out.set(month,{date,price});
        }return out;
    }
    function trackingError(selections,fundSeries,benchmarkSeries){
        if(!selections.length||selections.some(row=>!(row.weight>0)||!row.selectedIsin||!row.benchmark))return {value:NaN,reason:'Faltan fondos o benchmarks seleccionados.'};
        const lookup=(source,ticker)=>source[ticker]||Object.entries(source).find(([key])=>key.toLowerCase()===String(ticker).toLowerCase())?.[1];
        const pairs=selections.map(row=>({weight:row.weight,fund:monthlyPrices(lookup(fundSeries,row.selectedIsin)||lookup(fundSeries,row.ticker)),bench:monthlyPrices(lookup(benchmarkSeries,row.benchmark)?.data||lookup(benchmarkSeries,row.benchmark))}));
        if(pairs.some(pair=>pair.fund.size<3||pair.bench.size<3))return {value:NaN,reason:'Faltan historicos mensuales de fondos o benchmarks.'};
        const common=[...pairs[0].fund.keys()].filter(month=>pairs.every(pair=>pair.fund.has(month)&&pair.bench.has(month))).sort();
        let months=[],run=[];
        common.forEach(month=>{const prior=run.at(-1),consecutive=!prior||(Number(month.slice(0,4))*12+Number(month.slice(5)))-(Number(prior.slice(0,4))*12+Number(prior.slice(5)))===1;
            if(!consecutive){if(run.length>months.length)months=run;run=[];}run.push(month);
        });
        if(run.length>months.length)months=run;
        if(months.length<4)return {value:NaN,reason:'Se necesitan al menos cuatro cierres mensuales consecutivos y comunes.'};
        const total=pairs.reduce((sum,pair)=>sum+pair.weight,0),active=[];
        for(let i=1;i<months.length;i++){
            const previous=months[i-1],current=months[i];
            const fund=pairs.reduce((sum,pair)=>sum+pair.weight/total*(pair.fund.get(current).price/pair.fund.get(previous).price-1),0);
            const bench=pairs.reduce((sum,pair)=>sum+pair.weight/total*(pair.bench.get(current).price/pair.bench.get(previous).price-1),0);
            active.push(fund-bench);
        }
        return {value:finance.stdev(active)*Math.sqrt(12),months:months.length,from:months[0],to:months.at(-1)};
    }
    return {key,parseGrid,rank,fullRank,equalPositions,normalizePositions,transferIsins,setShare,setPortfolioWeight,setBandPosition,indexStatistics,projection,rfSummary,copyCategoryPositions,latestCommitteeViews,appendCommitteeViews,benchmarkIndex,trackingError,profile,assetType,allocation,bands};
});
