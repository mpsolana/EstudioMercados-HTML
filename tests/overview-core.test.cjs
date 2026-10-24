const test=require('node:test');
const assert=require('node:assert/strict');
const Core=require('../assets/overview-core.js');
const p=(account,isin,amount)=>({account,accountLabel:'Cuenta Cliente',isin,amount,name:isin});

test('client joins by normalized account label and never validates an incomplete category map',()=>{
    const clients=[{account:'Cuenta Cliente',code:'ABC',name:'Cliente',profile:'Equilibrado',organization:'GDC',cash:100,documents:[]}];
    const positions=[p('0232-0105-01-0000000001','ES0000000001',400),p('0232-0105-01-0000000001','ES0000000002',500)];
    const categories=[{isin:'ES0000000001',generic:'RV Global',type:'RV'}];
    const partial=Core.analyze({positions,clients,categories});
    assert.equal(partial.accounts.length,1);
    assert.equal(partial.accounts[0].client.name,'Cliente');
    assert.equal(partial.accounts[0].limit,'sin verificar');
    assert.equal(partial.accounts[0].unclassified,500);
    const full=Core.analyze({positions,clients,categories:[...categories,{isin:'ES0000000002',generic:'RF Europa',type:'RF'}]});
    assert.equal(full.accounts[0].rvPct,40);
    assert.equal(full.accounts[0].limit,'dentro');
    assert.equal(full.accounts[0].bandPosition,50);
    assert.equal(full.invested,900);
});

test('out-of-band positions and ambiguous account matches are explicit',()=>{
    const positions=[p('A','ES0000000001',70),p('A','ES0000000002',30)];
    const categories=[{isin:'ES0000000001',generic:'RV',type:'RV'},{isin:'ES0000000002',generic:'RF',type:'RF'}];
    const clients=[{account:'A',profile:'Equilibrado',cash:0,documents:[]}];
    const result=Core.analyze({positions,clients,categories});
    assert.equal(result.accounts[0].limit,'excede máximo');
    assert.equal(result.accounts[0].bandPosition,200);
    assert.equal(Core.analyze({positions,clients:[...clients,{account:'A',profile:'Prudente',cash:0,documents:[]}],categories}).accounts[0].limit,'sin verificar');
    const estimated=Core.analyze({positions,clients:[{account:'A',profile:'Equilibrado',documents:[]}],categories}).accounts[0];
    assert.equal(estimated.limit,'sin verificar');
    assert.equal(estimated.bandPosition,200);
});

test('missing cash never passes a limit; explicit zero cash can validate it',()=>{
    const positions=[p('A','ES0000000001',40),p('A','ES0000000002',60)];
    const clients=[{account:'A',profile:'Equilibrado',documents:[]}];
    const categories=[{isin:'ES0000000001',generic:'RV',type:'RV'},{isin:'ES0000000002',generic:'RF',type:'RF'}];
    const pending=Core.analyze({positions,clients,categories}).accounts[0];
    assert.equal(pending.limit,'sin verificar');
    assert.equal(pending.bandPosition,50);
    assert.deepEqual(pending.limitReasons,['efectivo pendiente']);
    assert.equal(Core.analyze({positions,clients,categories,cashByAccount:{A:0}}).accounts[0].limit,'dentro');
});

test('RF YTM and duration use only the RF sleeve and require complete coverage',()=>{
    const rows=[{...p('A','RFONE',300),classification:{type:'RF'}},{...p('A','RFTWO',200),classification:{type:'RF'}},{...p('A','RVONE',500),classification:{type:'RV'}}];
    const partial=Core.rfWeighted(rows,{'F:RFONE':{ytm:4,duration:2}});
    assert.equal(partial.coverage,0.6);
    assert.ok(Number.isNaN(partial.ytm));
    const full=Core.rfWeighted(rows,{'F:RFONE':{ytm:4,duration:2},'F:RFTWO':{ytm:6,duration:5}});
    assert.equal(full.ytm,4.8);
    assert.equal(full.duration,3.2);
    assert.equal(full.coverage,1);
});

test('document and renewal windows use the current date, not cached Excel labels',()=>{
    const today=new Date(2026,9,23);
    assert.equal(Core.documentStatus(new Date(2026,9,22),true,today),'caducado');
    assert.equal(Core.documentStatus(new Date(2026,10,10),true,today),'próximo');
    assert.equal(Core.documentStatus(new Date(2027,0,1),true,today),'vigente');
    assert.equal(Core.documentStatus(new Date(2026,10,22),true,today),'próximo');
    assert.equal(Core.documentStatus(null,true,today),'sin fecha');
    assert.equal(Core.documentStatus(null,false,today),'sin documento');
});

