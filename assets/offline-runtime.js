/* Loaded before any library in the confidential entry. No credentials or telemetry. */
(()=>{
 'use strict';
 const local=location.protocol==='file:'||(['localhost','127.0.0.1','[::1]'].includes(location.hostname)&&['http:','https:'].includes(location.protocol));
 window.APP_CONFIDENTIAL=local;
 window.APP_OFFLINE_ENTRY=true;
 const blocked=()=>new Error('Edición local: acceso a red desactivado. Utiliza datos importados y tipos de cambio manuales.');
 // CSP is the primary boundary. These guards also give callers a useful error.
 window.fetch=()=>Promise.reject(blocked());
 XMLHttpRequest.prototype.open=function(){throw blocked();};
 window.WebSocket=function(){throw blocked();};
 window.EventSource=function(){throw blocked();};
 if(navigator.sendBeacon)navigator.sendBeacon=()=>false;
 document.addEventListener('click',event=>{
  const a=event.target.closest?.('a[href]');if(a&&/^https?:/i.test(a.href)){event.preventDefault();event.stopImmediatePropagation();}
 },true);
 window.open=()=>null;
 if(!local){document.addEventListener('DOMContentLoaded',()=>{
  document.body.replaceChildren(Object.assign(document.createElement('p'),{textContent:'Abre esta edición desde una carpeta de tu equipo. No cargues datos confidenciales en una web publicada.'}));
 });}
})();
