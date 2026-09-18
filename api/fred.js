import {guard,timedJson} from '../server/request-guard.mjs';
export default async function handler(req,res){
    if(!guard(req,res,'GET')) return;
    const {series_id,sort_order='asc'}=req.query;
    if(typeof series_id!=='string'||!/^[A-Za-z0-9_]{1,80}$/.test(series_id)||!['asc','desc'].includes(sort_order))return res.status(400).json({error:'Serie u orden no valido'});
    const key=process.env.FRED_API_KEY||process.env.FRED_API_TOKEN;
    if(!key)return res.status(503).json({error:'Proveedor FRED no configurado'});
    const params=new URLSearchParams({series_id,sort_order,file_type:'json',api_key:key});
    try{const data=await timedJson(`https://api.stlouisfed.org/fred/series/observations?${params}`);res.setHeader('Cache-Control','s-maxage=3600, stale-while-revalidate=300');return res.status(200).json(data);}
    catch{return res.status(502).json({error:'FRED no disponible temporalmente'});}
}
