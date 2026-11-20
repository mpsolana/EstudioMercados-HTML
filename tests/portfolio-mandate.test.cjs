const assert = require('node:assert/strict');
const test = require('node:test');
const { calculate } = require('../assets/portfolio-mandate.js');

const etf = { kind: 'Dividendo', isin: 'IE0000000001', name: 'ETF de distribución', confirmed: true, ccy: 'EUR' };
const bond = { kind: 'Cupón', isin: 'FR0000000002', name: 'BONO 2,50 301129', confirmed: true, ccy: 'EUR' };
const trade = (instrument, code, date, amount) => ({ ...instrument, code, date, amount });

test('projects a regular dividend and derives a bond coupon from name and nominal', () => {
    const trades = [
        trade(etf, '1', '2026-03-18', 235),
        trade(etf, '2', '2026-06-19', 248),
        trade(etf, '3', '2026-09-17', 252),
        { ...bond, code: '4', kind: '', date: '2026-06-18', nominal: 200000, bondMovement: 1 }
    ];
    const result = calculate({ cutoff: '2026-10-05' }, { trades });
    assert.deepEqual(result.calendar.map(({ date, amount, gross }) => [date, amount, gross]), [
        ['2026-11-30', 5000, true], ['2026-12-18', 245, false]
    ]);
    assert.deepEqual(result.calendar[1].range, [235, 252]);
    assert.equal(result.bonds[0].maturity, '2029-11-30');
});

test('hand-entered coupons take priority and sold bonds do not contribute future income', () => {
    const trades = [
        { ...trade(bond, '5', '2025-11-30', 4998), nominal: 200000 },
        { ...bond, kind: '', code: '6', nominal: 200000, date: '2026-09-15', bondMovement: -1 }
    ];
    const result = calculate({
        cutoff: '2026-10-05',
        rules: { 'C:BONO NUEVO 5 311028': { name: 'BONO NUEVO 5 311028', kind: 'Cupón', nominal: '100000', net: '4800' } }
    }, { trades });
    assert.deepEqual(result.calendar.map(({ date, amount, gross }) => [date, amount, gross]), [['2026-10-31', 4800, false]]);
    assert.equal(result.bonds.length, 1);
    assert.equal(result.paymentAssets.find(row => row.isin === bond.isin).excluded, true);
});

test('a recurring override rolls forward across years, while a newly booked payment stays in actuals', () => {
    const trades = [trade(etf, '1', '2027-09-17', 250)];
    const result = calculate({
        cutoff: '2027-09-30',
        rules: { ['D:' + etf.isin]: { name: etf.name, kind: etf.kind, next: '2025-09-18', frequency: '3', net: '280' } }
    }, { trades });
    assert.equal(result.dividends, 250);
    assert.deepEqual(result.calendar.map(({ date, amount }) => [date, amount]), [['2027-12-18', 280]]);
});

test('an override saved by product name follows the ISIN when it appears in a later extract', () => {
    const trades = [{ ...bond, kind: '', code: '2', nominal: 200000, date: '2026-09-10', bondMovement: 1 }];
    const result = calculate({
        cutoff: '2026-10-05',
        rules: { 'C:BONO 2 50 301129': { name: bond.name, kind: bond.kind, nominal: '200000', net: '4990' } }
    }, { trades });
    assert.equal(result.paymentAssets.length, 1);
    assert.deepEqual(result.calendar.map(({ isin, amount }) => [isin, amount]), [[bond.isin, 4990]]);
});

