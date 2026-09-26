const PortfolioLoading=(()=>{
    let active=false,dialog;
    const pending=new Set();
    function track(promise){pending.add(promise);promise.then(()=>pending.delete(promise),()=>pending.delete(promise));return promise;}
    async function settled(){while(pending.size)await Promise.all([...pending]);}
    function update(percent,label){
        if(!active)return;
        percent=Math.max(percent,dialog.querySelector('progress').value||0);
        dialog.querySelector('progress').value=percent;dialog.querySelector('p').textContent=label;dialog.querySelector('strong').textContent=`${percent}%`;
    }
    async function phase(percent,label){
        if(!active)return;
        update(percent,label);
        await new Promise(resolve=>setTimeout(resolve,20));
    }
    async function run(task,options={}){
        if(active)throw new Error('Espera a que termine la carga actual.');
        active=true;
        if(!dialog){dialog=document.createElement('dialog');dialog.style.cssText='width:min(520px,90vw);border:1px solid #94a3b8;padding:24px;color:#173b63;background:white';dialog.innerHTML='<h2>Preparando datos y análisis</h2><p role="status" aria-live="polite"></p><progress aria-label="Progreso de carga" max="100" style="width:90%"></progress> <strong></strong>';dialog.addEventListener('cancel',e=>e.preventDefault());document.body.append(dialog);}
        dialog.querySelector('h2').textContent=options.title||'Preparando datos y análisis';dialog.querySelector('progress').value=0;
        dialog.showModal();
        try{await phase(5,options.start||'Leyendo y validando el archivo…');const result=await task();await settled();await phase(95,'Terminando gráficos y vistas secundarias…');await FinancialVisuals.settled();await phase(100,options.done||'Carga completa');return result;}
        finally{active=false;dialog.close();}
    }
    return {run,phase,update,track,settled,get active(){return active;}};
})();
