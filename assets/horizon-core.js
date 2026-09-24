(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.HorizonCore=factory();})(globalThis,function(){
    const periodsPerYear={D:252,C:365,W:52,M:12,Q:4,A:1};
    function windows(series,periods,frequency='M'){
        const annual=periodsPerYear[frequency]||252;
        if(!Number.isInteger(periods)||periods<1)throw new Error('Plazo no válido.');
        const samples=[];
        const invalid=[0];for(const p of series)invalid.push(invalid[invalid.length-1]+(Number.isFinite(p.price)&&p.price>0?0:1));
        for(let end=periods;end<series.length;end++){
            const start=end-periods;
            if(invalid[end+1]!==invalid[start])continue;
            const total=series[end].price/series[start].price-1;
            samples.push({start,end,date:series[end].date,total,annualized:Math.pow(1+total,annual/periods)-1});
        }
        return samples;
    }
    function summary(samples,field){
        const values=samples.map(s=>s[field]).filter(Number.isFinite);
        return {count:values.length,mean:values.length?values.reduce((s,v)=>s+v,0)/values.length:NaN,min:values.length?values.reduce((a,b)=>Math.min(a,b),Infinity):NaN,max:values.length?values.reduce((a,b)=>Math.max(a,b),-Infinity):NaN};
    }
    function horizon(series,months,frequency='M'){
        const annual=periodsPerYear[frequency]||252,raw=months*annual/12;
        if(raw<1)return null;
        const periods=Math.round(raw),samples=windows(series,periods,frequency),total=summary(samples,'total'),ann=summary(samples,'annualized');
        return {periods,periodsPerYear:annual,samples,count:total.count,meanTot:total.mean,minTot:total.min,maxTot:total.max,meanAnn:periods<annual?total.mean:ann.mean,minAnn:periods<annual?total.min:ann.min,maxAnn:periods<annual?total.max:ann.max};
    }
    function fromReturns(returns){let price=100;return [{price,date:0},...returns.map((r,i)=>({date:i+1,price:price*=Number.isFinite(r)&&r>=-1?1+r:NaN}))];}
    return {periodsPerYear,windows,summary,horizon,fromReturns};
});
