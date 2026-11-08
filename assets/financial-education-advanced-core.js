const FinancialEducationAdvancedCore=(()=>{
    const finite=(...values)=>values.every(Number.isFinite);
    const validRate=rate=>Number.isFinite(rate)&&rate>-1;
    function npv(flows,discountRate){
        if(!Array.isArray(flows)||!flows.length||!validRate(discountRate)||!flows.every(Number.isFinite))throw new Error('Flujos o tasa de descuento inválidos.');
        return flows.reduce((sum,flow,year)=>sum+flow/(1+discountRate)**year,0);
    }
    function growth({capital,monthly,annualReturn,years}){
        if(!finite(capital,monthly,annualReturn,years)||capital<0||monthly<0||!validRate(annualReturn)||years<1||years>60||!Number.isInteger(years))throw new Error('Revisa capital, aportaciones, rentabilidad y horizonte.');
        const monthlyRate=(1+annualReturn)**(1/12)-1,rows=[{year:0,value:capital,principal:capital,interest:0,contribution:0}],monthlyRows=[];
        let value=capital,principal=capital,crossoverMonth=null;
        for(let year=1;year<=years;year++){
            let interest=0;
            for(let month=0;month<12;month++){
                const gain=value*monthlyRate,number=(year-1)*12+month+1;
                if(crossoverMonth===null&&gain>monthly)crossoverMonth=number;
                monthlyRows.push({month:number,interest:gain,contribution:monthly});
                interest+=gain;value+=gain+monthly;principal+=monthly;
            }
            rows.push({year,value,principal,interest,contribution:monthly*12});
        }
        return {rows,monthlyRows,crossoverMonth,crossover:crossoverMonth===null?null:Math.ceil(crossoverMonth/12)};
    }
    function feeDrag({capital,monthly,annualReturn,years,feeHigh,feeLow}){
        if(!finite(feeHigh,feeLow)||feeHigh<0||feeLow<0||feeHigh>=1||feeLow>=1)throw new Error('Comisiones fuera de rango.');
        const base={capital,monthly,annualReturn,years};
        growth(base);
        const gross=(1+annualReturn)**(1/12),run=fee=>{
            let value=capital;const rows=[value],feeFactor=(1-fee)**(1/12);
            for(let year=1;year<=years;year++){for(let month=0;month<12;month++)value=value*gross*feeFactor+monthly;rows.push(value);}
            return rows;
        };
        return {high:run(feeHigh),low:run(feeLow)};
    }
    function assetMix({horizon,panic}){
        if(!finite(horizon,panic)||horizon<0||horizon>40||panic<0||panic>100)throw new Error('Revisa horizonte y tolerancia a caídas.');
        const capacity=.5*horizon/40+.5*(100-panic)/100;
        const equity=15+65*capacity,gold=8,cash=15-10*capacity;
        return {equity,bonds:100-equity-gold-cash,gold,cash,capacity};
    }
    function fire({monthlyExpenses,currentCapital,withdrawalRate}){
        if(!finite(monthlyExpenses,currentCapital,withdrawalRate)||monthlyExpenses<=0||currentCapital<0||withdrawalRate<=0||withdrawalRate>1)throw new Error('Revisa gastos, capital y tasa de retirada.');
        const target=monthlyExpenses*12/withdrawalRate;
        return {target,progress:currentCapital/target,annualWithdrawal:monthlyExpenses*12};
    }
    function emergency({cash,monthlyEssentials,targetMonths}){
        if(!finite(cash,monthlyEssentials,targetMonths)||cash<0||monthlyEssentials<=0||targetMonths<=0||targetMonths>36)throw new Error('Revisa efectivo, gastos esenciales y objetivo.');
        return {months:cash/monthlyEssentials,target:monthlyEssentials*targetMonths,progress:cash/(monthlyEssentials*targetMonths)};
    }
    function monteCarlo({capital,monthly,annualReturn,volatility,years,target,paths=600,seed=20261108}){
        growth({capital,monthly,annualReturn,years});
        if(!finite(volatility,target,paths)||volatility<0||volatility>2||target<0||paths<100||paths>3000||!Number.isInteger(paths))throw new Error('Revisa volatilidad, meta y número de simulaciones.');
        let state=seed>>>0;
        const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return (state+.5)/4294967296;};
        const normal=()=>Math.sqrt(-2*Math.log(random()))*Math.cos(2*Math.PI*random());
        const sigma=volatility/Math.sqrt(12),mu=Math.log(1+annualReturn)/12-sigma*sigma/2;
        const byYear=Array.from({length:years+1},()=>[]),finals=[];
        for(let path=0;path<paths;path++){
            let value=capital;byYear[0].push(value);
            for(let year=1;year<=years;year++){
                for(let month=0;month<12;month++)value=value*Math.exp(mu+sigma*normal())+monthly;
                byYear[year].push(value);
            }
            finals.push(value);
        }
        const quantile=(sorted,p)=>{const position=(sorted.length-1)*p,low=Math.floor(position),weight=position-low;return sorted[low]*(1-weight)+sorted[Math.min(low+1,sorted.length-1)]*weight;};
        const rows=byYear.map((values,year)=>{values.sort((a,b)=>a-b);return {year,p10:quantile(values,.1),p50:quantile(values,.5),p90:quantile(values,.9)};});
        return {rows,probability:finals.filter(value=>value>=target).length/paths,paths};
    }
    function rentBuy({price,rent,downPaymentRate,entryCostRate,saleCostRate,mortgageRate,mortgageYears,maintenanceRate,annualTax,homeGrowth,rentGrowth,investmentReturn,years}){
        if(!finite(price,rent,downPaymentRate,entryCostRate,saleCostRate,mortgageRate,mortgageYears,maintenanceRate,annualTax,homeGrowth,rentGrowth,investmentReturn,years)||price<=0||rent<0||years<1||years>50||!Number.isInteger(years)||mortgageYears<1||mortgageYears>50||downPaymentRate<0||downPaymentRate>=1||entryCostRate<0||saleCostRate<0||saleCostRate>=1||mortgageRate<0||maintenanceRate<0||annualTax<0||!validRate(homeGrowth)||!validRate(rentGrowth)||!validRate(investmentReturn))throw new Error('Revisa precio, gastos, tipos y horizontes.');
        const loan=price*(1-downPaymentRate),n=mortgageYears*12,r=mortgageRate/12;
        const payment=r?loan*r/(1-(1+r)**(-n)):loan/n;
        let mortgage=loan,home=price,monthlyRent=rent,ownerInvest=0,renterInvest=price*(downPaymentRate+entryCostRate);
        const investFactor=(1+investmentReturn)**(1/12),homeFactor=(1+homeGrowth)**(1/12),rentFactor=(1+rentGrowth)**(1/12);
        const rows=[{year:0,owner:price*downPaymentRate-price*saleCostRate,renter:renterInvest,mortgage,home}];
        for(let year=1;year<=years;year++){
            for(let month=0;month<12;month++){
                ownerInvest*=investFactor;renterInvest*=investFactor;home*=homeFactor;monthlyRent*=rentFactor;
                let mortgagePayment=0;
                if(mortgage>0){const interest=mortgage*r,mortgageDue=Math.min(payment,mortgage+interest);mortgage=Math.max(0,mortgage+interest-mortgageDue);mortgagePayment=mortgageDue;}
                const ownerCost=mortgagePayment+home*maintenanceRate/12+annualTax/12;
                if(ownerCost>monthlyRent)renterInvest+=ownerCost-monthlyRent;
                else ownerInvest+=monthlyRent-ownerCost;
            }
            rows.push({year,owner:home*(1-saleCostRate)-mortgage+ownerInvest,renter:renterInvest,mortgage,home});
        }
        const crossover=rows.find(row=>row.year>0&&row.owner>=row.renter)?.year??null;
        return {rows,crossover,payment};
    }
    function procrastination({startAge,laterAge,retirementAge,monthly,annualReturn}){
        if(!finite(startAge,laterAge,retirementAge)||startAge<0||laterAge<=startAge||retirementAge<=laterAge||retirementAge>100)throw new Error('Revisa las edades de inicio y retiro.');
        const monthlyRate=(1+annualReturn)**(1/12)-1;
        if(!validRate(annualReturn)||monthly<0)throw new Error('Revisa aportación y rentabilidad.');
        let early=0,late=0,earlyPaid=0,latePaid=0;
        const rows=[];
        for(let age=startAge;age<=retirementAge;age++){
            rows.push({age,early,late,earlyPaid,latePaid});
            if(age===retirementAge)break;
            for(let month=0;month<12;month++){
                early=early*(1+monthlyRate)+monthly;earlyPaid+=monthly;
                if(age>=laterAge){late=late*(1+monthlyRate)+monthly;latePaid+=monthly;}
            }
        }
        return rows;
    }
    function debtPlan({debts,monthlyBudget,method}){
        if(!Array.isArray(debts)||debts.length<2||debts.length>3||!finite(monthlyBudget)||monthlyBudget<=0||!['avalanche','snowball'].includes(method)||debts.some(debt=>!finite(debt.balance,debt.apr,debt.minimum)||debt.balance<=0||debt.apr<0||debt.apr>1||debt.minimum<=0))throw new Error('Introduce 2 o 3 deudas válidas y una cuota mensual.');
        if(monthlyBudget+1e-6<debts.reduce((sum,debt)=>sum+debt.minimum,0))throw new Error('La cuota total no cubre los pagos mínimos.');
        const state=debts.map((debt,index)=>({...debt,index,remaining:debt.balance,paidMonth:null})),rows=[{month:0,remaining:state.reduce((sum,debt)=>sum+debt.remaining,0),interest:0}];
        let totalInterest=0;
        for(let month=1;month<=600;month++){
            let available=monthlyBudget;
            for(const debt of state){if(debt.remaining<=0)continue;const interest=debt.remaining*((1+debt.apr)**(1/12)-1);debt.remaining+=interest;totalInterest+=interest;}
            for(const debt of state){if(debt.remaining<=0)continue;const payment=Math.min(debt.remaining,debt.minimum);debt.remaining-=payment;available-=payment;if(debt.remaining<1e-7&&debt.paidMonth===null)debt.paidMonth=month;}
            const sorted=state.filter(debt=>debt.remaining>1e-7).sort((a,b)=>method==='avalanche'?b.apr-a.apr||a.index-b.index:a.remaining-b.remaining||a.index-b.index);
            for(const debt of sorted){if(available<=1e-7)break;const payment=Math.min(debt.remaining,available);debt.remaining-=payment;available-=payment;if(debt.remaining<1e-7&&debt.paidMonth===null)debt.paidMonth=month;}
            const remaining=state.reduce((sum,debt)=>sum+Math.max(0,debt.remaining),0);
            rows.push({month,remaining,interest:totalInterest});
            if(remaining<1e-6)return {months:month,totalInterest,firstPayoff:Math.min(...state.map(debt=>debt.paidMonth)),rows,debts:state};
        }
        throw new Error('El presupuesto no amortiza todas las deudas en 50 años.');
    }
    return {npv,growth,feeDrag,assetMix,fire,emergency,monteCarlo,rentBuy,procrastination,debtPlan};
})();
if(typeof module!=='undefined')module.exports=FinancialEducationAdvancedCore;
else globalThis.FinancialEducationAdvancedCore=FinancialEducationAdvancedCore;
