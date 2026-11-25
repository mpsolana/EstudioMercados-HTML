const SharedData=(()=>{
 'use strict';
 const core=SharedDataCore,state={sources:new Map(),candidates:[],selection:{},explicit:new Set(),loaded:{},busy:false,notice:'Vincula las carpetas sincronizadas de OneDrive para revisar los archivos disponibles.',batch:''};
 let host;
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const stamp=value=>new Date(value).toLocaleString('es-ES');
 async function digest(buffer){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))].map(n=>n.toString(16).padStart(2,'0')).join('');}
 function summary(book){return book.SheetNames.map(name=>{
  const sheet=book.Sheets[name];if(!sheet['!ref'])return {name,rows:[]};
  const range=XLSX.utils.decode_range(sheet['!ref']);range.s.r=0;range.s.c=0;range.e.r=Math.min(11,range.e.r);
  return {name,rows:XLSX.utils.sheet_to_json(sheet,{header:1,defval:null,range})};
 });}
 function validate(book,role){
  const sheet=name=>book.Sheets[findSheet(book,[name])];
  const grid=name=>XLSX.utils.sheet_to_json(sheet(name),{header:1,defval:null,range:0});
  let valid=true;
  if(role==='gdc'||role==='gici')valid=ModelPortfolioCore.parseGrid(grid('Carteras Modelo')).length>0;
  if(role==='categories')valid=sheetRowsFromHeader(book,findSheet(book,['Categorización'])).some(row=>normalizeIsin(looseRowValue(row,['ISIN'])));
  if(role==='control')valid=grid('Control DNI & TEST').slice(3).some(row=>row[2]||row[60]);
  if(role==='balances')valid=OverviewCore.parseBalanceRows(sheetRowsFromHeader(book,book.SheetNames[0]).map(row=>({...row,BALANCE:parseRankingNumber(row.BALANCE)}))).length>0;
  if(role==='positions')valid=bestRowsByDetectedHeader(book,[['isin','codigo isin','security code'],['instrument','instrumento','nombre instrumento','security name']]).some(row=>normalizeIsin(looseRowValue(row,['ISIN','Código ISIN','Security Code'])));
  if(role==='universe')valid=sheetRowsFromHeader(book,findSheet(book,['Ranking Completo']),8).some(row=>normalizeIsin(fundCol(row,['ISIN']))&&String(fundCol(row,['Name'])||'').trim());
  if(role==='master')valid=book.SheetNames.some(name=>parseFundPortfolioRows(sheetRows(book,name)).length>0);
  if(!valid)throw Error(`${core.roles[role]}: el formato se reconoce, pero no hay registros válidos. No se ha iniciado la carga.`);
 }
 function render(){
  if(!host)return;
  if(!window.APP_CONFIDENTIAL){host.innerHTML='<h2>BBDD compartidas</h2><p>La carga de carpetas confidenciales está disponible en la edición local sin conexiones de red. Abre <strong>local.html</strong> desde el paquete completo de la aplicación en tu equipo.</p>';return;}
  const groups=core.group(state.candidates);
  host.innerHTML=`<div class="shared-data-heading"><div><span class="shared-data-eyebrow">EDICIÓN LOCAL · RED DESACTIVADA</span><h2>BBDD compartidas</h2><p>OneDrive sincroniza los archivos. Aquí revisas y cargas la copia disponible en este equipo.</p></div><span class="shared-data-badge">Solo lectura</span></div>
   <div class="shared-data-actions"><button data-pick="bbdd">Vincular BBDD</button><button data-pick="control">Vincular Control DNI</button><button data-action="refresh">Revisar cambios</button><button data-action="files">Elegir archivos</button><button data-action="load" class="shared-data-primary">Cargar selección</button></div>
   <p class="shared-data-status" role="status" aria-live="polite">${esc(state.notice)}</p>
   <div class="shared-data-sources">${[...state.sources].map(([id,source])=>`<span>${id==='bbdd'?'BBDD':'Control DNI'}: <strong>${esc(source.name)}</strong> · ${source.handle?'carpeta vinculada':'selección manual'}</span>`).join('')}</div>
   ${state.candidates.length?`<div class="shared-data-table"><table><thead><tr><th>Datos</th><th>Archivo a cargar</th><th>Modificado en este equipo¹</th><th>Estado</th></tr></thead><tbody>${core.order.filter(role=>groups[role].length).map(role=>{
    const options=groups[role],item=options.find(row=>row.id===state.selection[role]),loaded=state.loaded[role];
    const status=item?(core.sameVersion(item,loaded)?'Cargado · '+loaded.sha256.slice(0,10):'Pendiente de cargar'):'Elige un archivo';
    return `<tr><th>${esc(core.roles[role])}</th><td><select aria-label="${esc(core.roles[role])}" data-role="${role}"><option value="">${options.length>1?'Varios candidatos: selecciona uno':'No cargar'}</option>${options.map(row=>`<option value="${esc(row.id)}" ${row.id===state.selection[role]?'selected':''}>${esc(row.file.name)} (${row.source==='control'?'Control DNI':'BBDD'})</option>`).join('')}</select></td><td>${item?esc(stamp(item.file.lastModified)):'—'}</td><td>${esc(status)}</td></tr>`;
   }).join('')}</tbody></table></div>`:''}
   <label class="shared-data-confirm"><input type="checkbox" id="sharedMasterEur"> Si cargo el Maestro, confirmo que todos sus históricos están expresados en EUR.</label>
   <details><summary>Cómo se reconocen los archivos y cómo actualizar</summary><p>Se revisan hojas y cabeceras: Ranking Completo (ISIN, Name, Score), Maestro (pesos y precios), estados GDC/GICI, Categorización, posiciones (cuenta, ISIN y contravalor EUR), saldos (cuenta, divisa y saldo) y Control DNI (cuenta y perfil en sus columnas habituales). El nombre orienta; no sustituye la validación del formato.</p><p>Selecciona <strong>Comités/BBDD</strong> y, por separado, <strong>Dia Dia GDC &amp; Gestión Pasiva/Dia Dia</strong>. Solo se leen los Excel de primer nivel, sin subcarpetas ni archivos temporales. No se escriben cambios en los originales. Los formatos desconocidos se omiten y se indican abajo.</p><p>¹ La fecha de modificación no es la fecha financiera del contenido. Comprueba que OneDrive ha terminado de sincronizar antes de revisar cambios. Si aparece más de un archivo del mismo tipo, elige el válido; no se decide por la fecha del nombre.</p><p>«Revisar cambios» vuelve a leer las carpetas vinculadas, pero no sustituye el análisis. Pulsa «Cargar selección» para aplicar lo elegido. Si tu navegador usa selección manual, vuelve a seleccionar los archivos para actualizar. El permiso y la selección duran esta sesión. El identificador SHA-256 permite comparar la misma copia entre compañeros; no certifica que SharePoint esté sincronizado.</p><p>Los saldos en otras divisas requieren los tipos de cambio manuales del panel; esta edición no los consulta por internet. Los cambios hechos dentro de la aplicación siguen en memoria y se guardan mediante las exportaciones existentes. La publicación compartida de parametrizaciones se incorporará en una fase posterior.</p></details>
   ${state.batch?`<p class="shared-data-version">Última carga completa desde carpetas: ${esc(state.batch)}. Las importaciones manuales posteriores pueden modificar el análisis.</p>`:''}
   ${state.candidates.some(row=>!row.role)?`<details><summary>Archivos no reconocidos (${state.candidates.filter(row=>!row.role).length})</summary><p>${state.candidates.filter(row=>!row.role).map(row=>esc(row.file.name)+(row.error?' · no se pudo leer':' · formato no compatible')).join('<br>')}</p></details>`:''}
   <input type="file" id="sharedFiles" accept=".xls,.xlsx" multiple hidden><input type="file" id="sharedFolder" webkitdirectory multiple hidden>`;
  host.querySelectorAll('button,select').forEach(el=>el.disabled=state.busy);
 }
 async function scan(source,files){
  const next=[];
  for(const file of files){if(!core.eligible(file.name))continue;
   const id=source+'/'+file.name;
   try{
    const buffer=await file.arrayBuffer(),sha256=await digest(buffer),book=XLSX.read(buffer,{type:'array',sheetRows:12});
    next.push({id,source,file,sha256,role:core.classify(summary(book))});
   }catch(error){next.push({id,source,file,role:null,error:true});}
  }
  state.candidates=[...state.candidates.filter(row=>row.source!==source),...next];
  const groups=core.group(state.candidates);
  for(const role of core.order){const options=groups[role];if(state.explicit.has(role)&&state.selection[role]==='')continue;if(options.length>1&&!state.explicit.has(role))state.selection[role]='';else if(!options.some(item=>item.id===state.selection[role])){state.explicit.delete(role);state.selection[role]=options.length===1?options[0].id:'';}}
 }
 async function directoryFiles(handle){
  if(await handle.queryPermission({mode:'read'})!=='granted'&&await handle.requestPermission({mode:'read'})!=='granted')throw Error('Permiso de lectura denegado. Vuelve a vincular la carpeta.');
  const files=[];for await(const [name,entry] of handle.entries())if(entry.kind==='file'&&core.eligible(name))files.push(await entry.getFile());return files;
 }
 async function pick(source){
  if(!window.showDirectoryPicker){host.querySelector('#sharedFolder').dataset.source=source;host.querySelector('#sharedFolder').click();return;}
  try{
   const handle=await window.showDirectoryPicker({mode:'read',id:'shared-'+source});
   await run(async()=>{await scan(source,await directoryFiles(handle));state.sources.set(source,{name:handle.name,handle});state.notice='Archivos revisados. Comprueba la selección antes de cargarlos.';});
  }catch(error){if(error.name==='AbortError')return;state.notice='El navegador no permite vincular la carpeta. Puedes usar «Elegir archivos» o la selección manual de carpeta.';render();host.querySelector('#sharedFolder').dataset.source=source;host.querySelector('#sharedFolder').click();}
 }
 async function run(action){if(state.busy)return;state.busy=true;render();try{await action();}catch(error){state.notice=error.message;}finally{state.busy=false;render();}}
 async function refresh(){await run(async()=>{
  let manual=false;for(const [id,source] of state.sources){if(source.handle)await scan(id,await directoryFiles(source.handle));else manual=true;}
  state.notice=manual?'Carpetas vinculadas revisadas. Para actualizar las selecciones manuales, vuelve a elegir sus archivos.':'Revisión completada. Los cambios no se aplican hasta pulsar «Cargar selección».';
 });}
 async function load(){
  const chosen=core.order.map(role=>state.candidates.find(item=>item.role===role&&item.id===state.selection[role])).filter(Boolean);
  if(!chosen.length){state.notice='Selecciona al menos un archivo reconocido.';render();return;}
  const eur=host.querySelector('#sharedMasterEur').checked;
  if(chosen.some(item=>item.role==='master')&&!eur){state.notice='Confirma la moneda EUR de los históricos del Maestro antes de cargarlo.';host.querySelector('[role=status]').textContent=state.notice;return;}
  await run(async()=>{
   // Read and validate all snapshots before changing any active model.
   const staged=[];for(const item of chosen){
    const handle=state.sources.get(item.source)?.handle;
    const current=handle?await (await handle.getFileHandle(item.file.name)).getFile():item.file;
    const buffer=await current.arrayBuffer();if(await digest(buffer)!==item.sha256)throw Error('Un archivo ha cambiado durante la revisión. Revisa de nuevo la carpeta.');
    const book=XLSX.read(buffer,{type:'array',cellDates:true,cellNF:true});
    if(core.classify(summary(book))!==item.role)throw Error('El formato ha cambiado. Revisa de nuevo los archivos.');
    validate(book,item.role);
    staged.push({item,book});
   }
   state.batch='';let completed=0;
   for(const {item,book} of staged){
    state.notice=`Cargando ${core.roles[item.role]} (${completed+1}/${staged.length})…`;host.querySelector('[role=status]').textContent=state.notice;
    try{
     if(item.role==='universe'){await importFundUniverseFile(item.file);if(!fundUniverseState?.records?.length&&!fundUniverseState?.isinIndex?.size)throw Error('Universo sin registros válidos.');}
     if(item.role==='master'){document.getElementById('portfolioPricesInBase').checked=true;document.getElementById('portfolioBaseCurrency').value='EUR';await importFundScoringPortfolioFile(item.file);}
     if(item.role==='gdc'){GdcModel.loadWorkbook(book,item.file.name);}
     if(item.role==='gici'){GdcModel.switchMode('GICI');GdcModel.loadPriorWorkbook(book);}
     if(item.role==='categories')await OverviewPanel.importCategories(item.file);
     if(item.role==='positions')await importAggregatePositionsFile(item.file);
     if(item.role==='balances')await OverviewPanel.importBalances(item.file);
     if(item.role==='control')await OverviewPanel.importControl(item.file);
     state.loaded[item.role]={sha256:item.sha256,name:item.file.name,at:Date.now()};completed++;
    }catch(error){delete state.loaded[item.role];throw Error(`Carga incompleta: ${completed}/${staged.length} archivos aplicados. Falló ${core.roles[item.role]}. ${error.message} Revisa los datos antes de analizar.`);}
   }
   state.batch=`${stamp(Date.now())} · ${completed} archivos · ${ (await digest(new TextEncoder().encode(staged.map(({item})=>item.role+':'+item.sha256).join('\n')))).slice(0,16)}`;
   state.notice='Carga completada. Revisa las fechas financieras y los tipos de cambio pendientes en el panel.';
  });
 }
 function init(){
  const root=document.getElementById('overviewPanel');if(!root)return;
  host=document.createElement('section');host.id='sharedDataPanel';host.className='shared-data';root.before(host);render();
  host.addEventListener('click',event=>{const button=event.target.closest('button');if(!button||state.busy)return;if(button.dataset.pick)pick(button.dataset.pick);if(button.dataset.action==='refresh')refresh();if(button.dataset.action==='load')load();if(button.dataset.action==='files')host.querySelector('#sharedFiles').click();});
  host.addEventListener('change',event=>{
   if(event.target.dataset.role){state.selection[event.target.dataset.role]=event.target.value;state.explicit.add(event.target.dataset.role);render();return;}
   if(!['sharedFiles','sharedFolder'].includes(event.target.id))return;
   const input=event.target,source=input.dataset.source||'bbdd';
   const files=[...input.files].filter(file=>!file.webkitRelativePath||file.webkitRelativePath.split('/').length===2);
   run(async()=>{await scan(source,files);state.sources.set(source,{name:files[0]?.webkitRelativePath?.split('/')[0]||'Archivos elegidos',handle:null});state.notice='Selección manual revisada. Para actualizarla tendrás que volver a elegir los archivos.';});
  });
 }
 document.addEventListener('DOMContentLoaded',init);
 return {state,scan,refresh,load};
})();
