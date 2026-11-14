(function(root){
    const finite=value=>typeof value==='number'&&Number.isFinite(value);
    function validate(plan){
        const errors=[];
        if(!finite(plan.investableAssets)||plan.investableAssets<0)errors.push('Indica patrimonio financiero invertible no negativo.');
        if(!finite(plan.age)||plan.age<18||plan.age>100)errors.push('Indica la edad actual (18–100).');
        if(!finite(plan.retirementAge)||plan.retirementAge<=plan.age||plan.retirementAge>105)errors.push('La edad de jubilación debe superar la edad actual.');
        if(!finite(plan.horizonAge)||plan.horizonAge<=plan.retirementAge||plan.horizonAge>110)errors.push('El horizonte debe superar la jubilación y no exceder 110 años.');
        for(const field of ['netLaborIncome','netOtherIncome','netPension','annualSpending'])if(!finite(plan[field])||plan[field]<0)errors.push(`Revisa ${field}: importe anual neto no negativo.`);
        if(!finite(plan.inflationPct)||plan.inflationPct<0||plan.inflationPct>20)errors.push('Inflación fuera de 0–20%.');
        for(const field of ['returnPct','retirementReturnPct'])if(!finite(plan[field])||plan[field]<=-100||plan[field]>40)errors.push(`${field}: rentabilidad neta esperada fuera de rango.`);
        for(const field of ['riskPct','retirementRiskPct'])if(!finite(plan[field])||plan[field]<0||plan[field]>60)errors.push(`${field}: volatilidad esperada fuera de rango.`);
        const years=(plan.horizonAge||0)-(plan.age||0);
        if(!Array.isArray(plan.goals))errors.push('Lista de objetivos no válida.');
        else for(const [i,goal] of plan.goals.entries())if(!goal.name||!['contribution','withdrawal'].includes(goal.type)||!['monthly','annual','once'].includes(goal.frequency)||!finite(goal.amount)||goal.amount<=0||!Number.isInteger(goal.startYear)||goal.startYear<1||goal.startYear>years||!Number.isInteger(goal.endYear)||goal.endYear<goal.startYear||goal.endYear>years)errors.push(`Objetivo ${i+1}: revisa nombre, tipo, importe, frecuencia y años.`);
        return errors;
    }
    function rand(seed){let x=(seed>>>0)||1;return()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return(x>>>0)/4294967296;};}
    function normal(random){const u=Math.max(1e-12,random()),v=random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
    function percentile(values,p){const sorted=[...values].sort((a,b)=>a-b),index=(sorted.length-1)*p,low=Math.floor(index),high=Math.ceil(index);return sorted[low]+(sorted[high]-sorted[low])*(index-low);}
    function goalFlow(goal,month,inflation){
        const year=Math.ceil(month/12);if(year<goal.startYear||year>goal.endYear)return 0;
        if(goal.frequency==='annual'&&month%12!==0)return 0;
        if(goal.frequency==='once'&&month!==goal.startYear*12)return 0;
        const nominal=goal.amount*(goal.indexed?(1+inflation)**(month/12):1);
        return (goal.type==='withdrawal'?-1:1)*nominal;
    }
    function monthlyParams(annualMean,annualVol){
        const mean=annualMean/100,sd=annualVol/100;
        const variance=Math.log(1+(sd/(1+mean))**2);
        return {mu:(Math.log(1+mean)-variance/2)/12,sigma:Math.sqrt(variance/12)};
    }
    function project(plan,{paths=2000,seed=20261114}={}){
        const errors=validate(plan);if(errors.length)throw new Error(errors.join(' '));
        if(!Number.isInteger(paths)||paths<1||paths>10000)throw new Error('Número de simulaciones no válido.');
        const years=plan.horizonAge-plan.age,months=years*12,random=rand(seed),inflation=plan.inflationPct/100;
        const balances=Array.from({length:years+1},()=>[]),survivors=Array(years+1).fill(0),deterministic=[];
        let success=0,yearly=[];
        for(let path=0;path<=paths;path++){
            const baseline=path===paths;
            let balance=plan.investableAssets,alive=true;
            const annual=[balance],annualAlive=[true];
            const annualFlows=baseline?Array.from({length:years},(_,index)=>({year:index+1,age:plan.age+index+1,opening:0,income:0,spending:0,goals:0,ending:0,shortfall:0})):null;
            for(let month=1;month<=months;month++){
                const age=plan.age+(month-1)/12,retired=age>=plan.retirementAge;
                const glide=Math.max(0,Math.min(1,(age-(plan.retirementAge-5))/5));
                const expected=plan.returnPct+(plan.retirementReturnPct-plan.returnPct)*glide;
                const risk=plan.riskPct+(plan.retirementRiskPct-plan.riskPct)*glide;
                const params=monthlyParams(expected,risk);
                const investment=baseline?(1+expected/100)**(1/12)-1:Math.exp(params.mu+params.sigma*normal(random))-1;
                const price=(1+inflation)**(month/12);
                const income=((retired?plan.netPension:plan.netLaborIncome)+plan.netOtherIncome)*price/12;
                const spending=plan.annualSpending*price/12;
                const goalCash=plan.goals.reduce((sum,goal)=>sum+goalFlow(goal,month,inflation),0);
                const cash=income-spending+goalCash;
                if(baseline){const item=annualFlows[Math.ceil(month/12)-1];if(month%12===1)item.opening=balance;item.income+=income;item.spending+=spending;item.goals+=goalCash;}
                balance=balance*(1+investment)+cash;
                if(balance<0){if(baseline)annualFlows[Math.ceil(month/12)-1].shortfall+=-balance;alive=false;balance=0;}
                if(baseline&&month%12===0)annualFlows[Math.ceil(month/12)-1].ending=balance;
                if(month%12===0){annual.push(balance);annualAlive.push(alive);}
            }
            if(baseline){deterministic.push(...annual);yearly=annualFlows;}
            else{
                if(alive)success++;
                annual.forEach((value,index)=>{balances[index].push(value);if(annualAlive[index])survivors[index]++;});
            }
        }
        const table=balances.map((values,index)=>({year:index,age:plan.age+index,p10:percentile(values,.1),median:percentile(values,.5),p90:percentile(values,.9),survival:survivors[index]/paths,baseline:deterministic[index]}));
        return {paths,seed,success:success/paths,table,yearly};
    }
    function cashSummary(plan){
        const income=plan.netLaborIncome+plan.netOtherIncome;
        return {income,spending:plan.annualSpending,net:income-plan.annualSpending,assets:(plan.investableAssets||0)+(plan.otherFinancialAssets||0)+(plan.nonfinancialAssets||0),liabilities:plan.liabilities||0};
    }
    const api={validate,project,cashSummary,goalFlow,monthlyParams};
    if(typeof module==='object'&&module.exports)module.exports=api;
    else root.FinancialPlanningCore=api;
})(globalThis);
