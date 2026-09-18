import {guard,timedJson} from '../server/request-guard.mjs';
export default async function handler(req,res){
    if(!guard(req,res,'GET')) return;
    const {ticker,period1,period2,interval='1d'}=req.query;
    const start=Number(period1),end=Number(period2);
    if(typeof ticker!=='string'||!ticker.length||ticker.length>60||!/^[A-Za-z0-9^=._\-]+$/.test(ticker)||!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<=start||end-start>100*366*86400||!['1d','1wk','1mo'].includes(interval)) return res.status(400).json({error:'Ticker, fechas o intervalo no validos'});
    const params=new URLSearchParams({period1:String(start),period2:String(end),interval,events:'history'});
    const headers={'User-Agent':'MarketAnalyzer/1.0','Accept':'application/json'};
    for(const host of ['query1.finance.yahoo.com','query2.finance.yahoo.com']){
        try{const data=await timedJson(`https://${host}/v8/finance/chart/${encodeURIComponent(ticker)}?${params}`,{headers});res.setHeader('Cache-Control','s-maxage=300, stale-while-revalidate=300');return res.status(200).json(data);}catch{}
    }
    return res.status(502).json({error:'Precios no disponibles temporalmente'});
}
