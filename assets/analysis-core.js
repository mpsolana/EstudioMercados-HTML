(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./finance-core.js'));else root.AnalysisCore=factory(root.FinanceCore);})(globalThis,function(finance){
    const normalized=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
    function familyName(value){
        const words=normalized(value).replace(/\b(eur|usd|gbp|chf|jpy)[ -]?(?:h|hdg|hedged)\b/g,'$1 hedged').split(' ');
        const suffix=/^(?:[a-z]{1,2}\d{0,2}|eur|euro|usd|gbp|chf|jpy|acc|accumulation|accumulating|dist|distribution|distributing|inc|hedge|hedged|unhedged|hgd|cap|capitalisation|capitalization|institutional|retail|clean|class|clase|shares)$/;
        while(words.length>2&&suffix.test(words.at(-1)))words.pop();
        return words.join(' ');
    }
    function classMatch(a,b){
        if(!a||!b||[a,b].some(r=>['proxy','manual'].includes(r.originSource?.mode)))return '';
        if(a.fundId&&b.fundId&&normalized(a.fundId)!==normalized(b.fundId))return '';
        for(const key of ['currency','hedging'])if(a[key]&&b[key]&&normalized(a[key])!==normalized(b[key]))return '';
        const currency=r=>normalized(r.currency)||normalized(r.name).match(/\b(eur|usd|gbp|chf|jpy)\b/)?.[1];
        if(currency(a)&&currency(b)&&currency(a)!==currency(b))return '';
        const hedged=r=>/\b(hedge|hedged|hgd|hdg|(?:eur|usd|gbp|chf|jpy)[ -]?h)\b/.test(normalized(r.name));
        if(hedged(a)!==hedged(b))return '';
        if(finance.sameFund(a,b))return 'confirmed';
        if(a.fundId&&b.fundId&&normalized(a.fundId)===normalized(b.fundId))return 'probable';
        if(!normalized(a.category)||normalized(a.category)!==normalized(b.category)||!normalized(a.manager)||normalized(a.manager)!==normalized(b.manager))return '';
        if(!(a.aum>0&&b.aum>0)||Math.abs(a.aum-b.aum)/Math.max(a.aum,b.aum)>.01)return '';
        const name=familyName(a.name);
        return name.length>=10&&name.split(' ').length>=2&&name===familyName(b.name)?'probable':'';
    }
    function classes(record,universe,approvedIsins){
        if(!record || ['proxy','manual'].includes(record.originSource?.mode) || !Number.isFinite(record.ter))return {status:'unknown',all:[],approved:[]};
        const peers=universe.filter(r=>classMatch(record,r));
        const all=peers.filter(r=>r.isin!==record.isin&&Number.isFinite(r.ter)&&r.ter<record.ter).sort((a,b)=>a.ter-b.ter||a.isin.localeCompare(b.isin));
        return {status:all.length?'cheaper':!peers.length||peers.some(r=>!Number.isFinite(r.ter))?'unknown':'lowest',all,approved:all.filter(r=>approvedIsins.has(r.isin))};
    }
    // Candidates support manual research; they do not establish economic equivalence or approval.
    function classCandidates(record,universe){
        if(!record)return [];
        const family=familyName(record.name),manager=normalized(record.manager);
        return universe.filter(other=>{
            if(other.isin===record.isin)return false;
            if(record.fundId&&other.fundId)return normalized(record.fundId)===normalized(other.fundId);
            if(classMatch(record,other))return true;
            const words=new Set(family.split(' ')),otherWords=new Set(familyName(other.name).split(' '));
            const overlap=[...words].filter(word=>otherWords.has(word)).length/new Set([...words,...otherWords]).size;
            const tenureMatches=['managerTenure','fundTenure'].some(key=>Number.isFinite(record[key])&&Number.isFinite(other[key])&&Math.abs(record[key]-other[key])<=.1);
            const managerWords=value=>new Set(normalized(value).replace(/\b(asset|management|investment|investments|gestion|gestora|funds|ltd|limited|sa|sl|sicav)\b/g,'').split(' ').filter(Boolean));
            const am=managerWords(manager),bm=managerWords(other.manager),managerMatch=manager&&normalized(other.manager)&&(manager===normalized(other.manager)||(am.size&&bm.size&&[...am].filter(w=>bm.has(w)).length/Math.max(am.size,bm.size)>=.8));
            const aumMatches=record.aum>0&&other.aum>0&&Math.abs(record.aum-other.aum)/Math.max(record.aum,other.aum)<=.02;
            const managerTenureMatches=Number.isFinite(record.managerTenure)&&Number.isFinite(other.managerTenure)&&Math.abs(record.managerTenure-other.managerTenure)<=.1;
            const managerConflict=manager&&normalized(other.manager)&&!managerMatch;
            // Add a metadata search across all categories, without requiring similar names.
            if(aumMatches&&(managerMatch||(!managerConflict&&managerTenureMatches)))return true;
            const nameMatches=family===familyName(other.name)||(words.size>=3&&overlap>=.75&&tenureMatches);
            return family.length>=10&&words.size>=2&&managerMatch&&nameMatches&&(aumMatches||(!(record.aum>0&&other.aum>0)&&family===familyName(other.name)&&tenureMatches));
        }).sort((a,b)=>(Number.isFinite(a.ter)?a.ter:Infinity)-(Number.isFinite(b.ter)?b.ter:Infinity)||a.isin.localeCompare(b.isin));
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
    function categoryFlows(rows,capital){
        if(!Number.isFinite(capital)||capital<=0)throw new Error('Introduce un AUM de cartera mayor que cero.');
        if(!rows.length)throw new Error('Introduce las posiciones de origen.');
        if(rows.some(r=>!Number.isFinite(r.weight)||r.weight<0)||Math.abs(rows.reduce((s,r)=>s+r.weight,0)-100)>.01)throw new Error('Los pesos deben sumar 100% para representar el AUM completo.');
        const names=new Map(),links=new Map();
        const category=record=>{const label=String(record?.category||'').trim().replace(/\s+/g,' ')||'Sin categoría',key=normalized(label);if(!names.has(key))names.set(key,label);return key;};
        for(const row of rows){
            if(!row.weight)continue;
            const source=category(row.current),target=category(row.proposed),key=JSON.stringify([source,target]);
            if(!links.has(key))links.set(key,{source,target,amount:0,weight:0,funds:[]});
            const link=links.get(key);link.amount+=capital*row.weight/100;link.weight+=row.weight;
            link.funds.push({isin:row.isin,name:row.current?.name||row.isin||'Sin identificar',proposed:row.proposed?.name||'Sin propuesta',amount:capital*row.weight/100});
        }
        return {capital,categories:[...names].map(([key,label])=>({key,label})).sort((a,b)=>a.label.localeCompare(b.label)),links:[...links.values()]};
    }
    return {classes,classMatch,classCandidates,familyName,comparison,percent,sample,windowRows,categoryFlows};
});
