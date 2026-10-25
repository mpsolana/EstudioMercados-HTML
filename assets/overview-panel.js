const OverviewPanel=(()=>{
    const state={positions:[],clients:[],categories:new Map(),yahooTickers:new Map(),yahooSeries:new Map(),yahooLoading:false,cashOverrides:new Map(),balanceLinks:{},balances:[],balanceFile:'',balanceDate:null,positionsDate:null,positionsDateSource:'',balanceDateSource:'',fxRates:{},fxSource:{},includeCash:true,bands:{muy_conservador:[0,15],prudente:[15,30],equilibrado:[30,50],decidido:[50,75],muy_arriesgado:[75,100]},houseFunds:new Map(),positionsFile:'',controlFile:'',categoryFile:'',categoryDirty:false,tab:'summary',categoryView:'mapping',selected:'',selectedFund:'',search:'',fundSort:'amount',fundType:'all',fundProduct:'all',validityType:'all',validityStatus:'all',levelSort:'base',levelDescending:true};
    const esc=value=>escapeHtml(String(value??''));
    const money=value=>Number.isFinite(value)?new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(value):'—';
    const pct=value=>Number.isFinite(value)?`${value.toFixed(2)}%`:'—';
    const date=value=>value instanceof Date&&Number.isFinite(+value)?value.toLocaleDateString('es-ES'):'—';
    const inputDate=value=>value instanceof Date&&Number.isFinite(+value)?`${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`:'';
    const toDate=value=>parseExcelDate(value);
    const fileDate=name=>{const match=String(name||'').match(/(?:^|\D)(\d{2})(\d{2})(20\d{2})(?:\D|$)/);if(!match)return null;const date=new Date(+match[3],+match[2]-1,+match[1]);return date.getFullYear()===+match[3]&&date.getMonth()===+match[2]-1&&date.getDate()===+match[1]?date:null;};
    const plusMonths=(value,months)=>{const start=toDate(value);if(!start||!Number.isFinite(months)||months<=0)return null;const first=new Date(start.getFullYear(),start.getMonth()+months,1),lastDay=new Date(first.getFullYear(),first.getMonth()+1,0).getDate();return new Date(first.getFullYear(),first.getMonth(),Math.min(start.getDate(),lastDay));};
    const modelsByOrg=()=>Object.fromEntries(['GDC','GICI'].map(org=>[org,GdcModel.state.mode===org?GdcModel.state.models:GdcModel.state.scopes[org]?.models||[]]));
    const categoryType=value=>{const text=OverviewCore.key(value);return text==='rv'||text==='renta variable'?'RV':text==='rf'||text==='renta fija'?'RF':text==='otros'?'Otros':'';};
    const categoryColumns=['TIPO PRODUCTO','ISIN','INSTRUMENTO','Tipo Activo','TIPO ACTIVO +','TIPO ACTIVO VS BENCH','DIVISA','HEDGE','ESTRATEGIA DE INVERSIÓN','EUR EXPO','USD EXPO','OTROS EXPO','eur+usd'];
    const exposure=value=>value===null||value===undefined||String(value).trim()===''?NaN:parseRankingNumber(value);
    function automaticCategory(fund){
        const suggested=categorySuggestion(fund);
        if(suggested)return {...suggested,source:'Universo + mapeo modelo'};
        const position=state.positions.find(row=>row.isin===fund.isin),asset=OverviewCore.key(position?.assetType),product=OverviewCore.key(position?.productType);
        if(asset.startsWith('acciones ')||asset==='accion individual')return {isin:fund.isin,type:'RV',assetType:'RENTA VARIABLE',generic:'RV directa',source:'Tipo de activo en posiciones'};
        if(product==='renta fija'||asset.startsWith('deuda ')||asset.startsWith('bonos y obligaciones')||asset.startsWith('renta fija '))return {isin:fund.isin,type:'RF',assetType:'RENTA FIJA',generic:'RF directa',source:'Tipo de activo en posiciones'};
        return null;
    }
    function effectiveCategories(){
        const known=new Map(state.categories);
        for(const position of state.positions)if(!known.get(position.isin)?.generic){
            const suggestion=automaticCategory(position);
            if(suggestion)known.set(position.isin,{...known.get(position.isin),...suggestion,productType:known.get(position.isin)?.productType||position.productType,instrument:known.get(position.isin)?.instrument||position.name});
        }
        return known;
    }
    function capturePositions(rows,fileName){
        state.cashOverrides.clear();state.balanceLinks={};state.selectedFund='';
        const parsed=(rows||[]).filter(row=>!/^inmovilizad[oa]s?$/i.test(String(looseRowValue(row,['BALANCE TYPE','Balance type','Tipo saldo'])||'').trim())).map(row=>({
            isin:normalizeIsin(looseRowValue(row,['ISIN','Ticker','Código ISIN'])),
            account:String(looseRowValue(row,['INVERSIS ACCOUNT NUMBER','Número cuenta Inversis','ACCOUNT','Cuenta'])||'').trim(),
            accountLabel:String(looseRowValue(row,['ACCOUNT','Cliente'])||'').trim(),
            name:String(looseRowValue(row,['INSTRUMENT','Instrumento','Nombre'])||'').trim(),
            amount:parseRankingNumber(looseRowValue(row,['DIV INSTITUTION COUNTER VALUE','Counter Value','Contravalor EUR','Contravalor','Valor efectivo','Market Value','MARKET VALUE'])),
            productType:String(looseRowValue(row,['PRODUCT TYPE','Tipo producto','Product'])||'').trim(),
            assetType:String(looseRowValue(row,['TYPE OF ASSET','Tipo activo','Asset Type'])||'').trim()
        })).filter(row=>row.isin&&row.account);
        const net=new Map();
        for(const row of parsed){
            const key=`${OverviewCore.id(row.account)}|${row.isin}`,prior=net.get(key);
            if(!prior){net.set(key,{...row,amount:Number.isFinite(row.amount)?row.amount:NaN});continue;}
            prior.amount=Number.isFinite(prior.amount)&&Number.isFinite(row.amount)?prior.amount+row.amount:NaN;
            if(!prior.name&&row.name)prior.name=row.name;
        }
        state.positions=[...net.values()].filter(row=>!Number.isFinite(row.amount)||row.amount>0.005);
        state.positionsFile=fileName;state.positionsDate=fileDate(fileName);state.positionsDateSource=state.positionsDate?'Nombre del archivo':'Pendiente';render();loadYahooSeries();
    }
    function controlRows(workbook){
        const sheet=findSheet(workbook,['Control DNI & TEST']);
        if(!sheet)throw new Error('Falta la hoja Control DNI & TEST. No se han cargado clientes.');
        const range=XLSX.utils.decode_range(workbook.Sheets[sheet]['!ref']);range.s.c=0;range.s.r=0;
        const grid=XLSX.utils.sheet_to_json(workbook.Sheets[sheet],{header:1,defval:null,raw:true,range});
        const header=grid[2]||[];
        if(!String(header[2]||'').toUpperCase().includes('CUENTA')||!String(header[49]||'').toUpperCase().includes('PERFIL'))throw new Error('El formato del control ha cambiado: revisa las columnas CUENTA y PERFIL GESTION ID.');
        const docs=[['Titular',6,7],['Cotitular',10,11],['Apoderado',14,15],['Representante 1',18,19],['Representante 2',22,23],['Autorizado 1',26,27],['Autorizado 2',30,31],['Autorizado 3',34,35]];
        return grid.slice(3).map(row=>{
            const account=String(row[2]||'').trim(),code=String(row[60]||'').trim();
            if(!account&&!code)return null;
            return {account,code,name:String(row[1]||code||account).trim(),organization:String(row[55]||'').trim().toUpperCase(),profile:String(row[49]||'').trim(),commission:exposure(row[57]),reportedAum:parseRankingNumber(row[63]),qualitative:[['Estado',row[3]],['Resultado test',row[48]],['Condiciones',row[59]],['Control tarifas',row[56]],['Grupo familiar',row[53]],['Empleado',row[62]]].filter(([,value])=>value!==null&&value!==undefined&&String(value).trim()!==''),
                documents:docs.filter(([role,documentIndex,expiryIndex])=>role==='Titular'||row[documentIndex-1]||row[documentIndex]||row[expiryIndex]).map(([role,documentIndex,expiryIndex])=>({role,present:Boolean(row[documentIndex]),expiry:toDate(row[expiryIndex])})),
                kycExpiry:plusMonths(row[43],Number(row[45])),suitabilityExpiry:toDate(row[46]),esgExpiry:toDate(row[50]),birthday:toDate(row[64])};
        }).filter(Boolean);
    }
    async function importControl(file){
        if(!file)return;
        const clients=controlRows(await readWorkbook(file));
        state.clients=clients;state.controlFile=file.name;state.cashOverrides.clear();render();
    }
    async function importCategories(file){
        if(!file)return;
        return loadCategoriesWorkbook(await readWorkbook(file),file.name);
    }
    async function importBalances(file){
        if(!file)return;
        const workbook=await readWorkbook(file),sheet=workbook.SheetNames[0];
        const rows=sheetRowsFromHeader(workbook,sheet);
        if(!rows.length||!Object.keys(rows[0]).includes('TRANSACTIONAL ACCOUNT')||!Object.keys(rows[0]).includes('BALANCE'))throw new Error('Saldos: faltan TRANSACTIONAL ACCOUNT o BALANCE.');
        state.balances=OverviewCore.parseBalanceRows(rows.map(row=>({...row,BALANCE:exposure(row.BALANCE)})));state.balanceLinks={};state.balanceFile=file.name;
        const currencies=[...new Set(state.balances.filter(row=>row.amount!==0&&row.currency!=='EUR').map(row=>row.currency))];
        const dates=state.balances.map(row=>toDate(row.date)).filter(Boolean);
        state.balanceDate=dates.length&&dates.every(value=>value.toDateString()===dates[0].toDateString())?dates[0]:null;state.balanceDateSource=state.balanceDate?'Excel de saldos':'Pendiente: fechas distintas o ausentes';
        const asOf=dates.length?new Date(Math.min(...dates.map(Number))):new Date();
        const start=new Date(asOf);start.setDate(start.getDate()-14);
        const end=new Date(asOf);end.setDate(end.getDate()+2);
        await Promise.all(currencies.filter(currency=>!Number.isFinite(state.fxRates[currency])).map(async currency=>{
            try{
                const prices=await MarketData.prices(`EUR${currency}=X`,start.toISOString().slice(0,10),end.toISOString().slice(0,10));
                const available=prices.filter(point=>point.date<=asOf),last=available.at(-1);
                if(!last)throw new Error('Sin precio anterior a la fecha de saldo');
                state.fxRates[currency]=last.price;state.fxSource[currency]=`Yahoo · ${last.date.toLocaleDateString('es-ES')}`;
            }catch(error){state.fxSource[currency]=`Pendiente: ${error.message}`;}
        }));
        render();
    }
    function loadCategoriesWorkbook(workbook,fileName){
        const sheet=findSheet(workbook,['Categorización','Categorizacion']);
        if(!sheet)throw new Error('Falta la hoja Categorización con una columna ISIN.');
        const rows=sheetRowsFromHeader(workbook,sheet),next=new Map();
        for(const row of rows){
            const isin=normalizeIsin(looseRowValue(row,['ISIN']));
            if(!isin)continue;
            const generic=String(row['TIPO ACTIVO +']??looseRowValue(row,['Categoría genérica','Categoria generica','Categoría','Categoria'])??'').trim();
            const assetType=String(row['Tipo Activo']??row['TIPO ACTIVO']??looseRowValue(row,['Tipo','RV/RF'])??'').trim();
            next.set(isin,{isin,generic,benchCategory:String(looseRowValue(row,['TIPO ACTIVO VS BENCH'])||'').trim(),type:categoryType(assetType),assetType:assetType||'',productType:String(looseRowValue(row,['TIPO PRODUCTO'])||'').trim(),instrument:String(looseRowValue(row,['INSTRUMENTO','Nombre'])||'').trim(),currency:String(looseRowValue(row,['DIVISA'])||'').trim(),hedge:String(looseRowValue(row,['HEDGE'])||'').trim(),strategy:String(looseRowValue(row,['ESTRATEGIA DE INVERSIÓN','ESTRATEGIA DE INVERSION'])||'').trim(),eurExpo:exposure(looseRowValue(row,['EUR EXPO'])),usdExpo:exposure(looseRowValue(row,['USD EXPO'])),otherExpo:exposure(looseRowValue(row,['OTROS EXPO','OTROS EXP','OTROS EX']))});
        }
        state.categories=next;state.categoryFile=fileName;state.categoryDirty=false;
        const yahooSheet=findSheet(workbook,['Yahoo tickers','Tickers Yahoo']);
        state.yahooTickers=new Map(yahooSheet?sheetRowsFromHeader(workbook,yahooSheet).map(row=>[normalizeIsin(looseRowValue(row,['ISIN'])),String(looseRowValue(row,['Ticker Yahoo','Ticker YF'])||'').trim().toUpperCase()]).filter(([isin,ticker])=>isin&&ticker):[]);
        state.yahooSeries.clear();
        const rfSheet=findSheet(workbook,['Renta fija','RF']);
        if(rfSheet){
            const rows=sheetRowsFromHeader(workbook,rfSheet),entries=rows.map(row=>{const kind=OverviewCore.key(looseRowValue(row,['Tipo'])),identifier=OverviewCore.id(looseRowValue(row,['Identificador','ISIN','Ticker'])),key=`${kind==='indice'||kind==='benchmark'?'B':'F'}:${identifier}`;return [key,{duration:exposure(looseRowValue(row,['Duracion modificada (anos)','Duración modificada (años)','Duración'])),ytm:exposure(looseRowValue(row,['YTM (%)','YTM']))}];}).filter(([key])=>/^[BF]:[A-Z0-9]+$/.test(key));
            GdcModel.mergeRfMetrics(entries);render();
        }
        else render();
        const bandSheet=findSheet(workbook,['Limites RV','Límites RV']);
        if(bandSheet){state.bands={muy_conservador:[0,15],prudente:[15,30],equilibrado:[30,50],decidido:[50,75],muy_arriesgado:[75,100]};for(const row of sheetRowsFromHeader(workbook,bandSheet)){
            const profile=ModelPortfolioCore.profile(looseRowValue(row,['Perfil','PERFILES DE']));
            const low=exposure(looseRowValue(row,['Banda inferior','Min RV'])),high=exposure(looseRowValue(row,['Banda superior','Max RV']));
            if(profile&&Number.isFinite(low)&&Number.isFinite(high)&&low>=0&&high<=100&&low<high)state.bands[profile]=[low,high];
        }}
        const houseSheet=findSheet(workbook,['Fondos Santalucia','Fondos de la casa']);
        if(houseSheet){state.houseFunds=new Map();for(const row of sheetRowsFromHeader(workbook,houseSheet)){
            const isin=normalizeIsin(looseRowValue(row,['ISIN']));if(!isin)continue;
            const flag=OverviewCore.key(looseRowValue(row,['Es fondo casa','Fondo casa']));
            state.houseFunds.set(isin,{house:['si','sí','1','true'].includes(flag)?true:['no','0','false'].includes(flag)?false:null,ter:exposure(looseRowValue(row,['TER (%)','TER']))});
        }}
        render();
        loadYahooSeries();
    }
    function exportCategories(){
        if(!window.XLSX)throw new Error('No se ha cargado XLSX.');
        const workbook=XLSX.utils.book_new(),known=effectiveCategories();
        for(const position of state.positions)if(!known.has(position.isin))known.set(position.isin,{isin:position.isin,generic:'',type:''});
        const grid=[categoryColumns,...[...known.values()].sort((a,b)=>a.isin.localeCompare(b.isin)).map(row=>{const source=state.positions.find(p=>p.isin===row.isin),mix=OverviewCore.exposureMix(row);return [row.productType||source?.productType||'',row.isin,row.instrument||source?.name||'',row.assetType||({RV:'RENTA VARIABLE',RF:'RENTA FIJA',Otros:'OTROS'}[row.type]||''),row.generic||'',row.benchCategory||'',row.currency||'',row.hedge||'',row.strategy||'',Number.isFinite(row.eurExpo)?row.eurExpo:'',Number.isFinite(row.usdExpo)?row.usdExpo:'',Number.isFinite(row.otherExpo)?row.otherExpo:'',mix?row.eurExpo+row.usdExpo:''];})];
        const sheet=XLSX.utils.aoa_to_sheet(grid);sheet['!autofilter']={ref:`A1:M${grid.length}`};sheet['!cols']=[20,17,44,18,20,22,10,10,25,11,11,12,11].map(wch=>({wch}));
        XLSX.utils.book_append_sheet(workbook,sheet,'Categorización');
        const yahooRows=[['ISIN','Instrumento','Ticker Yahoo'],...[...known.values()].sort((a,b)=>a.isin.localeCompare(b.isin)).map(row=>[row.isin,row.instrument||state.positions.find(item=>item.isin===row.isin)?.name||'',state.yahooTickers.get(row.isin)||''])];
        const yahooSheet=XLSX.utils.aoa_to_sheet(yahooRows);yahooSheet['!autofilter']={ref:`A1:C${yahooRows.length}`};yahooSheet['!cols']=[22,48,22].map(wch=>({wch}));XLSX.utils.book_append_sheet(workbook,yahooSheet,'Yahoo tickers');
        const rfRows=[['Tipo','Identificador','Nombre','Duracion modificada (anos)','YTM (%)'],...[...rfInventory(data())].sort(([a],[b])=>a.localeCompare(b)).map(([key,fund])=>{const item=GdcModel.state.rfMetrics[key]||{},identifier=key.slice(2),name=fund?.name||GdcModel.state.fundNames[identifier]||GdcModel.state.benchmarkMeta[identifier]?.name||fundUniverseState?.isinIndex?.get(identifier)?.name||'';return [key.startsWith('B:')?'INDICE':'FONDO',identifier,name,Number.isFinite(item.duration)?item.duration:'',Number.isFinite(item.ytm)?item.ytm:''];})];
        const rfSheet=XLSX.utils.aoa_to_sheet(rfRows);rfSheet['!autofilter']={ref:`A1:E${rfRows.length}`};rfSheet['!cols']=[14,22,44,27,14].map(wch=>({wch}));XLSX.utils.book_append_sheet(workbook,rfSheet,'Renta fija');
        const bands=[['Perfil','Banda inferior','Banda superior','Max RV'],...Object.entries(state.bands).map(([profile,[low,high]])=>[profile.replaceAll('_',' ').toUpperCase(),low,high,high])];
        XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet(bands),'Limites RV');
        const houseInventory=new Map([...state.houseFunds.keys()].map(isin=>[isin,{isin,name:known.get(isin)?.instrument||'',productType:known.get(isin)?.productType||''}]));
        for(const fund of data().funds)houseInventory.set(fund.isin,fund);
        const house=[['ISIN','Instrumento','Es fondo casa','TER (%)'],...[...houseInventory.values()].sort((a,b)=>a.isin.localeCompare(b.isin)).map(fund=>{const item=houseInfo(fund);return [fund.isin,fund.name,item.house===true?'SI':item.house===false?'NO':'REVISAR',Number.isFinite(item.ter)?item.ter:''];})];
        XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet(house),'Fondos Santalucia');
        XLSX.writeFile(workbook,'Categorizacion_carteras.xlsx');
        state.categoryDirty=false;render();
    }
    function saveCategory(form){
        const isin=normalizeIsin(form.dataset.isin),generic=form.querySelector('[name="generic"]').value.trim(),type=form.querySelector('[name="type"]').value;
        if(!isin||!generic||!['RV','RF','Otros'].includes(type))throw new Error('Indica categoría genérica y tipo RV, RF u Otros.');
        const prior=state.categories.get(isin)||{},source=state.positions.find(row=>row.isin===isin),read=name=>form.querySelector(`[name="${name}"]`)?.value.trim()||'';
        state.categories.set(isin,{...prior,isin,generic,benchCategory:read('benchCategory'),type,assetType:{RV:'RENTA VARIABLE',RF:'RENTA FIJA',Otros:'OTROS'}[type],productType:read('productType')||source?.productType||'',instrument:read('instrument')||source?.name||'',currency:read('currency'),hedge:read('hedge'),strategy:read('strategy'),eurExpo:exposure(read('eurExpo')),usdExpo:exposure(read('usdExpo')),otherExpo:exposure(read('otherExpo'))});state.categoryDirty=true;render();
    }
    function categorySuggestion(fund){
        const record=fundUniverseState?.isinIndex?.get(fund.isin);
        if(!record?.category)return null;
        const candidates=new Map();
        for(const models of Object.values(modelsByOrg()))for(const portfolio of models)for(const row of portfolio.rows){
            if((row.subcategories||[]).some(category=>OverviewCore.key(category)===OverviewCore.key(record.category))&&['RV','RF','Otros'].includes(row.assetType))candidates.set(OverviewCore.key(row.generic),{isin:fund.isin,generic:row.generic,type:row.assetType,assetType:{RV:'RENTA VARIABLE',RF:'RENTA FIJA',Otros:'OTROS'}[row.assetType]});
        }
        return candidates.size===1?[...candidates.values()][0]:null;
    }
    function acceptSuggestions(){
        const suggestions=data().funds.filter(fund=>!state.categories.get(fund.isin)?.generic).map(categorySuggestion).filter(Boolean);
        for(const suggestion of suggestions)state.categories.set(suggestion.isin,{...state.categories.get(suggestion.isin),...suggestion});
        if(suggestions.length)state.categoryDirty=true;
        render();
    }
    function houseInfo(fund){
        const saved=state.houseFunds.get(fund.isin),name=OverviewCore.key(fund.name).replace(/[^a-z]/g,''),recognized=/santa?lucia/.test(name);
        const record=fundUniverseState?.isinIndex?.get(fund.isin);
        const direct=/accion individual|bono directo|etf|plan de pensiones/.test(OverviewCore.key(fund.productType));
        return {house:typeof saved?.house==='boolean'?saved.house:recognized?true:direct?false:null,ter:Number.isFinite(saved?.ter)?saved.ter:Number.isFinite(record?.ter)?record.ter:NaN};
    }
    function needsTer(fund){
        const product=OverviewCore.key(fund.productType||fund.classification?.productType),asset=OverviewCore.key(fund.assetType);
        return /etf|fondo|plan/.test(product)||!/accion individual|bono directo|accion directa|deuda directa/.test(product)&&!/^acciones (internacionales|nacionales)|^deuda |^bonos y obligaciones/.test(asset);
    }
    function cashResult(){
        const converted=OverviewCore.convertBalances(state.balances,state.fxRates);
        const matching=OverviewCore.matchBalanceAccounts(state.positions,state.balances,state.balanceLinks),amounts={};
        for(const [source,target] of Object.entries(matching.links))if(Object.prototype.hasOwnProperty.call(converted.amounts,source))amounts[target]=converted.amounts[source];
        return {...converted,...matching,amounts:{...amounts,...Object.fromEntries([...state.cashOverrides].map(([account,value])=>[OverviewCore.id(account),value]))}};
    }
    async function loadYahooSeries(){
        if(state.yahooLoading)return;
        const active=[...new Set(state.positions.map(row=>row.isin))].map(isin=>[isin,state.yahooTickers.get(isin)]).filter(([,ticker])=>ticker&&!state.yahooSeries.has(ticker));
        if(!active.length){renderYahooChart();return;}
        state.yahooLoading=true;render();
        const start=new Date();start.setFullYear(start.getFullYear()-10);const from=start.toISOString().slice(0,10),to=new Date().toISOString().slice(0,10);
        for(let i=0;i<active.length;i+=6)await Promise.all(active.slice(i,i+6).map(async([,ticker])=>{
            try{state.yahooSeries.set(ticker,await MarketData.prices(ticker,from,to));}catch{state.yahooSeries.set(ticker,[]);}
        }));
        state.yahooLoading=false;render();
    }
    function renderYahooChart(){
        const chart=document.getElementById('overviewYahooChart');if(!chart||state.tab!=='categories'||state.categoryView!=='yahoo'||!window.Plotly)return;
        const funds=data().funds.filter(fund=>state.yahooTickers.has(fund.isin));
        const traces=funds.map(fund=>{const ticker=state.yahooTickers.get(fund.isin),series=state.yahooSeries.get(ticker)||[],first=series[0]?.price;
            return first>0?{type:'scatter',mode:'lines',name:`${fund.name} (${fund.isin})`,x:series.map(point=>point.date),y:series.map(point=>point.price/first*100)}:null;
        }).filter(Boolean);
        if(traces.length)FinancialVisuals.newPlot(chart,traces,{title:'Evolución de activos en cartera · base 100',yaxis:{title:'Base 100'},hovermode:'x unified',height:440,margin:{t:55,l:60,r:20,b:70},legend:{orientation:'h',y:-.25}},{responsive:true});
    }
    function data(){
        const cash=cashResult(),positions=state.positions.map(row=>({...row,house:houseInfo(row).house}));
        const valuationAligned=!state.balances.length||Boolean(state.positionsDate&&state.balanceDate&&state.positionsDate.toDateString()===state.balanceDate.toDateString());
        return {...OverviewCore.analyze({positions,clients:state.clients,categories:[...effectiveCategories().values()],cashByAccount:cash.amounts,modelsByOrg:modelsByOrg(),rfMetrics:GdcModel.state.rfMetrics,bandsByProfile:state.bands,valuationAligned}),cashUnresolved:cash.unresolved,balanceMatch:cash};
    }
    const badge=value=>`<span class="overview-badge overview-${['dentro','vigente'].includes(value)?'ok':['caducado','excede máximo','bajo mínimo'].includes(value)?'bad':'warn'}">${esc(value)}</span>`;
    function economics(result){
        const integrated=result.accounts.reduce((sum,row)=>sum+row.base,0);
        let feeBase=0,management=0,missingFees=0;
        for(const row of result.accounts){
            const raw=row.client?.commission,rate=Number.isFinite(raw)&&raw>=0?(raw<=1?raw:raw/100):NaN;
            if(Number.isFinite(rate)){feeBase+=row.base;management+=row.base*rate;}
            else missingFees++;
        }
        let houseAum=0,houseTerBase=0,houseTerCost=0,unreviewed=0;
        for(const fund of result.funds){
            const item=houseInfo(fund);
            if(item.house===true){houseAum+=fund.amount;if(Number.isFinite(item.ter)){houseTerBase+=fund.amount;houseTerCost+=fund.amount*item.ter/100;}}
            else if(item.house===null)unreviewed+=fund.amount;
        }
        return {integrated,feeBase,management,missingFees,weightedFee:feeBase>0?management/feeBase*100:NaN,houseAum,houseTerBase,houseTerCost,houseTer:houseTerBase>0?houseTerCost/houseTerBase*100:NaN,unreviewed};
    }
    function currencyWithCash(row,includeCash=state.includeCash){
        const exposure={...row.currencyExposure};
        if(!includeCash||!row.cashKnown)return exposure;
        const source=Object.entries(OverviewCore.matchBalanceAccounts(state.positions,state.balances,state.balanceLinks).links).find(([,target])=>target===OverviewCore.id(row.account))?.[0];
        const booked=state.balances.filter(item=>OverviewCore.id(item.account)===source);
        if(state.cashOverrides.has(row.account)||!booked.length){exposure.eur+=row.cash;return exposure;}
        for(const item of booked){const amount=item.amount/(item.currency==='EUR'?1:state.fxRates[item.currency]);if(!Number.isFinite(amount))continue;const bucket=item.currency==='EUR'?'eur':item.currency==='USD'?'usd':'other';exposure[bucket]+=amount;}
        return exposure;
    }
    function levels(result){
        const rows=result.accounts.map(row=>{
            const base=row.base,rf=row.positions.filter(item=>item.classification?.type==='RF').reduce((sum,item)=>sum+item.amount,0);
            const exposure=currencyWithCash(row,true),known=exposure.eur+exposure.usd+exposure.other;
            let terCost=0,terMissing=0;
            for(const item of row.positions){
                if(!(item.amount>0))continue;
                if(!needsTer(item))continue;
                const ter=houseInfo(item).ter;
                if(Number.isFinite(ter))terCost+=item.amount*ter/100;else terMissing+=item.amount;
            }
            const raw=row.client?.commission,management=Number.isFinite(raw)?raw<=1?raw*100:raw:NaN;
            const ter=base>0&&terMissing<0.005?terCost/base*100:NaN;
            // Desglose provisional: el IVA se retira del importe bruto antes de restar la depositaría sin IVA.
            const implicit=Number.isFinite(ter)&&Number.isFinite(management)?ter+management/1.21-0.15:NaN;
            return {row,rf,exposure,known,ter,terMissing,management,implicit};
        });
        const sortValue=item=>{const {row,rf,exposure,known,ter,management,implicit}=item,base=row.base;
            return {account:row.client?.name||row.account,organization:row.organization,profile:row.client?.profile,test:row.client?.qualitative?.find(([label])=>label==='Resultado test')?.[1],base,rv:row.rvPct,rf:base>0?rf/base*100:NaN,cash:row.cashKnown&&base>0?row.cash/base*100:NaN,band:row.bandPosition,eur:base>0&&known>=base-.01?exposure.eur/base*100:NaN,usd:base>0&&known>=base-.01?exposure.usd/base*100:NaN,other:base>0&&known>=base-.01?exposure.other/base*100:NaN,duration:row.rf.duration,ytm:row.rf.ytm,ter,management,implicit,limit:row.limit}[state.levelSort];
        };
        rows.sort((a,b)=>{const x=sortValue(a),y=sortValue(b),missingX=x==null||typeof x==='number'&&!Number.isFinite(x),missingY=y==null||typeof y==='number'&&!Number.isFinite(y);if(missingX||missingY)return Number(missingX)-Number(missingY);const order=typeof x==='number'&&typeof y==='number'?x-y:String(x).localeCompare(String(y),'es');return state.levelDescending?-order:order;});
        const cell=value=>`<td class="num">${pct(value)}</td>`;
        return `<h3>Niveles por cliente</h3><p class="overview-context">Pesos sobre posición integrada conocida (posiciones + efectivo confirmado); si falta efectivo, son orientativos sobre invertido. Las divisas son exposición económica look-through, no divisa de cotización. YTM y duración se ponderan dentro de RF y exigen cobertura completa. TER ponderado sobre la posición integrada: los instrumentos directos no tienen TER; cualquier fondo sin TER deja el dato pendiente. Comisión implícita provisional = TER + comisión de gestión / 1,21 − 0,15 puntos porcentuales (depositaría); pendiente de confirmar la composición contractual de «Comisión Actual». No es una estimación de ingresos de la gestora.</p><div class="overview-scroll"><table><thead><tr><th><button type="button" data-level-sort="account" aria-label="Ordenar por Cuenta / cliente">Cuenta / cliente ${state.levelSort==='account'?(state.levelDescending?'▼':'▲'):''}</button></th><th><button type="button" data-level-sort="organization" aria-label="Ordenar por Entidad">Entidad ${state.levelSort==='organization'?(state.levelDescending?'▼':'▲'):''}</button></th><th><button type="button" data-level-sort="profile" aria-label="Ordenar por Perfil gestión">Perfil gestión ${state.levelSort==='profile'?(state.levelDescending?'▼':'▲'):''}</button></th><th><button type="button" data-level-sort="test" aria-label="Ordenar por Resultado test">Resultado test ${state.levelSort==='test'?(state.levelDescending?'▼':'▲'):''}</button></th><th><button type="button" data-level-sort="rv" aria-label="Ordenar por RV">RV ${state.levelSort==='rv'?(state.levelDescending?'▼':'▲'):''}</button></th><th><button type="button" data-level-sort="rf" aria-label="Ordenar por RF">RF ${state.levelSort==='rf'?(state.levelDescending?'▼':'▲'):''}</button></th><th><button type="button" data-level-sort="cash" aria-label="Ordenar por Cash">Cash ${state.levelSort==='cash'?(state.levelDescending?'▼':'▲'):''}</button></th><th><button type="button" data-level-sort="band" aria-label="Ordenar por Posición banda">Posición banda ${state.levelSort==='band'?(state.levelDescending?'▼':'▲'):''}</button></th><th>Rango RV / RF</th><th><button type="button" data-level-sort="eur" aria-label="Ordenar por EUR">EUR ${state.levelSort==='eur'?(state.levelDescending?'▼':'▲'):''}</button></th><th><button type="button" data-level-sort="usd" aria-label="Ordenar por USD">USD ${state.levelSort==='usd'?(state.levelDescending?'▼':'▲'):''}</button></th><th><button type="button" data-level-sort="other" aria-label="Ordenar por Otros">Otros ${state.levelSort==='other'?(state.levelDescending?'▼':'▲'):''}</button></th><th><button type="button" data-level-sort="duration" aria-label="Ordenar por Duración RF">Duración RF ${state.levelSort==='duration'?(state.levelDescending?'▼':'▲'):''}</button></th><th><button type="button" data-level-sort="ytm" aria-label="Ordenar por YTM RF">YTM RF ${state.levelSort==='ytm'?(state.levelDescending?'▼':'▲'):''}</button></th><th><button type="button" data-level-sort="ter" aria-label="Ordenar por TER">TER ${state.levelSort==='ter'?(state.levelDescending?'▼':'▲'):''}</button></th><th><button type="button" data-level-sort="management" aria-label="Ordenar por Comisión gestión">Comisión gestión ${state.levelSort==='management'?(state.levelDescending?'▼':'▲'):''}</button></th><th><button type="button" data-level-sort="implicit" aria-label="Ordenar por Comisión implícita*">Comisión implícita* ${state.levelSort==='implicit'?(state.levelDescending?'▼':'▲'):''}</button></th><th><button type="button" data-level-sort="limit" aria-label="Ordenar por Control RV">Control RV ${state.levelSort==='limit'?(state.levelDescending?'▼':'▲'):''}</button></th></tr></thead><tbody>${rows.map(({row,rf,exposure,known,ter,management,implicit})=>{const base=row.base,test=row.client?.qualitative?.find(([label])=>label==='Resultado test')?.[1];return `<tr><td><button class="overview-link" data-client="${esc(row.account)}">${esc(row.client?.code||row.account)}</button><br><small>${esc(row.client?.name||row.accountLabel||'Sin cruce')}</small></td><td>${esc(row.organization||'—')}</td><td>${esc(row.client?.profile||'—')}</td><td>${esc(test||'—')}</td>${cell(row.rvPct)}${cell(base>0?rf/base*100:NaN)}${cell(row.cashKnown&&base>0?row.cash/base*100:NaN)}${cell(row.bandPosition)}<td>${row.band?`${row.band[0]}–${row.band[1]}% RV / ${100-row.band[1]}–${100-row.band[0]}% RF*`:'—'}</td>${cell(base>0&&known>=base-.01?exposure.eur/base*100:NaN)}${cell(base>0&&known>=base-.01?exposure.usd/base*100:NaN)}${cell(base>0&&known>=base-.01?exposure.other/base*100:NaN)}<td class="num">${Number.isFinite(row.rf.duration)?row.rf.duration.toFixed(2):'—'}</td>${cell(row.rf.ytm)}${cell(ter)}${cell(management)}${cell(implicit)}<td>${badge(row.limit)}${row.limitReasons.length?`<br><small title="${esc(row.limitReasons.join('; '))}">${esc(row.limitReasons.join('; '))}</small>`:''}</td></tr>`;}).join('')||'<tr><td colspan="18">Carga posiciones para ver los niveles.</td></tr>'}</tbody></table></div><p class="overview-context">«Sin verificar» significa que falta un dato para acreditar el límite RV; el motivo concreto figura bajo el estado. * El rango RF es el complemento de la banda RV solo si la cartera se reparte exclusivamente entre RV y RF. Con efectivo u otros activos, no constituye un límite contractual de RF. Las cifras de divisa se ocultan si hay exposición sin clasificar.</p>`;
    }
    function summary(result){
        const matched=result.accounts.length-result.noControl;
        const expired=result.accounts.filter(row=>row.documents.some(doc=>doc.status==='caducado')||[row.kyc,row.suitability,row.esg].includes('caducado')).length;
        const possible=result.accounts.filter(row=>row.limit==='sin verificar'&&row.band&&Number.isFinite(row.rvPct)&&row.rvPct>row.band[1]);
        const econ=economics(result),cashTotal=result.accounts.filter(row=>row.cashKnown).reduce((sum,row)=>sum+row.cash,0);
        const terComplete=econ.houseAum>0&&econ.houseTerBase>=econ.houseAum;
        const metrics=[['AUM invertido',money(result.invested)],['Efectivo conocido',money(cashTotal)],['Posición integrada conocida',money(econ.integrated)],['Activos distintos',result.funds.length],['Posiciones cliente-ISIN',result.accounts.reduce((sum,row)=>sum+row.positions.length,0)],['AUM fondos Santalucía',money(econ.houseAum)],['Comisión gestión ponderada',pct(econ.weightedFee)],['Gestión anual estimada',econ.missingFees?'Pendiente':money(econ.management)],['TER medio fondos casa',pct(econ.houseTer)],['Coste TER anual indicativo',terComplete?money(econ.houseTerCost):'Pendiente'],['Gestión + TER bruto*',econ.missingFees||econ.unreviewed||!terComplete?'Pendiente':money(econ.management+econ.houseTerCost)],['Cuentas conciliadas',`${matched}/${result.accounts.length}`],['Excesos verificados',result.breaches.filter(row=>row.limit==='excede máximo').length],['Posibles excesos',possible.length],['Vigencias caducadas',expired],['Sin clasificar',money(result.unclassified)]];
        const notices=[];
        if(result.noControl)notices.push(`${result.noControl} cuentas sin cruce único con el control de clientes.`);
        if(result.unknownCategories.length)notices.push(`${result.unknownCategories.length} activos sin categorización RV/RF válida.`);
        if(result.invalidAmounts)notices.push(`${result.invalidAmounts} posiciones sin contravalor EUR válido.`);
        const missingCash=result.accounts.filter(row=>!row.cashKnown).length;
        if(missingCash)notices.push(`${missingCash} cuentas sin efectivo confirmado: límites de RV pendientes.`);
        if(possible.length)notices.push(`${possible.length} cuentas superan provisionalmente el máximo de RV sobre posiciones invertidas; no son infracciones confirmadas.`);
        if(result.currencyExposure.unknown)notices.push(`${money(result.currencyExposure.unknown)} sin desglose de divisa look-through válido.`);
        if(result.cashUnresolved.length)notices.push(`${result.cashUnresolved.length} saldos en divisa sin cambio EUR válido; esas cuentas no incluyen efectivo en el control.`);
        if(state.balances.length&&result.balanceMatch.unmatchedPositions.length)notices.push(`${result.balanceMatch.unmatchedPositions.length} cuentas de posiciones sin cruce único con saldos; revisa Parametrización.`);
        if(state.balances.length&&(!state.positionsDate||!state.balanceDate||state.positionsDate.toDateString()!==state.balanceDate.toDateString()))notices.push('Fechas de posiciones y saldos distintas o no identificables: límites provisionales.');
        if(econ.missingFees)notices.push(`${econ.missingFees} cuentas sin comisión de gestión: el ingreso global no se estima.`);
        if(econ.unreviewed)notices.push(`${money(econ.unreviewed)} en activos pendientes de validar como fondos de la casa.`);
        const alerts=result.accounts.filter(row=>row.limit!=='dentro').sort((a,b)=>(b.limit==='excede máximo')-(a.limit==='excede máximo')||(b.bandPosition>100)-(a.bandPosition>100)||b.invested-a.invested);
        const house=result.funds.filter(fund=>houseInfo(fund).house!==false);
        return `<div class="overview-metrics">${metrics.map(([label,value])=>`<div><span>${label}</span><strong>${value}</strong></div>`).join('')}</div><p class="overview-context">Comisión de gestión ponderada por posición integrada cubierta: ${money(econ.feeBase)} de ${money(econ.integrated)}. *Gestión + TER bruto suma dos importes de coste y puede duplicar componentes; no equivale a ingresos propios. El ingreso atribuible al TER requiere margen o retrocesión contractual. Importes anuales indicativos y sin impuestos.</p><p class="overview-warning">${notices.length?notices.map(esc).join(' '):'Importes y coberturas conciliados con los datos cargados.'}</p><div class="overview-chart-grid"><div id="overviewAumChart"></div><div id="overviewTreemapChart"></div></div><div class="overview-chart-grid overview-chart-grid-small"><div id="overviewAggregateAssetChart"></div><div id="overviewAggregateCurrencyChart"></div></div><div class="overview-chart-grid overview-chart-grid-small"><div id="overviewNationalChart"></div><div id="overviewAssetTypeChart"></div><div id="overviewNationalHouseChart"></div><div id="overviewProductChart"></div></div><div id="overviewCategoryChart" class="overview-chart-wide"></div><h3>Fondos de la casa · revisión</h3><p class="overview-context">Identificación por nombre o validación manual; comprueba los casos pendientes. Los cambios se guardan al descargar Categorización.</p><div class="overview-scroll overview-review"><table><thead><tr><th>ISIN</th><th>Instrumento</th><th>Tipo de activo</th><th>AUM</th><th>Fondo casa</th></tr></thead><tbody>${house.map(fund=>{const item=houseInfo(fund);return `<tr><td>${esc(fund.isin)}</td><td>${esc(fund.name)}</td><td>${esc(fund.classification?.assetType||fund.assetType||'—')}</td><td class="num">${money(fund.amount)}</td><td><select data-house="${esc(fund.isin)}"><option value="" ${item.house===null?'selected':''}>Revisar</option><option value="yes" ${item.house===true?'selected':''}>Sí</option><option value="no" ${item.house===false?'selected':''}>No</option></select></td></tr>`;}).join('')||'<tr><td colspan="5">Sin fondos identificados.</td></tr>'}</tbody></table></div><h3>Atención prioritaria</h3>${limitTable(alerts.slice(0,15))}`;
    }
    function rvActionCell(row){
        const action=OverviewCore.rvAction(row);
        if(!action)return '<span title="Faltan datos para cuantificar un traspaso">Pendiente de verificar</span>';
        if(action.amount===0)return 'Sin cambio';
        const amount=new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',minimumFractionDigits:2,maximumFractionDigits:2}).format(action.amount);
        return `<strong>${esc(action.direction)} ${amount}</strong><br><small>Objetivo RV ${pct(action.target)}</small>`;
    }
    function limitTable(rows){
        return `<div class="overview-scroll"><table><thead><tr><th>Cuenta</th><th>Cliente</th><th>Entidad / perfil</th><th>RV</th><th>Banda</th><th>Posición en banda</th><th>Estado</th><th>Motivo pendiente</th><th>Acción</th></tr></thead><tbody>${rows.map(row=>`<tr><td><button class="overview-link" data-client="${esc(row.account)}">${esc(row.account)}</button></td><td>${esc(row.client?.name||'Sin cruce')}</td><td>${esc(row.organization||'—')} · ${esc(row.client?.profile||'—')}</td><td class="num">${pct(row.rvPct)}${!row.cashKnown?'<br><small>sobre invertido</small>':''}</td><td class="num">${row.band?`${row.band[0]}–${row.band[1]}%`:'—'}</td><td class="num">${Number.isFinite(row.bandPosition)?`${pct(row.bandPosition)}${row.limit==='sin verificar'?'*':''}`:'—'}</td><td>${badge(row.limit)}</td><td>${esc(row.limitReasons.join('; ')||'—')}</td><td class="num">${rvActionCell(row)}</td></tr>`).join('')||'<tr><td colspan="9">Sin cuentas para mostrar.</td></tr>'}</tbody></table></div><p class="overview-context">* Posición orientativa mientras falte efectivo, clasificación completa o fechas conciliadas. Sin efectivo se divide por capital invertido; no acredita el cumplimiento. Para incumplimientos verificados, el importe asume un traspaso entre RV y no RV sin alterar el valor total. El objetivo queda a 2 puntos porcentuales del límite infringido (o en el punto medio si la banda es más estrecha). Verifica valoración y costes antes de operar. El campo «EFECTIVO INVERSIS» del control recibido contiene IBAN, no saldo.</p>`;
    }
    function rfComparison(row){
        const completeModel=row.model?.rows?.every(item=>Array.isArray(item.currentPositions)&&Array.isArray(item.proposedPositions)),model=completeModel?GdcModel.rfProfile(row.model):null,items=[['Cliente',row.rf],['Benchmark',model?.benchmark],['Cartera modelo',model?.portfolio]];
        return `<h4>Renta fija · YTM y duración modificada</h4><div class="overview-scroll"><table><thead><tr><th>Referencia</th><th>YTM media ponderada</th><th>Duración (años)</th><th>Cobertura RF</th><th>Δ YTM vs cliente</th><th>Δ duración vs cliente</th></tr></thead><tbody>${items.map(([label,item])=>`<tr><td>${label}</td><td class="num">${pct(item?.ytm)}</td><td class="num">${Number.isFinite(item?.duration)?item.duration.toFixed(2):'—'}</td><td class="num">${pct((item?.coverage??NaN)*100)}</td><td class="num">${Number.isFinite(item?.ytm)&&Number.isFinite(row.rf.ytm)?`${(row.rf.ytm-item.ytm).toFixed(2)} pp`:'—'}</td><td class="num">${Number.isFinite(item?.duration)&&Number.isFinite(row.rf.duration)?`${(row.rf.duration-item.duration).toFixed(2)} años`:'—'}</td></tr>`).join('')}</tbody></table></div><p class="overview-context">Medias ponderadas dentro de la manga RF. Solo se muestran con cobertura completa; el benchmark y el modelo usan los datos de GDC/GICI. La media de YTM no es la TIR de los flujos de la cartera ni rentabilidad garantizada; la duración aproxima sensibilidad lineal a tipos.</p>`;
    }
    function clientPositions(row){
        const order={RF:0,RV:1,Otros:2},sorted=[...row.positions].sort((a,b)=>(order[a.classification?.type]??3)-(order[b.classification?.type]??3)||b.amount-a.amount),max=Math.max(0,...sorted.map(item=>item.amount||0));
        const groups=new Map();for(const item of sorted){const type=item.classification?.type||'Sin clasificar';if(!groups.has(type))groups.set(type,[]);groups.get(type).push(item);}
        const base=state.includeCash&&row.cashKnown?row.base:row.invested;
        return `<h4>Posiciones por tipo de activo</h4><div class="overview-scroll"><table><thead><tr><th>Tipo activo / ISIN</th><th>Instrumento</th><th>Categoría</th><th>Contravalor EUR</th><th>Peso ${state.includeCash?'integrado':'invertido'}</th><th>Divisa</th></tr></thead><tbody>${[...groups].map(([type,items])=>`<tr class="overview-group"><th colspan="3">${esc({RF:'RENTA FIJA',RV:'RENTA VARIABLE',Otros:'OTROS'}[type]||type)}</th><th class="num">${money(items.reduce((sum,item)=>sum+item.amount,0))}</th><th class="num">${pct(base?items.reduce((sum,item)=>sum+item.amount,0)/base*100:NaN)}</th><th></th></tr>${items.map(pos=>{const weight=base>0?pos.amount/base*100:NaN,heat=max>0?Math.min(100,pos.amount/max*100):0;return `<tr><td>${esc(pos.isin)}</td><td>${esc(pos.name)}</td><td>${esc(pos.classification?.generic||'Pendiente')}</td><td class="num overview-heat" style="--heat:${heat.toFixed(1)}%">${money(pos.amount)}</td><td class="num overview-heat" style="--heat:${Number.isFinite(weight)?Math.min(100,weight):0}%">${pct(weight)}</td><td>${esc(pos.classification?.currency||'—')}</td></tr>`;}).join('')}`).join('')}${state.includeCash&&row.cashKnown?`<tr class="overview-group"><th colspan="3">EFECTIVO</th><th class="num">${money(row.cash)}</th><th class="num">${pct(base?row.cash/base*100:NaN)}</th><th>EUR equivalente</th></tr>`:''}<tr class="overview-total"><th colspan="3">Total ${state.includeCash&&row.cashKnown?'integrado':'invertido'}</th><th class="num">${money(base)}</th><th class="num">${pct(base>0?100:NaN)}</th><th></th></tr></tbody></table></div>`;
    }
    function comparison(row){
        if(!row.model)return '<p class="overview-warning">No hay cartera modelo cargada para esta entidad y perfil. La comparación no se estima.</p>';
        const base=state.includeCash&&row.cashKnown?row.base:row.invested;
        const actual=new Map();
        for(const [name,amount] of row.benchmarkAllocations)actual.set(OverviewCore.key(name),(actual.get(OverviewCore.key(name))||0)+(base>0?amount/base*100:0));
        if(state.includeCash&&row.cashKnown&&row.cash>0)actual.set('efectivo',(actual.get('efectivo')||0)+row.cash/base*100);
        const categories=[...new Set([...row.model.rows.map(item=>item.generic),...row.benchmarkAllocations.keys(),...(state.includeCash&&row.cashKnown&&row.cash>0?['Efectivo']:[])])];
        const modelRows=categories.map(name=>row.model.rows.find(item=>OverviewCore.key(item.generic)===OverviewCore.key(name)));
        const missing=row.positions.filter(item=>!item.classification?.benchCategory&&item.amount>0).reduce((sum,item)=>sum+item.amount,0);
        return `<p class="overview-context">Cartera modelo ${esc(row.organization)} · ${esc(row.model.name)}. El cliente se agrupa por «TIPO ACTIVO VS BENCH»; «TIPO ACTIVO +» se reserva para el desglose de cartera.</p>${missing?`<p class="overview-warning">${money(missing)} sin mapeo frente al benchmark. Las diferencias por categoría son parciales.</p>`:''}<div class="overview-chart-grid"><div id="overviewCompareChart"></div><div id="overviewDeviationChart"></div></div><div class="overview-scroll"><table><thead><tr><th>Categoría</th><th>Cliente</th><th>Benchmark</th><th>Modelo</th><th>Vs benchmark</th><th>Vs modelo</th></tr></thead><tbody>${categories.map((name,i)=>{const current=actual.get(OverviewCore.key(name))||0,benchmark=modelRows[i]?.weight,model=modelRows[i]?.portfolioWeight;return `<tr><td>${esc(name)}</td><td class="num">${pct(current)}</td><td class="num">${pct(benchmark)}</td><td class="num">${pct(model)}</td><td class="num">${Number.isFinite(benchmark)?`${(current-benchmark)>=0?'+':''}${(current-benchmark).toFixed(2)} pp`:'—'}</td><td class="num">${Number.isFinite(model)?`${(current-model)>=0?'+':''}${(current-model).toFixed(2)} pp`:'—'}</td></tr>`;}).join('')}</tbody></table></div>`;
    }
    function clients(result){
        const rows=result.accounts.filter(row=>!state.search||`${row.account} ${row.client?.name||''}`.toLowerCase().includes(state.search.toLowerCase()));
        const selected=rows.find(row=>row.account===state.selected)||rows[0];if(selected)state.selected=selected.account;
        return `<label class="overview-search">Buscar cuenta o cliente <input data-search value="${esc(state.search)}" placeholder="Cuenta o nombre"></label><div class="overview-layout"><div class="overview-scroll overview-client-list"><table><thead><tr><th>Cuenta</th><th>Cliente</th><th>Importe</th><th>RV / límite</th></tr></thead><tbody>${rows.slice(0,300).map(row=>`<tr><td><button class="overview-link" data-client="${esc(row.account)}">${esc(row.account)}</button></td><td>${esc(row.client?.name||'Sin cruce')}</td><td class="num">${money(row.invested)}</td><td>${badge(row.limit)}</td></tr>`).join('')}</tbody></table></div><div class="overview-detail">${selected?`<h3>${esc(selected.client?.name||selected.account)}</h3><p>${esc(selected.account)} · ${esc(selected.organization||'Entidad pendiente')} · ${esc(selected.client?.profile||'Perfil pendiente')}</p><div class="overview-metrics compact"><div><span>Posiciones</span><strong>${money(selected.invested)}</strong></div><div><span>Efectivo confirmado</span><strong>${selected.cashKnown?money(selected.cash):'Pendiente'}</strong></div><div><span>RV${selected.cashKnown?'':' estimada'}</span><strong>${pct(selected.rvPct)}</strong></div><div><span>Cobertura clasificación</span><strong>${pct(selected.coverage*100)}</strong></div></div>${selected.limitReasons.length?`<p class="overview-warning">Límite RV ${esc(selected.limit)}: ${esc(selected.limitReasons.join('; '))}.</p>`:''}${Number.isFinite(selected.client?.reportedAum)?`<p class="overview-context">AUM del control: ${money(selected.client.reportedAum)} · diferencia frente a posiciones + efectivo: ${money(selected.client.reportedAum-selected.base)}. Comprueba fecha y perímetro antes de conciliar.</p>`:''}<div class="overview-chart-grid overview-chart-grid-small"><div id="overviewAssetDonut"></div><div id="overviewCurrencyDonut"></div><div id="overviewGenericDonut"></div></div>${comparison(selected)}${rfComparison(selected)}${clientPositions(selected)}`:'Selecciona una cuenta.'}</div></div>`;
    }
    function funds(result){
        const rows=result.funds.filter(row=>(!state.search||`${row.isin} ${row.name}`.toLowerCase().includes(state.search.toLowerCase()))&&(state.fundType==='all'||(row.classification?.type||'Pendiente')===state.fundType)&&(state.fundProduct==='all'||(row.classification?.productType||row.productType||'Pendiente')===state.fundProduct)).sort((a,b)=>state.fundSort==='accounts'?b.accounts.size-a.accounts.size||b.amount-a.amount:b.amount-a.amount||b.accounts.size-a.accounts.size);
        const productTypes=[...new Set(result.funds.map(row=>row.classification?.productType||row.productType||'Pendiente'))].sort(),max=Math.max(0,...rows.map(row=>row.amount)),total=rows.reduce((sum,row)=>sum+row.amount,0),accounts=new Set(rows.flatMap(row=>[...row.accounts]));
        return `<div class="overview-filters"><label>Buscar ISIN o fondo<input data-search value="${esc(state.search)}" placeholder="ISIN o nombre"></label><label>Tipo de activo<select data-fund-type><option value="all">Todos</option>${['RF','RV','Otros','Pendiente'].map(type=>`<option value="${type}" ${state.fundType===type?'selected':''}>${type}</option>`).join('')}</select></label><label>Tipo de producto<select data-fund-product><option value="all">Todos</option>${productTypes.map(type=>`<option value="${esc(type)}" ${state.fundProduct===type?'selected':''}>${esc(type)}</option>`).join('')}</select></label><label>Ordenar<select data-fund-sort><option value="amount" ${state.fundSort==='amount'?'selected':''}>AUM mayor a menor</option><option value="accounts" ${state.fundSort==='accounts'?'selected':''}>Cuentas mayor a menor</option></select></label></div><div class="overview-scroll"><table><thead><tr><th>ISIN</th><th>Fondo / activo</th><th>Categoría</th><th>Tipo</th><th>Producto</th><th class="num">AUM en posiciones</th><th class="num">Cuentas</th></tr></thead><tbody>${rows.slice(0,400).map(fund=>`<tr><td><button class="overview-link" data-fund="${esc(fund.isin)}" title="Ver cuentas con y sin este fondo">${esc(fund.isin)}</button></td><td>${esc(fund.name)}</td><td>${esc(fund.classification?.generic||'Pendiente')}</td><td>${esc(fund.classification?.type||'Pendiente')}</td><td>${esc(fund.classification?.productType||fund.productType||'—')}</td><td class="num overview-heat" style="--heat:${max>0?(fund.amount/max*100).toFixed(1):0}%">${money(fund.amount)}</td><td class="num">${fund.accounts.size}</td></tr>`).join('')}<tr class="overview-total"><th colspan="5">Total filtrado · ${rows.length} activos</th><th class="num">${money(total)}</th><th class="num">${accounts.size} cuentas únicas</th></tr></tbody></table></div><p class="overview-context">Pulsa un ISIN para ver quién lo tiene y qué peso ocupa en cada cuenta. Se muestran hasta 400 activos; el total incluye todos los que cumplen los filtros. AUM = contravalor de posiciones, no saldo del control.</p>`;
    }
    function vigencias(result){
        const rows=result.accounts.filter(row=>row.client).flatMap(row=>[
            ...row.documents.map(doc=>({row,group:'dni',kind:`DNI ${doc.role}`,status:doc.status,expiry:doc.expiry})),
            ...[['kyc','KYC',row.kyc,row.client.kycExpiry],['idoneidad','Test idoneidad',row.suitability,row.client.suitabilityExpiry],['esg','Test ESG',row.esg,row.client.esgExpiry]].map(([group,kind,status,expiry])=>({row,group,kind,status,expiry}))
        ]);
        const birthdays=result.accounts.filter(row=>row.client?.birthday).map(row=>{const birth=row.client.birthday,now=new Date(),next=new Date(now.getFullYear(),birth.getMonth(),birth.getDate());if(next<new Date(now.getFullYear(),now.getMonth(),now.getDate()))next.setFullYear(next.getFullYear()+1);return {row,next,days:Math.ceil((next-now)/86400000)};}).filter(item=>item.days>=0&&item.days<=30).sort((a,b)=>a.days-b.days);
        const groups=[['dni','DNI y documentos'],['kyc','KYC'],['idoneidad','Test de idoneidad'],['esg','Test ESG']];
        const visible=rows.filter(item=>(state.validityType==='all'||item.group===state.validityType)&&(state.validityStatus==='all'?item.status!=='vigente':item.status===state.validityStatus));
        return `<h3>Documentos y renovaciones</h3><p class="overview-context">“Próximo” significa 30 días o menos. Las fechas ausentes se mantienen pendientes; no se importan números de DNI.</p><div class="overview-filters"><label>Tipo de control<select data-validity-type><option value="all">Todos</option>${groups.map(([key,label])=>`<option value="${key}" ${state.validityType===key?'selected':''}>${label}</option>`).join('')}</select></label><label>Estado<select data-validity-status>${[['all','Incidencias'],['caducado','Caducado'],['próximo','Próximo'],['sin fecha','Sin fecha'],['sin documento','Sin documento'],['vigente','Vigente']].map(([key,label])=>`<option value="${key}" ${state.validityStatus===key?'selected':''}>${label}</option>`).join('')}</select></label></div>${groups.filter(([key])=>state.validityType==='all'||state.validityType===key).map(([key,label])=>{const section=visible.filter(item=>item.group===key);return `<section class="overview-validity-group"><h4>${label} · ${section.length}</h4><div class="overview-scroll"><table><thead><tr><th>Cuenta</th><th>Cliente</th><th>Control</th><th>Vencimiento</th><th>Estado</th></tr></thead><tbody>${section.map(item=>`<tr><td>${esc(item.row.account)}</td><td>${esc(item.row.client.name)}</td><td>${esc(item.kind)}</td><td>${date(item.expiry)}</td><td>${badge(item.status)}</td></tr>`).join('')||'<tr><td colspan="5">Sin registros con este filtro.</td></tr>'}</tbody></table></div></section>`;}).join('')}<h3>Cumpleaños próximos 30 días</h3><div class="overview-scroll"><table><thead><tr><th>Cuenta</th><th>Cliente</th><th>Fecha</th><th>Días</th></tr></thead><tbody>${birthdays.map(item=>`<tr><td>${esc(item.row.account)}</td><td>${esc(item.row.client.name)}</td><td>${date(item.next)}</td><td>${item.days}</td></tr>`).join('')||'<tr><td colspan="4">Sin cumpleaños próximos.</td></tr>'}</tbody></table></div>`;
    }
    function categories(result){
        let nav=`<nav class="overview-subtabs" aria-label="Categorización">${[['mapping','Clasificación'],['rf','YTM y duración'],['bands','Límites RV'],['house','Fondos Santalucía'],['yahoo','Activos en cartera']].map(([key,label])=>`<button data-category-view="${key}" aria-current="${state.categoryView===key?'page':'false'}">${label}</button>`).join('')}</nav>`;
        if(state.categoryView==='house'){
            const identified=result.funds.filter(fund=>houseInfo(fund).house===true);
            nav+=`<h4>Fondos de la casa identificados · ${identified.length}</h4><div class="overview-scroll"><table><thead><tr><th>ISIN</th><th>Instrumento</th><th>AUM</th></tr></thead><tbody>${identified.map(fund=>`<tr><td>${esc(fund.isin)}</td><td>${esc(fund.name)}</td><td class="num">${money(fund.amount)}</td></tr>`).join('')||'<tr><td colspan="3">Sin fondos identificados.</td></tr>'}</tbody></table></div>`;
        }
        if(state.categoryView==='yahoo')return nav+`<p class="overview-context">Los ISIN activos proceden de Posiciones. Al importar Categorización se cargan los históricos Yahoo de los tickers mapeados; la hoja «Yahoo tickers» del Excel exportado conserva el catálogo. El ticker no demuestra equivalencia económica con la clase ISIN.</p><button type="button" data-load-yahoo-assets> Actualizar evolución</button><p id="overviewYahooStatus" role="status">${state.yahooLoading?'Descargando históricos...':`${result.funds.filter(fund=>state.yahooSeries.get(state.yahooTickers.get(fund.isin))?.length>1).length} históricos disponibles de ${result.funds.length} ISIN activos.`}</p><div class="overview-scroll"><table><thead><tr><th>ISIN</th><th>Instrumento</th><th>Categoría</th><th>Ticker Yahoo</th></tr></thead><tbody>${result.funds.map(fund=>`<tr><td>${esc(fund.isin)}</td><td>${esc(fund.name)}</td><td>${esc(fund.classification?.generic||'Pendiente')}</td><td><input data-yahoo-isin="${esc(fund.isin)}" value="${esc(state.yahooTickers.get(fund.isin)||'')}" placeholder="Ticker Yahoo" aria-label="Ticker Yahoo de ${esc(fund.isin)}"></td></tr>`).join('')||'<tr><td colspan="4">Carga posiciones para poblar el catálogo.</td></tr>'}</tbody></table></div><div id="overviewYahooChart" class="overview-chart-wide"></div>`;
        if(state.categoryView==='rf')return nav+rfDatabase(result);
        if(state.categoryView==='bands')return nav+`<p class="overview-context">Banda aplicable al perfil de gestión contratado. Los cambios se exportan en la hoja «Limites RV» y se recuperan al importar el Excel actualizado.</p><div class="overview-scroll"><table><thead><tr><th>Perfil</th><th>Mínimo RV (%)</th><th>Máximo RV (%)</th></tr></thead><tbody>${Object.entries(state.bands).map(([profile,[low,high]])=>`<tr><td>${esc(profile.replaceAll('_',' ').toUpperCase())}</td><td><input class="overview-rf-input" type="number" min="0" max="100" step="0.01" data-band="${profile}" data-band-index="0" value="${low}"></td><td><input class="overview-rf-input" type="number" min="0" max="100" step="0.01" data-band="${profile}" data-band-index="1" value="${high}"></td></tr>`).join('')}</tbody></table></div>`;
        if(state.categoryView==='house')return nav+`<p class="overview-context">Se proponen nombres que contienen Santalucía, Santalucia o Santlucia, aunque no aparezca al principio. Comprueba la lista y corrige los casos dudosos. El TER procede del universo por ISIN o de este campo manual; no equivale necesariamente a un ingreso de la gestora.</p><div class="overview-scroll"><table><thead><tr><th>ISIN</th><th>Fondo / activo</th><th>AUM</th><th>Fondo de la casa</th><th>TER (%)</th><th>Origen TER</th></tr></thead><tbody>${result.funds.map(fund=>{const item=houseInfo(fund),manual=state.houseFunds.get(fund.isin);return `<tr><td>${esc(fund.isin)}</td><td>${esc(fund.name)}</td><td class="num">${money(fund.amount)}</td><td><select data-house="${esc(fund.isin)}"><option value="" ${item.house===null?'selected':''}>Revisar</option><option value="yes" ${item.house===true?'selected':''}>Sí</option><option value="no" ${item.house===false?'selected':''}>No</option></select></td><td><input class="overview-rf-input" type="number" min="0" step="0.01" data-house-ter="${esc(fund.isin)}" value="${Number.isFinite(item.ter)?item.ter:''}"></td><td>${Number.isFinite(manual?.ter)?'Manual':Number.isFinite(item.ter)?'Universo':'Pendiente'}</td></tr>`;}).join('')}</tbody></table></div>`;
        const known=[...result.funds];
        const mapped=effectiveCategories();
        const generic=[...new Set(Object.values(modelsByOrg()).flatMap(models=>models.flatMap(model=>model.rows.map(row=>row.generic))))].sort();
        return `${nav}<p class="overview-context">Se aplica automáticamente la hoja Categorización importada, y después los cruces únicos con universo/modelo o acciones y deuda directa inequívocas. Los fondos sin cruce permanecen pendientes. EUR/USD/Otros deben sumar 1 o 100; la divisa de cotización no sustituye al look-through. Descarga el Excel actualizado para el siguiente comité.</p><div class="overview-scroll"><table><thead><tr><th>ISIN / activo</th><th>AUM</th><th>Clasificación y look-through</th></tr></thead><tbody>${known.map(fund=>{const mapping=mapped.get(fund.isin),field=(name,label,value,width='')=>`<label>${label}<input name="${name}" value="${esc(value??'')}" ${width?`style="width:${width}"`:''}></label>`;return `<tr><td><strong>${esc(fund.isin)}</strong><br><small>${esc(fund.name)}</small>${mapping?.source?`<br><small>Automática: ${esc(mapping.source)}</small>`:''}</td><td class="num">${money(fund.amount)}</td><td><form class="overview-map-form" data-isin="${esc(fund.isin)}">${field('productType','Tipo producto',mapping?.productType||state.positions.find(p=>p.isin===fund.isin)?.productType,'130px')}${field('instrument','Instrumento',mapping?.instrument||fund.name,'190px')}${field('generic','Tipo activo +',mapping?.generic,'135px')}${field('benchCategory','Tipo activo vs bench',mapping?.benchCategory,'150px')}<label>Tipo activo<select name="type"><option value="">Pendiente</option>${['RV','RF','Otros'].map(type=>`<option ${mapping?.type===type?'selected':''}>${type}</option>`).join('')}</select></label>${field('currency','Divisa',mapping?.currency,'65px')}${field('hedge','Hedge',mapping?.hedge,'55px')}${field('strategy','Estrategia',mapping?.strategy,'115px')}${[['eurExpo','EUR'],['usdExpo','USD'],['otherExpo','Otros']].map(([name,label])=>field(name,label,Number.isFinite(mapping?.[name])?mapping[name]:'','58px')).join('')}<button type="submit" title="Guardar clasificación y exposición"><i class="fa-solid fa-check" aria-hidden="true"></i> Guardar</button></form></td></tr>`;}).join('')}</tbody></table></div><datalist id="overviewGenericList">${generic.map(name=>`<option value="${esc(name)}">`).join('')}</datalist>`;
    }
    function rfInventory(result){
        const entries=new Map(Object.keys(GdcModel.state.rfMetrics).map(key=>[key,null]));
        for(const fund of result.funds.filter(item=>item.classification?.type==='RF'))entries.set(`F:${fund.isin}`,fund);
        for(const models of Object.values(modelsByOrg()))for(const portfolio of models)for(const row of portfolio.rows.filter(item=>item.assetType==='RF')){
            for(const ticker of GdcModel.benchmarkTickers(row).slice(0,1))if(ticker)entries.set(`B:${ticker.toUpperCase()}`,null);
            for(const item of [...(row.currentPositions||[]),...(row.proposedPositions||[])])if(item.isin&&!entries.has(`F:${item.isin.toUpperCase()}`))entries.set(`F:${item.isin.toUpperCase()}`,null);
        }
        return entries;
    }
    function rfDatabase(result){
        const rows=[...rfInventory(result)].sort(([a],[b])=>a.localeCompare(b));
        return `<p class="overview-context">Base compartida con GDC/GICI y con la hoja «Renta fija» del Excel de categorización. YTM en % anual; duración modificada en años. El Excel mensual GDC/GICI también conserva estos datos.</p><div class="overview-scroll"><table><thead><tr><th>Tipo</th><th>ISIN / índice</th><th>Instrumento</th><th>AUM en posiciones</th><th>Duración modificada (años)</th><th>YTM anual (%)</th></tr></thead><tbody>${rows.map(([key,fund])=>{const metric=GdcModel.state.rfMetrics[key]||{},id=key.slice(2),name=fund?.name||GdcModel.state.fundNames[id]||GdcModel.state.benchmarkMeta[id]?.name||fundUniverseState?.isinIndex?.get(id)?.name||'';return `<tr><td>${key.startsWith('B:')?'Índice':'Fondo'}</td><td>${esc(id)}</td><td>${esc(name)}</td><td class="num">${fund?money(fund.amount):'—'}</td><td><input class="overview-rf-input" type="number" min="0" step="0.01" data-overview-rf="${esc(key)}" data-rf-field="duration" value="${Number.isFinite(metric.duration)?metric.duration:''}" aria-label="Duración ${esc(id)}"></td><td><input class="overview-rf-input" type="number" step="0.01" data-overview-rf="${esc(key)}" data-rf-field="ytm" value="${Number.isFinite(metric.ytm)?metric.ytm:''}" aria-label="YTM ${esc(id)}"></td></tr>`;}).join('')||'<tr><td colspan="6">Carga posiciones y carteras modelo para poblar la base RF.</td></tr>'}</tbody></table></div>`;
    }
    function parameters(result){
        const missing=result.unknownCategories,rf=result.funds.filter(fund=>fund.classification?.type==='RF'&&(!Number.isFinite(GdcModel.state.rfMetrics[`F:${fund.isin}`]?.ytm)||!Number.isFinite(GdcModel.state.rfMetrics[`F:${fund.isin}`]?.duration))),currency=result.funds.filter(fund=>!OverviewCore.exposureMix(fund.classification));
        const list=(items,kind)=>`<div class="overview-scroll"><table><thead><tr><th>ISIN</th><th>Instrumento</th><th>AUM</th></tr></thead><tbody>${items.map(fund=>`<tr><td>${esc(fund.isin)}</td><td>${esc(fund.name)}</td><td class="num">${money(fund.amount)}</td></tr>`).join('')||`<tr><td colspan="3">Sin pendientes de ${kind}.</td></tr>`}</tbody></table></div>`;
        const unmatched=result.balanceMatch.unmatchedPositions,balances=result.balanceMatch.unmatchedBalances;
        const eurBalances=OverviewCore.convertBalances(state.balances,state.fxRates).amounts;
        const cashAccounts=[...new Set(state.balances.map(item=>OverviewCore.id(item.account)))];
        const cashRows=cashAccounts.map(account=>{const sample=state.balances.find(item=>OverviewCore.id(item.account)===account),linked=result.balanceMatch.links[account];return `<tr><td>${esc(sample?.account||account)}</td><td>${esc(sample?.description||'—')}</td><td class="num">${money(eurBalances[account])}</td><td>${esc(linked||'Sin asignar')}</td></tr>`;}).join('');
        const rows=unmatched.map(account=>{const pos=state.positions.find(item=>OverviewCore.id(item.account)===account),candidates=balances.map(source=>state.balances.find(item=>OverviewCore.id(item.account)===source)).filter(Boolean).sort((a,b)=>Number(OverviewCore.id(b.description)===OverviewCore.id(pos?.accountLabel))-Number(OverviewCore.id(a.description)===OverviewCore.id(pos?.accountLabel)));return `<tr><td>${esc(pos?.accountLabel||account)}</td><td>${esc(account)}</td><td><select data-balance-link="${esc(account)}"><option value="">Seleccionar cuenta</option>${candidates.map(item=>`<option value="${esc(OverviewCore.id(item.account))}">${esc(item.account)} · ${esc(item.description)} · ${money(eurBalances[OverviewCore.id(item.account)])}</option>`).join('')}</select></td></tr>`;}).join('');
        return `<h3>Parámetros pendientes</h3><p class="overview-context">La clasificación RF/RV permite estimar la asignación; el efectivo confirmado y el look-through se controlan por separado. Los límites no se acreditan hasta completar los datos necesarios.</p><h4>Sin categoría RV/RF · ${missing.length}</h4>${list(missing,'clasificación')}<h4>Fondos RF sin YTM o duración · ${rf.length}</h4>${list(rf,'métricas RF')}<h4>Sin exposición de divisa válida · ${currency.length}</h4>${list(currency,'divisa')}${state.balances.length?`<h4>Cruce de cuentas de saldos · ${Object.keys(result.balanceMatch.links).length} conciliadas; ${unmatched.length} pendientes</h4><p class="overview-context">Se cruza primero el identificador y después el nombre exacto solo cuando es único en ambos ficheros. Las homonimias requieren selección manual; no se hace emparejamiento difuso.</p><div class="overview-scroll"><table><thead><tr><th>Cliente</th><th>Cuenta posiciones</th><th>Cuenta saldos candidata</th></tr></thead><tbody>${rows||'<tr><td colspan="3">Todas las cuentas de posiciones tienen cruce único.</td></tr>'}</tbody></table></div><h4>Cuentas de efectivo · contravalor EUR</h4><div class="overview-scroll"><table><thead><tr><th>Cuenta efectivo</th><th>Titular</th><th>Saldo EUR</th><th>Cuenta posiciones enlazada</th></tr></thead><tbody>${cashRows}</tbody></table></div>`:''}<h4>Cuentas sin efectivo confirmado · ${result.accounts.filter(row=>!row.cashKnown).length}</h4>${limitTable(result.accounts.filter(row=>!row.cashKnown))}`;
    }
    function draw(result){
        const palette=['#075aa3','#153d80','#42a4db','#637f9c','#83c4df','#516071','#a9b9c7','#dce5ed'];
        const layout=(title,height=350)=>({title:{text:title,font:{size:15,color:'#253f56'}},height,margin:{t:45,l:38,r:18,b:48},paper_bgcolor:'#fff',plot_bgcolor:'#fff',font:{family:'Arial, sans-serif',size:11,color:'#344b61'}});
        const donut=(target,title,labels,values,colors)=>{const shown=values.map((value,index)=>({value,index})).filter(item=>item.value>0);return FinancialVisuals.newPlot(target,[{type:'pie',hole:.57,labels:shown.map(item=>labels[item.index]),values:shown.map(item=>item.value),sort:false,textinfo:'percent',textposition:'inside',insidetextorientation:'horizontal',marker:{colors:shown.map(item=>colors[item.index]),line:{color:'#fff',width:2}},hovertemplate:'%{label}: %{value:,.0f} EUR (%{percent})<extra></extra>'}],{...layout(title,310),margin:{t:48,l:15,r:15,b:52},showlegend:true,legend:{orientation:'h',x:.5,xanchor:'center',y:-.08}},{responsive:true,displayModeBar:false});};
        const currency=(target,title,exposure)=>{const values=[exposure.eur,exposure.usd,exposure.other,exposure.unknown];if(values.some(value=>value>0))donut(target,title,['EUR','USD','Otras','Sin dato'],values,['#075aa3','#42a4db','#637f9c','#dce5ed']);};
        if(state.tab==='summary'&&result.accounts.length){
            const top=result.accounts.slice(0,18);
            FinancialVisuals.newPlot('overviewAumChart',[{type:'bar',orientation:'h',name:'Posición integrada conocida',x:top.map(row=>row.base),y:top.map(row=>row.client?.code||row.account),marker:{color:'#075aa3'},hovertemplate:'%{y}: %{x:,.0f} EUR<extra></extra>'}],{...layout('AUM por cliente · principales 18',Math.max(350,top.length*27)),margin:{t:48,l:75,r:20,b:42},yaxis:{autorange:'reversed'},xaxis:{title:'EUR'}},{responsive:true});
            const all=result.accounts;
            FinancialVisuals.newPlot('overviewTreemapChart',[{type:'treemap',labels:all.map(row=>row.client?.code||row.account),parents:all.map(()=>'AUM'),values:all.map(row=>row.base),branchvalues:'total',marker:{colors:all.map((_,i)=>palette[i%palette.length]),line:{color:'#fff',width:2}},textinfo:'label+percent root',hovertemplate:'%{label}: %{value:,.0f} EUR<extra></extra>'}],{...layout('Concentración del AUM · todas las cuentas',Math.max(350,top.length*27)),margin:{t:48,l:10,r:10,b:10}},{responsive:true,displayModeBar:false});
            const values=new Map();for(const row of result.accounts)for(const [name,amount] of row.allocations)values.set(name,(values.get(name)||0)+amount);
            const sorted=[...values].sort((a,b)=>b[1]-a[1]).slice(0,12);
            FinancialVisuals.newPlot('overviewCategoryChart',[{type:'bar',orientation:'h',name:'AUM',x:sorted.map(([,value])=>value),y:sorted.map(([name])=>name),marker:{color:'#637f9c'},hovertemplate:'%{y}: %{x:,.0f} EUR<extra></extra>'}],{...layout('Exposición por categoría',Math.max(330,sorted.length*29)),margin:{t:48,l:135,r:18,b:42},yaxis:{autorange:'reversed'},xaxis:{title:'EUR'}},{responsive:true});
            const typeValues=new Map();for(const row of result.accounts){for(const item of row.positions){const type=item.classification?.type||'Sin clasificar';typeValues.set(type,(typeValues.get(type)||0)+item.amount);}if(state.includeCash&&row.cashKnown)typeValues.set('Efectivo',(typeValues.get('Efectivo')||0)+row.cash);}
            donut('overviewAggregateAssetChart','Composición agregada por tipo de activo',[...typeValues.keys()],[...typeValues.values()],['#075aa3','#42a4db','#637f9c','#dce5ed']);
            const exposure={eur:0,usd:0,other:0,unknown:0};for(const account of result.accounts){const part=currencyWithCash(account);for(const key of Object.keys(exposure))exposure[key]+=part[key];}
            currency('overviewAggregateCurrencyChart','Divisa económica · look-through',exposure);
            const assetTypes=new Map(),products=new Map(),national=[0,0,0],nationalHouse=[0,0,0];
            for(const row of state.positions){
                if(!(row.amount>0))continue;
                const type=row.assetType||'Sin dato',product=row.productType||'Sin dato',normalized=OverviewCore.key(type);
                assetTypes.set(type,(assetTypes.get(type)||0)+row.amount);
                products.set(product,(products.get(product)||0)+row.amount);
                const isNational=/fondos?\s+nacional/.test(normalized),isInternational=/fondos?\s+internacional/.test(normalized);
                national[isNational?0:isInternational?1:2]+=row.amount;
                if(isNational){const house=houseInfo(row).house;nationalHouse[house===true?0:house===false?1:2]+=row.amount;}
            }
            donut('overviewNationalChart','Fondos nacionales e internacionales',['Nacionales','Internacionales','Otros activos'],national,['#075aa3','#42a4db','#9aafbf']);
            const assetEntries=[...assetTypes].sort((a,b)=>b[1]-a[1]);
            donut('overviewAssetTypeChart','Tipo de activo · Excel Posiciones',assetEntries.map(([name])=>name),assetEntries.map(([,value])=>value),assetEntries.map((_,i)=>palette[i%palette.length]));
            donut('overviewNationalHouseChart','Fondos nacionales · casa vs terceros',['Santalucía','Terceros','Pendiente'],nationalHouse,['#075aa3','#637f9c','#e2b765']);
            const productEntries=[...products].sort((a,b)=>b[1]-a[1]);
            donut('overviewProductChart','Tipo de producto · Excel Posiciones',productEntries.map(([name])=>name),productEntries.map(([,value])=>value),productEntries.map((_,i)=>palette[i%palette.length]));
        }
        if(state.tab==='clients'){
            const row=result.accounts.find(item=>item.account===state.selected);if(!row)return;
            const typeValues=new Map();for(const item of row.positions){const type=item.classification?.type||'Sin clasificar';typeValues.set(type,(typeValues.get(type)||0)+item.amount);}if(state.includeCash&&row.cashKnown)typeValues.set('Efectivo',(typeValues.get('Efectivo')||0)+row.cash);
            donut('overviewAssetDonut','Composición por tipo de activo',[...typeValues.keys()],[...typeValues.values()],['#075aa3','#42a4db','#637f9c','#dce5ed']);
            const generic=new Map(row.allocations);if(state.includeCash&&row.cashKnown&&row.cash>0)generic.set('Efectivo',(generic.get('Efectivo')||0)+row.cash);
            const genericEntries=[...generic].sort((a,b)=>b[1]-a[1]);
            donut('overviewGenericDonut','Asset allocation · Tipo Activo +',genericEntries.map(([name])=>name),genericEntries.map(([,value])=>value),genericEntries.map((_,i)=>palette[i%palette.length]));
            currency('overviewCurrencyDonut','Divisa económica · look-through',currencyWithCash(row));
            if(row.base>0){
                const housePct=row.house/row.base*100;
                FinancialVisuals.newPlot('overviewHouseDonut',[{type:'pie',hole:.58,labels:['Fondos Santalucía','Pendiente de validar','Resto de cartera'],values:[row.house,row.houseUnreviewed,Math.max(0,row.base-row.house-row.houseUnreviewed)],sort:false,direction:'clockwise',rotation:0,textinfo:'percent',marker:{colors:['#075aa3','#e2b765','#dce5ed']},hovertemplate:'%{label}: %{value:,.0f} EUR<extra></extra>'}],{...layout('Fondos de la casa · límite 75%',300),showlegend:true,legend:{orientation:'h',y:-.1},annotations:[{text:`${row.houseUnreviewed?'≥':''}${housePct.toFixed(1)}%`,x:.5,y:.5,showarrow:false,font:{size:19,color:housePct>75?'#b83a40':'#153d65'}}]},{responsive:true,displayModeBar:false});
            }
            if(!row.model)return;
            const base=state.includeCash&&row.cashKnown?row.base:row.invested;
            const names=[...new Set([...row.model.rows.map(item=>item.generic),...row.benchmarkAllocations.keys(),...(state.includeCash&&row.cashKnown&&row.cash>0?['Efectivo']:[])])],byKey=new Map();
            for(const [name,amount] of row.benchmarkAllocations)byKey.set(OverviewCore.key(name),(byKey.get(OverviewCore.key(name))||0)+(base>0?amount/base*100:0));
            if(state.includeCash&&row.cashKnown&&row.cash>0)byKey.set('efectivo',(byKey.get('efectivo')||0)+row.cash/base*100);
            const lookup=name=>row.model.rows.find(item=>OverviewCore.key(item.generic)===OverviewCore.key(name));
            const actual=names.map(name=>byKey.get(OverviewCore.key(name))||0),benchmark=names.map(name=>lookup(name)?.weight||0),model=names.map(name=>lookup(name)?.portfolioWeight||0);
            FinancialVisuals.newPlot('overviewCompareChart',[{type:'bar',name:'Cliente',orientation:'h',y:names,x:actual,marker:{color:'#075aa3'}},{type:'bar',name:'Benchmark',orientation:'h',y:names,x:benchmark,marker:{color:'#9cabb9'}},{type:'bar',name:'Modelo',orientation:'h',y:names,x:model,marker:{color:'#42a4db'}}],{...layout('Cartera vs benchmark y modelo',Math.max(380,names.length*42)),barmode:'group',margin:{t:48,l:120,r:18,b:72},yaxis:{autorange:'reversed'},xaxis:{title:'Peso (%)'},legend:{orientation:'h',y:-.22}},{responsive:true});
            const diff=actual.map((value,i)=>value-benchmark[i]);
            FinancialVisuals.newPlot('overviewDeviationChart',[{type:'bar',orientation:'h',y:names,x:diff,marker:{color:diff.map(value=>value>=0?'#18815a':'#b34348')},hovertemplate:'%{y}: %{x:+.2f} pp<extra></extra>'}],{...layout('Diferencia frente al benchmark',Math.max(380,names.length*42)),margin:{t:48,l:120,r:26,b:72},yaxis:{autorange:'reversed'},xaxis:{title:'Puntos porcentuales',zeroline:true,zerolinecolor:'#8092a2'}},{responsive:true});
        }
    }
    function render(){
        const root=document.getElementById('overviewPanel');if(!root)return;
        const result=data(),tabs=[['summary','Resumen'],['clients','Clientes'],['funds','Fondos y AUM'],['levels','Niveles'],['limits','Límites RV'],['validity','Vigencias'],['categories','Categorización'],['parameters','Parametrización']];
        const content=state.tab==='summary'?summary(result):state.tab==='clients'?clients(result):state.tab==='funds'?funds(result):state.tab==='levels'?levels(result):state.tab==='limits'?`<h3>Control de bandas de renta variable</h3><p class="overview-context">RV sobre posiciones más efectivo numérico confirmado. Sin efectivo o clasificación completa, la posición en banda es orientativa y el cumplimiento no se verifica.</p>${limitTable(result.accounts)}`:state.tab==='validity'?vigencias(result):state.tab==='categories'?categories(result):parameters(result);
        root.innerHTML=`<header class="overview-heading"><div><h2>Panel de control patrimonial</h2><p>Seguimiento de clientes, asignación y vigencias</p></div><img src="assets/santalucia-gestion-patrimonial.png" alt="Santalucía Asset Management"></header><div class="overview-sources"><div><span>Posiciones</span><strong>${state.positionsFile?esc(state.positionsFile):'Pendiente'}</strong><button data-open-positions><i class="fa-solid fa-upload" aria-hidden="true"></i> Cargar en Análisis Cartera</button></div><div><span>Control de clientes</span><strong>${state.controlFile?`${state.clients.length} registros · ${esc(state.controlFile)}`:'Pendiente'}</strong><label><i class="fa-solid fa-file-excel" aria-hidden="true"></i> Importar Excel<input type="file" data-import-control accept=".xlsx,.xls" hidden></label></div><div><span>Categorización</span><strong>${result.funds.length-result.unknownCategories.length}/${result.funds.length} activos clasificados${state.categoryFile?` · ${esc(state.categoryFile)}`:''}${state.categoryDirty?' · Cambios sin exportar':''}</strong><label><i class="fa-solid fa-file-excel" aria-hidden="true"></i> Importar Excel<input type="file" data-import-categories accept=".xlsx,.xls" hidden></label><button data-export-categories title="Descargar categorización y base RF actualizadas"><i class="fa-solid fa-download" aria-hidden="true"></i> Descargar</button></div></div><p class="overview-privacy">Los datos personales se procesan solo en esta sesión del navegador. No se guardan en el servidor ni en el repositorio. <button data-clear-control>Retirar control de clientes</button></p><nav class="overview-tabs" aria-label="Vistas del panel">${tabs.map(([id,label])=>`<button data-tab="${id}" aria-current="${state.tab===id?'page':'false'}">${label}</button>`).join('')}</nav><section class="overview-content">${content}</section><p id="overviewStatus" role="status" class="overview-status"></p>`;
        root.querySelector('.overview-sources').insertAdjacentHTML('beforeend',`<div><span>Saldos</span><strong>${state.balanceFile?`${state.balances.length} subcuentas · ${esc(state.balanceFile)}`:'Pendiente'}</strong><label><i class="fa-solid fa-file-excel" aria-hidden="true"></i> Importar Excel<input type="file" data-import-balances accept=".xlsx,.xls" hidden></label></div>`);
        if(state.tab==='summary')root.querySelector('.overview-sources').insertAdjacentHTML('afterend',`<div class="overview-valuation-dates"><label>Fecha de posiciones <input type="date" data-valuation-date="positions" value="${inputDate(state.positionsDate)}"><small>${esc(state.positionsDateSource||'Pendiente')}</small></label><label>Fecha de saldos <input type="date" data-valuation-date="balances" value="${inputDate(state.balanceDate)}"><small>${esc(state.balanceDateSource||'Pendiente')}</small></label><span>Confirma ambas fechas contra los extractos: igualarlas manualmente acredita solo la fecha declarada, no que las valoraciones sean idénticas.</span></div>`);
        const currencies=[...new Set(state.balances.filter(row=>row.currency!=='EUR').map(row=>row.currency))];
        if(state.balances.length)root.querySelector('.overview-sources').insertAdjacentHTML('afterend',`<div class="overview-fx"><span>Valoración: posiciones ${date(state.positionsDate)} · saldos ${date(state.balanceDate)}</span>${currencies.map(currency=>`<label>1 EUR = <input type="number" step="any" min="0.000001" data-fx="${esc(currency)}" value="${Number.isFinite(state.fxRates[currency])?state.fxRates[currency]:''}" placeholder="Pendiente"> ${esc(currency)} <small>${esc(state.fxSource[currency]||'Manual')}</small></label>`).join('')}<span>${result.cashUnresolved.length?'Hay saldos sin convertir. Revisa los cambios.':'Todos los saldos en divisa convertidos.'}</span></div>`);
        if(location.hostname.endsWith('.vercel.app'))root.querySelector('.overview-privacy').insertAdjacentText('beforeend',' Antes de importar datos reales en una vista previa de Vercel, confirma el control de acceso corporativo.');
        if(state.tab==='parameters'){
            const missingTer=result.funds.filter(fund=>needsTer(fund)&&!Number.isFinite(houseInfo(fund).ter));
            root.querySelector('.overview-content').insertAdjacentHTML('beforeend',`<h4>Fondos y ETF sin TER · ${missingTer.length}</h4><p class="overview-context">El TER se cruza primero por ISIN con el ranking del universo y después con la hoja «Fondos Santalucia» del Excel de categorización. Los instrumentos directos no requieren TER. Los costes anuales globales permanecen pendientes si falta alguno.</p><div class="overview-scroll"><table><thead><tr><th>ISIN</th><th>Instrumento</th><th>AUM</th><th>TER anual (%)</th></tr></thead><tbody>${missingTer.map(fund=>`<tr><td>${esc(fund.isin)}</td><td>${esc(fund.name)}</td><td class="num">${money(fund.amount)}</td><td><input class="overview-rf-input" type="number" min="0" step="0.01" data-house-ter="${esc(fund.isin)}" aria-label="TER de ${esc(fund.isin)}"></td></tr>`).join('')||'<tr><td colspan="4">Todos los fondos y ETF tienen TER.</td></tr>'}</tbody></table></div>`);
        }
        if(state.tab==='clients'){
            const selected=result.accounts.find(item=>item.account===state.selected);
            const metric=root.querySelector('.overview-detail .overview-metrics');
            if(selected&&metric){
                const value=state.cashOverrides.get(selected.account);
                metric.insertAdjacentHTML('afterend',`<label class="overview-cash">Efectivo confirmado de esta cuenta (€) <input data-cash="${esc(selected.account)}" type="number" min="0" step="0.01" placeholder="${selected.cashKnown?selected.cash:'Pendiente'}" value="${Number.isFinite(value)?value:''}"></label><p class="overview-context">Puedes corregir el efectivo en esta sesión (también a 0). Sin efectivo confirmado, el límite de RV queda sin verificar.</p>`);
                if(!selected.cashKnown){metric.children[1].querySelector('strong').textContent='Pendiente';metric.children[2].querySelector('span').textContent='RV sobre invertido';}
                const rawFee=selected.client?.commission,fee=Number.isFinite(rawFee)?(rawFee<=1?rawFee*100:rawFee):NaN;
                const lower=selected.base>0?selected.house/selected.base*100:NaN,upper=selected.base>0?(selected.house+selected.houseUnreviewed)/selected.base*100:NaN;
                const houseStatus=Number.isFinite(lower)?lower>75?'Supera 75%':upper<=75?'Dentro del 75%':'Pendiente de validar':'Pendiente';
                const documentIssues=[...selected.documents.filter(item=>item.status!=='vigente').map(item=>`${item.role}: ${item.status}`),...[['KYC',selected.kyc],['Idoneidad',selected.suitability],['ESG',selected.esg]].filter(([,status])=>status!=='vigente').map(([label,status])=>`${label}: ${status}`)];
                metric.insertAdjacentHTML('beforeend',`<div><span>Comisión gestión</span><strong>${pct(fee)}</strong></div><div><span>Gestión anual indicativa</span><strong>${Number.isFinite(fee)?money(selected.base*fee/100):'Pendiente'}</strong></div><div><span>Fondos casa / límite</span><strong>${pct(lower)} / 75%</strong><small>${esc(houseStatus)}</small></div>`);
                metric.insertAdjacentHTML('afterend',`<div class="overview-filters"><label class="overview-cash-toggle"><input type="checkbox" data-include-cash ${state.includeCash?'checked':''}> Incluir efectivo en pesos y gráficas</label></div><p class="overview-context">La opción de visualización no altera el control de límites: este usa el efectivo conocido. ${selected.cashKnown?'':'Sin saldo confirmado, el peso RV se estima sobre posiciones.'}</p><div class="overview-client-checks"><strong>Control operativo:</strong> RV ${badge(selected.limit)} · Fondos de la casa ${esc(houseStatus)} · Documentos ${documentIssues.length?`<span class="overview-badge overview-warn">${documentIssues.length} pendientes</span>`:badge('vigente')}</div><div class="overview-client-qual"><h4>Información cualitativa y vigencias</h4>${selected.client?.qualitative?.length?`<dl>${selected.client.qualitative.map(([label,text])=>`<div><dt>${esc(label)}</dt><dd>${esc(text)}</dd></div>`).join('')}</dl>`:'<p>Control de clientes pendiente o sin datos cualitativos.</p>'}${documentIssues.length?`<p class="overview-warning">${esc(documentIssues.join(' · '))}</p>`:''}</div>`);
                root.querySelector('.overview-detail .overview-chart-grid')?.insertAdjacentHTML('afterend',`<div id="overviewHouseDonut" class="overview-house-chart"></div><div class="overview-house-threshold" style="--house:${Math.min(100,Math.max(0,Number.isFinite(lower)?lower:0))}%"><span>0%</span><div><i></i></div><span>100%</span></div><p class="overview-context">La marca roja indica el límite del 75% sobre posiciones más efectivo conocido. En amarillo, activos pendientes de validar; no se atribuyen a la casa.</p>`);
            }
        }
        if(state.tab==='funds'&&state.selectedFund){
            const fund=result.funds.find(item=>item.isin===state.selectedFund);
            if(fund){
                const label=row=>`<button class="overview-link" data-client="${esc(row.account)}">${esc(row.client?.code||row.client?.name||row.account)}</button><small> ${esc(row.client?.name||row.accountLabel||'Sin cruce')}</small>`;
                const withFund=result.accounts.filter(row=>fund.accounts.has(row.account)),withoutFund=result.accounts.filter(row=>!fund.accounts.has(row.account));
                root.querySelector('.overview-content').insertAdjacentHTML('beforeend',`<section class="overview-presence"><h3>Presencia · ${esc(fund.name)} (${esc(fund.isin)})</h3><div><section><h4>Lo tienen · ${withFund.length}</h4><ul>${withFund.map(row=>{const holding=row.positions.find(item=>item.isin===fund.isin);return `<li>${label(row)}<strong>${pct(row.invested>0?holding.amount/row.invested*100:NaN)}</strong><small>${money(holding.amount)}</small></li>`;}).join('')}</ul></section><section><h4>No lo tienen · ${withoutFund.length}</h4><ul>${withoutFund.map(row=>`<li>${label(row)}</li>`).join('')}</ul></section></div><p class="overview-context">Peso del fondo sobre las posiciones invertidas de cada cuenta, excluyendo efectivo.</p></section>`);
            }
        }
        if(result.accounts.length)draw(result);
        renderYahooChart();
    }
    function init(){const root=document.getElementById('overviewPanel');if(!root)return;
        root.addEventListener('click',event=>{
            const levelSort=event.target.closest('[data-level-sort]');if(levelSort){const key=levelSort.dataset.levelSort;state.levelDescending=state.levelSort===key?!state.levelDescending:true;state.levelSort=key;render();return;}
            const tab=event.target.closest('[data-tab]');if(tab){state.tab=tab.dataset.tab;state.search='';render();return;}
            const categoryView=event.target.closest('[data-category-view]');if(categoryView){state.categoryView=categoryView.dataset.categoryView;render();return;}
            const client=event.target.closest('[data-client]');if(client){state.selected=client.dataset.client;state.tab='clients';state.search='';render();return;}
            const fund=event.target.closest('[data-fund]');if(fund){state.selectedFund=fund.dataset.fund;render();root.querySelector('.overview-presence')?.scrollIntoView({block:'nearest'});return;}
            if(event.target.closest('[data-open-positions]')){switchSection('cartera');PortfolioWorkspace.scope='data';portfolioWorkflowRefresh();document.getElementById('aggregatePositionsFileInput')?.closest('.min-w-0')?.scrollIntoView({block:'center'});}
            if(event.target.closest('[data-export-categories]')){try{exportCategories();}catch(error){root.querySelector('#overviewStatus').textContent=error.message;}}
            if(event.target.closest('[data-load-yahoo-assets]')){state.yahooSeries.clear();loadYahooSeries();}
            if(event.target.closest('[data-accept-suggestions]'))acceptSuggestions();
            if(event.target.closest('[data-clear-control]')){state.clients=[];state.controlFile='';state.cashOverrides.clear();render();}
        });
        root.addEventListener('change',async event=>{const control=event.target.closest('[data-import-control]'),categories=event.target.closest('[data-import-categories]'),balances=event.target.closest('[data-import-balances]'),cash=event.target.closest('[data-cash]'),rf=event.target.closest('[data-overview-rf]');
            if(event.target.matches('[data-valuation-date]')){const value=event.target.value,parsed=value?new Date(`${value}T12:00:00`):null;if(value&&(!Number.isFinite(+parsed)||inputDate(parsed)!==value)){root.querySelector('#overviewStatus').textContent='Fecha no válida.';return;}if(event.target.dataset.valuationDate==='positions'){state.positionsDate=parsed;state.positionsDateSource=value?'Introducida por el gestor':'Pendiente';}else{state.balanceDate=parsed;state.balanceDateSource=value?'Introducida por el gestor':'Pendiente';}render();return;}
            if(event.target.matches('[data-yahoo-isin]')){const isin=normalizeIsin(event.target.dataset.yahooIsin),ticker=event.target.value.trim().toUpperCase();if(ticker&&!/^[A-Z0-9^=._-]+$/.test(ticker)){root.querySelector('#overviewStatus').textContent='Ticker Yahoo no válido.';return;}if(ticker)state.yahooTickers.set(isin,ticker);else state.yahooTickers.delete(isin);state.categoryDirty=true;render();loadYahooSeries();return;}
            if(event.target.matches('[data-include-cash]')){state.includeCash=event.target.checked;render();return;}
            if(event.target.matches('[data-balance-link]')){const target=event.target.dataset.balanceLink,source=event.target.value;if(source)state.balanceLinks[target]=source;else delete state.balanceLinks[target];render();return;}
            if(event.target.matches('[data-fx]')){const currency=event.target.dataset.fx,value=Number(event.target.value.replace(',','.'));if(!(value>0)){root.querySelector('#overviewStatus').textContent='Introduce un cambio positivo: unidades de divisa por 1 EUR.';return;}state.fxRates[currency]=value;state.fxSource[currency]='Manual';render();return;}
            if(event.target.matches('[data-band]')){const profile=event.target.dataset.band,index=+event.target.dataset.bandIndex,value=Number(event.target.value.replace(',','.')),next=[...state.bands[profile]];next[index]=value;if(!Number.isFinite(value)||next[0]<0||next[1]>100||next[0]>=next[1]){root.querySelector('#overviewStatus').textContent='La banda debe cumplir 0 ≤ mínimo < máximo ≤ 100.';event.target.value=state.bands[profile][index];return;}state.bands[profile]=next;state.categoryDirty=true;render();return;}
            if(event.target.matches('[data-house]')){const isin=event.target.dataset.house,item=state.houseFunds.get(isin)||{};state.houseFunds.set(isin,{...item,house:event.target.value==='yes'?true:event.target.value==='no'?false:null});state.categoryDirty=true;render();return;}
            if(event.target.matches('[data-house-ter]')){const isin=event.target.dataset.houseTer,raw=event.target.value.trim(),value=raw===''?NaN:Number(raw.replace(',','.'));if(raw!==''&&(!Number.isFinite(value)||value<0)){root.querySelector('#overviewStatus').textContent='El TER debe ser un porcentaje no negativo.';return;}const item=state.houseFunds.get(isin)||{};state.houseFunds.set(isin,{...item,ter:value});state.categoryDirty=true;render();return;}
            if(cash){const raw=cash.value.trim(),value=Number(raw.replace(',','.'));if(!raw)state.cashOverrides.delete(cash.dataset.cash);else if(Number.isFinite(value)&&value>=0)state.cashOverrides.set(cash.dataset.cash,value);else {root.querySelector('#overviewStatus').textContent='Introduce un efectivo no negativo.';return;}render();return;}
            if(rf){try{const value=rf.value.trim()===''?null:Number(rf.value.replace(',','.'));GdcModel.setRfMetric(rf.dataset.overviewRf,rf.dataset.rfField,value);state.categoryDirty=true;render();}catch(error){root.querySelector('#overviewStatus').textContent=error.message;}return;}
            for(const [selector,key] of [['[data-fund-type]','fundType'],['[data-fund-product]','fundProduct'],['[data-fund-sort]','fundSort'],['[data-validity-type]','validityType'],['[data-validity-status]','validityStatus']])if(event.target.matches(selector)){state[key]=event.target.value;render();return;}
            if(!control&&!categories&&!balances)return;try{if(control)await importControl(control.files?.[0]);else if(categories)await importCategories(categories.files?.[0]);else await importBalances(balances.files?.[0]);}catch(error){root.querySelector('#overviewStatus').textContent=error.message;}});
        root.addEventListener('submit',event=>{const form=event.target.closest('.overview-map-form');if(!form)return;event.preventDefault();try{saveCategory(form);}catch(error){root.querySelector('#overviewStatus').textContent=error.message;}});
        root.addEventListener('change',event=>{if(!event.target.matches('[data-search]'))return;state.search=event.target.value.trim();render();});
        render();
    }
    return {init,capturePositions,importControl,importCategories,importBalances,loadCategoriesWorkbook,exportCategories,render,state};
})();
OverviewPanel.init();
