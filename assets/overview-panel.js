const OverviewPanel=(()=>{
    const state={positions:[],clients:[],categories:new Map(),cashOverrides:new Map(),positionsFile:'',controlFile:'',categoryFile:'',categoryDirty:false,tab:'summary',selected:'',selectedFund:'',search:''};
    const esc=value=>escapeHtml(String(value??''));
    const money=value=>Number.isFinite(value)?new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(value):'—';
    const pct=value=>Number.isFinite(value)?`${value.toFixed(2)}%`:'—';
    const date=value=>value instanceof Date&&Number.isFinite(+value)?value.toLocaleDateString('es-ES'):'—';
    const toDate=value=>parseExcelDate(value);
    const plusMonths=(value,months)=>{const start=toDate(value);if(!start||!Number.isFinite(months)||months<=0)return null;const first=new Date(start.getFullYear(),start.getMonth()+months,1),lastDay=new Date(first.getFullYear(),first.getMonth()+1,0).getDate();return new Date(first.getFullYear(),first.getMonth(),Math.min(start.getDate(),lastDay));};
    const modelsByOrg=()=>Object.fromEntries(['GDC','GICI'].map(org=>[org,GdcModel.state.mode===org?GdcModel.state.models:GdcModel.state.scopes[org]?.models||[]]));
    function capturePositions(rows,fileName){
        state.cashOverrides.clear();state.selectedFund='';
        const parsed=(rows||[]).map(row=>({
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
        state.positionsFile=fileName;render();
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
            return {account,code,name:String(row[1]||code||account).trim(),organization:String(row[55]||'').trim().toUpperCase(),profile:String(row[49]||'').trim(),cash:parseRankingNumber(row[40]),reportedAum:parseRankingNumber(row[63]),
                documents:docs.filter(([,documentIndex,expiryIndex])=>row[documentIndex]||row[expiryIndex]).map(([role,documentIndex,expiryIndex])=>({role,present:Boolean(row[documentIndex]),expiry:toDate(row[expiryIndex])})),
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
        const workbook=await readWorkbook(file),sheet=findSheet(workbook,['Categorización','Categorizacion']);
        if(!sheet)throw new Error('Falta la hoja Categorización (ISIN, Categoría genérica, Tipo).');
        const rows=sheetRowsFromHeader(workbook,sheet),next=new Map();
        for(const row of rows){
            const isin=normalizeIsin(looseRowValue(row,['ISIN']));
            if(!isin)continue;
            const generic=String(looseRowValue(row,['Categoría genérica','Categoria generica','Categoría','Categoria'])||'').trim();
            const type=String(looseRowValue(row,['Tipo','Tipo activo','RV/RF'])||'').trim().toUpperCase();
            next.set(isin,{isin,generic,type:type==='RV'||type==='RF'?type:type==='OTROS'?'Otros':''});
        }
        state.categories=next;state.categoryFile=file.name;state.categoryDirty=false;render();
    }
    function exportCategories(){
        if(!window.XLSX)throw new Error('No se ha cargado XLSX.');
        const workbook=XLSX.utils.book_new(),known=new Map(state.categories);
        for(const position of state.positions)if(!known.has(position.isin))known.set(position.isin,{isin:position.isin,generic:'',type:''});
        const grid=[['ISIN','Nombre','Categoría genérica','Tipo'],...[...known.values()].sort((a,b)=>a.isin.localeCompare(b.isin)).map(row=>[row.isin,state.positions.find(p=>p.isin===row.isin)?.name||'',row.generic,row.type])];
        XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet(grid),'Categorización');
        XLSX.writeFile(workbook,'Categorizacion_carteras.xlsx');
        state.categoryDirty=false;render();
    }
    function saveCategory(form){
        const isin=normalizeIsin(form.dataset.isin),generic=form.querySelector('[name="generic"]').value.trim(),type=form.querySelector('[name="type"]').value;
        if(!isin||!generic||!['RV','RF','Otros'].includes(type))throw new Error('Indica categoría genérica y tipo RV, RF u Otros.');
        state.categories.set(isin,{isin,generic,type});state.categoryDirty=true;render();
    }
    function categorySuggestion(fund){
        const record=fundUniverseState?.isinIndex?.get(fund.isin);
        if(!record?.category)return null;
        const candidates=new Map();
        for(const models of Object.values(modelsByOrg()))for(const portfolio of models)for(const row of portfolio.rows){
            if((row.subcategories||[]).some(category=>OverviewCore.key(category)===OverviewCore.key(record.category))&&['RV','RF','Otros'].includes(row.assetType))candidates.set(OverviewCore.key(row.generic),{isin:fund.isin,generic:row.generic,type:row.assetType});
        }
        return candidates.size===1?[...candidates.values()][0]:null;
    }
    function acceptSuggestions(){
        const suggestions=data().funds.filter(fund=>!state.categories.get(fund.isin)?.generic).map(categorySuggestion).filter(Boolean);
        for(const suggestion of suggestions)state.categories.set(suggestion.isin,suggestion);
        if(suggestions.length)state.categoryDirty=true;
        render();
    }
    function data(){return OverviewCore.analyze({positions:state.positions,clients:state.clients,categories:[...state.categories.values()],cashByAccount:Object.fromEntries(state.cashOverrides),modelsByOrg:modelsByOrg()});}
    const badge=value=>`<span class="overview-badge overview-${['dentro','vigente'].includes(value)?'ok':['caducado','excede máximo','bajo mínimo'].includes(value)?'bad':'warn'}">${esc(value)}</span>`;
    function summary(result){
        const matched=result.accounts.length-result.noControl;
        const expired=result.accounts.filter(row=>row.documents.some(doc=>doc.status==='caducado')||[row.kyc,row.suitability,row.esg].includes('caducado')).length;
        const metrics=[['Importe en posiciones',money(result.invested)],['Cuentas con posiciones',result.accounts.length],['Cuentas conciliadas',`${matched}/${result.accounts.length}`],['Fuera de banda',result.breaches.length],['Vigencias caducadas',expired],['Sin clasificar',money(result.unclassified)]];
        const notices=[];
        if(result.noControl)notices.push(`${result.noControl} cuentas sin cruce único con el control de clientes.`);
        if(result.unknownCategories.length)notices.push(`${result.unknownCategories.length} activos sin categorización RV/RF válida.`);
        if(result.invalidAmounts)notices.push(`${result.invalidAmounts} posiciones sin contravalor EUR válido.`);
        const missingCash=result.accounts.filter(row=>!row.cashKnown).length;
        if(missingCash)notices.push(`${missingCash} cuentas sin efectivo confirmado: límites de RV pendientes.`);
        return `<div class="overview-metrics">${metrics.map(([label,value])=>`<div><span>${label}</span><strong>${value}</strong></div>`).join('')}</div><p class="overview-warning">${notices.length?notices.map(esc).join(' '):'Importes y coberturas conciliados con los datos cargados.'}</p><div class="overview-chart-grid"><div id="overviewAumChart"></div><div id="overviewCategoryChart"></div></div><h3>Atención prioritaria</h3>${limitTable(result.accounts.filter(row=>row.limit!=='dentro').slice(0,15))}`;
    }
    function limitTable(rows){
        return `<div class="overview-scroll"><table><thead><tr><th>Cuenta</th><th>Cliente</th><th>Entidad / perfil</th><th>RV</th><th>Banda</th><th>Posición en banda</th><th>Estado</th></tr></thead><tbody>${rows.map(row=>`<tr><td><button class="overview-link" data-client="${esc(row.account)}">${esc(row.account)}</button></td><td>${esc(row.client?.name||'Sin cruce')}</td><td>${esc(row.organization||'—')} · ${esc(row.client?.profile||'—')}</td><td class="num">${pct(row.rvPct)}</td><td class="num">${row.band?`${row.band[0]}–${row.band[1]}%`:'—'}</td><td class="num">${Number.isFinite(row.bandPosition)?pct(row.bandPosition):'—'}</td><td>${badge(row.limit)}</td></tr>`).join('')||'<tr><td colspan="7">Sin cuentas para mostrar.</td></tr>'}</tbody></table></div>`;
    }
    function comparison(row){
        if(!row.model)return '<p class="overview-warning">No hay cartera modelo cargada para esta entidad y perfil. La comparación no se estima.</p>';
        const actual=new Map([...row.allocations].map(([name,amount])=>[OverviewCore.key(name),row.base>0?amount/row.base*100:0]));
        if(row.cash>0)actual.set('efectivo',(actual.get('efectivo')||0)+row.cash/row.base*100);
        const categories=[...new Set([...row.model.rows.map(item=>item.generic),...row.allocations.keys(),...(row.cash>0?['Efectivo']:[])])];
        const modelRows=categories.map(name=>row.model.rows.find(item=>OverviewCore.key(item.generic)===OverviewCore.key(name)));
        return `<p class="overview-context">Cartera modelo ${esc(row.organization)} · ${esc(row.model.name)}. Pesos sobre posiciones más efectivo informado; el benchmark y el modelo son los del comité cargado.</p><div id="overviewCompareChart"></div><div class="overview-scroll"><table><thead><tr><th>Categoría</th><th>Cliente</th><th>Benchmark</th><th>Modelo</th><th>Cliente vs modelo</th></tr></thead><tbody>${categories.map((name,i)=>{const current=actual.get(OverviewCore.key(name))||0,benchmark=modelRows[i]?.weight,model=modelRows[i]?.portfolioWeight;return `<tr><td>${esc(name)}</td><td class="num">${pct(current)}</td><td class="num">${pct(benchmark)}</td><td class="num">${pct(model)}</td><td class="num">${Number.isFinite(model)?`${(current-model)>=0?'+':''}${(current-model).toFixed(2)} pp`:'—'}</td></tr>`;}).join('')}</tbody></table></div>`;
    }
    function clients(result){
        const rows=result.accounts.filter(row=>!state.search||`${row.account} ${row.client?.name||''}`.toLowerCase().includes(state.search.toLowerCase()));
        const selected=rows.find(row=>row.account===state.selected)||rows[0];if(selected)state.selected=selected.account;
        return `<label class="overview-search">Buscar cuenta o cliente <input data-search value="${esc(state.search)}" placeholder="Cuenta o nombre"></label><div class="overview-layout"><div class="overview-scroll overview-client-list"><table><thead><tr><th>Cuenta</th><th>Cliente</th><th>Importe</th><th>RV / límite</th></tr></thead><tbody>${rows.slice(0,300).map(row=>`<tr><td><button class="overview-link" data-client="${esc(row.account)}">${esc(row.account)}</button></td><td>${esc(row.client?.name||'Sin cruce')}</td><td class="num">${money(row.invested)}</td><td>${badge(row.limit)}</td></tr>`).join('')}</tbody></table></div><div class="overview-detail">${selected?`<h3>${esc(selected.client?.name||selected.account)}</h3><p>${esc(selected.account)} · ${esc(selected.organization||'Entidad pendiente')} · ${esc(selected.client?.profile||'Perfil pendiente')}</p><div class="overview-metrics compact"><div><span>Posiciones</span><strong>${money(selected.invested)}</strong></div><div><span>Efectivo informado</span><strong>${money(selected.cash)}</strong></div><div><span>RV</span><strong>${pct(selected.rvPct)}</strong></div><div><span>Cobertura</span><strong>${pct(selected.coverage*100)}</strong></div></div>${Number.isFinite(selected.client?.reportedAum)?`<p class="overview-context">AUM del control: ${money(selected.client.reportedAum)} · diferencia frente a posiciones + efectivo: ${money(selected.client.reportedAum-selected.base)}. Comprueba fecha y perímetro antes de conciliar.</p>`:''}${comparison(selected)}<h4>Posiciones</h4><div class="overview-scroll"><table><thead><tr><th>ISIN</th><th>Fondo</th><th>Categoría</th><th>Importe</th><th>Peso</th></tr></thead><tbody>${selected.positions.map(pos=>`<tr><td>${esc(pos.isin)}</td><td>${esc(pos.name)}</td><td>${esc(pos.classification?.generic||'Pendiente')}</td><td class="num">${money(pos.amount)}</td><td class="num">${selected.base>0?pct(pos.amount/selected.base*100):'—'}</td></tr>`).join('')}</tbody></table></div>`:'Selecciona una cuenta.'}</div></div>`;
    }
    function funds(result){
        const rows=result.funds.filter(row=>!state.search||`${row.isin} ${row.name}`.toLowerCase().includes(state.search.toLowerCase()));
        const byAccount=new Map(result.accounts.map(row=>[row.account,row]));
        return `<label class="overview-search">Buscar ISIN o fondo <input data-search value="${esc(state.search)}" placeholder="ISIN o nombre"></label><div class="overview-scroll"><table><thead><tr><th>ISIN</th><th>Fondo / activo</th><th>Categoría</th><th>Tipo</th><th>AUM en posiciones</th><th>Cuentas</th><th>Clientes que lo tienen</th></tr></thead><tbody>${rows.slice(0,400).map(fund=>`<tr><td><button class="overview-link" data-fund="${esc(fund.isin)}" title="Ver cuentas con y sin este fondo">${esc(fund.isin)}</button></td><td>${esc(fund.name)}</td><td>${esc(fund.classification?.generic||'Pendiente')}</td><td>${esc(fund.classification?.type||'—')}</td><td class="num">${money(fund.amount)}</td><td class="num">${fund.accounts.size}</td><td>${[...fund.accounts].sort().map(account=>{const holder=byAccount.get(account);return `<button class="overview-link" data-client="${esc(account)}" title="${esc(holder?.client?.name||holder?.accountLabel||account)}">${esc(holder?.client?.code||holder?.client?.name||account)}</button>`;}).join(', ')}</td></tr>`).join('')}</tbody></table></div><p class="overview-context">Pulsa un ISIN para ver cuentas con y sin el activo. Se muestran hasta 400 activos por búsqueda. Los importes son contravalores de posiciones; no se suman saldos del control.</p>`;
    }
    function vigencias(result){
        const rows=result.accounts.filter(row=>row.client).flatMap(row=>[
            ...row.documents.filter(doc=>doc.status!=='vigente').map(doc=>({row,kind:`DNI ${doc.role}`,status:doc.status,expiry:doc.expiry})),
            ...[['KYC',row.kyc,row.client.kycExpiry],['Test idoneidad',row.suitability,row.client.suitabilityExpiry],['Test ESG',row.esg,row.client.esgExpiry]].filter(([,status])=>status!=='vigente').map(([kind,status,expiry])=>({row,kind,status,expiry}))
        ]);
        const birthdays=result.accounts.filter(row=>row.client?.birthday).map(row=>{const birth=row.client.birthday,now=new Date(),next=new Date(now.getFullYear(),birth.getMonth(),birth.getDate());if(next<new Date(now.getFullYear(),now.getMonth(),now.getDate()))next.setFullYear(next.getFullYear()+1);return {row,next,days:Math.ceil((next-now)/86400000)};}).filter(item=>item.days>=0&&item.days<=30).sort((a,b)=>a.days-b.days);
        return `<h3>Documentos y renovaciones</h3><p class="overview-context">Cálculo según fecha de caducidad del Excel y fecha actual. “Próximo” significa 30 días o menos; las fechas ausentes se muestran pendientes. No se importan números de DNI.</p><div class="overview-scroll"><table><thead><tr><th>Cuenta</th><th>Cliente</th><th>Control</th><th>Vencimiento</th><th>Estado</th></tr></thead><tbody>${rows.map(item=>`<tr><td>${esc(item.row.account)}</td><td>${esc(item.row.client.name)}</td><td>${esc(item.kind)}</td><td>${date(item.expiry)}</td><td>${badge(item.status)}</td></tr>`).join('')||'<tr><td colspan="5">Sin incidencias de vigencia.</td></tr>'}</tbody></table></div><h3>Cumpleaños próximos 30 días</h3><div class="overview-scroll"><table><thead><tr><th>Cuenta</th><th>Cliente</th><th>Fecha</th><th>Días</th></tr></thead><tbody>${birthdays.map(item=>`<tr><td>${esc(item.row.account)}</td><td>${esc(item.row.client.name)}</td><td>${date(item.next)}</td><td>${item.days}</td></tr>`).join('')||'<tr><td colspan="4">Sin cumpleaños próximos.</td></tr>'}</tbody></table></div>`;
    }
    function categories(result){
        const known=[...result.funds];
        const generic=[...new Set(Object.values(modelsByOrg()).flatMap(models=>models.flatMap(model=>model.rows.map(row=>row.generic))))].sort();
        const suggestionCount=known.filter(fund=>!state.categories.get(fund.isin)?.generic&&categorySuggestion(fund)).length;
        return `<p class="overview-context">Cada ISIN se clasifica explícitamente como RV, RF u Otros y en una categoría genérica. El análisis de límites queda sin verificar hasta clasificar el 100% del contravalor. Descarga el Excel actualizado e impórtalo en el próximo comité; el navegador no puede sobrescribir SharePoint sin permiso del usuario.</p>${suggestionCount?`<button class="overview-suggestions" data-accept-suggestions>Aplicar ${suggestionCount} sugerencias exactas del ranking y mapeo GDC/GICI</button>`:''}<div class="overview-scroll"><table><thead><tr><th>ISIN / activo</th><th>AUM</th><th>Categoría genérica</th><th>Tipo</th><th>Acción</th></tr></thead><tbody>${known.map(fund=>{const mapping=state.categories.get(fund.isin),suggestion=!mapping?.generic?categorySuggestion(fund):null;return `<tr><td><strong>${esc(fund.isin)}</strong><br><small>${esc(fund.name)}</small>${suggestion?`<br><small>Sugerencia: ${esc(suggestion.generic)} · ${esc(suggestion.type)}</small>`:''}</td><td class="num">${money(fund.amount)}</td><td colspan="3"><form class="overview-map-form" data-isin="${esc(fund.isin)}"><input name="generic" list="overviewGenericList" value="${esc(mapping?.generic||'')}" aria-label="Categoría genérica de ${esc(fund.isin)}" placeholder="Categoría genérica"><select name="type" aria-label="Tipo de ${esc(fund.isin)}"><option value="">Pendiente</option>${['RV','RF','Otros'].map(type=>`<option ${mapping?.type===type?'selected':''}>${type}</option>`).join('')}</select><button type="submit" title="Guardar clasificación"><i class="fa-solid fa-check" aria-hidden="true"></i> Guardar</button></form></td></tr>`;}).join('')}</tbody></table></div><datalist id="overviewGenericList">${generic.map(name=>`<option value="${esc(name)}">`).join('')}</datalist>`;
    }
    function draw(result){
        if(state.tab==='summary'&&result.accounts.length){
            const top=result.accounts.slice(0,15);
            FinancialVisuals.newPlot('overviewAumChart',[{type:'bar',orientation:'h',name:'Posiciones',x:top.map(row=>row.invested),y:top.map(row=>row.client?.code||row.account),marker:{color:'#1c5797'}}],{title:'AUM por cuenta · posiciones',height:Math.max(340,top.length*28),margin:{t:45,l:75,r:20,b:40},yaxis:{autorange:'reversed'},xaxis:{title:'EUR'}},{responsive:true});
            const values=new Map();for(const row of result.accounts)for(const [name,amount] of row.allocations)values.set(name,(values.get(name)||0)+amount);
            const sorted=[...values].sort((a,b)=>b[1]-a[1]).slice(0,15);
            FinancialVisuals.newPlot('overviewCategoryChart',[{type:'bar',orientation:'h',name:'AUM',x:sorted.map(([,value])=>value),y:sorted.map(([name])=>name),marker:{color:'#627486'}}],{title:'Exposición por categoría',height:Math.max(340,sorted.length*28),margin:{t:45,l:150,r:20,b:40},yaxis:{autorange:'reversed'},xaxis:{title:'EUR'}},{responsive:true});
        }
        if(state.tab==='clients'){
            const row=result.accounts.find(item=>item.account===state.selected);if(!row?.model)return;
            const names=[...new Set([...row.model.rows.map(item=>item.generic),...row.allocations.keys(),...(row.cash>0?['Efectivo']:[])])],byKey=new Map([...row.allocations].map(([name,amount])=>[OverviewCore.key(name),row.base>0?amount/row.base*100:0]));
            if(row.cash>0)byKey.set('efectivo',(byKey.get('efectivo')||0)+row.cash/row.base*100);
            const lookup=name=>row.model.rows.find(item=>OverviewCore.key(item.generic)===OverviewCore.key(name));
            FinancialVisuals.newPlot('overviewCompareChart',[{type:'bar',name:'Cliente',x:names,y:names.map(name=>byKey.get(OverviewCore.key(name))||0),marker:{color:'#195995'}},{type:'bar',name:'Benchmark',x:names,y:names.map(name=>lookup(name)?.weight||0),marker:{color:'#9aa8b5'}},{type:'bar',name:'Cartera modelo',x:names,y:names.map(name=>lookup(name)?.portfolioWeight||0),marker:{color:'#2d8090'}}],{barmode:'group',height:390,margin:{t:25,l:45,r:15,b:110},yaxis:{title:'Peso (%)'},legend:{orientation:'h',y:-.35}},{responsive:true});
        }
    }
    function render(){
        const root=document.getElementById('overviewPanel');if(!root)return;
        const result=data(),tabs=[['summary','Resumen'],['clients','Clientes'],['funds','Fondos y AUM'],['limits','Límites RV'],['validity','Vigencias'],['categories','Categorización']];
        const content=state.tab==='summary'?summary(result):state.tab==='clients'?clients(result):state.tab==='funds'?funds(result):state.tab==='limits'?`<h3>Control de bandas de renta variable</h3><p class="overview-context">RV sobre posiciones más efectivo informado. Sin perfil, clasificación completa o importe válido, el resultado se marca sin verificar.</p>${limitTable(result.accounts)}`:state.tab==='validity'?vigencias(result):categories(result);
        root.innerHTML=`<header class="overview-heading"><div><h2>Panel de control patrimonial</h2><p>Seguimiento de clientes, asignación y vigencias</p></div><img src="assets/santalucia-gestion-patrimonial.png" alt="Santalucía Asset Management"></header><div class="overview-sources"><div><span>Posiciones</span><strong>${state.positionsFile?esc(state.positionsFile):'Pendiente'}</strong><button data-open-positions><i class="fa-solid fa-upload" aria-hidden="true"></i> Cargar en Análisis Cartera</button></div><div><span>Control de clientes</span><strong>${state.controlFile?`${state.clients.length} registros · ${esc(state.controlFile)}`:'Pendiente'}</strong><label><i class="fa-solid fa-file-excel" aria-hidden="true"></i> Importar Excel<input type="file" data-import-control accept=".xlsx,.xls" hidden></label></div><div><span>Categorización</span><strong>${state.categoryFile?esc(state.categoryFile):`${state.categories.size} clasificados`}${state.categoryDirty?' · Cambios sin exportar':''}</strong><label><i class="fa-solid fa-file-excel" aria-hidden="true"></i> Importar Excel<input type="file" data-import-categories accept=".xlsx,.xls" hidden></label><button data-export-categories title="Descargar categorización actualizada"><i class="fa-solid fa-download" aria-hidden="true"></i> Descargar</button></div></div><p class="overview-privacy">Los datos personales se procesan solo en esta sesión del navegador. No se guardan en el servidor ni en el repositorio. <button data-clear-control>Retirar control de clientes</button></p><nav class="overview-tabs" aria-label="Vistas del panel">${tabs.map(([id,label])=>`<button data-tab="${id}" aria-current="${state.tab===id?'page':'false'}">${label}</button>`).join('')}</nav><section class="overview-content">${content}</section><p id="overviewStatus" role="status" class="overview-status"></p>`;
        if(location.hostname.endsWith('.vercel.app'))root.querySelector('.overview-privacy').insertAdjacentText('beforeend',' Antes de importar datos reales en una vista previa de Vercel, confirma el control de acceso corporativo.');
        if(state.tab==='clients'){
            const selected=result.accounts.find(item=>item.account===state.selected);
            const metric=root.querySelector('.overview-detail .overview-metrics');
            if(selected&&metric){
                const value=state.cashOverrides.get(selected.account);
                metric.insertAdjacentHTML('afterend',`<label class="overview-cash">Efectivo confirmado de esta cuenta (€) <input data-cash="${esc(selected.account)}" type="number" min="0" step="0.01" placeholder="Pendiente" value="${Number.isFinite(value)?value:''}"></label><p class="overview-context">Dato temporal de esta sesión. Si el control no lo informa, la RV sobre posiciones es orientativa y el límite queda sin verificar hasta confirmar el efectivo (puede ser 0).</p>`);
                if(!selected.cashKnown){metric.children[1].querySelector('strong').textContent='Pendiente';metric.children[2].querySelector('span').textContent='RV sobre invertido';}
            }
        }
        if(state.tab==='funds'&&state.selectedFund){
            const fund=result.funds.find(item=>item.isin===state.selectedFund);
            if(fund){
                const label=row=>`<button class="overview-link" data-client="${esc(row.account)}">${esc(row.client?.code||row.client?.name||row.account)}</button><small> ${esc(row.client?.name||row.accountLabel||'Sin cruce')}</small>`;
                const withFund=result.accounts.filter(row=>fund.accounts.has(row.account)),withoutFund=result.accounts.filter(row=>!fund.accounts.has(row.account));
                root.querySelector('.overview-content').insertAdjacentHTML('beforeend',`<section class="overview-presence"><h3>Presencia · ${esc(fund.name)} (${esc(fund.isin)})</h3><div><section><h4>Lo tienen · ${withFund.length}</h4><ul>${withFund.map(row=>`<li>${label(row)}</li>`).join('')}</ul></section><section><h4>No lo tienen · ${withoutFund.length}</h4><ul>${withoutFund.map(row=>`<li>${label(row)}</li>`).join('')}</ul></section></div></section>`);
            }
        }
        if(result.accounts.length)draw(result);
    }
    function init(){const root=document.getElementById('overviewPanel');if(!root)return;
        root.addEventListener('click',event=>{
            const tab=event.target.closest('[data-tab]');if(tab){state.tab=tab.dataset.tab;state.search='';render();return;}
            const client=event.target.closest('[data-client]');if(client){state.selected=client.dataset.client;state.tab='clients';state.search='';render();return;}
            const fund=event.target.closest('[data-fund]');if(fund){state.selectedFund=fund.dataset.fund;render();root.querySelector('.overview-presence')?.scrollIntoView({block:'nearest'});return;}
            if(event.target.closest('[data-open-positions]')){switchSection('cartera');PortfolioWorkspace.scope='data';portfolioWorkflowRefresh();document.getElementById('aggregatePositionsFileInput')?.closest('.min-w-0')?.scrollIntoView({block:'center'});}
            if(event.target.closest('[data-export-categories]')){try{exportCategories();}catch(error){root.querySelector('#overviewStatus').textContent=error.message;}}
            if(event.target.closest('[data-accept-suggestions]'))acceptSuggestions();
            if(event.target.closest('[data-clear-control]')){state.clients=[];state.controlFile='';state.cashOverrides.clear();render();}
        });
        root.addEventListener('change',async event=>{const control=event.target.closest('[data-import-control]'),categories=event.target.closest('[data-import-categories]'),cash=event.target.closest('[data-cash]');if(cash){const raw=cash.value.trim(),value=Number(raw.replace(',','.'));if(!raw)state.cashOverrides.delete(cash.dataset.cash);else if(Number.isFinite(value)&&value>=0)state.cashOverrides.set(cash.dataset.cash,value);else {root.querySelector('#overviewStatus').textContent='Introduce un efectivo no negativo.';return;}render();return;}if(!control&&!categories)return;try{if(control)await importControl(control.files?.[0]);else await importCategories(categories.files?.[0]);}catch(error){root.querySelector('#overviewStatus').textContent=error.message;}});
        root.addEventListener('submit',event=>{const form=event.target.closest('.overview-map-form');if(!form)return;event.preventDefault();try{saveCategory(form);}catch(error){root.querySelector('#overviewStatus').textContent=error.message;}});
        root.addEventListener('change',event=>{if(!event.target.matches('[data-search]'))return;state.search=event.target.value.trim();render();});
        render();
    }
    return {init,capturePositions,importControl,importCategories,exportCategories,render,state};
})();
OverviewPanel.init();
