importScripts('financial-planning-core.js');
self.onmessage=event=>{
    try{self.postMessage({result:self.FinancialPlanningCore.project(event.data.plan,{paths:event.data.paths,seed:event.data.seed})});}
    catch(error){self.postMessage({error:error.message});}
};
