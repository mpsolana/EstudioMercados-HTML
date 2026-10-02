const test=require('node:test'),assert=require('node:assert/strict'),Compare=require('../assets/multi-asset-compare.js');
const dates=['2023-01-02','2023-02-02','2023-03-02','2023-04-03'];
const series=values=>values.map((price,i)=>({date:new Date(dates[i]+'T00:00:00Z'),price}));
test('compares only common dates and rebases each asset at the same point',()=>{
    const a={ticker:'A',data:series([100,110,120,130])},b={ticker:'B',data:series([50,55,60,65]).slice(1)};
    const result=Compare.compare([a,b]);
    assert.equal(result.rows.length,3);
    assert.deepEqual(result.assets[0].base100,[100,120/110*100,130/110*100]);
    assert.deepEqual(result.assets[1].base100,[100,60/55*100,65/55*100]);
    assert.ok(Number.isNaN(result.assets[0].annual));
});
test('drawdown and risk use the same selected window',()=>{
    const a={ticker:'A',data:series([100,120,90,110])},b={ticker:'B',data:series([100,100,100,100])};
    const result=Compare.compare([a,b]);
    assert.equal(result.assets[0].drawdown,-.25);
    assert.equal(result.assets[1].vol,0);
    assert.equal(Compare.compare([a]).assets.length,1);
    assert.throws(()=>Compare.compare([a,{ticker:'C',data:series([1,2,3,4]).slice(3)}]),/tres precios/);
});
test('reports recovery of the maximum drawdown and return correlations',()=>{
    const a={ticker:'A',data:series([100,120,90,125])},b={ticker:'B',data:series([50,60,45,62.5])};
    const result=Compare.compare([a,b]);
    assert.equal(result.assets[0].drawdown,-.25);
    assert.equal(result.assets[0].recoveryDays,60);
    assert.ok(Math.abs(result.correlations[0][1]-1)<1e-12);
    assert.equal(result.correlations[0][0],1);
    assert.equal(Compare.compare([a,{ticker:'FLAT',data:series([100,100,100,100])}]).correlations[0][1],null);
    assert.equal(Compare.compare([{ticker:'UNRECOVERED',data:series([100,120,90,110])}]).assets[0].recoveryDays,null);
});
test('annual correlations use non-overlapping year-end returns when history permits',()=>{
    const annual=(values)=>values.map((price,index)=>({date:new Date(Date.UTC(2020+index,11,31)),price}));
    const a={ticker:'A',data:annual([100,110,120,108,125,130])};
    const b={ticker:'B',data:annual([100,95,105,115,110,120])};
    const result=Compare.compare([a,b]);
    assert.equal(result.correlationFrequency,'A');
    const left=[.1,120/110-1,108/120-1,125/108-1,130/125-1];
    const right=[-.05,105/95-1,115/105-1,110/115-1,120/110-1];
    const avg=values=>values.reduce((sum,value)=>sum+value,0)/values.length;
    const expected=left.reduce((sum,value,i)=>sum+(value-avg(left))*(right[i]-avg(right)),0)/Math.sqrt(left.reduce((sum,value)=>sum+(value-avg(left))**2,0)*right.reduce((sum,value)=>sum+(value-avg(right))**2,0));
    assert.ok(Math.abs(result.correlations[0][1]-expected)<1e-12);
    assert.equal(Compare.compare([a,b],'3Y').rows.length,4);
    const monthly=Array.from({length:72},(_,index)=>({date:new Date(Date.UTC(2020+Math.floor(index/12),(index%12)+1,0)),price:100+index+(index%12)*.7}));
    const monthlyResult=Compare.compare([{ticker:'M1',data:monthly},{ticker:'M2',data:monthly.map((point,index)=>({...point,price:95+index*.8-(index%12)*.3}))}]);
    assert.equal(monthlyResult.frequency,'M');
    assert.equal(monthlyResult.correlationFrequency,'A');
});
test('keeps four assets on one shared calendar',()=>{
    const assets=['A','B','C','D'].map((ticker,index)=>({ticker,data:series([100,101+index,102+index,103+index])}));
    const result=Compare.compare(assets);
    assert.equal(result.assets.length,4);
    assert.equal(result.rows.length,4);
    assert.equal(new Set(result.assets.map(asset=>asset.color)).size,4);
});
test('supports ten and up to twenty assets without reusing series colours',()=>{
    const assets=Array.from({length:20},(_,index)=>({ticker:`F${index}`,data:series([100,101+index,102+index,103+index])}));
    for(const count of [10,20]){
        const result=Compare.compare(assets.slice(0,count));
        assert.equal(result.assets.length,count);
        assert.equal(result.rows.length,4);
        assert.equal(new Set(result.assets.map(asset=>asset.color)).size,count);
    }
    assert.throws(()=>Compare.compare(assets.concat(assets[0])),/1 y 20/);
    assert.equal(Compare.compare(assets,'ALL',0,{ticker:'BENCH',data:series([100,102,101,104])}).assets.length,20);
});
test('recalculates Sharpe and Jensen beta and alpha against one shared benchmark',()=>{
    const benchmark={ticker:'BENCH',data:series([100,102,101,104])};
    const asset={ticker:'A',data:series([100,105,103,110])};
    const without=Compare.compare([asset],'ALL',0,benchmark),withRate=Compare.compare([asset],'ALL',.04,benchmark);
    assert.equal(without.assets[0].beta,withRate.assets[0].beta);
    assert.notEqual(without.assets[0].sharpe,withRate.assets[0].sharpe);
    assert.notEqual(without.assets[0].alpha,withRate.assets[0].alpha);
    assert.ok(Number.isFinite(withRate.assets[0].beta));
    assert.ok(Number.isFinite(withRate.assets[0].alpha));
    assert.equal(Compare.compare([benchmark],'ALL',.04,benchmark).assets[0].beta,1);
    assert.ok(Math.abs(Compare.compare([benchmark],'ALL',.04,benchmark).assets[0].alpha)<1e-10);
    assert.ok(Number.isNaN(Compare.compare([asset]).assets[0].beta));
    assert.ok(Number.isNaN(Compare.compare([asset],'ALL',0,{ticker:'FLAT',data:series([100,100,100,100])}).assets[0].alpha));
    assert.throws(()=>Compare.compare([asset],'ALL',-1),/superior a -100/);
});
test('horizon returns require a full lookback and retain the last prior year close',()=>{
    const monthly=Array.from({length:84},(_,index)=>({date:new Date(Date.UTC(2019,index+1,0)),price:100+index}));
    const result=Compare.compare([{ticker:'A',data:monthly}]),h=result.assets[0].horizons;
    assert.ok(Math.abs(h.sixMonths-(183/177-1))<1e-12);
    assert.ok(Math.abs(h.oneYear-(183/171-1))<1e-12);
    assert.ok(Math.abs(h.ytd-(183/171-1))<1e-12);
    assert.ok(Math.abs(h.sinceStart-.83)<1e-12);
    assert.ok(Number.isFinite(h.threeYears)&&Number.isFinite(h.fiveYears));
    const short=Compare.compare([{ticker:'A',data:monthly.slice(-12)}]).assets[0].horizons;
    assert.ok(Number.isNaN(short.oneYear)&&Number.isNaN(short.fiveYears));
    assert.throws(()=>Compare.compare([{ticker:'A',data:monthly.slice(-12)}],'5Y'),/5 años completos/);
    assert.ok(Compare.compare([{ticker:'A',data:monthly}],'5Y').rows.length>=60);
});
test('Jensen alpha by horizon uses paired returns and rolling correlation keeps its window',()=>{
    const prices=Array.from({length:430},(_,index)=>({date:new Date(Date.UTC(2025,0,index+1)),price:100*Math.exp(index*.0003+Math.sin(index/13)*.02)}));
    const asset={ticker:'FUND',name:'Fondo',data:prices},bench={ticker:'BENCH',name:'Indice',data:prices.map(point=>({...point}))};
    const result=Compare.compare([asset],'ALL',.02,bench),alphas=result.assets[0].horizonAlphas;
    for(const key of ['oneMonth','threeMonths','sixMonths','ytd','oneYear','sinceStart'])assert.ok(Math.abs(alphas[key])<1e-10,key);
    assert.ok(Number.isNaN(alphas.threeYears));
    const rolling=Compare.rollingCorrelation(result.rows,0,1,30);
    assert.equal(rolling.length,result.rows.length-30);
    assert.ok(rolling.every(point=>Math.abs(point.value-1)<1e-10));
    assert.deepEqual(Compare.rollingCorrelation(result.rows.slice(0,20),0,1,30),[]);
});
