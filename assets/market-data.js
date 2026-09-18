const MarketData = (() => {
    const cache = new Map(), pending = new Map(), metadata = new Map(), queue = [];
    let active = 0;
    async function slot(task) {
        if (active >= 4) await new Promise(resolve => queue.push(resolve));
        active++;
        try { return await task(); } finally { active--; queue.shift()?.(); }
    }
    async function read(url) {
        const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
        try {
            const response = await fetch(url, { signal: controller.signal });
            if (!response.ok) throw new Error(`Proveedor HTTP ${response.status}`);
            const body = await response.json();
            const result = body.chart?.result?.[0];
            if (!result?.timestamp?.length) throw new Error('El proveedor no devuelve precios.');
            return result;
        } finally { clearTimeout(timer); }
    }
    async function prices(ticker, start, end) {
        const key = `${ticker}|${start}|${end}`, saved = cache.get(key);
        if (saved && Date.now() - saved.time < 15 * 60 * 1000) { metadata.set(ticker, saved.metadata); return saved.data; }
        if (pending.has(key)) return pending.get(key);
        const task = slot(async () => {
            const p1 = Math.floor(new Date(start).getTime() / 1000), p2 = Math.floor(new Date(end).getTime() / 1000);
            if (!Number.isFinite(p1) || !Number.isFinite(p2) || p2 <= p1) throw new Error('Rango de fechas no valido.');
            const params = `period1=${p1}&period2=${p2}&interval=1d`;
            const own = `/api/yahoo?ticker=${encodeURIComponent(ticker)}&${params}`;
            let result, source = 'Backend Yahoo';
            try { result = await read(own); }
            catch (error) {
                source = 'Yahoo directo';
                result = await read(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?${params}&events=history`);
            }
            const adjusted = result.indicators?.adjclose?.[0]?.adjclose;
            const values = adjusted || result.indicators?.quote?.[0]?.close || [];
            const data = result.timestamp.map((t, i) => ({date: new Date(t * 1000), price: values[i]})).filter(p => Number.isFinite(p.price) && p.price > 0).sort((a, b) => a.date - b.date);
            FinanceCore.validateSeries(data, ticker);
            metadata.set(ticker, { currency: result.meta?.currency || null, priceType: adjusted ? 'adjusted-close' : 'close', source, retrievedAt: new Date().toISOString(), start, end });
            cache.set(key, { time: Date.now(), data, metadata: metadata.get(ticker) });
            if (cache.size > 250) cache.delete(cache.keys().next().value);
            if (metadata.size > 500) metadata.delete(metadata.keys().next().value);
            return data;
        }).finally(() => pending.delete(key));
        pending.set(key, task); return task;
    }
    return { prices, metadata };
})();
