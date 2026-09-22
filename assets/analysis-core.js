(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./finance-core.js'));else root.AnalysisCore=factory(root.FinanceCore);})(globalThis,function(finance){
    function classes(record,universe,approvedIsins){
        if(!record || ['proxy','manual'].includes(record.originSource?.mode) || !Number.isFinite(record.ter) || !finance.sameFund(record,record))return {status:'unknown',all:[],approved:[]};
        const peers=universe.filter(r=>finance.sameFund(record,r));
        const all=peers.filter(r=>r.isin!==record.isin&&Number.isFinite(r.ter)&&r.ter<record.ter).sort((a,b)=>a.ter-b.ter||a.isin.localeCompare(b.isin));
        return {status:all.length?'cheaper':peers.some(r=>!Number.isFinite(r.ter))?'unknown':'lowest',all,approved:all.filter(r=>approvedIsins.has(r.isin))};
    }
    function comparison(rows,field){
        const total=rows.reduce((s,r)=>s+Math.max(0,r.weight||0),0);
        const eligible=rows.filter(r=>r.weight>0&&Number.isFinite(r.current?.[field])&&Number.isFinite(r.proposed?.[field])&&(field!=='score'||r.current.category&&r.current.category===r.proposed.category));
        const weight=eligible.reduce((s,r)=>s+r.weight,0);
        const current=weight?eligible.reduce((s,r)=>s+r.weight*r.current[field],0)/weight:NaN;
        const proposed=weight?eligible.reduce((s,r)=>s+r.weight*r.proposed[field],0)/weight:NaN;
        return {current,proposed,delta:proposed-current,coverage:total?weight/total:0};
    }
    function percent(value,format,unit='fraction'){
        if(value===null||value===undefined||String(value).trim()==='')return NaN;
        const raw=String(value).trim(),explicit=raw.includes('%');let text=raw.replace(/%/g,'').replace(/\s/g,'');
        if(text.includes(',')&&text.includes('.'))text=text.lastIndexOf(',')>text.lastIndexOf('.')?text.replace(/\./g,'').replace(',','.'):text.replace(/,/g,'');else text=text.replace(',','.');
        const number=Number(text);return Number.isFinite(number)?number*(explicit?1:(String(format||'').includes('%')||unit==='fraction'?100:1)):NaN;
    }
    function sample(rows,limit){if(rows.length<=limit)return rows;return Array.from({length:limit},(_,i)=>rows[Math.floor(i*(rows.length-1)/(limit-1))]);}
    function windowRows(rows,range,start,end,asOf){
        if(!rows.length||range==='ALL')return rows;
        const last=asOf||rows[rows.length-1].date,finish=range==='CUSTOM'?new Date(end+'T23:59:59Z'):new Date(last);
        let begin=range==='CUSTOM'?new Date(start+'T00:00:00Z'):new Date(last);
        if(range==='YTD')begin=new Date(Date.UTC(begin.getUTCFullYear(),0,1));else if(range!=='CUSTOM')begin.setUTCFullYear(begin.getUTCFullYear()-Number(range.replace('Y','')));
        if(!Number.isFinite(+begin)||!Number.isFinite(+finish)||begin>finish)throw new Error('Periodo de informe no valido.');
        const base=rows.filter(r=>r.date<=begin).at(-1),visible=rows.filter(r=>r.date>=begin&&r.date<=finish);
        return base&&visible.length&&base!==visible[0]?[base,...visible]:visible;
    }
    return {classes,comparison,percent,sample,windowRows};
});
