import {guard,timedJson} from '../server/request-guard.mjs';
export default async function handler(req,res){
    if(!guard(req,res,'POST')) return;
    let payload=req.body;
    try{if(typeof payload==='string'){if(payload.length>64000)throw new Error();payload=JSON.parse(payload);}}catch{return res.status(400).json({error:'JSON no valido o demasiado grande'});}
    const key=process.env.OPENFIGI_API_KEY||process.env.OPEN_FIGI_API_KEY;
    if(!Array.isArray(payload)||!payload.length||payload.length>(key?100:10)||JSON.stringify(payload).length>64000||payload.some(job=>!job||typeof job.idType!=='string'||typeof job.idValue!=='string'||job.idValue.length>200))return res.status(400).json({error:'Lote OpenFIGI no valido'});
    const headers={'Content-Type':'application/json','Accept':'application/json'};if(key)headers['X-OPENFIGI-APIKEY']=key;
    try{return res.status(200).json(await timedJson('https://api.openfigi.com/v3/mapping',{method:'POST',headers,body:JSON.stringify(payload)}));}
    catch{return res.status(502).json({error:'OpenFIGI no disponible temporalmente'});}
}
