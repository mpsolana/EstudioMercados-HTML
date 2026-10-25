const {chromium}=require('playwright');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const os=require('node:os');
const assert=require('node:assert/strict');

(async()=>{
    const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'});
    try{
        const page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});
        await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
        await page.waitForFunction(()=>typeof OverviewPanel!=='undefined'&&OverviewPanel.state&&window.XLSX&&window.Plotly);
        await page.evaluate(async()=>{
            const id='ES0000000001',other='ES0000000002';
            OverviewPanel.capturePositions([
                {'ISIN':id,'ACCOUNT':'Cuenta Cliente','INVERSIS ACCOUNT NUMBER':'0232-0105-01-0000000001','INSTRUMENT':'Fondo A','DIV INSTITUTION COUNTER VALUE':400},
                {'ISIN':other,'ACCOUNT':'Cuenta Cliente','INVERSIS ACCOUNT NUMBER':'0232-0105-01-0000000001','INSTRUMENT':'Fondo B','DIV INSTITUTION COUNTER VALUE':-100},
                {'ISIN':other,'ACCOUNT':'Cuenta Cliente','INVERSIS ACCOUNT NUMBER':'0232-0105-01-0000000001','INSTRUMENT':'Fondo B','DIV INSTITUTION COUNTER VALUE':600}
            ],'posiciones-prueba.xlsx');
            const header=Array(67).fill(null);header[2]='CUENTA (Inversis)';header[49]='PERFIL GESTION ID';
            const row=Array(67).fill(null);row[1]='Cliente sintético';row[2]='Cuenta Cliente';row[49]='EQUILIBRADO';row[55]='GDC';row[60]='ABC';row[40]=100;
            const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([[],[],header,row]),'Control DNI & TEST');
            const file=new File([XLSX.write(book,{type:'array',bookType:'xlsx'})],'control-prueba.xlsx');
            await OverviewPanel.importControl(file);
            OverviewPanel.state.cashOverrides.set('0232-0105-01-0000000001',100);
            OverviewPanel.render();
            const categoryBook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(categoryBook,XLSX.utils.aoa_to_sheet([['TIPO PRODUCTO','ISIN','INSTRUMENTO','Tipo Activo','TIPO ACTIVO +','DIVISA','HEDGE','ESTRATEGIA DE INVERSIÓN','EUR EXPO','USD EXPO','OTROS EXPO','eur+usd'],['FONDO',id,'Fondo A','RENTA VARIABLE','RV Global','EUR','N','RISK ON',0.8,0.2,0,1],['FONDO',other,'Fondo B','RENTA FIJA','RF Europa','EUR','N','RISK OFF',1,0,0,1]]),'Categorización');
            await OverviewPanel.importCategories(new File([XLSX.write(categoryBook,{type:'array',bookType:'xlsx'})],'categorias-prueba.xlsx'));
        });
        const result=await page.evaluate(()=>OverviewCore.analyze({positions:OverviewPanel.state.positions,clients:OverviewPanel.state.clients,categories:[...OverviewPanel.state.categories.values()],cashByAccount:{'02320105010000000001':100}}));
        assert.equal(result.invested,900);
        assert.equal(result.accounts[0].client.name,'Cliente sintético');
        assert.equal(result.accounts[0].limit,'dentro');
        assert.equal(result.accounts[0].bandPosition,50);
        const categoryExport=await page.evaluate(()=>{
            const original=XLSX.writeFile;let output;
            try{XLSX.writeFile=book=>{output=book;};OverviewPanel.exportCategories();}
            finally{XLSX.writeFile=original;}
            return {sheets:output.SheetNames,rows:XLSX.utils.sheet_to_json(output.Sheets['Categorización'])};
        });
        assert.deepEqual(categoryExport.sheets,['Categorización','Yahoo tickers','Renta fija','Limites RV','Fondos Santalucia']);
        assert.equal(categoryExport.rows.length,2);
        assert.equal(categoryExport.rows[0]['Tipo Activo'],'RENTA VARIABLE');
        assert.equal(categoryExport.rows[0]['TIPO ACTIVO +'],'RV Global');
        assert.equal(categoryExport.rows[0]['USD EXPO'],0.2);
        assert.equal(categoryExport.rows[0]['ESTRATEGIA DE INVERSIÓN'],'RISK ON');
        assert.ok(!JSON.stringify(categoryExport).includes('Cliente sintético'));
        await page.evaluate(()=>{
            GdcModel.state.mode='GDC';
            GdcModel.state.models=[{name:'Equilibrado',profile:'equilibrado',rows:[
                {generic:'RV Global',weight:35,portfolioWeight:45,assetType:'RV',currentPositions:[],proposedPositions:[],subcategories:[]},
                {generic:'RF Europa',weight:65,portfolioWeight:55,assetType:'RF',benchmarkTicker:'BTEST',currentPositions:[],proposedPositions:[{isin:'ES0000000002',share:100}],subcategories:[]}
            ]}];
            GdcModel.state.rfMetrics={'F:ES0000000002':{ytm:4.2,duration:3},'B:BTEST':{ytm:3.8,duration:2.5}};
            OverviewPanel.render();
        });
        assert.ok(await page.locator('#overviewTreemapChart .js-plotly-plot').count()||await page.locator('#overviewTreemapChart svg').count());
        assert.ok(await page.locator('#overviewAggregateCurrencyChart .js-plotly-plot').count()||await page.locator('#overviewAggregateCurrencyChart svg').count());
        await page.locator('#overviewPanel').screenshot({path:path.join(os.tmpdir(),'overview-summary-desktop.png')});
        await page.locator('[data-tab="clients"]').click();
        assert.ok(await page.locator('.overview-detail').innerText().then(text=>text.includes('Cliente sintético')));
        assert.ok(await page.locator('#overviewCompareChart .js-plotly-plot').count()||await page.locator('#overviewCompareChart svg').count());
        assert.ok(await page.locator('#overviewAssetDonut .js-plotly-plot').count()||await page.locator('#overviewAssetDonut svg').count());
        assert.ok(await page.locator('#overviewCurrencyDonut .js-plotly-plot').count()||await page.locator('#overviewCurrencyDonut svg').count());
        assert.ok(await page.locator('#overviewHouseDonut .js-plotly-plot').count()||await page.locator('#overviewHouseDonut svg').count());
        await page.locator('[data-include-cash]').uncheck();
        assert.ok((await page.locator('.overview-detail').innerText()).includes('Total invertido'));
        await page.locator('[data-include-cash]').check();
        assert.ok((await page.locator('.overview-detail').innerText()).includes('EFECTIVO'));
        assert.ok((await page.locator('.overview-detail').innerText()).includes('4.20%'));
        assert.ok((await page.locator('.overview-detail').innerText()).includes('3.80%'));
        assert.ok((await page.locator('.overview-group').allInnerTexts()).some(text=>text.includes('RENTA FIJA')));
        assert.equal(await page.locator('.overview-brandbar').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)');
        await page.locator('#overviewPanel').screenshot({path:path.join(os.tmpdir(),'overview-desktop.png')});
        await page.setViewportSize({width:390,height:844});
        await page.locator('#overviewPanel').screenshot({path:path.join(os.tmpdir(),'overview-mobile.png')});
        await page.setViewportSize({width:1440,height:900});
        await page.evaluate(()=>window.scrollTo(0,0));
        await page.locator('[data-tab="funds"]').click();
        await page.locator('[data-fund-sort]').selectOption('accounts');
        await page.locator('[data-fund-type]').selectOption('RF');
        assert.equal(await page.locator('[data-fund]').count(),1);
        await page.locator('[data-fund-type]').selectOption('all');
        await page.locator('[data-fund="ES0000000001"]').click();
        assert.ok((await page.locator('.overview-presence').innerText()).includes('No lo tienen'));
        assert.ok((await page.locator('.overview-presence').innerText()).includes('44.44%'));
        await page.locator('#overviewPanel').screenshot({path:path.join(os.tmpdir(),'overview-funds.png')});
        await page.locator('[data-tab="levels"]').click();
        assert.ok((await page.locator('.overview-content').innerText()).includes('Cliente sintético'));
        assert.ok((await page.locator('.overview-content').innerText()).includes('Posición banda'));
        await page.locator('#overviewPanel').screenshot({path:path.join(os.tmpdir(),'overview-levels.png')});
        await page.locator('[data-tab="categories"]').click();
        await page.locator('[data-category-view="yahoo"]').click();
        await page.locator('[data-yahoo-isin="ES0000000001"]').fill('SPY');
        await page.locator('[data-yahoo-isin="ES0000000001"]').dispatchEvent('change');
        const tickers=await page.evaluate(()=>{const previous=XLSX.writeFile;let book;try{XLSX.writeFile=value=>{book=value;};OverviewPanel.exportCategories();}finally{XLSX.writeFile=previous;}return XLSX.utils.sheet_to_json(book.Sheets['Yahoo tickers']);});
        assert.equal(tickers.find(row=>row.ISIN==='ES0000000001')['Ticker Yahoo'],'SPY');
        await page.locator('[data-category-view="bands"]').click();
        assert.equal(await page.locator('[data-band="equilibrado"][data-band-index="1"]').inputValue(),'50');
        await page.locator('[data-band="equilibrado"][data-band-index="1"]').fill('55');
        await page.locator('[data-band="equilibrado"][data-band-index="1"]').dispatchEvent('change');
        const bandExport=await page.evaluate(()=>{const previous=XLSX.writeFile;let book;try{XLSX.writeFile=value=>{book=value;};OverviewPanel.exportCategories();}finally{XLSX.writeFile=previous;}return XLSX.utils.sheet_to_json(book.Sheets['Limites RV']);});
        assert.equal(bandExport.find(row=>row.Perfil==='EQUILIBRADO')['Banda superior'],55);
        const restored=await page.evaluate(async()=>{const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['ISIN','Tipo Activo','TIPO ACTIVO +'],['ES0000000001','RENTA VARIABLE','RV Global'],['ES0000000002','RENTA FIJA','RF Europa']]),'Categorización');XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Perfil','Banda inferior','Banda superior'],['EQUILIBRADO',30,52]]),'Limites RV');XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['ISIN','Es fondo casa','TER (%)'],['ES0000000001','SI',0.42]]),'Fondos Santalucia');await OverviewPanel.importCategories(new File([XLSX.write(book,{type:'array',bookType:'xlsx'})],'parametros.xlsx'));return {band:OverviewPanel.state.bands.equilibrado,house:OverviewPanel.state.houseFunds.get('ES0000000001')};});
        assert.deepEqual(restored.band,[30,52]);
        assert.equal(restored.house.house,true);
        assert.equal(restored.house.ter,0.42);
        await page.locator('[data-category-view="house"]').click();
        assert.ok(await page.locator('[data-house]').count()>0);
        await page.locator('[data-category-view="rf"]').click();
        await page.locator('#overviewPanel').screenshot({path:path.join(os.tmpdir(),'overview-rf.png')});
        const ytm=page.locator('[data-overview-rf="F:ES0000000002"][data-rf-field="ytm"]');
        await ytm.fill('4.5');await ytm.dispatchEvent('change');
        assert.equal(await page.evaluate(()=>GdcModel.state.rfMetrics['F:ES0000000002'].ytm),4.5);
        const rfExport=await page.evaluate(()=>{const previous=XLSX.writeFile;let book;try{XLSX.writeFile=value=>{book=value;};OverviewPanel.exportCategories();}finally{XLSX.writeFile=previous;}return XLSX.utils.sheet_to_json(book.Sheets['Renta fija']);});
        assert.equal(rfExport.find(row=>row.Identificador==='ES0000000002')['YTM (%)'],4.5);
        const importedRf=await page.evaluate(async()=>{const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['ISIN','Tipo Activo','TIPO ACTIVO +'],['ES0000000001','RENTA VARIABLE','RV Global'],['ES0000000002','RENTA FIJA','RF Europa']]),'Categorización');XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Tipo','Identificador','Nombre','Duracion modificada (anos)','YTM (%)'],['FONDO','ES0000000002','Fondo B',4,6.1]]),'Renta fija');await OverviewPanel.importCategories(new File([XLSX.write(book,{type:'array',bookType:'xlsx'})],'comite.xlsx'));return GdcModel.state.rfMetrics['F:ES0000000002'];});
        assert.equal(importedRf.ytm,6.1);
        assert.equal(importedRf.duration,4);
        await page.locator('[data-tab="validity"]').click();
        await page.locator('[data-validity-type]').selectOption('kyc');
        assert.ok((await page.locator('.overview-validity-group').innerText()).includes('KYC'));
        if(process.env.OVERVIEW_POSITIONS_FILE&&process.env.OVERVIEW_CONTROL_FILE){
            await page.locator('#aggregatePositionsFileInput').setInputFiles(process.env.OVERVIEW_POSITIONS_FILE);
            await page.waitForFunction(()=>OverviewPanel.state.positionsFile!==''&&OverviewPanel.state.positionsFile!=='posiciones-prueba.xlsx',null,{timeout:90000});
            await page.locator('[data-import-control]').setInputFiles(process.env.OVERVIEW_CONTROL_FILE);
            await page.waitForFunction(()=>OverviewPanel.state.controlFile!==''&&OverviewPanel.state.controlFile!=='control-prueba.xlsx',null,{timeout:90000});
            const audit=await page.evaluate(()=>{const rows=OverviewCore.analyze({positions:OverviewPanel.state.positions,clients:OverviewPanel.state.clients,categories:[...OverviewPanel.state.categories.values()]});return {accounts:rows.accounts.length,matched:rows.accounts.length-rows.noControl,unverified:rows.accounts.filter(row=>row.limit==='sin verificar').length};});
            assert.ok(audit.accounts>=40,'El fichero real perdió cuentas en la importación.');
            assert.ok(audit.matched>=35,'El fichero real no cruza con el control de clientes.');
            assert.equal(audit.unverified,audit.accounts,'Con categorización sintética no debe aprobarse ningún límite del fichero real.');
            const commission=await page.evaluate(()=>OverviewPanel.state.clients.map(row=>row.commission).filter(Number.isFinite));
            assert.ok(commission.length>=35);
            assert.ok(commission.some(value=>value>0&&value<0.01),'Comision Actual debe conservar su unidad decimal anual.');
            if(process.env.OVERVIEW_BALANCES_FILE){
                await page.locator('[data-import-balances]').setInputFiles(process.env.OVERVIEW_BALANCES_FILE);
                await page.waitForFunction(()=>OverviewPanel.state.balanceFile!=='',null,{timeout:120000});
                const cash=await page.evaluate(()=>({rows:OverviewPanel.state.balances.length,currencies:[...new Set(OverviewPanel.state.balances.map(item=>item.currency))],date:OverviewPanel.state.balanceDate?.toISOString().slice(0,10)}));
                assert.ok(cash.rows>=40,JSON.stringify(cash));
                assert.ok(cash.currencies.includes('USD'));
                assert.ok(cash.date);
                const converted=await page.evaluate(()=>{OverviewPanel.state.fxRates={USD:1.2,GBP:0.85,CAD:1.6};OverviewPanel.render();const value=OverviewCore.convertBalances(OverviewPanel.state.balances,OverviewPanel.state.fxRates),match=OverviewCore.matchBalanceAccounts(OverviewPanel.state.positions,OverviewPanel.state.balances);return {unresolved:value.unresolved.length,accounts:Object.keys(value.amounts).length,matched:Object.keys(match.links).filter(account=>Number.isFinite(value.amounts[account])).length,unmatched:match.unmatchedPositions.length,positionsDate:OverviewPanel.state.positionsDate?.toISOString().slice(0,10),balanceDate:OverviewPanel.state.balanceDate?.toISOString().slice(0,10)};});
                assert.equal(converted.unresolved,0);
                assert.ok(converted.accounts>=40);
                assert.ok(converted.matched>=35,`El cruce único por nombre debe conciliar las cuentas: ${converted.matched}/${converted.accounts}.`);
                assert.ok(converted.unmatched>0,'Las homonimias del fichero real deben permanecer pendientes.');
                assert.notEqual(converted.positionsDate,converted.balanceDate);
                await page.locator('[data-tab="summary"]').click();
                assert.ok((await page.locator('#overviewPanel').innerText()).includes('Fechas de posiciones y saldos distintas'));
                await page.locator('[data-valuation-date="positions"]').fill(cash.date);
                await page.locator('[data-valuation-date="positions"]').dispatchEvent('change');
                assert.equal(await page.evaluate(()=>OverviewPanel.state.positionsDate?.toISOString().slice(0,10)),cash.date);
                assert.equal(await page.evaluate(()=>OverviewPanel.state.positionsDateSource),'Introducida por el gestor');
                process.stdout.write(`Saldos reales validados: ${cash.rows} subcuentas; ${converted.matched} cuentas conciliadas automáticamente y ${converted.unmatched} pendientes; divisas ${cash.currencies.join(', ')}.\n`);
            }
            process.stdout.write(`Cruce real validado: ${audit.matched}/${audit.accounts} cuentas; límites pendientes sin cobertura completa de categorías y valoración conciliada.\n`);
        }
        await page.evaluate(()=>OverviewPanel.capturePositions([{'ISIN':'US0000000001','ACCOUNT':'Directa','INVERSIS ACCOUNT NUMBER':'A-DIRECTA','INSTRUMENT':'Acción directa','PRODUCT TYPE':'RENTA VARIABLE Y ETFs','TYPE OF ASSET':'ACCIONES INTERNACIONALES','DIV INSTITUTION COUNTER VALUE':100}],'directa.xlsx'));
        await page.locator('[data-tab="categories"]').click();await page.locator('[data-category-view="mapping"]').click();
        assert.ok((await page.locator('.overview-content').innerText()).includes('Tipo de activo en posiciones'));
        const combined=await page.evaluate(async()=>{
            const book=XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['ISIN','INSTRUMENT','ACCOUNT','INVERSIS ACCOUNT NUMBER','PRODUCT TYPE','TYPE OF ASSET','DIV INSTITUTION COUNTER VALUE'],['ES0000000010','Fondo combinado','Cuenta combinada','A-COMBINADA','FONDOS DE INVERSION','FONDOS INTERNACIONALES',100]]),'Posiciones');
            XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['ISIN','INSTRUMENTO','Tipo Activo','TIPO ACTIVO +'],['ES0000000010','Fondo combinado','RENTA FIJA','RF Europa']]),'Categorización');
            await importAggregatePositionsFile([new File([XLSX.write(book,{type:'array',bookType:'xlsx'})],'combinado.xlsx')]);
            return {file:OverviewPanel.state.categoryFile,category:OverviewPanel.state.categories.get('ES0000000010')?.generic,positions:OverviewPanel.state.positions.length};
        });
        assert.deepEqual(combined,{file:'combinado.xlsx',category:'RF Europa',positions:1});
        process.stdout.write('Panel: neteo, control, categorización, banda y vistas desktop/mobile OK.\n');
    }finally{await browser.close();}
})().catch(error=>{process.stderr.write(error.stack+'\n');process.exitCode=1;});
