(function(root){
    const valid=value=>typeof value==='number'&&Number.isFinite(value);
    const month=value=>{const date=value instanceof Date?value:new Date(value);return Number.isFinite(+date)?`${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}`:'';};
    function monthEnds(series){const out=new Map();for(const point of [...(series||[])].filter(Boolean).sort((a,b)=>+new Date(a.date)-+new Date(b.date))){const key=month(point.date);if(key&&valid(point.price)&&point.price>0)out.set(key,point.price);}return out;}
    function holdings(snapshot){return (snapshot||[]).flatMap(row=>{
        const funds=(row.funds||[]).filter(item=>item.isin),shares=funds.map(item=>valid(item.share)?item.share:100/funds.length),total=shares.reduce((sum,value)=>sum+value,0);
        return funds.map((fund,i)=>({id:String(fund.isin).toUpperCase(),name:fund.name||fund.isin,category:row.category||'',type:row.type||'',currency:fund.currency||'',weight:row.weight/100*(total>0?shares[i]/total:0)}));
    });}
    function portfolio(snapshot,series){
        const items=holdings(snapshot),weight=items.reduce((sum,item)=>sum+item.weight,0);
        if(!items.length||Math.abs(weight-1)>.001)return {reason:'La cartera debe tener fondos identificados y pesos completos al 100%.'};
        const maps=items.map(item=>monthEnds(series?.[item.id]?.data||series?.[item.id]));
        const missing=items.filter((_,i)=>maps[i].size<13).map(item=>item.id);
        if(missing.length)return {reason:`Histórico mensual insuficiente de ${missing.join(', ')}.`};
        const common=[...maps[0].keys()].filter(key=>maps.every(map=>map.has(key))).sort();
        let dates=[],run=[];for(const date of common){const previous=run.at(-1);if(previous){const [y,m]=previous.split('-').map(Number),[ny,nm]=date.split('-').map(Number);if((ny*12+nm)-(y*12+m)!==1)run=[];}run.push(date);if(run.length>dates.length)dates=[...run];}
        if(dates.length<13)return {reason:'Menos de doce retornos mensuales comunes para toda la cartera.'};
        const values=[100],returns=[];
        for(let i=1;i<dates.length;i++){
            const change=items.reduce((sum,item,j)=>sum+item.weight*(maps[j].get(dates[i])/maps[j].get(dates[i-1])-1),0);
            returns.push(change);values.push(values.at(-1)*(1+change));
        }
        return {dates,values,returns,items,currency:[...new Set(items.map(item=>item.currency).filter(Boolean))]};
    }
    function periods(returns){
        const horizons=[1,3,6,12,36,60,120,180],labels=['1 mes','3 meses','6 meses','1 año','3 años','5 años','10 años','15 años'];
        return horizons.map((months,i)=>{
            const rolling=root.RollingCore||(typeof require==='function'?require('./rolling-core.js'):null);
            const samples=months<=returns.length&&rolling?rolling.compounded(returns,months).filter(valid):[];
            if(!samples.length)return {months,label:labels[i],count:0};
            const values=samples.map(value=>months>=12?(1+value)**(12/months)-1:value);
            return {months,label:labels[i],count:values.length,min:Math.min(...values),max:Math.max(...values),mean:values.reduce((sum,value)=>sum+value,0)/values.length,positive:values.filter(value=>value>0).length/values.length,annualized:months>=12};
        });
    }
    function metrics(values,returns){
        if(!values?.length||!returns?.length)return null;
        const total=values.at(-1)/values[0]-1,mean=returns.reduce((sum,value)=>sum+value,0)/returns.length;
        const variance=returns.reduce((sum,value)=>sum+(value-mean)**2,0)/Math.max(1,returns.length-1);
        let peak=values[0],drawdown=0;for(const value of values){peak=Math.max(peak,value);drawdown=Math.min(drawdown,value/peak-1);}
        return {total,cagr:(1+total)**(12/returns.length)-1,volatility:Math.sqrt(variance*12),drawdown,months:returns.length};
    }
    function allocation(snapshot){const groups=new Map();for(const row of snapshot||[]){const category=row.category||'Sin categoría';groups.set(category,(groups.get(category)||0)+Number(row.weight||0));}return [...groups].map(([category,weight])=>({category,weight}));}
    const api={monthEnds,holdings,portfolio,periods,metrics,allocation};
    if(typeof module==='object'&&module.exports)module.exports=api;
    else root.FinancialPlanningAnalytics=api;
})(globalThis);