test('the position report supplies bond nominals and converts foreign gains from the EUR countervalue', () => {
    const { readWorkbook } = require('../assets/portfolio-mandate.js');
    const rows = [
        ['Fecha de Referencia', '01/10/2026'],
        [' Producto', ' ISIN', 'Títulos / Nominal', 'Coste Medio', 'Precio Excupón', '% Ganancia/Pérdida',
            'Precio de mercado', 'Coste Adquisición', 'Valor de mercado', 'Plus Minus', 'Contravalor en EUR'],
        [bond.name, bond.isin, 200000, 100, 99, -2000, 99, 200000, 198000, -0.01, 198000],
        ['Activo CAD', etf.isin, 100, 14, null, 600, 20, 1400, 2000, 0.43, 1200],
        ['TOTAL CARTERA', null, null, null, null, null, null, null, null, null, 199200],
        ['', 'CAD'],
        ['1 EUR', 0.6]
    ];
    const sources = readWorkbook({ SheetNames: ['Data'], Sheets: { Data: rows } }, { utils: { sheet_to_json: sheet => sheet } });
    const result = calculate({ sales: { [etf.isin]: '50' } }, sources);
    assert.equal(result.cutoff, '2026-10-01');
    assert.equal(result.snapshotTotal, 199200);
    assert.equal(result.value, 199200);
    assert.equal(result.bonds[0].nominal, 200000);
    assert.equal(result.pendingCoupons, 5000);
    assert.equal(result.assets.find(asset => asset.key === etf.isin).ccy, 'CAD');
    assert.equal(result.possible, 360);
    assert.equal(result.selected, 180);
    assert.equal(result.proceeds, 600);
    assert.equal(calculate({ cutoff: '2026-09-30' }, sources).assets.length, 0);

    const laterTrade = { ...trade(etf, '9', '2026-10-02', 200), kind: '', positionMovement: true };
    assert.equal(calculate({}, { ...sources, trades: [laterTrade] }).possible, 0);
});

test('multicurrency cash uses matched currency only for an equal net and never trusts an ambiguous cash rate', () => {
    const trades = [{ ...trade(etf, 'usd', '2026-09-01', 100), ccy: 'USD', fx: 0.85, gross: 110, sourceTax: 8, localTax: 2 }];
    const cash = [{ code: 'usd', date: '2026-09-01', kind: 'Dividendo', isin: etf.isin, amount: 100, direction: 'ABONO', account: 'USD1' }];
    const result = calculate({}, { trades, cash });
    assert.equal(result.dividends, 85);
    assert.equal(result.actual.payments.length, 1);
    assert.equal(result.actual.payments[0].sourceTaxEUR, 6.8);
    assert.equal(result.actual.payments[0].localAmount, 100);
    assert.equal(calculate({}, { cash: [{ ...cash[0], fx: 1.2 }] }).actual.unresolved, 1);
    const mapped = calculate({ accountRows: 'USD1;USD;0.9' }, { cash });
    assert.equal(mapped.dividends, 90);
    const euroCash = calculate({}, { trades, cash: [{ ...cash[0], ccy: 'EUR', amount: 85 }] });
    assert.equal(euroCash.dividends, 85);
    assert.equal(euroCash.actual.payments.length, 1);
});

test('projection includes payments through the chosen end and deducts explicit withholding only on gross coupons', () => {
    const trades = [{ ...trade(bond, 'b', '2025-11-30', 4998), nominal: 200000 }];
    const rules = { ['C:' + bond.isin]: { name: bond.name, kind: 'Cupón', nominal: '200000', withholding: '20' } };
    const result = calculate({ cutoff: '2026-10-01', end: '2027-12-31', rules }, { trades });
    assert.equal(result.calendar.length, 2);
    assert.equal(result.pendingCoupons, 8000);
    rules['C:' + bond.isin].net = '4900';
    assert.equal(calculate({ cutoff: '2026-10-01', end: '2027-12-31', rules }, { trades }).pendingCoupons, 9800);
    assert.equal(calculate({ cutoff: '2026-10-01', end: '2026-10-20', rules }, { trades }).calendar.length, 0);
    assert.equal(Number.isNaN(calculate({ cutoff: '2026-10-01', end: '2026-09-30' }, { trades }).base), true);
});

