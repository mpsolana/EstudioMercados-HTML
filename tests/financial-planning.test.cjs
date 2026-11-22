const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const core=require('../assets/financial-planning-core.js');
const portfolio=require('../assets/financial-planning-portfolio.js');
const analytics=require('../assets/financial-planning-analytics.js');
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

test('el Maestro admite pesos porcentuales o fraccionarios y rechaza cartera incompleta',()=>{
    const rows=[{ISIN:'ES0000000001','Peso (%)':60,Nombre:'Fondo A',Categoria:'RV'},{ISIN:'ES0000000002','Peso (%)':40,Nombre:'Fondo B',Categoria:'RF'}];
    assert.deepEqual(portfolio.parseRows(rows).map(item=>item.weight),[60,40]);
    assert.deepEqual(portfolio.parseRows(rows.map(item=>({...item,'Peso (%)':item['Peso (%)']/100}))).map(item=>item.weight),[60,40]);
    assert.throws(()=>portfolio.parseRows(rows.map(item=>({...item,'Peso (%)':10}))),/suman/);
    assert.throws(()=>portfolio.parseRows([rows[0],rows[0]]),/suman|repetido/);
    const book={SheetNames:['prices','Cartera Scoring'],Sheets:{prices:{rows:[{date:'2026-01-01',price:100}]},'Cartera Scoring':{rows}}};
    const parsed=portfolio.parseWorkbook(book,{utils:{sheet_to_json:sheet=>sheet.rows}});
    assert.equal(parsed.sheet,'Cartera Scoring');
    assert.equal(portfolio.snapshot(parsed.entries)[0].funds[0].isin,'ES0000000001');
});

test('se puede crear un expediente de prospecto sin posiciones cargadas',()=>{
    const state={positionsDate:null,balanceDate:null,selected:''};
    const context=vm.createContext({OverviewCore:{id:value=>String(value).toUpperCase()},OverviewPanel:{state},FinancialPlanningCore:core,FinancialPlanningPortfolio:portfolio,window:{},Intl,Date,Map,Number,Math,JSON,Error,Promise});
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/financial-planning.js'),'utf8'),context);
    const view=vm.runInContext('FinancialPlanning',context),render=()=>{};
    assert.match(view.panel({accounts:[]},''),/Crear expediente de prospecto/);
    view.handleClick({target:{closest:()=>({dataset:{planAction:'new-prospect'}})}},{accounts:[]},render);
    const plan=[...view.state.plans.values()][0];
    assert.equal(plan.sourceType,'prospect');
    assert.equal(plan.account,'');
    assert.match(view.panel({accounts:[]},''),/Nombre del prospecto/);
});

test('el Excel de un prospecto conserva identidad, origen y cartera sin exigir una cuenta',async()=>{
    let saved;
    const XLSX={utils:{book_new:()=>({SheetNames:[],Sheets:{}}),aoa_to_sheet:rows=>({rows}),book_append_sheet:(book,sheet,name)=>{book.SheetNames.push(name);book.Sheets[name]=sheet;},sheet_to_json:(sheet,options)=>options.header===1?sheet.rows:sheet.rows.slice(1).map(row=>Object.fromEntries(sheet.rows[0].map((name,i)=>[name,row[i]])))},writeFile:book=>{saved=book;},read:()=>saved};
    const make=()=>{
        const status={textContent:''},state={positionsDate:null,balanceDate:null,selected:''};
        const context=vm.createContext({OverviewCore:{id:value=>String(value).toUpperCase()},OverviewPanel:{state},FinancialPlanningCore:core,FinancialPlanningPortfolio:portfolio,FinancialPlanningAnalytics:analytics,window:{XLSX},XLSX,document:{getElementById:()=>status},Intl,Date,Map,Number,Math,JSON,Error,Promise});
        vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/financial-planning.js'),'utf8'),context);
        return {view:vm.runInContext('FinancialPlanning',context),state,status};
    };
    const first=make();first.view.handleClick({target:{closest:()=>({dataset:{planAction:'new-prospect'}})}},{accounts:[]},()=>{});
    const plan=[...first.view.state.plans.values()][0];plan.clientName='Prospecto prueba';plan.modelSource='maestro';plan.modelFile='Maestro prueba.xlsx';plan.modelSnapshot=portfolio.snapshot([{id:'ES0000000001',name:'Fondo',category:'RV',type:'RV',weight:100}]);
    Object.assign(plan,{age:50,retirementAge:67,caseNotes:'Caso documentado',pricesInBase:true,priceSeries:{ES0000000001:[{date:'2025-01-31',price:100},{date:'2025-02-28',price:101}]},goals:[{name:'Casa',type:'withdrawal',amount:30000,startYear:1,endYear:17,frequency:'once',indexed:true}]});
    first.view.handleClick({target:{closest:()=>({dataset:{planAction:'export'}})}},{accounts:[]},()=>{});
    assert.ok(saved.Sheets['Cartera propuesta']);
    const second=make();await second.view.handleChange({target:{matches:selector=>selector==='[data-plan-file]',files:[{name:'plan.xlsx',arrayBuffer:async()=>new ArrayBuffer(1)}]}},{accounts:[]},()=>{});
    const restored=[...second.view.state.plans.values()][0];
    assert.equal(restored.sourceType,'prospect');assert.equal(restored.account,'');assert.equal(restored.clientName,'Prospecto prueba');assert.equal(restored.modelSource,'maestro');assert.equal(restored.modelSnapshot[0].weight,100);assert.equal(restored.caseNotes,'Caso documentado');assert.equal(restored.pricesInBase,true);assert.equal(restored.priceSeries.ES0000000001[1].price,101);assert.equal(JSON.stringify(restored.goals.map(g=>[g.startYear,g.endYear])),'[[1,17]]');
});

