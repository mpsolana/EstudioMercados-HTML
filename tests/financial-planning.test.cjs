const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const core=require('../assets/financial-planning-core.js');
const base={investableAssets:120000,age:60,retirementAge:65,horizonAge:70,netLaborIncome:24000,netOtherIncome:0,netPension:18000,annualSpending:18000,inflationPct:0,returnPct:0,riskPct:0,retirementReturnPct:0,retirementRiskPct:0,goals:[]};

test('sin volatilidad, sueldo neto y pensión producen flujo y supervivencia exactos',()=>{
    const result=core.project(base,{paths:20,seed:1});
    assert.equal(result.success,1);
    assert.equal(result.table[5].median,150000);
    assert.equal(result.table[10].median,150000);
    assert.equal(result.table[10].survival,1);
    assert.equal(result.yearly[0].income,24000);
    assert.equal(result.yearly[0].ending,126000);
    assert.equal(result.yearly[5].income,18000);
});

test('un objetivo único se aplica una sola vez y el déficit no revive',()=>{
    const plan={...base,goals:[{name:'Vivienda',type:'withdrawal',amount:200000,startYear:2,endYear:2,frequency:'once',indexed:false}]};
    const result=core.project(plan,{paths:20,seed:1});
    assert.equal(result.success,0);
    assert.equal(result.table[2].survival,0);
    assert.equal(result.table[10].survival,0);
    assert.equal(result.yearly[1].goals,-200000);
    assert.equal(result.yearly[1].shortfall,68000);
    assert.equal(core.goalFlow(plan.goals[0],24,0),-200000);
    assert.equal(core.goalFlow(plan.goals[0],36,0),0);
});

test('una simulación repetida con semilla fija reproduce percentiles; rechaza datos incompletos',()=>{
    const plan={...base,riskPct:12,retirementRiskPct:5};
    const first=core.project(plan,{paths:100,seed:2026}),second=core.project(plan,{paths:100,seed:2026});
    assert.deepEqual(first,second);
    assert.ok(first.table.every(row=>row.p10<=row.median&&row.median<=row.p90));
    assert.throws(()=>core.project({...plan,investableAssets:null}),/patrimonio financiero/);
    assert.throws(()=>core.project({...plan,retirementAge:59}),/jubilación/);
});

test('el panel enlaza la cuenta seleccionada y mantiene expedientes separados por cuenta',()=>{
    const context=vm.createContext({OverviewCore:{id:value=>String(value).toUpperCase()},OverviewPanel:{state:{positionsDate:new Date('2026-11-14'),balanceDate:new Date('2026-11-14')}},FinancialPlanningCore:core,window:{}});
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/financial-planning.js'),'utf8'),context);
    const view=vm.runInContext('FinancialPlanning',context);
    const result={accounts:[{account:'ACC1',client:{code:'C1',name:'Cliente',profile:'Prudente'},organization:'GDC',cashKnown:true,base:100000,invested:90000,cash:10000},{account:'ACC2',client:{code:'C1',name:'Cliente',profile:'Prudente'},organization:'GDC',cashKnown:true,base:200000,invested:190000,cash:10000}]};
    assert.match(view.panel(result,'ACC2'),/value="200000"/);
    assert.match(view.panel(result,'ACC1'),/value="100000"/);
    assert.equal(view.state.plans.size,2);
});
