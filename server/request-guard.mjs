const calls = new Map();
export function guard(req, res, method) {
    const origin = req.headers?.origin;
    const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
    let sameHost = false;
    try { sameHost = new URL(origin).host === req.headers?.host; } catch {}
    if (origin && !sameHost && !allowed.includes(origin)) { res.status(403).json({error:'Origen no permitido'}); return false; }
    if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary','Origin'); }
    res.setHeader('Access-Control-Allow-Methods', `${method}, OPTIONS`);
    res.setHeader('Access-Control-Allow-Headers','Content-Type');
    if(req.method==='OPTIONS'){res.status(204).end();return false;}
    if(req.method!==method){res.setHeader('Allow',method);res.status(405).json({error:'Metodo no permitido'});return false;}
    const now=Date.now(), key=String(req.headers?.['x-real-ip'] || req.socket?.remoteAddress || 'anonymous');
    if(calls.size>1000) for(const [id,v] of calls) if(now-v.start>60000) calls.delete(id);
    if(calls.size>=10000&&!calls.has(key)){res.setHeader('Retry-After','60');res.status(429).json({error:'Limite temporal de servicio'});return false;}
    const bucket=calls.get(key);const next=!bucket||now-bucket.start>60000?{start:now,count:1}:{...bucket,count:bucket.count+1};calls.set(key,next);
    if(next.count>120){res.setHeader('Retry-After','60');res.status(429).json({error:'Demasiadas peticiones'});return false;}
    return true;
}
export async function timedJson(url, options={}) {
    const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),12000);
    try {
        const response=await fetch(url,{...options,signal:controller.signal});
        if(!response.ok) throw new Error(`Proveedor HTTP ${response.status}`);
        return await response.json();
    } finally {clearTimeout(timer);}
}
