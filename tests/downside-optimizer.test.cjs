const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../assets/downside-optimizer-core.js');
const Finance = require('../assets/finance-core.js');

function fixture() {
    const dates = [];
    for (let time = +new Date('2017-01-02'); time <= +new Date('2023-01-03'); time += 86400000) {
        const date = new Date(time);
        if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) dates.push(date.toISOString().slice(0, 10));
    }
    return Array.from({ length: 6 }, (_, i) => ({
        isin: 'ES' + String(i + 1).padStart(10, '0'), name: 'Fondo ' + i,
        type: i < 3 ? 'RF' : 'RV', credit: i < 2 ? 'IG' : 'HY', grossYield: 4, ter: .5, duration: 1,
        fxPct: i === 5 ? 50 : 0,
        data: dates.map((date, t) => ({ date, price: 100 * Math.exp((.0001 + i * .000015) * t + .008 * Math.sin(t / 30 + i)) }))
    }));
}
const config = { ...Core.profiles.equilibrado, minWeight: 5, maxWeight: 25, maxRv: 75, maxDrawdown: 50,
    maxRecovery: 10000, maxHy: 100, maxFx: 100, allowOpen: true,
    iterations: 100, seed: 12345, ulcerPenalty: .05, riskFree: 0, rebalance: 'monthly' };

test('sampled portfolios have operational minimums, caps and exact total, with zero allowed only for unused funds', () => {
    const bounds = Core.validate(config, 10), random = Core.randomSource(123);
    for (let n = 0; n < 500; n++) {
        const weights = Core.sample(10, config, random, bounds);
        assert(Math.abs(weights.reduce((a, b) => a + b, 0) - 1) < 1e-10);
        assert(weights.every(w => w === 0 || w >= .05 - 1e-10 && w <= .25 + 1e-10));
    }
    assert.throws(() => Core.validate({ ...config, maxWeight: 10 }, 6), /100%/);
});

test('RF metrics normalize inside the RF sleeve and TER is deducted only from gross yield', () => {
    const assets = fixture();
    const metrics = Core.fundamentals(assets, [.25, .25, 0, .25, .25, 0]);
    assert.equal(metrics.netYield, 3.5);
    assert.equal(metrics.duration, 1);
    assert.equal(metrics.efficiency, 3.5);
    assert.equal(metrics.hy, 0);
    assert.equal(metrics.rateImpact, -.5);
    const prepared = Core.prepare(assets, config);
    const simulated = Core.history(prepared, [.25, .25, 0, .25, .25, 0], config, true);
    const expected = Finance.portfolioPath(assets.map((asset, i) => ({ ticker: asset.isin, weight: [.25,.25,0,.25,.25,0][i] })),
        prepared.dates, prepared.returns, { rebalance: 'monthly', costBps: 0 });
    let value = 100;
    expected.forEach((r, i) => { value *= 1 + r; assert(Math.abs(value - simulated.path[i + 1]) < 1e-8); });
});

test('optimizer is reproducible, returns valid candidates and explains near misses under impossible limits', async () => {
    const assets = fixture(), first = await Core.optimize(assets, config), second = await Core.optimize(assets, config);
    assert(first.valid > 0);
    assert.deepEqual(first.choices[0].weights, second.choices[0].weights);
    assert(first.choices[0].worst3 > 0 && first.choices[0].worst5 > 0);
    assert.equal(first.choices[0].failures.length, 0);
    const impossible = await Core.optimize(assets, { ...config, minYield: 10 });
    assert.equal(impossible.valid, 0);
    assert.equal(impossible.choices.length, 3);
    assert(impossible.choices.every(point => point.failures.some(failure => failure.name === 'TIR neta RF')));
    assert(impossible.blockers['TIR neta RF'] > 0);
});

test('missing metadata, insufficient histories and cancellation fail visibly', async () => {
    const assets = fixture();
    assert.throws(() => Core.prepare([{ ...assets[0], fxPct: NaN }, assets[1]], config), /exposición/);
    assert.throws(() => Core.prepare(assets.map(asset => ({ ...asset, data: asset.data.slice(0, 200) })), config), /cinco años/);
    assert.equal(Core.prepare(assets.map(asset => ({ ...asset, data: asset.data.filter((_, i) => i % 21 === 0) })), config).frequency, 'M');
    await assert.rejects(Core.optimize(assets, config, { cancelled: () => true }), /cancelado/);
});

test('recovery uses all peak-to-recovery episodes and preserves the open duration as a lower bound', () => {
    const dates = ['2020-01-01','2020-01-02','2020-01-03','2020-01-06','2020-01-07'];
    const prices = [100,90,80,100,95];
    const prepared = { assets: [{ isin: 'A' }], dates, times: dates.map(date => +new Date(date)),
        returns: { A: prices.slice(1).map((price, i) => price / prices[i] - 1) },
        windows3: dates.map(() => -1), windows5: dates.map(() => -1), frequency: 'D' };
    const result = Core.history(prepared, [1], config, true);
    assert(Math.abs(result.maxDrawdown - 20) < 1e-10);
    assert.equal(result.maxRecovery, 5);
    assert.equal(result.openRecovery, 1);
    assert.equal(result.recoveryDays, 5);
    assert(Math.abs(result.ulcer - Math.sqrt((100 + 400 + 25) / 5)) < 1e-10);
});