test('la cartera Yahoo se aplica solo tras verificar todos los tickers y mantiene su divisa',async()=>{
    const status={textContent:''},state={positionsDate:null,balanceDate:null,selected:''};
    const metadata=new Map([['VTI',{name:'US Market',currency:'USD'}],['BND',{name:'US Bonds',currency:'USD'}]]);
    const context=vm.createContext({OverviewCore:{id:value=>String(value).toUpperCase()},OverviewPanel:{state},FinancialPlanningCore:core,FinancialPlanningPortfolio:portfolio,FinancialPlanningAnalytics:analytics,MarketData:{metadata,prices:async()=>Array.from({length:12},(_,i)=>({date:new Date(Date.UTC(2025,i,28)),price:100+i}))},window:{},document:{getElementById:()=>status},Intl,Date,Map,Number,Math,JSON,Error,Promise});
    const source=fs.readFileSync(path.join(__dirname,'../assets/financial-planning.js'),'utf8').replace('return {panel,afterRender,handleClick,handleChange,state:{plans}};','return {panel,afterRender,handleClick,handleChange,state:{plans},applyYahoo};');
    vm.runInContext(source,context);const view=vm.runInContext('FinancialPlanning',context);
    view.handleClick({target:{closest:()=>({dataset:{planAction:'new-prospect'}})}},{accounts:[]},()=>{});
    const plan=[...view.state.plans.values()][0];plan.yahooRows=[{id:'VTI',weight:60,category:'RV'},{id:'BND',weight:40,category:'RF'}];
    await view.applyYahoo(plan,()=>{});
    assert.equal(plan.modelSource,'yahoo');assert.equal(plan.modelSnapshot[0].funds[0].name,'US Market');assert.equal(plan.modelSnapshot[1].funds[0].currency,'USD');
});

test('el informe inicial identifica al prospecto y la procedencia de su cartera',async()=>{
    const state={positionsDate:null,balanceDate:null,selected:''};
    const context=vm.createContext({OverviewCore:{id:value=>String(value).toUpperCase()},OverviewPanel:{state},FinancialPlanningCore:core,FinancialPlanningPortfolio:portfolio,FinancialPlanningAnalytics:analytics,window:{},Intl,Date,Map,Number,Math,JSON,Error,Promise});
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/financial-planning-report.js'),'utf8'),context);
    const source=fs.readFileSync(path.join(__dirname,'../assets/financial-planning.js'),'utf8').replace('return {panel,afterRender,handleClick,handleChange,state:{plans}};','return {panel,afterRender,handleClick,handleChange,state:{plans},reportHtml,setResult:result=>{last=result;}};');
    vm.runInContext(source,context);const view=vm.runInContext('FinancialPlanning',context);
    view.handleClick({target:{closest:()=>({dataset:{planAction:'new-prospect'}})}},{accounts:[]},()=>{});
    const plan=[...view.state.plans.values()][0];Object.assign(plan,{...base,clientName:'Prospecto prueba',sourceType:'prospect',modelSource:'maestro',modelFile:'Maestro.xlsx',modelSnapshot:portfolio.snapshot([{id:'ES0000000001',weight:100,category:'RV',type:'RV',name:'Fondo prueba'}])});
    view.setResult({key:plan.clientKey,result:core.project(plan,{paths:10})});
    const html=await view.reportHtml(plan,{account:plan.clientKey});
    assert.match(html,/Informe inicial para prospecto/);
    assert.match(html,/importada del Maestro/);
    assert.match(html,/Fondo prueba/);
    assert.match(html,/datos facilitados a/);
    assert.match(html,/Balance de situación/);
    assert.match(html,/Cuenta de pérdidas y ganancias/);
    assert.match(html,/Consumo del ahorro y prestaciones/);
    assert.match(html,/Productos y calidad frente a peers/);
});

test('las edades de objetivos se convierten en años de simulación',()=>{
    assert.equal(core.ageToYear(50,50),1);
    assert.equal(core.ageToYear(67,50),17);
    assert.equal(core.yearToAge(17,50),67);
});

