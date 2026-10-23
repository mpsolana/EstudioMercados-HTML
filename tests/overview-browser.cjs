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
            const categoryBook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(categoryBook,XLSX.utils.aoa_to_sheet([['ISIN','Categoría genérica','Tipo'],[id,'RV Global','RV'],[other,'RF Europa','RF']]),'Categorización');
            await OverviewPanel.importCategories(new File([XLSX.write(categoryBook,{type:'array',bookType:'xlsx'})],'categorias-prueba.xlsx'));
        });
        const result=await page.evaluate(()=>OverviewCore.analyze({positions:OverviewPanel.state.positions,clients:OverviewPanel.state.clients,categories:[...OverviewPanel.state.categories.values()]}));
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
        assert.deepEqual(categoryExport.sheets,['Categorización']);
        assert.equal(categoryExport.rows.length,2);
        assert.equal(categoryExport.rows[0].Tipo,'RV');
        assert.ok(!JSON.stringify(categoryExport).includes('Cliente sintético'));
        await page.evaluate(()=>{
            GdcModel.state.mode='GDC';
            GdcModel.state.models=[{name:'Equilibrado',profile:'equilibrado',rows:[
                {generic:'RV Global',weight:35,portfolioWeight:45,assetType:'RV'},
                {generic:'RF Europa',weight:65,portfolioWeight:55,assetType:'RF'}
            ]}];
            OverviewPanel.render();
        });
        await page.locator('[data-tab="clients"]').click();
        assert.ok(await page.locator('.overview-detail').innerText().then(text=>text.includes('Cliente sintético')));
        assert.ok(await page.locator('#overviewCompareChart .js-plotly-plot').count()||await page.locator('#overviewCompareChart svg').count());
        await page.locator('#overviewPanel').screenshot({path:path.join(os.tmpdir(),'overview-desktop.png')});
        await page.setViewportSize({width:390,height:844});
        await page.locator('#overviewPanel').screenshot({path:path.join(os.tmpdir(),'overview-mobile.png')});
        await page.locator('[data-tab="funds"]').click();
        await page.locator('[data-fund="ES0000000001"]').click();
        assert.ok((await page.locator('.overview-presence').innerText()).includes('No lo tienen'));
        if(process.env.OVERVIEW_POSITIONS_FILE&&process.env.OVERVIEW_CONTROL_FILE){
            await page.locator('#aggregatePositionsFileInput').setInputFiles(process.env.OVERVIEW_POSITIONS_FILE);
            await page.waitForFunction(()=>OverviewPanel.state.positionsFile!==''&&OverviewPanel.state.positionsFile!=='posiciones-prueba.xlsx',null,{timeout:90000});
            await page.locator('[data-import-control]').setInputFiles(process.env.OVERVIEW_CONTROL_FILE);
            await page.waitForFunction(()=>OverviewPanel.state.controlFile!==''&&OverviewPanel.state.controlFile!=='control-prueba.xlsx',null,{timeout:90000});
            const audit=await page.evaluate(()=>{const rows=OverviewCore.analyze({positions:OverviewPanel.state.positions,clients:OverviewPanel.state.clients,categories:[...OverviewPanel.state.categories.values()]});return {accounts:rows.accounts.length,matched:rows.accounts.length-rows.noControl,unverified:rows.accounts.filter(row=>row.limit==='sin verificar').length};});
            assert.ok(audit.accounts>=40,'El fichero real perdió cuentas en la importación.');
            assert.ok(audit.matched>=35,'El fichero real no cruza con el control de clientes.');
            assert.equal(audit.unverified,audit.accounts,'Con categorización sintética no debe aprobarse ningún límite del fichero real.');
            process.stdout.write(`Cruce real validado: ${audit.matched}/${audit.accounts} cuentas; límites sin verificar hasta categorizar.\n`);
        }
        process.stdout.write('Panel: neteo, control, categorización, banda y vistas desktop/mobile OK.\n');
    }finally{await browser.close();}
})().catch(error=>{process.stderr.write(error.stack+'\n');process.exitCode=1;});
