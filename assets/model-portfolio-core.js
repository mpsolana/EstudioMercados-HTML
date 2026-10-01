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
        return {benchmarkTotal:sum('weight'),portfolioTotal:sum('portfolioWeight'),benchmarkRv:byType('weight','RV'),portfolioRv:byType('portfolioWeight','RV'),benchmarkRf:byType('weight','RF'),portfolioRf:byType('portfolioWeight','RF'),benchmarkOther:byType('weight','Otros'),portfolioOther:byType('portfolioWeight','Otros'),band,neutral:band?(band[0]+band[1])/2:NaN,unknown:rows.filter(row=>row.assetType==='Otros'&&(row.weight>0||row.portfolioWeight>0)).map(row=>row.generic)};
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
    function setShare(positions,index,value){
        if(!positions[index]||!Number.isFinite(value)||value<0||value>100)throw new Error('El peso dentro de la categoria debe estar entre 0% y 100%.');
        if(positions.length===1)return [{...positions[0],share:100}];
        const remainder=100-value,others=positions.reduce((sum,item,i)=>sum+(i===index?0:Math.max(0,item.share||0)),0);
        return positions.map((item,i)=>({...item,share:i===index?value:others>0?remainder*Math.max(0,item.share||0)/others:remainder/(positions.length-1)}));
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
    return {key,parseGrid,rank,fullRank,equalPositions,normalizePositions,setShare,benchmarkIndex,trackingError,profile,assetType,allocation,bands};
});