test('sale hypotheses compound price and FX, respect the horizon and accept an acquisition cost in EUR', () => {
    const position = { date: '2026-10-01', issues: [], assets: [
        { key: etf.isin, name: 'CAD asset', units: 100, marketValue: 1200, cost: 840, ccy: 'CAD', imported: true }
    ] };
    const state = { end: '2026-12-31', sales: { [etf.isin]: '50' },
        saleAssumptions: { [etf.isin]: { returnPct: '20', fxPct: '10', date: '2026-12-15', costEUR: '900' } } };
    const result = calculate(state, { positions: position });
    assert(Math.abs(result.projectedProceeds - 792) < 1e-9);
    assert(Math.abs(result.projectedSelected - 342) < 1e-9);
    assert.equal(result.assets[0].costEstimated, false);
    state.end = '2026-11-30';
    assert.equal(calculate(state, { positions: position }).projectedSelected, 0);
});

test('fiscal reserve preserves booked net income and deducts costs and capital tax once', () => {
    const positions = { date: '2026-10-01', issues: [], assets: [
        { key: etf.isin, name: 'EUR asset', units: 100, marketValue: 1000, cost: 800, ccy: 'EUR', imported: true }
    ] };
    const trades = [trade(etf, 'income', '2026-09-01', 100)];
    const state = { sales: { [etf.isin]: '100' }, fiscalMode: 'net', incomeReservePct: '10', gainsTaxPct: '20', saleCostsPct: '1' };
    const result = calculate(state, { positions, trades });
    assert.equal(result.dividends, 100);
    assert.equal(result.grossBase, 100);
    assert.equal(result.base, 90);
    assert.deepEqual(result.selectedOutcome, { fees: 10, tax: 38, net: 152 });
    assert.deepEqual(result.projectedOutcome, result.selectedOutcome);
    assert.equal(result.base + result.selectedOutcome.net, 242);
    assert.equal(calculate({ ...state, gainsTaxPct: '' }, { positions, trades }).fiscal.valid, false);
    assert.equal(Number.isNaN(calculate({ ...state, gainsTaxPct: '' }, { positions, trades }).base), true);
    const loss = calculate(state, { positions: { ...positions, assets: [{ ...positions.assets[0], cost: 1100 }] }, trades });
    assert.deepEqual(loss.selectedOutcome, { fees: 10, tax: 0, net: -110 });
});

test('net carry uses explicit taxes and costs while a direct net yield takes precedence', () => {
    const config = { cutoff: '2026-10-01', value: '100000', rf: '80', duration: '3.2', ytm: '5',
        annualCostsPct: '.5', carryTaxPct: '20', convexity: '12', governmentPct: '100', igPct: '0', hyPct: '0' };
    const result = calculate(config, {});
    assert.equal(result.netYield, 3.6);
    assert.equal(result.macroRows.length, 4);
    assert.equal(calculate({ ...config, netYieldPct: '3.8' }, {}).netYield, 3.8);
    assert.equal(calculate({ ...config, carryTaxPct: '' }, {}).macroRows.length, 0);
    assert.equal(result.base, 0);
});


test('principal sensitivity separates rate and spread duration and omits absent spread risk', () => {
    const state={value:'350000',rf:'90',duration:'2.5',shock:'50'};
    const simple=calculate(state,{});
    assert.equal(simple.hasSpread,false);
    assert.equal(simple.shockImpact,-3937.5);
    const spread=calculate({...state,spreadDuration:'2.3',spreadShock:'50'},{});
    assert.equal(spread.hasSpread,true);
    assert(Math.abs(spread.shockImpact+7560)<1e-8);
    const unchangedRates=spread.sensitivity.find(row=>row.bp===0);
    assert.equal(Math.abs(unchangedRates.ratePct),0);
    assert(Math.abs(unchangedRates.creditPct+1.15)<1e-10);
    assert(Math.abs(unchangedRates.change+3622.5)<1e-8);
    assert.equal(calculate({...state,spreadShock:'50'},{}).shockImpact,simple.shockImpact);
    const invalid=calculate({...state,spreadDuration:'2.3',spreadShock:''},{});
    assert(Number.isNaN(invalid.shockImpact));
    assert(invalid.errors.some(error=>error.startsWith('Spread de referencia')));
});
