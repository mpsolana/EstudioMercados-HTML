(function(root,factory){
    const core=factory(root.FinanceCore||require('./finance-core.js'));
    if(typeof module==='object'&&module.exports)module.exports=core;
    else root.ModelPortfolioCore=core;
})(globalThis,function(finance){
    const key=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,' ');
    const number=value=>{if(typeof value==='number')return value;if(value===null||value===undefined||value==='')return NaN;return Number(String(value).trim().replace('%','').replace(',','.'));};
    function parseGrid(grid){
        if(!Array.isArray(grid)||grid.length<2)throw new Error('La hoja Carteras Modelo no contiene categorias y pesos.');
        const header=grid[0]||[],names=header.slice(2).map(v=>String(v||'').trim());
        if(!names.some(Boolean))throw new Error('Faltan nombres de carteras modelo a partir de la columna C.');
        const rows=grid.slice(1).map((cells,index)=>({id:index,generic:String(cells?.[0]||'').trim(),subcategories:String(cells?.[1]||'').split(';').map(v=>v.trim()).filter(Boolean),raw:names.map((_,i)=>number(cells?.[i+2]))})).filter(row=>row.generic&&row.subcategories.length&&row.raw.some(v=>Number.isFinite(v)&&v>0));
        if(!rows.length)throw new Error('No hay filas validas con categoria, subcategoria y pesos.');
        const models=names.map((name,i)=>{
            if(!name)return null;
            const total=rows.reduce((sum,row)=>sum+(Number.isFinite(row.raw[i])&&row.raw[i]>0?row.raw[i]:0),0),scale=total<=1.5?100:1;
            return {name,rows:rows.filter(row=>row.raw[i]>0).map(row=>({id:row.id,generic:row.generic,subcategories:row.subcategories,weight:row.raw[i]*scale,selectedIsin:'',ticker:''})),total:total*scale};
        }).filter(model=>model&&model.rows.length);
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
        const pairs=selections.map(row=>({weight:row.weight,fund:monthlyPrices(fundSeries[row.selectedIsin]||fundSeries[row.ticker]),bench:monthlyPrices(benchmarkSeries[row.benchmark]?.data||benchmarkSeries[row.benchmark])}));
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
    return {key,parseGrid,rank,benchmarkIndex,trackingError};
});
