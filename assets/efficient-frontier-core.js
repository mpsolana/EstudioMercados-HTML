(function(root,factory){
    const api=factory();
    if(typeof module==='object'&&module.exports)module.exports=api;
    else root.EfficientFrontierCore=api;
})(globalThis,function(){
    const key=value=>String(value||'').trim().toUpperCase();
    const month=date=>{const d=new Date(date);return Number.isFinite(+d)?d.getFullYear()*12+d.getMonth():NaN;};
    function monthlyPrices(series){
        const values=new Map();
        for(const point of series?.data||series||[]){
            const m=month(point.date),date=+new Date(point.date),price=Number(point.price);
            if(!Number.isFinite(m)||!Number.isFinite(price)||price<=0)continue;
            const prior=values.get(m);if(!prior||date>prior.date)values.set(m,{date,price});
        }
        return new Map([...values].map(([m,value])=>[m,value.price]));
    }
    function positions(rows,side){
        if(!rows?.length)throw new Error(`Falta la cartera de ${side}.`);
        const total=rows.reduce((sum,row)=>sum+Number(row.weight||0),0);
        if(rows.some(row=>!Number.isFinite(Number(row.weight))||Number(row.weight)<0)||Math.abs(total-100)>.05)throw new Error(`Los pesos de ${side} deben sumar 100%.`);
        return rows.filter(row=>Number(row.weight)>0).map(row=>{
            if(!row.record?.isin)throw new Error(`Hay fondos de ${side} sin identificar.`);
            return {source:key(row.record.originSource?.proxyIsin||row.record.isin),weight:Number(row.weight)/100,name:row.record.name||row.record.isin};
        });
    }
    function buildAssets(origin,proposal,series){
        const byKey=new Map(),available=new Map(Object.entries(series||{}).map(([id,data])=>[key(id),data]));
        for(const [side,rows] of [['origin',origin],['proposal',proposal]])for(const position of rows){
            const item=byKey.get(position.source)||{key:position.source,name:position.name,origin:0,proposal:0};
            item[side]+=position.weight;byKey.set(position.source,item);
        }
        const missing=[...byKey.keys()].filter(id=>!available.has(id));
        if(missing.length)throw new Error(`Faltan históricos en posis/prices para ${missing.join(', ')}. No se estiman correlaciones con retornos o riesgos del ranking.`);
        return [...byKey.values()].map(asset=>({...asset,prices:monthlyPrices(available.get(asset.key))}));
    }
    function commonMonths(assets){
        const all=[...assets[0].prices.keys()].sort((a,b)=>a-b).filter(m=>assets.every(asset=>asset.prices.has(m)));
        let longest=[],run=[];
        for(const m of all){if(run.length&&m!==run.at(-1)+1)run=[];run.push(m);if(run.length>longest.length||run.length===longest.length&&m>longest.at(-1))longest=[...run];}
        if(longest.length<37)throw new Error('Se necesitan al menos 36 rentabilidades mensuales consecutivas comunes para todos los fondos de origen y propuesta.');
        return longest;
    }
    function moments(assets,months,overrides={}){
        const observations=assets.map(asset=>months.slice(1).map((m,i)=>asset.prices.get(m)/asset.prices.get(months[i])-1));
        const averages=observations.map(row=>row.reduce((a,b)=>a+b,0)/row.length);
        const mu=assets.map((asset,i)=>Number.isFinite(overrides[asset.key])?Number(overrides[asset.key])/100:averages[i]*12);
        const cov=observations.map((row,i)=>observations.map((other,j)=>row.reduce((sum,value,t)=>sum+(value-averages[i])*(other[t]-averages[j]),0)/(row.length-1)*12));
        return {mu,cov,historical:averages.map(value=>value*12)};
    }
    function point(weights,mu,cov){
        const value=weights.reduce((sum,w,i)=>sum+w*mu[i],0);
        const variance=weights.reduce((sum,w,i)=>sum+w*weights.reduce((inner,v,j)=>inner+v*cov[i][j],0),0);
        return {ret:value*100,risk:Math.sqrt(Math.max(0,variance))*100,weights};
    }
    function benchmarkPoint(series,months){
        if(!series)return null;const prices=monthlyPrices(series);
        if(months.some(m=>!prices.has(m)))return null;
        const returns=months.slice(1).map((m,i)=>prices.get(m)/prices.get(months[i])-1),mean=returns.reduce((a,b)=>a+b,0)/returns.length;
        const variance=returns.reduce((sum,value)=>sum+(value-mean)**2,0)/(returns.length-1);
        return {ret:mean*1200,risk:Math.sqrt(variance*12)*100};
    }
    function calculate({origin,proposal,series,mode='historical',expected={},maxWeight=100,benchmark,optimizer}){
        const source=positions(origin,'origen'),target=positions(proposal,'propuesta'),assets=buildAssets(source,target,series);
        if(assets.length<2)throw new Error('La frontera requiere al menos dos históricos distintos; origen y propuesta pueden coincidir.');
        if(assets.length>30)throw new Error('Hay más de 30 series distintas. Reduce el universo antes de calcular la frontera.');
        const cap=Number(maxWeight)/100;
        if(!Number.isFinite(cap)||cap<=0||cap>1||cap*assets.length<1-1e-9)throw new Error('El límite por serie no permite invertir el 100% entre las series disponibles.');
        const months=commonMonths(assets),stats=moments(assets,months,mode==='assumptions'?expected:{});
        const lib=optimizer||globalThis.PortfolioAllocation;
        if(!lib?.meanVarianceEfficientFrontierPortfolios)throw new Error('No está disponible el optimizador de carteras.');
        const constraints={maxWeights:assets.map(()=>cap)};
        const raw=lib.meanVarianceEfficientFrontierPortfolios(stats.mu,stats.cov,{nbPortfolios:30,discretizationType:'return',constraints,optimizationMethod:'automatic'});
        const frontier=raw.map(([weights])=>point(weights,stats.mu,stats.cov)).filter(p=>Number.isFinite(p.ret)&&Number.isFinite(p.risk));
        if(frontier.length<2)throw new Error('La matriz de covarianzas no permite construir una frontera estable.');
        const actual=point(assets.map(asset=>asset.origin),stats.mu,stats.cov),proposed=point(assets.map(asset=>asset.proposal),stats.mu,stats.cov);
        const feasible=p=>p.weights.every(w=>w<=cap+1e-6);
        function gap(p){if(!feasible(p))return NaN;try{
            const w=lib.meanVarianceOptimizationWeights(stats.mu,stats.cov,{constraints:{...constraints,maxVolatility:p.risk/100+1e-8},optimizationMethod:'automatic'});
            return Math.max(0,point(w,stats.mu,stats.cov).ret-p.ret);
        }catch{return NaN;}}
        return {assets:assets.map(({prices,...asset},i)=>({...asset,historicalReturn:stats.historical[i]*100,expectedReturn:stats.mu[i]*100})),months,mode,cap,actual:{...actual,feasible:feasible(actual),gap:gap(actual)},proposed:{...proposed,feasible:feasible(proposed),gap:gap(proposed)},frontier,benchmark:benchmarkPoint(benchmark,months)};
    }
    return {calculate,monthlyPrices,commonMonths,moments,point};
});
