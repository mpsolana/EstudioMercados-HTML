(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SharedDataCore=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 'use strict';
 const key=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const roles={universe:'Universo de fondos',master:'Maestro de cartera',gdc:'Cartera modelo GDC',gici:'Cartera modelo GICI',categories:'Categorización',positions:'Posiciones',balances:'Saldos',control:'Clientes · Control DNI'};
 const order=['universe','master','gdc','gici','categories','positions','balances','control'];
 function classify(sheets){
  const named=name=>sheets.find(sheet=>key(sheet.name)===key(name));
  const headers=(sheet,groups)=>sheet?.rows?.some(row=>{const cells=new Set(row.map(key));return groups.every(group=>group.some(header=>cells.has(key(header))));});
  const any=groups=>sheets.some(sheet=>headers(sheet,groups));
  // Committees contain prices too: test their dedicated state before a generic master.
  if(named('Carteras Modelo')&&named('GICI Estado'))return 'gici';
  if(named('Carteras Modelo')&&named('GDC Estado'))return 'gdc';
  const control=sheets.find(sheet=>key(sheet.name).includes('control dni'));
  if(control&&key(control.rows?.[2]?.[2]).includes('cuenta')&&key(control.rows?.[2]?.[49]).includes('perfil'))return 'control';
  if(headers(named('Ranking Completo'),[['ISIN'],['Name'],['Score']]))return 'universe';
  if(headers(named('Categorización'),[['ISIN'],['Tipo Activo'],['TIPO ACTIVO +']]))return 'categories';
  if(any([['TRANSACTIONAL ACCOUNT'],['BALANCE'],['CURRENCY']]))return 'balances';
  if(any([['ISIN'],['INSTRUMENT','Instrumento','Security Name'],['INVERSIS ACCOUNT NUMBER','ACCOUNT'],['DIV INSTITUTION COUNTER VALUE','Contravalor EUR']]))return 'positions';
  if(['weights','pesos','cartera scoring','cartera individual','cartera'].some(name=>headers(named(name),[['ticker','ISIN'],['weight','peso','pesos']]))&&['prices','precios','posis','historico','historicos','nav'].some(named))return 'master';
  return null;
 }
 function eligible(name){return /\.xlsx?$/i.test(name)&&!/^~\$/.test(name);}
 function group(candidates){return Object.fromEntries(order.map(role=>[role,candidates.filter(item=>item.role===role)]));}
 function sameVersion(a,b){return Boolean(a&&b&&a.sha256===b.sha256);}
 return {key,roles,order,classify,eligible,group,sameVersion};
});