test('look-through uses amounts and keeps missing or inconsistent currency exposures unknown',()=>{
    const rows=[
        {...p('A','ONE',600),classification:{eurExpo:0.5,usdExpo:0.5,otherExpo:0}},
        {...p('A','TWO',300),classification:{eurExpo:100,usdExpo:0,otherExpo:0}},
        {...p('A','THREE',100),classification:{eurExpo:0.4,usdExpo:0.4,otherExpo:0}}
    ];
    assert.deepEqual(Core.lookThrough(rows),{eur:600,usd:300,other:0,unknown:100,covered:900,invested:1000});
    assert.equal(Core.exposureMix({eurExpo:0,usdExpo:1,otherExpo:0})[1],1);
    assert.ok(Math.abs(Core.exposureMix({eurExpo:0.51,usdExpo:0.50,otherExpo:0}).reduce((a,b)=>a+b,0)-1)<1e-10);
    assert.equal(Core.exposureMix({eurExpo:0,usdExpo:0,otherExpo:0}),null);
});

test('multicurrency balances join on transactional account and require each FX rate',()=>{
    const rows=Core.parseBalanceRows([
        {ACCOUNT:'EUR-SUB','TRANSACTIONAL ACCOUNT':'MAIN','CURRENCY':'EUR',BALANCE:100,'VALUE DATE':'2026-10-23'},
        {ACCOUNT:'USD-SUB','TRANSACTIONAL ACCOUNT':'MAIN','CURRENCY':'USD',BALANCE:120,'VALUE DATE':'2026-10-23'},
        {ACCOUNT:'OTHER','TRANSACTIONAL ACCOUNT':'SECOND','CURRENCY':'EUR',BALANCE:0}
    ]);
    assert.equal(rows.length,3);
    assert.deepEqual(Core.convertBalances(rows,{USD:1.2}),{amounts:{MAIN:200,SECOND:0},unresolved:[]});
    const missing=Core.convertBalances(rows,{});
    assert.equal(missing.amounts.MAIN,undefined);
    assert.equal(missing.unresolved.length,1);
    assert.throws(()=>Core.parseBalanceRows([{ACCOUNT:'EUR-SUB','TRANSACTIONAL ACCOUNT':'MAIN',CURRENCY:'EUR',BALANCE:100},{ACCOUNT:'EUR-SUB','TRANSACTIONAL ACCOUNT':'MAIN',CURRENCY:'EUR',BALANCE:200}]),/duplicado/);
});

test('balance account reconciliation accepts only exact unique names and flags homonyms',()=>{
    const positions=[{account:'P1',accountLabel:'María López'},{account:'P2',accountLabel:'Familia Pérez'},{account:'P3',accountLabel:'Familia Pérez'}];
    const balances=[{account:'B1',description:'Maria Lopez'},{account:'B2',description:'Familia Perez'},{account:'B3',description:'Familia Perez'}];
    const matched=Core.matchBalanceAccounts(positions,balances);
    assert.deepEqual(matched.links,{B1:'P1'});
    assert.deepEqual(matched.unmatchedPositions,['P2','P3']);
    const manual=Core.matchBalanceAccounts(positions,balances,{P2:'B2'});
    assert.equal(manual.links.B2,'P2');
    assert.ok(manual.unmatchedPositions.includes('P3'));
});

test('editable profile bands and mismatched valuation dates never produce verified compliance',()=>{
    const positions=[p('A','RVONE',30),p('A','RFONE',70)],clients=[{account:'A',profile:'Prudente',documents:[]}];
    const categories=[{isin:'RVONE',generic:'RV',type:'RV'},{isin:'RFONE',generic:'RF',type:'RF'}];
    const bands={prudente:[10,25]};
    const result=Core.analyze({positions,clients,categories,bandsByProfile:bands,cashByAccount:{A:0},valuationAligned:false}).accounts[0];
    assert.equal(result.rvPct,30);
    assert.equal(result.bandPosition,133.33333333333331);
    assert.equal(result.limit,'sin verificar');
    assert.ok(result.limitReasons.includes('fechas de posiciones y saldos sin conciliar'));
    assert.equal(Core.analyze({positions,clients,categories,bandsByProfile:bands,cashByAccount:{A:0}}).accounts[0].limit,'excede máximo');
});
