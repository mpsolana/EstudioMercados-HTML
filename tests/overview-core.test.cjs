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
});

test('missing cash never passes a limit; explicit zero cash can validate it',()=>{
    const positions=[p('A','ES0000000001',40),p('A','ES0000000002',60)];
    const clients=[{account:'A',profile:'Equilibrado',documents:[]}];
    const categories=[{isin:'ES0000000001',generic:'RV',type:'RV'},{isin:'ES0000000002',generic:'RF',type:'RF'}];
    assert.equal(Core.analyze({positions,clients,categories}).accounts[0].limit,'sin verificar');
    assert.equal(Core.analyze({positions,clients,categories,cashByAccount:{A:0}}).accounts[0].limit,'dentro');
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
