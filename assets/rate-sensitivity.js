(function(root,factory){
    const core=factory();
    if(typeof module==='object'&&module.exports)module.exports=core;
    else root.RateSensitivity=core;
})(globalThis,function(){
    const DAY=86400000;
    const monthKey=date=>`${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}`;
    function shiftKey(key,months){
        const [year,month]=key.split('-').map(Number);
        return monthKey(new Date(Date.UTC(year,month-1+months,1)));
    }
    function scenario({amount,rfWeightPct,duration,changeBps}){
        if(![amount,rfWeightPct,duration,changeBps].every(Number.isFinite)||amount<0||rfWeightPct<0||rfWeightPct>100||duration<0||duration>100)throw new Error('Revisa importe, peso de RF, duración y cambio de tipos.');
        const rfAmount=amount*rfWeightPct/100,rfReturn=-duration*changeBps/10000;
        const change=rfAmount*rfReturn;
        return {changeBps,rfAmount,rfReturn,change,portfolioReturn:amount>0?change/amount:0,portfolioValue:amount+change};
    }
    const bpsToDecimal=bps=>bps/10000;
    function combinedScenario({amount,rfWeightPct,rateDuration,spreadDuration,rateBps,spreadBps,ytmPct=0,horizonMonths=0,includeCarry=false}){
        if(![amount,rfWeightPct,rateDuration,rateBps,spreadBps].every(Number.isFinite)||amount<=0||rfWeightPct<0||rfWeightPct>100||rateDuration<0||rateDuration>100||Math.abs(rateBps)>2000||Math.abs(spreadBps)>2000)throw new Error('Revisa importe, peso de RF, duración y shocks en pb.');
        if(spreadBps!==0&&(!Number.isFinite(spreadDuration)||spreadDuration<0||spreadDuration>100))throw new Error('Indica spread duration para calcular un shock de crédito; no se sustituye por la duración de tipos.');
        if(includeCarry&&(!Number.isFinite(ytmPct)||!Number.isFinite(horizonMonths)||horizonMonths<=0||horizonMonths>120))throw new Error('Para incluir carry, indica YTM anual y horizonte válido en meses.');
        const rfAmount=amount*rfWeightPct/100;
        const rates=-rateDuration*bpsToDecimal(rateBps);
        const credit=spreadBps===0?0:-spreadDuration*bpsToDecimal(spreadBps);
        const carry=includeCarry?ytmPct/100*horizonMonths/12:0;
        const rfReturn=rates+credit+carry;
        return {rfAmount,rates,credit,carry,rfReturn,portfolioReturn:rfReturn*rfWeightPct/100,rateAmount:rfAmount*rates,creditAmount:rfAmount*credit,carryAmount:rfAmount*carry,change:rfAmount*rfReturn,portfolioValue:amount+rfAmount*rfReturn};
    }
    function weightedPositions(positions,amount){
        if(!Number.isFinite(amount)||amount<=0)throw new Error('El importe total debe ser positivo.');
        const included=(positions||[]).filter(row=>Number.isFinite(row.value)&&row.value>0);
        const rfAmount=included.reduce((sum,row)=>sum+row.value,0);
        if(rfAmount>amount+0.01)throw new Error('El valor de renta fija supera el importe total.');
        const metric=key=>included.every(row=>Number.isFinite(row[key]))&&rfAmount>0?included.reduce((sum,row)=>sum+row.value*row[key],0)/rfAmount:NaN;
        return {rfAmount,rfWeightPct:rfAmount/amount*100,rateDuration:metric('rateDuration'),spreadDuration:metric('spreadDuration'),ytmPct:metric('ytmPct'),missing:included.filter(row=>!Number.isFinite(row.rateDuration)||!Number.isFinite(row.spreadDuration))};
    }
    function series(points,positive){
        return (points||[]).filter(point=>point&&Number.isFinite(+new Date(point.date))&&Number.isFinite(point.price)&&(!positive||point.price>0))
            .map(point=>({date:new Date(point.date),price:point.price})).sort((a,b)=>a.date-b.date);
    }
    function rateMaxAge(points){
        const gaps=points.slice(1,Math.min(points.length,101)).map((point,i)=>(point.date-points[i].date)/DAY).filter(gap=>gap>0).sort((a,b)=>a-b);
        const median=gaps[Math.floor(gaps.length/2)]||1;
        return median<=7?10:median<=45?45:110;
    }
    function asOf(points,date,maxAge){
        let low=0,high=points.length-1,index=-1;
        while(low<=high){const middle=(low+high)>>1;if(points[middle].date<=date){index=middle;low=middle+1;}else high=middle-1;}
        return index>=0&&(date-points[index].date)/DAY<=maxAge?points[index].price:null;
    }
    function forwardPairs(assetData,ratesData,horizonMonths,lookbackMonths=12){
        const assets=series(assetData,true),rates=series(ratesData,false);
        if(!Number.isInteger(horizonMonths)||horizonMonths<1||horizonMonths>120||assets.length<3||rates.length<3)return [];
        const monthly=new Map();assets.forEach(point=>monthly.set(monthKey(point.date),point));
        const maxAge=rateMaxAge(rates),out=[];
        for(const [key,asset] of monthly){
            const future=monthly.get(shiftKey(key,horizonMonths));
            if(!future||future.date<=asset.date)continue;
            const [year,month]=shiftKey(key,-lookbackMonths).split('-').map(Number);
            const priorDate=new Date(Date.UTC(year,month,0));
            const rateLevel=asOf(rates,asset.date,maxAge),priorRate=asOf(rates,priorDate,maxAge);
            if(!Number.isFinite(rateLevel)||!Number.isFinite(priorRate))continue;
            out.push({date:asset.date,rateLevel,rateChange:rateLevel-priorRate,forwardRet:future.price/asset.price-1});
        }
        return out;
    }
    function summarize(pairs,predicate){
        const values=pairs.filter(predicate).map(pair=>pair.forwardRet).filter(Number.isFinite);
        if(!values.length)return {n:0,mean:NaN,min:NaN,max:NaN,median:NaN,sd:NaN,winRate:NaN};
        const sorted=[...values].sort((a,b)=>a-b),n=values.length,mean=values.reduce((sum,value)=>sum+value,0)/n;
        const variance=n>1?values.reduce((sum,value)=>sum+(value-mean)**2,0)/(n-1):NaN;
        return {n,mean,min:sorted[0],max:sorted.at(-1),median:n%2?sorted[(n-1)/2]:(sorted[n/2-1]+sorted[n/2])/2,sd:Number.isFinite(variance)?Math.sqrt(variance):NaN,winRate:values.filter(value=>value>0).length/n};
    }
    return {scenario,combinedScenario,weightedPositions,bpsToDecimal,forwardPairs,summarize};
});
