(function(root,factory){
    const api=factory(root.FinanceCore||require('./finance-core.js'),root.MultiAssetCompare||require('./multi-asset-compare.js'));
    if(typeof module==='object'&&module.exports)module.exports=api;
    else root.PortfolioCompareCore=api;
})(globalThis,function(finance,compare){
    function build(models,settings={rebalance:'monthly',costBps:0}){
        if(!Array.isArray(models)||!models.length||models.length>20)throw new Error('Selecciona entre 1 y 20 carteras.');
        if(!['period','monthly','hold'].includes(settings.rebalance)||!Number.isFinite(settings.costBps)||settings.costBps<0)throw new Error('Hipotesis de rebalanceo o coste no validas.');
        const prepared=models.map((model,index)=>{
            if(model.direct){finance.validateSeries(model.direct,model.name);return {model,index,direct:model.direct};}
            if((model.entries||[]).some(entry=>!Number.isFinite(entry.weight)||entry.weight<0))throw new Error(`${model.name}: los pesos deben ser no negativos.`);
            const entries=finance.normalizeWeights((model.entries||[]).filter(entry=>entry.weight>0));
            const sources=entries.map(entry=>{
                const series=model.series?.[entry.ticker];
                if(!series)throw new Error(`${model.name}: falta historico de ${entry.ticker}.`);
                finance.validateSeries(series,entry.ticker);
                return {ticker:entry.ticker,series};
            });
            return {model,index,entries,sources};
        });
        const sources=prepared.flatMap(item=>item.direct?[{key:`${item.index}:direct`,series:item.direct}]:item.sources.map(source=>({key:`${item.index}:${source.ticker}`,series:source.series})));
        const aligned=compare.commonSeries(sources.map(source=>({ticker:source.key,data:source.series})),'ALL',sources.length);
        const dates=aligned.rows.map(row=>row.date.toISOString().slice(0,10));
        const output=prepared.map(item=>{
            if(item.direct){const index=sources.findIndex(source=>source.key===`${item.index}:direct`);return {ticker:item.model.name,data:aligned.rows.map(row=>({date:row.date,price:row.prices[index]}))};}
            const returns={};
            item.sources.forEach(source=>{
                const index=sources.findIndex(value=>value.key===`${item.index}:${source.ticker}`);
                const prices=aligned.rows.map(row=>row.prices[index]);
                returns[source.ticker]=prices.slice(1).map((price,i)=>price/prices[i]-1);
            });
            const periods=finance.portfolioPath(item.entries,dates,returns,settings),values=[100];
            periods.forEach(value=>values.push(values.at(-1)*(1+value)));
            return {ticker:item.model.name,data:aligned.rows.map((row,i)=>({date:row.date,price:values[i]}))};
        });
        return {assets:output,dates,from:dates[0],to:dates.at(-1),frequency:aligned.frequency};
    }
    return {build};
});