test('rentabilidades rolling y probabilidad observada usan meses comunes consecutivos',()=>{
    const snapshot=[{category:'RV',type:'RV',weight:60,funds:[{isin:'AAA',currency:'EUR'}]},{category:'RF',type:'RF',weight:40,funds:[{isin:'BBB',currency:'EUR'}]}];
    const months=Array.from({length:25},(_,i)=>new Date(Date.UTC(2024,i,28)).toISOString().slice(0,10));
    const series={AAA:months.map((date,i)=>({date,price:100+i})),BBB:months.map((date,i)=>({date,price:100+i*.2}))};
    const result=analytics.portfolio(snapshot,series);
    assert.equal(result.returns.length,24);
    assert.equal(result.dates[0],'2024-01');
    const periods=analytics.periods(result.returns);
    assert.equal(periods.find(p=>p.months===12).count,13);
    assert.equal(periods.find(p=>p.months===12).positive,1);
    delete series.AAA[6];
    assert.equal(analytics.portfolio(snapshot,series).returns.length,17);
});

test('las hipótesis de la cartera salen del CAGR y volatilidad en EUR con cobertura explícita',()=>{
    const snapshot=[{category:'RV',type:'RV',weight:100,funds:[{isin:'AAA',currency:'EUR'}]}];
    const series={AAA:Array.from({length:37},(_,i)=>({date:new Date(Date.UTC(2022,i,28)).toISOString().slice(0,10),price:100*Math.exp(i*.005+Math.sin(i/3)*.01)}))};
    const blocked=analytics.calibrate(snapshot,series,{pricesInBase:false});
    assert.match(blocked.reason,/EUR/);
    const result=analytics.calibrate(snapshot,series,{pricesInBase:true});
    assert.equal(result.months,36);
    assert.equal(result.start,'2022-01');
    assert.ok(result.returnPct>0&&result.riskPct>0);
    const short=analytics.calibrate(snapshot,{AAA:series.AAA.slice(0,13)},{pricesInBase:true});
    assert.match(short.reason,/24 retornos/);
});

test('el plan rellena ambos periodos desde la cartera y respeta un ajuste manual',()=>{
    const state={positionsDate:null,balanceDate:null,selected:''};
    const context=vm.createContext({OverviewCore:{id:value=>String(value).toUpperCase()},OverviewPanel:{state},FinancialPlanningCore:core,FinancialPlanningAnalytics:analytics,window:{},Intl,Date,Map,Number,Math,JSON,Error,Promise});
    const source=fs.readFileSync(path.join(__dirname,'../assets/financial-planning.js'),'utf8').replace('return {panel,afterRender,handleClick,handleChange,state:{plans}};','return {panel,afterRender,handleClick,handleChange,state:{plans},refreshAssumptions};');
    vm.runInContext(source,context);const view=vm.runInContext('FinancialPlanning',context);
    const plan={assumptionMode:'portfolio',pricesInBase:true,modelSnapshot:[{weight:100,category:'RV',funds:[{isin:'AAA'}]}],priceSeries:{AAA:Array.from({length:37},(_,i)=>({date:new Date(Date.UTC(2022,i,28)).toISOString().slice(0,10),price:100*Math.exp(i*.004+Math.sin(i/3)*.01)}))}};
    view.refreshAssumptions(plan);
    assert.equal(plan.returnPct,plan.retirementReturnPct);
    assert.equal(plan.riskPct,plan.retirementRiskPct);
    assert.ok(plan.returnPct>0);
    plan.assumptionMode='manual';plan.returnPct=7;view.refreshAssumptions(plan);
    assert.equal(plan.returnPct,7);
});

test('Yahoo convierte cotizaciones USD a EUR antes de calibrar la cartera',async()=>{
    const status={textContent:''},state={positionsDate:null,balanceDate:null,selected:''},calls=[];
    const metadata=new Map([['VTI',{name:'Índice prueba',currency:'USD'}]]);
    const prices=async ticker=>{calls.push(ticker);return Array.from({length:37},(_,i)=>({date:new Date(Date.UTC(2022,i,28)),price:ticker==='EURUSD=X'?2:100*Math.exp(i*.004+Math.sin(i/3)*.01)}));};
    const context=vm.createContext({OverviewCore:{id:value=>String(value).toUpperCase()},OverviewPanel:{state},FinancialPlanningCore:core,FinancialPlanningPortfolio:portfolio,FinancialPlanningAnalytics:analytics,MarketData:{metadata,prices},window:{},document:{getElementById:()=>status},Intl,Date,Map,Number,Math,JSON,Error,Promise});
    const source=fs.readFileSync(path.join(__dirname,'../assets/financial-planning.js'),'utf8').replace('return {panel,afterRender,handleClick,handleChange,state:{plans}};','return {panel,afterRender,handleClick,handleChange,state:{plans},applyYahoo};');
    vm.runInContext(source,context);const view=vm.runInContext('FinancialPlanning',context);
    view.handleClick({target:{closest:()=>({dataset:{planAction:'new-prospect'}})}},{accounts:[]},()=>{});
    const plan=[...view.state.plans.values()][0];plan.yahooRows=[{id:'VTI',weight:100,category:'RV'}];
    await view.applyYahoo(plan,()=>{});
    assert.ok(calls.includes('EURUSD=X'));
    assert.equal(plan.pricesInBase,true);
    assert.equal(plan.priceSeries.VTI[0].price,50);
    assert.equal(plan.modelSnapshot[0].funds[0].currency,'EUR');
    assert.ok(plan.returnPct>0&&plan.riskPct>0);
});
