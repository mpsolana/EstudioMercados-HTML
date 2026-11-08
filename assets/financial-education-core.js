const FinancialEducationCore=(()=>{
    const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
    function diversification({count,volatility,correlation}){
        const n=Math.floor(count),sigma=volatility/100,rho=correlation;
        if(n<1||n>100||sigma<0||rho<0||rho>1)throw new Error('Introduce entre 1 y 100 activos, volatilidad positiva y correlación entre 0 y 1.');
        return Array.from({length:n},(_,i)=>({count:i+1,risk:100*sigma*Math.sqrt(rho+(1-rho)/(i+1))}));
    }
    function irr(flows){
        if(flows.length<2||!flows.some(x=>x<0)||!flows.some(x=>x>0))return null;
        const npv=rate=>flows.reduce((sum,flow,t)=>sum+flow/Math.pow(1+rate,t),0);
        let low=-.9999,high=1;
        while(npv(high)>0&&high<1e6)high=high*2+1;
        if(npv(low)*npv(high)>0)return null;
        for(let i=0;i<180;i++){const middle=(low+high)/2;if(npv(low)*npv(middle)>0)low=middle;else high=middle;}
        return (low+high)/2;
    }
    function simulate({capital,basis=capital,years,annualReturn,fee=0,dividendYield=0,realizedFraction=0,taxRate,transition=false}){
        if(![capital,basis,years,annualReturn,fee,dividendYield,realizedFraction,taxRate].every(Number.isFinite)||capital<=0||basis<0||years<1||years>60||fee<0||fee>=1||taxRate<0||taxRate>1||realizedFraction<0||realizedFraction>1||dividendYield<0||annualReturn-dividendYield-fee<=-1)throw new Error('Revisa capital, coste fiscal, horizonte, rendimientos y porcentajes.');
        let value=capital,costBasis=basis,annualTax=0,initialTax=0;
        if(transition){initialTax=Math.max(0,capital-basis)*taxRate;value-=initialTax;costBasis=value;}
        const rows=[{year:0,value,basis:costBasis,tax:initialTax}];
        for(let year=1;year<=years;year++){
            const start=value,startBasis=costBasis;
            const priceGain=start*(annualReturn-dividendYield-fee);
            const grossBeforeDividend=start+priceGain;
            const dividend=start*dividendYield;
            const dividendTax=Math.max(0,dividend)*taxRate;
            const dividendNet=dividend-dividendTax;
            value=grossBeforeDividend+dividendNet;
            costBasis=startBasis+dividendNet;
            const sold=value*realizedFraction;
            const basisSold=costBasis*realizedFraction;
            const saleTax=Math.max(0,sold-basisSold)*taxRate;
            value-=saleTax;
            costBasis=costBasis-basisSold+sold-saleTax;
            const tax=dividendTax+saleTax;annualTax+=tax;
            rows.push({year,value,basis:costBasis,tax});
        }
        const exitTax=Math.max(0,value-costBasis)*taxRate;
        return {rows,grossFinal:value,netFinal:value-exitTax,exitTax,annualTax,initialTax,totalTax:initialTax+annualTax+exitTax};
    }
    function comparison(input){
        const common={capital:input.capital,basis:input.basis,years:input.years,annualReturn:input.annualReturn,taxRate:input.taxRate};
        return {
            fund:simulate({...common,fee:input.fundFee,dividendYield:0,realizedFraction:0,transition:Boolean(input.transition)}),
            taxable:simulate({...common,fee:input.taxableFee,dividendYield:input.dividendYield,realizedFraction:input.realizedFraction}),
        };
    }
    return {diversification,irr,simulate,comparison,clamp};
})();
if(typeof module!=='undefined')module.exports=FinancialEducationCore;
else globalThis.FinancialEducationCore=FinancialEducationCore;