test('quarterly and annual rebalance are consistent with target weights at calendar boundaries', () => {
    const dates = ['2020-03-30','2020-03-31','2020-04-01','2020-04-02','2021-01-04','2021-01-05'];
    const entries = [{ ticker: 'A', weight: .5 }, { ticker: 'B', weight: .5 }];
    const returns = { A: [.1, .1, .1, .1, .1], B: [0,0,0,0,0] };
    const quarter = Finance.portfolioPath(entries, dates, returns, { rebalance: 'quarterly' });
    const annual = Finance.portfolioPath(entries, dates, returns, { rebalance: 'annual' });
    assert(Math.abs(quarter[2] - .05) < 1e-12);
    assert(annual[2] > .05);
    assert(Math.abs(annual[4] - .05) < 1e-12);
});

test('optimizer profile RV ceilings use the shared GDC/GICI bands', () => {
    const Models = require('../assets/model-portfolio-core.js');
    assert.deepEqual(Object.keys(Core.profiles), Object.keys(Models.bands));
    for (const [profile, band] of Object.entries(Models.bands)) assert.equal(Core.profiles[profile].maxRv, band[1]);
    assert.equal(Models.assetType('MM EUR'), 'RF');
});

test('100 monthly observations are usable and date diagnostics distinguish loaded and selected prices', () => {
    const dates = Array.from({ length: 100 }, (_, i) => new Date(Date.UTC(2018, 7 + i + 1, 0, 22)));
    const assets = fixture().slice(0, 2).map((asset, index) => ({
        ...asset, data: dates.map((date, i) => ({ date, price: 100 * (1 + .002 + index * .001) ** i }))
    }));
    const prepared = Core.prepare(assets, config);
    assert.equal(prepared.frequency, 'M');
    assert.equal(prepared.dates.length, 100);
    const metrics = Core.history(prepared, [.5, .5], config);
    assert(Number.isFinite(metrics.worst3) && Number.isFinite(metrics.worst5));
    assert.throws(() => Core.prepare(assets, { ...config, start: '2028-01-01' }), /100 precios cargados, pero 0/);
    const lastDate = dates.at(-1).toISOString().slice(0, 10);
    assert.equal(Core.prepare(assets, { ...config, end: lastDate }).dates.length, 100);
});


test('five-year annualized rolling floor filters winners and reports rejected candidates', async () => {
    const assets = fixture();
    const accepted = await Core.optimize(assets, { ...config, minRolling5: 0 });
    assert(accepted.valid > 0);
    assert(accepted.choices.every(point => point.worst5 >= 0 && point.failures.length === 0));
    const rejected = await Core.optimize(assets, { ...config, minRolling5: 50 });
    assert.equal(rejected.valid, 0);
    assert(rejected.choices.length > 0);
    assert(rejected.blockers['Retorno rolling mínimo a 5 años'] > 0);
    for (const point of rejected.choices) {
        const failure = point.failures.find(item => item.name === 'Retorno rolling mínimo a 5 años');
        assert(failure);
        assert.equal(failure.limit, 50);
        assert.equal(failure.value, point.worst5);
        assert.equal(failure.unit, '% anual');
    }
    const disabled = await Core.optimize(assets, { ...config, minRolling5: NaN });
    const legacy = await Core.optimize(assets, config);
    assert.equal(disabled.valid, legacy.valid);
    assert.deepEqual(disabled.choices[0].weights, legacy.choices[0].weights);
    for (const minRolling5 of [-101, Infinity, 'bad'])
        assert.throws(() => Core.validate({ ...config, minRolling5 }, assets.length), /mínimo rolling/);
});


test('Monetario is accepted as RF quality and remains outside the HY bucket', () => {
    const assets=fixture().slice(0,2).map(asset=>({...asset,credit:'Monetario'}));
    Core.prepare(assets,config);
    assert.equal(Core.fundamentals(assets,[.5,.5]).hy,0);
});

test('disabling filters permits historical-only search and pure worst five-year return ranking', async () => {
    const assets=fixture().map(asset=>({...asset,type:'',credit:'',fxPct:NaN,grossYield:NaN,ter:NaN,duration:NaN}));
    const relaxed={...config,objective:'rolling5',disabledConstraints:Core.constraintKeys,minWeight:NaN,maxWeight:NaN,maxDuration:NaN,minYield:NaN,minEfficiency:NaN,maxFx:NaN,maxHy:NaN,maxDrawdown:NaN,maxRecovery:NaN,minRolling5:NaN,ulcerPenalty:NaN,allowOpen:false};
    const result=await Core.optimize(assets,relaxed);
    assert(result.valid>0);
    assert(result.choices.every(point=>point.failures.length===0&&point.score===point.worst5));
    assert(result.choices[0].worst5>=result.choices.at(-1).worst5-1e-10);
    for(const point of result.choices){assert(Math.abs(point.weights.reduce((a,b)=>a+b,0)-1)<1e-10);assert(point.weights.every(weight=>weight>=0&&weight<=1));}
    const floor=await Core.optimize(assets,{...relaxed,minRolling5:100,disabledConstraints:Core.constraintKeys.filter(key=>key!=='minRolling5')});
    assert.equal(floor.valid,0);
    assert(floor.choices.every(point=>point.failures.some(failure=>failure.name==='Retorno rolling mínimo a 5 años')));
    const rv=fixture().map(asset=>({...asset,type:'RV'}));
    const onlyRv=await Core.optimize(rv,{...relaxed,maxRv:100,disabledConstraints:Core.constraintKeys.filter(key=>key!=='maxRv')});
    assert(onlyRv.valid>0);
});

test('common date defaults use actual shared observations, not just overlapping bounds', () => {
    const assets=fixture().slice(0,2);
    assets[1].data=assets[1].data.slice(10,-7);
    const range=Core.commonRange(assets);
    assert.equal(range.start,assets[1].data[0].date);
    assert.equal(range.end,assets[1].data.at(-1).date);
    assert.equal(range.count,assets[1].data.length);
    assert.deepEqual(Core.commonRange([]),{start:'',end:'',count:0});
});
