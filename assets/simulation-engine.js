const SimulationEngine = (() => {
    async function simulate(data, progress = () => {}) {
        const { sims, stepsPerYear, histDays, longTermYears, capital, logReturns, method = 'normal', blockSize = 5, initialShock = 0 } = data;
        if (!logReturns?.length || !logReturns.every(Number.isFinite) || initialShock <= -1 || initialShock > 0) throw new Error('Parametros de simulacion no validos.');
        let seed = (Number(data.seed) || 1) >>> 0;
        const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return ((seed >>> 0) + .5) / 4294967296; };
        const average = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
        const sd = Math.sqrt(logReturns.reduce((a, b) => a + (b - average) ** 2, 0) / Math.max(1, logReturns.length - 1));
        const monthlySamples = Array.from({ length: 13 }, () => []), longTermSamples = Array.from({ length: longTermYears + 1 }, () => []), maxDrawdowns = [];
        const checkpoints = Array.from({ length: 13 }, (_, m) => m ? Math.max(1, Math.round(m / 12 * stepsPerYear)) : 0);
        for (let s = 0; s < sims; s++) {
            let value = 1, peak = 1, dd = 0, blockStart = 0;
            monthlySamples[0].push(capital); longTermSamples[0].push(capital);
            for (let t = 1; t <= Math.max(histDays, longTermYears * stepsPerYear, stepsPerYear); t++) {
                let r;
                if (method === 'bootstrap') {
                    if ((t - 1) % blockSize === 0) blockStart = Math.floor(random() * logReturns.length);
                    r = logReturns[(blockStart + (t - 1) % blockSize) % logReturns.length];
                } else r = average + sd * Math.sqrt(-2 * Math.log(random())) * Math.cos(2 * Math.PI * random());
                value *= Math.exp(r) * (t === 1 ? 1 + initialShock : 1);
                if (t <= histDays) { peak = Math.max(peak, value); dd = Math.max(dd, 1 - value / peak); }
                if (t <= stepsPerYear) checkpoints.forEach((step, m) => { if (m && step === t) monthlySamples[m].push(capital * value); });
                if (t % stepsPerYear === 0 && t / stepsPerYear <= longTermYears) longTermSamples[t / stepsPerYear].push(capital * value);
            }
            maxDrawdowns.push(dd);
            if (s % 100 === 0) { progress(Math.round(s / sims * 100)); await new Promise(resolve => setTimeout(resolve, 0)); }
        }
        return { monthlySamples, longTermSamples, maxDrawdowns };
    }
    function run(data) {
        const source = `const simulate=${simulate.toString()};self.onmessage=async e=>{try{self.postMessage({result:await simulate(e.data,p=>self.postMessage({progress:p}))})}catch(error){self.postMessage({error:error.message})}};`;
        const url = URL.createObjectURL(new Blob([source], {type:'application/javascript'}));
        return new Promise((resolve, reject) => {
            let worker;
            const done = () => { worker?.terminate(); URL.revokeObjectURL(url); };
            try { worker = new Worker(url); } catch (error) { done(); simulate(data).then(resolve,reject); return; }
            worker.onmessage = ({data:message}) => {
                if ('progress' in message) { const el=document.getElementById('forecastStatus'); if(el)el.textContent=`Simulando escenarios: ${message.progress}%`; return; }
                done(); message.error ? reject(new Error(message.error)) : resolve(message.result);
            };
            worker.onerror = error => { done(); reject(new Error(error.message)); };
            worker.postMessage(data);
        });
    }
    return { run, simulate };
})();
if (typeof module !== 'undefined') module.exports = SimulationEngine;
