(function () {
    'use strict';

    const rateSensitivity = typeof module !== 'undefined' && module.exports
        ? require('./rate-sensitivity.js') : globalThis.RateSensitivity;

    const normalize = value => String(value ?? '').normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
    const numeric = value => {
        const text = String(value ?? '').trim().replace(/\s/g, '');
        if (!text) return NaN;
        const amount = Number(text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text);
        return Number.isFinite(amount) ? amount : NaN;
    };
    const isoDate = value => {
        if (value instanceof Date && Number.isFinite(+value)) {
            return [value.getFullYear(), value.getMonth() + 1, value.getDate()]
                .map((part, i) => String(part).padStart(i === 0 ? 4 : 2, '0')).join('-');
        }
        const text = String(value ?? '').trim();
        const local = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
        const iso = local ? [local[3], local[2].padStart(2, '0'), local[1].padStart(2, '0')].join('-') : text.slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
        const date = new Date(iso + 'T00:00:00Z');
        return Number.isFinite(+date) && date.toISOString().startsWith(iso) ? iso : '';
    };
    const classify = value => {
        const name = normalize(value);
        if (/^(PAGO (DE )?CUPON)$/.test(name)) return 'Cupón';
        if (/^(ABONO (DE )?DIVIDENDO)$/.test(name)) return 'Dividendo';
        return '';
    };
    const id = value => String(value ?? '').trim().replace(/^"|"$/g, '');
    const currency = value => String(value ?? '').trim().toUpperCase();
    const sheetTypes = { OPERACIONES: 'trades', 'MOVIMIENTOS DE EFECTIVO': 'cash' };

    function readPositions(rows, header) {
        const columns = rows[header].map(normalize);
        const cell = (row, name) => row[columns.indexOf(name)];
        const date = isoDate(rows.slice(0, header).find(row => normalize(row[0]) === 'FECHA DE REFERENCIA')?.[1]);
        if (!date) throw new Error('La posición necesita una Fecha de Referencia válida.');
        const exchanges = new Map();
        for (let i = header + 1; i + 1 < rows.length; i++) {
            const ccy = currency(rows[i][1]);
            const rate = numeric(rows[i + 1][1]);
            if (/^[A-Z]{3}$/.test(ccy) && normalize(rows[i + 1][0]) === '1 EUR' && rate > 0) exchanges.set(ccy, rate);
        }
        const assets = new Map();
        const issues = [];
        for (const row of rows.slice(header + 1)) {
            const key = id(cell(row, 'ISIN')).toUpperCase();
            if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(key)) continue;
            const name = id(cell(row, 'PRODUCTO')) || key;
            const units = numeric(cell(row, 'TITULOS NOMINAL'));
            const price = numeric(cell(row, 'PRECIO DE MERCADO'));
            const localValue = numeric(cell(row, 'VALOR DE MERCADO'));
            const marketValue = numeric(cell(row, 'CONTRAVALOR EN EUR'));
            const localCost = numeric(cell(row, 'COSTE ADQUISICION'));
            const fx = localValue > 0 && marketValue >= 0 ? marketValue / localValue : NaN;
            const zeroValue = marketValue === 0 && localValue === 0;
            const ccy = Math.abs(fx - 1) < 0.0001 ? 'EUR' :
                [...exchanges].find(([, rate]) => Math.min(Math.abs(rate - fx), Math.abs(1 / rate - fx)) < 0.0001)?.[0] || '';
            const bond = numeric(cell(row, 'PRECIO EXCUPON')) > 0 && Boolean(bondTerms(name).maturity);
            if (!(units > 0) || !(marketValue >= 0)) {
                issues.push(name);
                continue;
            }
            const cost = fx > 0 && localCost >= 0 ? localCost * fx : NaN;
            const asset = { key, name, units, price, ccy, fx, cost, localCost, localValue, marketValue, bond, imported: true };
            if (!(cost >= 0) || zeroValue) issues.push(name);
            const previous = assets.get(key);
            if (previous) {
                if (previous.ccy !== ccy || previous.bond !== bond || !Number.isFinite(previous.fx) || !Number.isFinite(fx) ||
                    Math.abs(previous.fx - fx) > 0.0001) {
                    throw new Error('La posición repite un ISIN con divisa o tipo incoherentes: ' + key);
                }
                asset.units += previous.units;
                asset.price = (price * units + previous.price * previous.units) / asset.units;
                asset.localCost += previous.localCost;
                asset.localValue += previous.localValue;
                asset.cost += previous.cost;
                asset.marketValue += previous.marketValue;
            }
            assets.set(key, asset);
        }
        if (!assets.size) throw new Error('La posición no contiene filas con ISIN, cantidad y contravalor válidos.');
        return { date, assets: [...assets.values()], issues };
    }

    function readWorkbook(workbook, xlsx) {
        const result = {};
        for (const sheet of workbook.SheetNames) {
            const rowsWithHeaders = xlsx.utils.sheet_to_json(workbook.Sheets[sheet], {
                header: 1, raw: true, defval: null, blankrows: false
            });
            const type = sheetTypes[normalize(sheet)];
            if (!type) {
                const positionHeader = rowsWithHeaders.findIndex(row => {
                    const columns = row.map(normalize);
                    return ['PRODUCTO', 'ISIN', 'TITULOS NOMINAL', 'PRECIO DE MERCADO', 'COSTE ADQUISICION',
                        'VALOR DE MERCADO', 'CONTRAVALOR EN EUR'].every(name => columns.includes(name));
                });
                if (positionHeader < 0) continue;
                if (result.positions) throw new Error('El libro contiene más de una hoja de posiciones.');
                result.positions = readPositions(rowsWithHeaders, positionHeader);
                continue;
            }
            if (result[type]) throw new Error('El libro contiene dos hojas del mismo tipo.');
            const [headers = [], ...rows] = rowsWithHeaders;
            const columns = headers.map(normalize);
            const fields = type === 'trades'
                ? ['TRANSACTION CODE', 'TRANSACTION STATUS', 'TRANSACTIONS', 'SETTLEMENT DATE CUSTOMER', 'NET AMOUNT', 'CURRENCY', 'ISIN']
                : ['TIPO DE OPERACI', 'FECHA VALOR', 'SENTIDO', 'IMPORTE NETO', 'ISIN'];
            const positions = fields.map(field => columns.findIndex(col => col === field
                || (field === 'TIPO DE OPERACI' && /^TIPO DE OPERACI( |O)/.test(col))));
            if (positions.includes(-1)) throw new Error('Falta una columna requerida en ' + sheet + '.');
            const get = (row, field) => row[columns.indexOf(field)];
            result[type] = rows.map(row => {
                if (type === 'trades') {
                    const [code, status, event, date, amount, ccy, isin] = positions.map(i => row[i]);
                    const movement = normalize(event);
                    const fixedIncome = normalize(get(row, 'PRODUCT TYPE')) === 'RENTA FIJA' || /^(COMPRA|VENTA) RF\b/.test(movement);
                    const bondMovement = !fixedIncome ? 0 : /^COMPRA\b/.test(movement) ? 1 :
                        /^(VENTA|AMORTIZACION|REEMBOLSO)\b/.test(movement) ? -1 : 0;
                    return { code: id(code), bondMovement, positionMovement: /^(COMPRA|VENTA|SUSCRIPCI|REEMBOLSO|AMORTIZACI|TRASPASO)/.test(movement), disposal: /^(VENTA|REEMBOLSO|AMORTIZACI)/.test(movement),
                        nominal: currency(ccy) === 'EUR' ? numeric(get(row, 'TOTAL NOMINAL')) : NaN, confirmed: normalize(status) === 'DEFINITIVA', kind: classify(event),
                        date: isoDate(date ?? get(row, 'VALUE DATE') ?? get(row, 'TRADE DATE')),
                        gross: numeric(get(row, 'GROSS AMOUNT')),
                        sourceTax: numeric(get(row, 'SOURCE WITHHOLDING TAX')),
                        localTax: numeric(get(row, 'LOCAL WITHHOLDING TAX')),
                        account: id(get(row, 'CLIENT SETTLEMENT ACCOUNT')),
                        amount: numeric(amount), ccy: currency(ccy), fx: numeric(get(row, 'EUR CURRENCY PRICE CHANGE')),
                        isin: id(isin).toUpperCase(), name: id(get(row, 'INSTRUMENT')) };
                }
                const [event, date, direction, amount, isin] = positions.map(i => row[i]);
                return { code: id(get(row, 'NUM OPERACIONES')), account: id(get(row, 'CODIGO CUENTA')),
                    kind: classify(event), date: isoDate(date), amount: numeric(amount), direction: normalize(direction),
                    ccy: currency(get(row, 'DIVISA DEL MOVIMIENTO DIVISA DE LA CUENTA')),
                    fx: numeric(get(row, 'TIPO DE CAMBIO')), isin: id(isin).toUpperCase(), name: id(get(row, 'CONCEPTO')) };
            }).filter(row => row.date || row.kind || row.code);
        }
        if (!Object.keys(result).length) throw new Error('El libro debe contener Operaciones, Movimientos de efectivo o el extracto de posición.');
        return result;
    }

    function received({ trades = [], cash = [] }, cutoff, allYears = false, accountRules = {}) {
        const operations = new Map();
        const booked = new Set();
        const seenCash = new Set();
        let unresolved = 0;
        const unresolvedRows = [];
        for (const row of trades) {
            if (row.confirmed && row.kind && row.code) operations.set(row.code, row);
        }
        const withinYear = row => row.date && row.date <= cutoff && (allYears || row.date.slice(0, 4) === cutoff.slice(0, 4));
        const payments = [];
        for (const row of cash) {
            if (!row.kind) continue;
            const operation = operations.get(row.code);
            const matched = operation && operation.kind === row.kind &&
                (!row.isin || !operation.isin || row.isin === operation.isin) ? operation : null;
            if (matched) booked.add(row.code);
            if (!withinYear(row)) continue;
            const key = row.code ? [row.account, row.code, row.kind, row.date, row.direction, row.amount, row.isin].join('|') : null;
            if (key && seenCash.has(key)) continue;
            if (key) seenCash.add(key);
            const mapping = accountRules[row.account] || {};
            const sameNet = matched && Math.abs(Math.abs(row.amount) - Math.abs(matched.amount)) < 0.011;
            const ccy = row.ccy || mapping.ccy || (sameNet ? matched.ccy : '');
            const fx = ccy === 'EUR' ? 1 : mapping.fx > 0 ? mapping.fx :
                ccy === matched?.ccy && matched?.fx > 0 ? matched.fx : NaN;
            if (!ccy || !(fx > 0) || !Number.isFinite(row.amount) || !['ABONO', 'CARGO'].includes(row.direction)) {
                unresolved++;
                unresolvedRows.push({ ...row, ccy: row.ccy || '', reason: 'Falta divisa o cambio EUR confirmado' });
                continue;
            }
            const amount = Math.abs(row.amount) * fx * (row.direction === 'CARGO' ? -1 : 1);
            payments.push({ ...row, amount, localAmount: Math.abs(row.amount) * (row.direction === 'CARGO' ? -1 : 1), ccy, fx,
                grossEUR: sameNet && ccy === matched.ccy ? matched.gross * fx : NaN,
                sourceTaxEUR: sameNet && ccy === matched.ccy ? matched.sourceTax * fx : NaN,
                localTaxEUR: sameNet && ccy === matched.ccy ? matched.localTax * fx : NaN,
                conversion: mapping.fx > 0 || mapping.ccy ? 'Cuenta parametrizada' : sameNet ? 'Operación conciliada' : 'Divisa del efectivo',
                isin: row.isin || matched?.isin || '', name: matched?.name || row.name });
        }
        const seenTrades = new Set();
        let fromTrades = 0;
        for (const row of trades) {
            if (!row.kind || !row.confirmed || !withinYear(row) || booked.has(row.code) || seenTrades.has(row.code)) continue;
            if (row.code) seenTrades.add(row.code);
            const fx = row.ccy === 'EUR' ? 1 : row.fx;
            if (!row.ccy || !(fx > 0) || !Number.isFinite(row.amount)) {
                unresolved++;
                unresolvedRows.push({ ...row, ccy: row.ccy || '', reason: 'Falta divisa o cambio EUR confirmado' });
                continue;
            }
            payments.push({ ...row, amount: row.amount * fx, localAmount: row.amount, fx,
                grossEUR: row.gross * fx, sourceTaxEUR: row.sourceTax * fx, localTaxEUR: row.localTax * fx,
                conversion: 'Operación definitiva' });
            fromTrades++;
        }
        return { payments, unresolved, unresolvedRows, fromTrades };
    }

    const sum = (rows, value) => rows.reduce((total, row) => total + value(row), 0);
    const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2, useGrouping: 'always' });
    const decimal = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });
    const shortDate = date => date ? date.split('-').reverse().join('/') : '—';
    const money = value => Number.isFinite(value) ? eur.format(value + 0) : '—';
    const couponPct = value => Number.isFinite(value) ? value.toLocaleString('es-ES', { maximumFractionDigits: 3 }) + ' %' : '—';
    const num = value => Number.isFinite(value) ? decimal.format(value + 0) : '—';
    const pct = value => Number.isFinite(value) ? num(value) + ' %' : '—';
    const safe = value => String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
    const inputStyle = 'w-full mt-1 p-2 border border-slate-300 rounded text-sm bg-white';
    const buttonStyle = 'px-3 py-2 border border-slate-300 rounded text-sm font-semibold bg-white hover:bg-slate-100';
    const cardStyle = 'bg-white border border-slate-200 rounded-xl p-4 sm:p-5';
    const numField = (name, label, attributes = '') => `<label class="block text-sm font-semibold">${label}<input name="${name}" type="number" step="any" class="${inputStyle}" ${attributes}></label>`;
    const area = (name, label, hint) => `<label class="block text-sm font-semibold mt-3">${label}<span class="block text-xs text-slate-500 font-normal mt-1">${hint}</span><textarea name="${name}" rows="3" spellcheck="false" class="${inputStyle} font-mono"></textarea></label>`;
    const fields = ['cutoff', 'end', 'accountRows', 'value', 'rf', 'duration', 'ytm', 'goal', 'alternatives', 'shock', 'paymentRows', 'bondRows', 'assetRows', 'scenarioRows'];
    const summaryCard = (title, value) => `<div class="mandate-kpi"><div class="mandate-kpi-label">${title}</div><div class="mandate-kpi-value">${value}</div></div>`;
    const table = (headers, rows, style = '') => rows.length ? `<div class="overflow-x-auto"><table class="mandate-table ${style}"><thead><tr>${headers.map(h => `<th scope="col" class="px-3 py-2">${h}</th>`).join('')}</tr></thead><tbody class="divide-y divide-slate-100">${rows.map(row => `<tr>${row.map(cell => `<td class="px-3 py-2">${safe(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<p class="text-sm text-slate-500">Sin datos para mostrar.</p>';

    function parseRows(text, label, width, parse, errors) {
        return String(text ?? '').split(/\r?\n/).flatMap((line, index) => {
            if (!line.trim()) return [];
            const cells = line.split(line.includes('\t') ? '\t' : ';').map(cell => cell.trim());
            const row = cells.length === width ? parse(cells) : null;
            if (row) return [row];
            errors.push(`${label}, fila ${index + 1}`);
            return [];
        });
    }

    function bondTerms(name) {
        const match = name.match(/\s(\d{1,2}(?:[.,]\d+)?)\s*%?\s+(\d{2})(\d{2})(\d{2}|\d{4})\s*$/);
        if (!match) return {};
        const [, coupon, day, month, year] = match;
        const maturity = isoDate(`${year.length === 2 ? '20' + year : year}-${month}-${day}`);
        return maturity ? { coupon: numeric(coupon), maturity } : {};
    }

    function inMonth(date, delta, day = Number(date.slice(8))) {
        const month = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1 + delta, 1));
        const lastDay = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
        month.setUTCDate(Math.min(day, lastDay));
        return month.toISOString().slice(0, 10);
    }

    const dateGap = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;
    const seriesKey = (kind, isin, name) => (kind === 'Cupón' ? 'C' : 'D') + ':' + (isin || normalize(name));
    const scheduleSteps = [1, 2, 3, 4, 6, 12];
    const median = values => {
        const ordered = values.slice().sort((a, b) => a - b);
        return (ordered[Math.floor((ordered.length - 1) / 2)] + ordered[Math.floor(ordered.length / 2)]) / 2;
    };

    function projectPayments(history, trades, rules, cutoff, snapshot, end = cutoff.slice(0, 4) + '-12-31') {
        const instruments = new Map();
        function register(kind, isin, name) {
            const key = seriesKey(kind, isin, name);
            if (!instruments.has(key)) instruments.set(key, { key, kind, isin, name, history: [], trades: [] });
            return instruments.get(key);
        }
        for (const row of history.filter(row => row.amount > 0)) register(row.kind, row.isin, row.name).history.push(row);
        const holdings = new Map((snapshot?.assets || []).map(asset => [asset.key, asset]));
        for (const position of holdings.values()) {
            if (position.bond) register('Cupón', position.key, position.name);
        }
        const seen = new Set();
        for (const trade of trades) {
            if (!trade.confirmed || !trade.date || trade.date > cutoff || !trade.isin) continue;
            if (trade.code && seen.has(trade.code)) continue;
            if (trade.code) seen.add(trade.code);
            if (trade.kind === 'Cupón' || trade.bondMovement) {
                register('Cupón', trade.isin, trade.name).trades.push(trade);
            } else if (trade.disposal) {
                instruments.get(seriesKey('Dividendo', trade.isin, trade.name))?.trades.push(trade);
            }
        }
        for (const [key, rule] of Object.entries(rules)) {
            if (!rule.name || !['Cupón', 'Dividendo'].includes(rule.kind)) continue;
            const matches = rule.isin ? [] : [...instruments.values()].filter(instrument =>
                instrument.kind === rule.kind && normalize(instrument.name) === normalize(rule.name));
            const instrument = instruments.get(key) || (matches.length === 1 ? matches[0] : register(rule.kind, rule.isin, rule.name));
            instrument.ruleKey = key;
            instrument.rule = rule;
        }

        const calendar = [];
        const bonds = [];
        const assets = [];
        const year = cutoff.slice(0, 4);
        for (const instrument of instruments.values()) {
            const { key, kind, isin } = instrument;
            const rule = instrument.rule || {};
            const holding = holdings.get(isin);
            const name = rule.name || holding?.name || instrument.name;
            const isBond = kind === 'Cupón';
            const terms = isBond ? bondTerms(name) : {};
            const maturity = isoDate(rule.maturity) || terms.maturity || '';
            const coupon = rule.coupon === '' || rule.coupon == null ? terms.coupon : numeric(rule.coupon);
            const series = new Map();
            for (const row of instrument.history) series.set(row.date, (series.get(row.date) || 0) + row.amount);
            const observed = [...series].sort(([a], [b]) => a.localeCompare(b)).slice(-12);
            const observedDates = observed.map(([date]) => date);
            const amounts = observed.map(([, amount]) => amount);
            const last = observedDates.at(-1);
            const inferredStep = observedDates.length >= 2 ? scheduleSteps.find(step => observedDates.slice(1).every((date, i) =>
                dateGap(date, inMonth(observedDates[i], step)) <= (step <= 2 ? 6 : 12))) : undefined;

            let historicalNominal = NaN;
            let soldOrRedeemed = false;
            let changedAfterCoupon = false;
            let couponNominal = NaN;
            for (const trade of instrument.trades.sort((a, b) => a.date.localeCompare(b.date))) {
                if (trade.kind === 'Cupón' && trade.nominal > 0) {
                    couponNominal = historicalNominal = trade.nominal;
                    changedAfterCoupon = false;
                    soldOrRedeemed = false;
                } else if (trade.bondMovement && trade.nominal > 0) {
                    if (trade.bondMovement > 0) historicalNominal = (historicalNominal || 0) + trade.nominal;
                    else if (Number.isFinite(historicalNominal)) historicalNominal = Math.max(0, historicalNominal - trade.nominal);
                    changedAfterCoupon = true;
                    soldOrRedeemed = trade.bondMovement < 0 && (!Number.isFinite(historicalNominal) || historicalNominal === 0);
                } else if (trade.disposal && trade.date >= (last || '')) {
                    soldOrRedeemed = true;
                }
            }
            if (snapshot && holding?.bond) {
                historicalNominal = holding.units * holding.fx;
                changedAfterCoupon = Number.isFinite(couponNominal) && couponNominal !== holding.units * holding.fx;
                soldOrRedeemed = false;
                for (const trade of instrument.trades.filter(trade => trade.date > snapshot.date && trade.bondMovement)) {
                    if (trade.nominal > 0) historicalNominal = Math.max(0, historicalNominal + trade.nominal * trade.bondMovement);
                    else if (trade.bondMovement < 0) soldOrRedeemed = true;
                    changedAfterCoupon = true;
                }
            }
            if (holding && !isBond) soldOrRedeemed = instrument.trades.some(trade => trade.date > snapshot.date && trade.disposal);
            const nominal = rule.nominal === '' || rule.nominal == null ? historicalNominal : numeric(rule.nominal);
            const manualStep = scheduleSteps.includes(Number(rule.frequency)) ? Number(rule.frequency) : 0;
            const step = manualStep || inferredStep || (isBond && maturity ? 12 : 0);
            const next = isoDate(rule.next);
            const net = numeric(rule.net) >= 0 ? numeric(rule.net) : NaN;
            const average = amounts.length ? sum(amounts, amount => amount) / amounts.length : NaN;
            const contractual = isBond && nominal > 0 && coupon >= 0 && step ? nominal * coupon / 100 * step / 12 : NaN;
            const gross = !Number.isFinite(net) && isBond && (!Number.isFinite(average) || changedAfterCoupon || Number.isFinite(numeric(rule.nominal)) || Number.isFinite(numeric(rule.coupon)) || Boolean(manualStep));
            let amount = Number.isFinite(net) ? net : gross ? contractual : isBond ? amounts.at(-1) : average;
            const withholding = numeric(rule.withholding);
            const tax = gross && withholding >= 0 && withholding <= 100 ? amount * withholding / 100 : NaN;
            if (Number.isFinite(tax)) amount -= tax;
            const explicitHolding = isBond ? numeric(rule.nominal) > 0 : Boolean(next);
            const newAfterSnapshot = snapshot && instrument.trades.some(trade => trade.date > snapshot.date && trade.bondMovement > 0);
            const missingFromSnapshot = snapshot && isin && !holding && !newAfterSnapshot && !explicitHolding;
            const excluded = Boolean(rule.excluded) || missingFromSnapshot || (soldOrRedeemed && !explicitHolding) || (isBond && nominal === 0);
            const amountSource = Number.isFinite(net) ? 'Neto manual' : gross ? 'Bruto por nominal y cupón' : isBond ? 'Último cupón neto' : 'Media de dividendos netos';
            const repeatDay = isBond && maturity ? Number(maturity.slice(8)) : Math.round(median(observedDates.map(date => Number(date.slice(8)))));
            let schedule = [];
            if (cutoff && !excluded) {
                const anchor = next || (isBond && maturity && (!inferredStep || inferredStep === 12) ? maturity : last);
                const interval = next ? manualStep : step;
                if (anchor) {
                    if (!interval) schedule = [anchor];
                    else {
                        const months = (Number(cutoff.slice(0, 4)) - Number(anchor.slice(0, 4))) * 12 +
                            Number(cutoff.slice(5, 7)) - Number(anchor.slice(5, 7));
                        const first = Math.floor(months / interval) * interval;
                        for (let offset = first; offset <= first + 132; offset += interval) {
                            if (next && offset < 0) continue;
                            const date = inMonth(anchor, offset, next || isBond ? Number(anchor.slice(8)) : repeatDay);
                            if (date > end) break;
                            schedule.push(date);
                        }
                    }
                }
                schedule = [...new Set(schedule)].filter(date => date > cutoff && date <= end && (!maturity || date <= maturity) &&
                    !observedDates.some(booked => dateGap(date, booked) <= 10));
            }
            let review = '';
            if (!excluded) {
                if (!step && !next) review = 'Sin frecuencia suficiente';
                else if (schedule.length && !Number.isFinite(amount)) review = 'Falta importe o nominal';
                else if (next && !manualStep && next.startsWith(year) && next <= cutoff && !observedDates.some(booked => dateGap(next, booked) <= 10)) {
                    review = 'Pago anterior al corte sin abono identificado';
                }
            }
            const assumption = next ? 'Fecha manual' : manualStep ? 'Frecuencia manual' : inferredStep ? 'Frecuencia histórica' : 'Cupón anual supuesto';
            for (const date of schedule) {
                if (amount === 0) continue;
                calendar.push({ key, date, name, kind, isin, amount, gross: gross && !Number.isFinite(tax), withholding: tax, estimated: true,
                    origin: `${assumption} · ${amountSource}${Number.isFinite(tax) ? ' · retención ' + withholding + '%' : ''}`,
                    range: !isBond && !Number.isFinite(net) && amounts.length > 1 ? [Math.min(...amounts), Math.max(...amounts)] : null });
            }
            if (isBond && !excluded && cutoff && maturity > cutoff && nominal > 0) {
                bonds.push({ name, isin, maturity, nominal, coupon, ytm: numeric(rule.ytm), group: rule.group || '', inferred: true });
            }
            assets.push({ key: instrument.ruleKey || key, kind, isin, name, maturity, coupon, nominal, last, step, amount, review, excluded, rule });
        }
        return { calendar, bonds, assets };
    }

    function calculate(state, sources) {
        const errors = [];
        const dates = [...(sources.trades || []), ...(sources.cash || [])].map(row => row.date).filter(Boolean);
        const snapshot = sources.positions;
        const snapshotTotal = snapshot ? sum(snapshot.assets, asset => asset.marketValue) : NaN;
        const cutoff = isoDate(state.cutoff) || [...dates, snapshot?.date].filter(Boolean).sort().at(-1) || '';
        const year = cutoff.slice(0, 4);
        const end = isoDate(state.end) || year + '-12-31';
        const validHorizon = Boolean(cutoff && end >= cutoff && end <= inMonth(cutoff, 120));
        if (cutoff && !validHorizon) errors.push('Fecha final: debe estar entre el corte y diez años después');
        const accountRules = Object.fromEntries(parseRows(state.accountRows, 'Cuentas', 3, ([account, ccy, fx]) => {
            const rate = currency(ccy) === 'EUR' ? 1 : numeric(fx);
            if (!account || !/^[A-Z]{3}$/.test(currency(ccy)) || !(rate > 0)) return null;
            return [account, { ccy: currency(ccy), fx: rate }];
        }, errors));
        const actual = received(sources, cutoff, false, accountRules);
        const activeSnapshot = snapshot?.date <= cutoff ? snapshot : null;
        const hasYearData = dates.some(date => date.startsWith(year));
        const coupons = sum(actual.payments.filter(row => row.kind === 'Cupón'), row => row.amount);
        const dividends = sum(actual.payments.filter(row => row.kind === 'Dividendo'), row => row.amount);

        const paymentRows = parseRows(state.paymentRows, 'Pagos', 5, ([date, name, type, isin, net]) => {
            const kind = normalize(type) === 'CUPON' ? 'Cupón' : normalize(type) === 'DIVIDENDO' ? 'Dividendo' : '';
            const amount = numeric(net);
            if (!isoDate(date) || !name || !kind || (net && !(amount >= 0)) || (!net && (kind !== 'Dividendo' || !isin))) return null;
            return { date: isoDate(date), name, kind, isin: isin.toUpperCase(), amount };
        }, errors);
        const enteredBonds = parseRows(state.bondRows, 'Bonos', 6, ([name, maturity, nominal, coupon, ytm, group]) => {
            if (!name || !isoDate(maturity) || !(numeric(nominal) > 0) || !(numeric(coupon) >= 0)
                || (ytm && !Number.isFinite(numeric(ytm)))) return null;
            return { name, maturity: isoDate(maturity), nominal: numeric(nominal), coupon: numeric(coupon), ytm: numeric(ytm), group };
        }, errors).filter(bond => cutoff && bond.maturity > cutoff).sort((a, b) => a.maturity.localeCompare(b.maturity));

        const matchesPayment = row => actual.payments.some(payment => payment.kind === row.kind && payment.date === row.date &&
            (row.isin ? payment.isin === row.isin : normalize(payment.name) === normalize(row.name)));
        const overdue = paymentRows.filter(row => row.date.startsWith(year) && row.date <= cutoff && !matchesPayment(row));
        const manualCalendar = paymentRows.flatMap(row => {
            if (!cutoff || row.date <= cutoff || row.date > end) return [];
            const history = actual.payments.filter(p => p.isin === row.isin && p.kind === row.kind && p.amount > 0);
            const estimated = !Number.isFinite(row.amount);
            const amount = estimated ? (history.length ? sum(history, p => p.amount) / history.length : NaN) : row.amount;
            return [{ ...row, estimated, amount,
                range: estimated && history.length ? [Math.min(...history.map(p => p.amount)), Math.max(...history.map(p => p.amount))] : null }];
        }).sort((a, b) => a.date.localeCompare(b.date));
        const historyStart = cutoff ? inMonth(cutoff, -18) : '';
        const history = received(sources, cutoff, true, accountRules).payments.filter(row => row.date >= historyStart);
        const projection = projectPayments(history, sources.trades || [], state.rules || {}, cutoff, activeSnapshot, validHorizon ? end : cutoff);
        const overrides = (a, b) => a.kind === b.kind && dateGap(a.date, b.date) <= 10 &&
            (a.isin && b.isin ? a.isin === b.isin : normalize(a.name) === normalize(b.name));
        const calendar = [...manualCalendar, ...projection.calendar.filter(auto => !manualCalendar.some(manual => overrides(manual, auto)))]
            .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
        const bonds = [...enteredBonds, ...projection.bonds.filter(auto => !enteredBonds.some(manual =>
            normalize(auto.name) === normalize(manual.name) && auto.maturity === manual.maturity))]
            .sort((a, b) => a.maturity.localeCompare(b.maturity));
        const pendingCoupons = sum(calendar.filter(r => r.kind === 'Cupón' && Number.isFinite(r.amount)), r => r.amount);
        const pendingDividends = sum(calendar.filter(r => r.kind === 'Dividendo' && Number.isFinite(r.amount)), r => r.amount);
        const base = validHorizon ? coupons + dividends + pendingCoupons + pendingDividends : NaN;
        const value = numeric(state.value) > 0 ? numeric(state.value) : activeSnapshot ? snapshotTotal : NaN;
        const rf = numeric(state.rf) / 100;
        const duration = numeric(state.duration);
        const ytm = numeric(state.ytm);
        const goal = numeric(state.goal);
        const shock = numeric(state.shock);
        const rfValue = value > 0 && rf >= 0 && rf <= 1 ? value * rf : NaN;
        const rateScenario = bp => Number.isFinite(rfValue) && duration >= 0 && duration <= 100 && Number.isFinite(bp)
            ? rateSensitivity.scenario({ amount: value, rfWeightPct: rf * 100, duration, changeBps: bp })
            : null;
        const sensitivity = [-200, -100, -50, -25, 0, 25, 50, 100, 200].map(bp => {
            const result = rateScenario(bp);
            const change = result?.change ?? NaN;
            return { bp, change, rfPct: (result?.rfReturn ?? NaN) * 100, portfolioPct: (result?.portfolioReturn ?? NaN) * 100,
                value: result?.portfolioValue ?? NaN, coverage: cutoff && goal > 0 ? (base + change) / goal * 100 : NaN };
        });

        const assets = parseRows(state.assetRows, 'Activos', 8, ([key, name, units, price, ccy, fx, cost, sale]) => {
            const asset = { key: key.toUpperCase(), name, units: numeric(units), price: numeric(price), ccy: currency(ccy),
                fx: currency(ccy) === 'EUR' && !fx ? 1 : numeric(fx), cost: numeric(cost), sale: numeric(sale) / 100 };
            if (!asset.key || !name || !/^[A-Z]{3}$/.test(asset.ccy) || !(asset.units > 0) || !(asset.price > 0) ||
                !(asset.fx > 0) || !(asset.cost >= 0) || !(asset.sale >= 0 && asset.sale <= 1)) return null;
            return asset;
        }, errors);
        const changed = new Set((sources.trades || []).filter(trade => trade.confirmed && trade.positionMovement &&
            activeSnapshot && trade.date > activeSnapshot.date && trade.date <= cutoff).map(trade => trade.isin));
        const prices = new Map();
        for (const asset of activeSnapshot?.assets || []) {
            if (!(asset.cost >= 0) || changed.has(asset.key)) continue;
            const sale = numeric(state.sales?.[asset.key]) / 100;
            prices.set(asset.key, { ...asset, sale: sale >= 0 && sale <= 1 ? sale : 0 });
        }
        const manualKeys = new Set();
        for (const asset of assets) {
            if (manualKeys.has(asset.key)) errors.push('Código de activo duplicado: ' + asset.key);
            else prices.set(asset.key, { ...asset, marketValue: asset.units * asset.price * asset.fx });
            manualKeys.add(asset.key);
        }
        for (const asset of prices.values()) {
            const assumption = state.saleAssumptions?.[asset.key] || {};
            const costEUR = numeric(assumption.costEUR);
            if (costEUR >= 0) asset.cost = costEUR;
            asset.costEstimated = asset.imported && asset.ccy !== 'EUR' && !(costEUR >= 0);
            asset.costOverride = assumption.costEUR || '';
            asset.returnPct = numeric(assumption.returnPct);
            asset.fxPct = numeric(assumption.fxPct);
            asset.saleDate = isoDate(assumption.date) || end;
            asset.inHorizon = validHorizon && asset.saleDate >= cutoff && asset.saleDate <= end;
            const growth = Number.isFinite(asset.returnPct) ? asset.returnPct : 0;
            const fxGrowth = Number.isFinite(asset.fxPct) ? asset.fxPct : 0;
            if (growth < -100 || fxGrowth <= -100) errors.push('Hipótesis de precio o divisa inválida en ' + asset.name);
            asset.projectedValue = growth >= -100 && fxGrowth > -100
                ? asset.marketValue * (1 + growth / 100) * (1 + fxGrowth / 100) : NaN;
            asset.projectedGain = asset.projectedValue - asset.cost;
            asset.plannedSale = asset.inHorizon ? asset.sale : 0;
        }
        const gain = (asset, change = 0) => asset.marketValue * (1 + change) - asset.cost;
        const possible = sum([...prices.values()], asset => Math.max(0, gain(asset)));
        const selected = sum([...prices.values()], asset => gain(asset) * asset.sale);
        const projectedSelected = sum([...prices.values()], asset => asset.projectedGain * asset.plannedSale);
        const projectedProceeds = sum([...prices.values()], asset => asset.projectedValue * asset.plannedSale);
        const proceeds = sum([...prices.values()], asset => asset.marketValue * asset.sale);
        const scenarioInputs = parseRows(state.scenarioRows, 'Escenarios', 3, ([name, key, change]) => {
            if (!name || !prices.has(key.toUpperCase()) || !(numeric(change) >= -100)) return null;
            return { name, key: key.toUpperCase(), change: numeric(change) / 100 };
        }, errors);
        const grouped = new Map();
        for (const row of scenarioInputs) {
            if (!grouped.has(row.name)) grouped.set(row.name, new Map());
            const scenario = grouped.get(row.name);
            if (scenario.has(row.key)) errors.push(`Escenario ${row.name}: cambio duplicado para ${row.key}`);
            else scenario.set(row.key, row.change);
        }
        const scenarios = [...grouped].map(([name, shifts]) => {
            const realized = sum([...prices.values()], asset => gain(asset, shifts.get(asset.key)) * asset.sale);
            const retained = sum([...prices.values()], asset => asset.marketValue * (shifts.get(asset.key) || 0) * (1 - asset.sale));
            return { name, realized, retained, details: [...shifts].map(([key, change]) => {
                const asset = prices.get(key);
                return { name: asset.name, ccy: asset.ccy || 'divisa local', change, price: asset.price * (1 + change), gain: gain(asset, change) };
            }) };
        });
        return { cutoff, end, validHorizon, actual, paymentAssets: projection.assets, hasYearData, errors, coupons, dividends, calendar, overdue, pendingCoupons, pendingDividends, base, bonds, snapshot, snapshotTotal, activeSnapshot, changed, proceeds, projectedSelected, projectedProceeds,
            value, rf, rfValue, duration, ytm, goal, shockImpact: rateScenario(shock)?.change ?? NaN, sensitivity, possible, selected, assets: [...prices.values()].map(asset => ({ ...asset,
                gain: gain(asset) })).sort((a, b) => b.gain - a.gain), scenarios };
    }

    const ruleFields = ['name', 'isin', 'kind', 'next', 'frequency', 'net', 'nominal', 'coupon', 'maturity', 'ytm', 'group', 'withholding', 'excluded'];

    function paymentsEditor(root, onSave, onReset) {
        root.innerHTML = `
            <div class="mandate-editor-header"><div><h4>Calendario por activo</h4>
            <p>Ajusta las estimaciones en cada ficha. Para un bono nuevo, introduce su nombre de mercado y el nominal en euros.</p></div>
            <button class="${buttonStyle}" type="button" data-new>+ Añadir activo</button></div>
            <form class="mandate-rule-form hidden rounded-lg bg-slate-50 p-4 mt-3">
                <h5 class="font-bold mb-3" data-rule-title></h5>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <label class="text-sm font-semibold">Producto<input name="name" required class="${inputStyle}"></label>
                    <label class="text-sm font-semibold">ISIN<input name="isin" class="${inputStyle}"></label>
                    <label class="text-sm font-semibold">Tipo<select name="kind" class="${inputStyle}"><option>Cupón</option><option>Dividendo</option></select></label>
                    <label class="text-sm font-semibold">Próximo pago<input name="next" type="date" class="${inputStyle}"></label>
                    <label class="text-sm font-semibold">Frecuencia<select name="frequency" class="${inputStyle}"><option value="">Automática / pago único</option>
                        ${scheduleSteps.map(months => `<option value="${months}">Cada ${months} ${months === 1 ? 'mes' : 'meses'}</option>`).join('')}</select></label>
                    ${numField('net', 'Importe neto por pago (€)', 'min="0"')}
                    ${numField('withholding', 'Retención prevista sobre cupón bruto (%)', 'min="0" max="100"')}
                    ${numField('nominal', 'Nominal vigente (€)', 'min="0" data-bond-field')}
                    ${numField('coupon', 'Cupón anual (%)', 'min="0" data-bond-field')}
                    <label class="text-sm font-semibold">Vencimiento<input name="maturity" type="date" class="${inputStyle}" data-bond-field></label>
                    ${numField('ytm', 'TIR indicativa (%)', 'data-bond-field')}
                    <label class="text-sm font-semibold">Grupo de curva<input name="group" class="${inputStyle}" data-bond-field></label>
                    <label class="flex items-center gap-2 text-sm"><input name="excluded" type="checkbox"> Excluir de las previsiones</label>
                </div>
                <div class="flex flex-wrap gap-2 mt-3">
                    <button class="${buttonStyle}" type="submit">Guardar ficha</button>
                    <button class="${buttonStyle}" type="button" data-cancel>Cancelar</button>
                    <button class="${buttonStyle}" type="button" data-remove>Restaurar automático</button>
                </div>
                <p class="mt-2 text-xs text-slate-600">Los campos vacíos toman el dato disponible en el extracto o en el nombre. El neto manual y la media de cobros ya incorporan las deducciones cobradas. La retención prevista se aplica únicamente a cupones calculados en bruto; queda fuera el impuesto final del cliente.</p>
                <p data-rule-error role="status" class="text-sm text-red-700 mt-2"></p>
            </form>
            <div data-catalog class="mt-3"></div>`;
        const form = root.querySelector('form');
        const field = name => form.elements.namedItem(name);
        const error = form.querySelector('[data-rule-error]');
        let current;
        let assets = [];
        const bondFields = () => form.querySelectorAll('[data-bond-field]').forEach(el => {
            el.closest('label').hidden = field('kind').value !== 'Cupón';
        });
        const open = asset => {
            form.reset();
            current = asset || null;
            const rule = asset?.rule || {};
            for (const name of ruleFields) {
                if (name === 'excluded') field(name).checked = Boolean(rule[name]);
                else field(name).value = rule[name] ?? (['name', 'isin', 'kind'].includes(name) ? asset?.[name] || field(name).value : '');
            }
            field('isin').readOnly = field('kind').disabled = Boolean(asset);
            for (const name of ['nominal', 'coupon', 'net']) {
                field(name).placeholder = Number.isFinite(asset?.[name === 'net' ? 'amount' : name]) ? num(asset[name === 'net' ? 'amount' : name]) : 'Automático';
            }
            bondFields();
            error.textContent = '';
            form.querySelector('[data-rule-title]').textContent = asset ? 'Ajustar pago y posición' : 'Añadir activo al calendario';
            form.querySelector('[data-remove]').hidden = !Object.keys(rule).length;
            form.classList.remove('hidden');
            field('name').focus();
        };
        root.querySelector('[data-new]').addEventListener('click', () => open(null));
        field('kind').addEventListener('change', bondFields);
        form.querySelector('[data-cancel]').addEventListener('click', () => form.classList.add('hidden'));
        form.querySelector('[data-remove]').addEventListener('click', () => {
            onReset(current.key);
            form.classList.add('hidden');
        });
        form.addEventListener('submit', event => {
            event.preventDefault();
            const rule = Object.fromEntries(ruleFields.map(name => [name, name === 'excluded' ? field(name).checked : field(name).value.trim()]));
            rule.isin = rule.isin.toUpperCase();
            const key = current?.key || seriesKey(rule.kind, rule.isin, rule.name);
            if (!rule.name || (rule.isin && !/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(rule.isin))) {
                error.textContent = 'Introduce el producto y, si lo conoces, un ISIN válido.';
                return;
            }
            if (!current && assets.some(asset => asset.key === key || (asset.kind === rule.kind &&
                (rule.isin ? asset.isin === rule.isin : normalize(asset.name) === normalize(rule.name))))) {
                error.textContent = 'Este activo ya tiene ficha. Edítalo en la tabla.';
                return;
            }
            onSave(key, rule);
            form.classList.add('hidden');
        });
        const catalog = root.querySelector('[data-catalog]');
        catalog.addEventListener('click', event => {
            const button = event.target.closest('[data-edit-rule]');
            if (button) open(assets[Number(button.dataset.editRule)]);
        });
        return {
            clear: () => form.classList.add('hidden'),
            update: rows => {
                assets = rows;
                catalog.innerHTML = rows.length ? `<div class="overflow-x-auto"><table class="mandate-table"><thead><tr>
                    <th>Producto</th><th>Tipo</th><th>Último cobro</th><th>Nominal</th><th>Estado</th><th>Ficha</th></tr></thead><tbody>
                    ${rows.map((row, index) => `<tr><td><strong>${safe(row.name)}</strong><small>${safe(row.isin)}</small></td><td>${row.kind}</td>
                    <td>${shortDate(row.last)}</td><td>${money(row.nominal)}</td><td>${row.excluded ? 'Excluido' : row.review || (Object.keys(row.rule).length ? 'Ajustado' : 'Automático')}</td>
                    <td><button type="button" class="${buttonStyle}" data-edit-rule="${index}" aria-label="Editar ${safe(row.name)}">Editar</button></td></tr>`).join('')}
                    </tbody></table></div>` : '<p class="text-sm text-slate-600">Al cargar el extracto aparecerán aquí los activos identificados.</p>';
            }
        };
    }

    function editableGrid(root, storage, columns, update) {
        const values = () => [...root.querySelectorAll('tbody tr')].map(row => [...row.querySelectorAll('input')].map(input => input.value));
        const write = () => {
            storage.value = values().filter(row => row.some(value => value.trim())).map(row => row.join('\t')).join('\n');
            update();
        };
        const row = cells => `<tr>${columns.map((label, i) =>
            `<td><input aria-label="${safe(label)}" ${i === 1 ? 'data-wide' : ''} value="${safe(cells[i])}"></td>`).join('')}
            <td><button class="${buttonStyle}" type="button" data-delete-row aria-label="Quitar fila">Quitar</button></td></tr>`;
        root.innerHTML = `<div class="overflow-x-auto"><table class="mandate-table"><thead><tr>
            ${columns.map(label => `<th scope="col">${safe(label)}</th>`).join('')}<th scope="col">Acción</th></tr></thead><tbody></tbody></table></div>
            <button class="${buttonStyle} mt-2" type="button" data-add-row>+ Añadir fila</button>`;
        const body = root.querySelector('tbody');
        root.addEventListener('input', event => {
            event.stopPropagation();
            write();
        });
        root.addEventListener('click', event => {
            if (event.target.closest('[data-add-row]')) {
                body.insertAdjacentHTML('beforeend', row([]));
                body.lastElementChild.querySelector('input').focus();
            }
            if (event.target.closest('[data-delete-row]')) {
                event.target.closest('tr').remove();
                write();
            }
        });
        return () => { body.innerHTML = storage.value.split(/\r?\n/).filter(Boolean).map(line => row(line.split(line.includes('\t') ? '\t' : ';'))).join(''); };
    }

    function mount(root, rateInputs) {
        root.classList.add('space-y-4', 'mandate-report');
        root.innerHTML = `
            <section class="${cardStyle}">
                <h3 tabindex="-1" class="mandate-title">Ingresos, vencimientos y plusvalías</h3>
                <div class="mt-4 flex flex-wrap items-end gap-3">
                    <label class="block text-sm font-semibold">Extractos YTD y posición (.xlsx o .xls)<input data-extract type="file" multiple accept=".xlsx,.xls" class="${inputStyle}"></label>

                    <button type="button" data-save class="${buttonStyle}">Guardar supuestos</button>
                    <label class="${buttonStyle} cursor-pointer">Cargar supuestos<input data-load type="file" accept=".json" class="sr-only"></label>
                    <button type="button" data-reset class="${buttonStyle}">Limpiar cartera</button>
                </div>
                <p data-import role="status" class="mt-2 text-sm text-slate-600">Carga Operaciones, Movimientos de efectivo y Posición de cartera juntos o por separado. Cada archivo sustituye al anterior del mismo tipo.</p>
                <form novalidate>
                    <div class="grid sm:grid-cols-2 xl:grid-cols-4 gap-3 mt-4">
                        <label class="block text-sm font-semibold">Fecha de corte<input name="cutoff" type="date" class="${inputStyle}"></label>
                        <label class="block text-sm font-semibold">Fecha final de proyección<input name="end" type="date" class="${inputStyle}"></label>
                        ${numField('value', 'Valor de cartera (€)', 'min="0"')}
                        ${numField('rf', 'Peso renta fija (%)', 'min="0" max="100"')}
                        ${numField('duration', 'Duración modificada RF (años)', 'min="0" max="100"')}
                        ${numField('ytm', 'TIR ponderada RF (%)')}
                        ${numField('goal', 'Objetivo anual (€)', 'min="0"')}
                        ${numField('shock', 'Cambio de tipos de referencia (pb)')}
                        <label class="block text-sm font-semibold">Otros objetivos (€)<input name="alternatives" class="${inputStyle}" placeholder="100000; 150000"></label>
                    </div>
                    <p class="mt-2 text-xs text-slate-600">La fecha de corte toma la más reciente de los extractos. La proyección parte de los cobros del año del corte y añade los pagos hasta la fecha final, que comienza en el 31 de diciembre. Los campos de sensibilidad vacíos siguen al simulador. Si falta el valor de cartera, se usa el contravalor total de la posición vigente.</p>
                    <details class="mt-4 border-t border-slate-200 pt-3">
                        <summary class="font-semibold cursor-pointer">Carga masiva de pagos, bonos y escenarios</summary>
                        <p class="mt-2 text-sm text-slate-600">Pega filas de Excel sin encabezados o escribe una fila por línea, separando las columnas con punto y coma. Fechas AAAA-MM-DD o DD/MM/AAAA. Importes sin separadores de miles.</p>
                        ${area('paymentRows', 'Pagos pendientes', 'Fecha · producto · cupón/dividendo · ISIN · neto EUR. Para estimar un dividendo por la media de los abonos del mismo ISIN, deja vacía la última columna.')}
                        ${area('bondRows', 'Bonos en cartera', 'Producto · vencimiento · nominal EUR · cupón % · TIR % · grupo de curva. La TIR y el grupo pueden quedar vacíos. Usa un grupo común solo para emisiones comparables.')}
                        ${area('assetRows', 'Posiciones y ventas simuladas', 'Código/ISIN · activo · unidades · precio local · divisa · EUR por unidad de divisa · coste total EUR · % a vender. En EUR puedes dejar vacío el cambio.')}
                        ${area('scenarioRows', 'Escenarios de revalorización', 'Escenario · código/ISIN · variación %. Repite el nombre del escenario para cambiar varios activos a la vez. Usa 0 para mantener su precio.')}
                    </details>
                    <details class="mt-4 border-t border-slate-200 pt-3">
                        <summary class="font-semibold cursor-pointer">Posiciones, ventas y revalorizaciones</summary>
                        <p class="mt-2 mb-3 text-sm text-slate-600">Introduce las posiciones que quieres simular. Para cada escenario, usa el mismo código del activo. En EUR el cambio puede quedar vacío.</p>
                        <h4 class="mb-2">Posiciones y ventas</h4><div data-positions-grid></div>
                        <h4 class="mt-4 mb-2">Escenarios de precio</h4><div data-scenarios-grid></div>
                    </details>
                    <details class="mt-4"><summary class="font-semibold cursor-pointer">Cuentas multidivisa y conversión de cobros</summary>
                        ${area('accountRows', 'Divisa y cambio por cuenta', 'Cuenta · divisa · EUR por unidad de divisa. Usa el código de cuenta del detalle de cobros. Para USD con 1 USD = 0,86 EUR, introduce 0,86. Este cambio manual sustituye el de las operaciones de esa cuenta.')}
                        <p class="text-xs text-slate-600 mt-2">El neto del efectivo ya incorpora las deducciones del abono. Las retenciones de origen y locales se muestran como información cuando constan en Operaciones. La fiscalidad final depende del cliente y queda fuera del cálculo.</p>
                    </details>
                    <p data-errors role="status"  class="mt-3 text-sm text-red-700"></p>
                </form>
            </section>
            <div data-dashboard class="space-y-4"></div><details data-payment-details open class="${cardStyle}"><summary class="font-bold cursor-pointer">Ajustes de pagos y bonos por activo</summary><div data-payment-editor class="mt-3"></div></details>`;

        const form = root.querySelector('form');
        const input = name => form.elements.namedItem(name);
        const dashboard = root.querySelector('[data-dashboard]');
        const status = root.querySelector('[data-import]');
        let sources = {};
        let rules = Object.create(null);
        let sales = Object.create(null);
        let saleAssumptions = Object.create(null);
        let model;
        let revision = 0;
        let automaticEnd = true;
        const editor = paymentsEditor(root.querySelector('[data-payment-editor]'), (key, rule) => {
            rules[key] = rule;
            render();
        }, key => {
            delete rules[key];
            render();
        });
        const readState = () => Object.fromEntries(fields.map(name => [name, input(name).value]));
        const render = () => {
            const state = readState();
            if (automaticEnd) state.end = '';
            const linked = rateInputs();
            for (const [name, value] of Object.entries(linked)) {
                input(name).placeholder = value || 'Sin dato';
                if (!state[name]) state[name] = value;
            }
            model = calculate({ ...state, rules, sales, saleAssumptions }, sources);
            if (automaticEnd && model.cutoff) input('end').value = model.end;
            editor.update(model.paymentAssets);
            root.querySelector('[data-errors]').textContent = model.errors.length ? 'Revisa estas filas: ' + model.errors.join(' · ') : '';
            renderDashboard(dashboard, model, input('alternatives').value, Object.keys(sources).length > 0);
        };

        const refreshPositions = editableGrid(root.querySelector('[data-positions-grid]'), input('assetRows'),
            ['Código / ISIN', 'Activo', 'Unidades', 'Precio local', 'Divisa', 'EUR / divisa', 'Coste total €', 'Venta %'], render);
        const refreshScenarios = editableGrid(root.querySelector('[data-scenarios-grid]'), input('scenarioRows'),
            ['Escenario', 'Código / ISIN', 'Variación %'], render);
        const syncEditors = () => { refreshPositions(); refreshScenarios(); };
        input('assetRows').addEventListener('input', refreshPositions);
        input('scenarioRows').addEventListener('input', refreshScenarios);

        dashboard.addEventListener('change', event => {
            const hypothesis = event.target.closest('[data-sale-assumption]');
            if (hypothesis) {
                if (!hypothesis.checkValidity()) { hypothesis.reportValidity(); return; }
                const key = hypothesis.dataset.assetKey;
                saleAssumptions[key] = { ...saleAssumptions[key], [hypothesis.dataset.saleAssumption]: hypothesis.value };
                render();
                return;
            }
            const field = event.target.closest('[data-sale]');
            if (!field) return;
            const value = numeric(field.value);
            if (value >= 0 && value <= 100) sales[field.dataset.sale] = field.value;
            else if (!field.value) delete sales[field.dataset.sale];
            else {
                field.reportValidity();
                return;
            }
            render();
        });

        dashboard.addEventListener('click', event => {
            if (event.target.closest('[data-select-gains]')) {
                for (const asset of model.assets.filter(asset => asset.imported)) sales[asset.key] = asset.gain > 0 ? '100' : '0';
                render();
                return;
            }
            if (event.target.closest('[data-clear-sales]')) {
                sales = Object.create(null);
                render();
                return;
            }
            if (!event.target.closest('[data-jump-payments]')) return;
            const details = root.querySelector('[data-payment-details]');
            details.open = true;
            details.scrollIntoView({ block: 'start' });
            details.querySelector('summary').focus({ preventScroll: true });
        });
        const rates = root.parentElement;
        if (rates) {
            rates.addEventListener('input', event => {
                if (event.target.closest('.workspace-settings,[data-rate-position]')) render();
            });
            rates.addEventListener('change', event => {
                if (event.target.id === 'initialRateMode') render();
            });
            rates.addEventListener('click', event => {
                if (event.target.closest('#initialRateImport')) render();
            });
        }
        form.addEventListener('submit', event => event.preventDefault());
        form.addEventListener('input', event => {
            if (event.target === input('end')) automaticEnd = !event.target.value;
            render();
        });
        root.querySelector('[data-extract]').addEventListener('change', async event => {
            const files = [...event.target.files];
            event.target.value = '';
            if (!files.length) return;
            const current = ++revision;
            status.textContent = 'Importando extractos...';
            try {
                if (!window.XLSX) throw new Error('La biblioteca XLSX aún no está disponible.');
                const replacement = {};
                for (const file of files) {
                    const workbook = window.XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
                    const parsed = readWorkbook(workbook, window.XLSX);
                    if (Object.keys(parsed).some(type => replacement[type])) {
                        throw new Error('La selección contiene dos extractos del mismo tipo. Elige la versión vigente.');
                    }
                    Object.assign(replacement, parsed);
                }
                if (current !== revision) return;
                sources = { ...sources, ...replacement };
                status.textContent = `Operaciones: ${sources.trades?.length ?? 'sin cargar'} · Movimientos de efectivo: ${sources.cash?.length ?? 'sin cargar'} · Posición: ${sources.positions
                    ? shortDate(sources.positions.date) + ' (' + sources.positions.assets.length + ' ISIN)' : 'sin cargar'}`;
                render();
            } catch (error) {
                if (current === revision) status.textContent = 'No se pudo importar. ' + error.message;
            }
        });

        root.querySelector('[data-save]').addEventListener('click', () => {
            const blob = new Blob([JSON.stringify({ version: 4, inputs: readState(), rules, sales, saleAssumptions }, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = Object.assign(document.createElement('a'), { href: url, download: 'supuestos-cartera.json' });
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        });

        root.querySelector('[data-load]').addEventListener('change', async event => {
            const file = event.target.files[0];
            event.target.value = '';
            if (!file) return;
            const current = ++revision;
            try {
                const data = JSON.parse(await file.text());
                if (current !== revision) return;
                if (![1, 2, 3, 4].includes(data.version) || !data.inputs || fields.filter(name => !['end', 'accountRows'].includes(name)).some(name => typeof data.inputs[name] !== 'string')) {
                    throw new Error('Elige un archivo de supuestos guardado desde el panel.');
                }
                sales = Object.create(null);
                for (const [key, value] of Object.entries(data.sales || {})) {
                    const percent = numeric(value);
                    if (/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(key) && percent >= 0 && percent <= 100) sales[key] = String(percent);
                }
                saleAssumptions = Object.create(null);
                for (const [key, row] of Object.entries(data.saleAssumptions || {})) {
                    if (row && typeof row === 'object') saleAssumptions[key] = Object.fromEntries(
                        ['returnPct', 'fxPct', 'date', 'costEUR'].map(field => [field, typeof row[field] === 'string' ? row[field] : '']));
                }
                const hadSources = Object.keys(sources).length > 0;
                sources = {};
                rules = Object.create(null);
                for (const [key, rule] of Object.entries(data.rules || {})) {
                    if (rule && typeof rule.name === 'string' && ['Cupón', 'Dividendo'].includes(rule.kind)) {
                        rules[key] = Object.fromEntries(ruleFields.map(name => [name, name === 'excluded'
                            ? rule[name] === true : typeof rule[name] === 'string' ? rule[name] : '']));
                    }
                }
                editor.clear();
                automaticEnd = !data.inputs.end;
                for (const name of fields) input(name).value = data.inputs[name] || '';
                syncEditors();
                status.textContent = hadSources ? 'Supuestos cargados. Vuelve a cargar los extractos de esta cartera.' : 'Supuestos cargados. Carga los extractos de esta cartera.';
                render();
            } catch (error) {
                if (current === revision) status.textContent = error.message;
            }
        });

        root.querySelector('[data-reset]').addEventListener('click', () => {
            revision++;
            sources = {};
            form.reset();
            automaticEnd = true;
            sales = Object.create(null);
            saleAssumptions = Object.create(null);
            rules = Object.create(null);
            editor.clear();
            syncEditors();
            status.textContent = 'Panel limpio. Carga los extractos de la cartera.';
            render();
        });
        render();
    }

    function salesTable(assets, open, end) {
        const positions = assets.filter(asset => asset.imported);
        if (!positions.length) return '';
        const rows = positions.map(asset => `<tr>
            <td><strong>${safe(asset.name)}</strong><small>${safe(asset.key)}${asset.ccy ? ' · ' + safe(asset.ccy) : ''}</small></td>
            <td>${money(asset.marketValue)}<small>${asset.imported ? num(asset.localValue) + ' ' + safe(asset.ccy || 'divisa local') : ''}</small></td>
            <td>${money(asset.cost)}<small>${asset.costEstimated ? 'Estimado al cambio actual' : 'Base en EUR'}</small>
            <input data-sale-assumption="costEUR" data-asset-key="${safe(asset.key)}" type="number" min="0" step="0.01" value="${safe(asset.costOverride)}" placeholder="Coste histórico EUR" aria-label="Coste histórico EUR de ${safe(asset.name)}"></td>
            <td class="${asset.gain < 0 ? 'text-red-700' : 'text-emerald-800'}">${money(asset.gain)}</td>
            <td><input data-sale="${safe(asset.key)}" class="mandate-sale-input" type="number" step="0.01" min="0" max="100"
                value="${+(asset.sale * 100).toFixed(2)}" aria-label="% a vender de ${safe(asset.name)}"></td>
            <td>${money(asset.gain * asset.sale)}</td>
            <td><input data-sale-assumption="returnPct" data-asset-key="${safe(asset.key)}" type="number" min="-100" step="0.1" value="${Number.isFinite(asset.returnPct) ? asset.returnPct : ''}" placeholder="0" aria-label="Revalorización % de ${safe(asset.name)}"></td>
            <td><input data-sale-assumption="fxPct" data-asset-key="${safe(asset.key)}" type="number" min="-99.99" step="0.1" value="${Number.isFinite(asset.fxPct) ? asset.fxPct : ''}" placeholder="0" aria-label="Variación cambio % de ${safe(asset.name)}"></td>
            <td><input data-sale-assumption="date" data-asset-key="${safe(asset.key)}" type="date" value="${safe(asset.saleDate || end)}" aria-label="Fecha de venta de ${safe(asset.name)}"></td>
            <td>${money(asset.projectedGain * asset.plannedSale)}${asset.sale && !asset.inHorizon ? '<small>Fecha fuera de la proyección</small>' : ''}</td></tr>`).join('');
        return `<details data-sales-details class="mt-4" ${open ? 'open' : ''}>
            <summary class="cursor-pointer font-semibold">Posiciones importadas y porcentaje de venta</summary>
            <div class="flex flex-wrap gap-2 mt-3 mb-3">
                <button type="button" data-select-gains class="${buttonStyle}">Simular venta de posiciones con plusvalía</button>
                <button type="button" data-clear-sales class="${buttonStyle}">Quitar ventas de la posición</button>
            </div>
            <div class="overflow-x-auto"><table class="mandate-table mandate-sales-table"><thead><tr>
                <th>Producto</th><th>Mercado EUR</th><th>Coste EUR</th><th>Plusvalía latente</th>
                <th>% a vender</th><th>Resultado a precio actual</th><th>Revalorización %</th><th>Cambio EUR/divisa %</th><th>Fecha de venta</th><th>Resultado con hipótesis</th></tr></thead><tbody>${rows}</tbody></table></div>
            <p class="text-xs text-slate-600 mt-2">La revalorización es acumulada hasta la fecha de venta. Precio y cambio se multiplican. El coste histórico en EUR permite incorporar el cambio de adquisición. Las ventas fuera del horizonte aportan cero al resultado proyectado.</p>
        </details>`;
    }

    function renderDashboard(target, m, alternatives, imported) {
        const actualReady = Boolean(m.cutoff && imported && m.hasYearData);
        const unresolvedForecast = m.calendar.filter(row => !Number.isFinite(row.amount)).length;
        const forecast = m.validHorizon && actualReady && !m.actual.unresolved && !m.overdue.length && !m.errors.some(error => error.startsWith('Pagos,'));
        const base = forecast ? m.base : NaN;
        const coverage = amount => m.goal > 0 ? pct(amount / m.goal * 100) : '—';
        const signedBp = bp => (bp > 0 ? '+' : '') + bp + ' pb';
        const header = text => `<h4 class="font-bold text-lg text-slate-900 mb-3">${text}</h4>`;
        const muted = text => `<p class="text-sm text-slate-600 mb-3">${text}</p>`;
        const cards = items => `<div class="grid sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-4">${items.map(([label, value]) => summaryCard(label, value)).join('')}</div>`;
        const section = html => `<section class="${cardStyle}">${html}</section>`;
        const goalList = [...new Set([m.goal, ...String(alternatives).split(';').map(numeric)].filter(goal => goal > 0))];
        const warnings = [];
        if (m.snapshot && !m.activeSnapshot) warnings.push(`La posición del ${shortDate(m.snapshot.date)} es posterior al corte y queda fuera del análisis.`);
        if (imported && !m.hasYearData) warnings.push('El extracto no contiene movimientos del año de corte.');
        if (m.overdue.length) warnings.push(`Pagos previstos que ya han vencido sin cobro identificado: ${m.overdue.map(row => row.name + ' (' + row.date + ')').join(', ')}. Revisa la fecha, el ISIN y el extracto.`);
        if (m.actual.unresolved) warnings.push(`${m.actual.unresolved} cobro(s) sin divisa, cambio, sentido o importe verificable. Carga ambas hojas para completar la conciliación.`);
        if (m.actual.fromTrades) warnings.push(`${m.actual.fromTrades} cobro(s) proceden de operaciones definitivas sin contrapartida en efectivo.`);
        if (unresolvedForecast) warnings.push(`${unresolvedForecast} pago(s) con importe pendiente. Completa su ficha.`);
        const reviews = m.paymentAssets.filter(asset => asset.review).length;
        if (reviews) warnings.push(`${reviews} activo(s) tienen una ficha por revisar. El total recoge los pagos con importe disponible.`);
        const grossCount = m.calendar.filter(row => row.gross && Number.isFinite(row.amount)).length;
        if (grossCount) warnings.push(`${grossCount} cupón(es) usan importe bruto estimado. Puedes sustituirlo por un neto en su ficha.`);

        if (window.Plotly) target.querySelectorAll('.js-plotly-plot').forEach(chart => window.Plotly.purge(chart));
        const salesOpen = target.querySelector('[data-sales-details]')?.open ?? true;
        const changedPositions = m.activeSnapshot?.assets.filter(asset => m.changed.has(asset.key)).length || 0;
        target.innerHTML = [
            section(header('Ingresos y objetivo anual') +
                muted(m.cutoff ? `Corte: ${shortDate(m.cutoff)} · Proyección hasta ${shortDate(m.end)} · ${m.actual.payments.length} cobros identificados` : 'Carga los extractos para obtener los cobros acumulados.') +
                cards([['Cupones cobrados', money(actualReady ? m.coupons : NaN)], ['Dividendos cobrados', money(actualReady ? m.dividends : NaN)],
                    ['Cupones pendientes estimados', money(m.cutoff ? m.pendingCoupons : NaN)], ['Dividendos pendientes estimados', money(m.cutoff ? m.pendingDividends : NaN)]]) +
                (m.actual.unresolvedRows.length ? table(['Cuenta pendiente', 'Producto', 'Importe original', 'Divisa declarada', 'Revisión'],
                    m.actual.unresolvedRows.map(row => [row.account, row.name, num(row.amount), row.ccy || 'Sin divisa', row.reason])) : '') +
                (warnings.length ? `<p class="text-sm text-amber-800 mb-3">${safe(warnings.join(' '))}</p>` : '') +
                `<div class="grid grid-cols-1 xl:grid-cols-2 gap-4"><div><div class="mandate-editor-header mb-2"><h5 class="font-semibold">Calendario de pagos pendientes</h5><button type="button" data-jump-payments class="${buttonStyle}">Editar pagos y bonos</button></div>
                    ${table(['Fecha', 'Producto', 'Tipo', 'Importe EUR', 'Origen / rango'], m.calendar.map(row => [
                        shortDate(row.date), row.name, row.kind, money(row.amount),
                        [row.origin || (row.estimated ? (row.range ? 'Media histórica' : 'Sin histórico') : 'Introducido'),
                            row.range ? `${money(row.range[0])} a ${money(row.range[1])}` : ''].filter(Boolean).join(' · ')
                    ]), 'mandate-calendar')}</div>
                    <div><h5 class="font-semibold mb-2">Puente hasta la fecha final</h5>
                    ${table(['Concepto', 'EUR'], [
                        ['Cobrado hasta el corte', money(actualReady ? m.coupons + m.dividends : NaN)], ['Cupones pendientes', money(m.cutoff ? m.pendingCoupons : NaN)],
                        ['Dividendos pendientes', money(m.cutoff ? m.pendingDividends : NaN)]
                    ])}<div class="mandate-forecast mt-3"><span>Ingreso previsto con los pagos identificados</span>
                    <strong>${money(base)}</strong><small>${m.goal > 0 ? `${coverage(base)} del objetivo de ${money(m.goal)}` : 'Cupones y dividendos hasta la fecha final'}</small></div></div></div>` +
                (goalList.length ? `<h5 class="font-semibold mt-4 mb-2">Ingresos previstos frente a objetivos</h5>
                    <div class="space-y-2">${goalList.map(goal => {
                        const ratio = base / goal * 100;
                        return `<div class="grid grid-cols-[minmax(5rem,auto)_minmax(0,1fr)_4rem] items-center gap-2 text-sm">
                            <span>${safe(money(goal))}</span><div class="h-3 rounded bg-slate-100 overflow-hidden"><div class="mandate-progress" style="width:${Number.isFinite(ratio) ? Math.max(0, Math.min(100, ratio)) : 0}%"></div></div>
                            <strong class="text-right">${pct(ratio)}</strong></div>`;
                    }).join('')}</div>` : '') +
                `<details class="mt-4"><summary class="cursor-pointer font-semibold text-sm">Detalle de cobros importados</summary>
                    ${table(['Fecha valor', 'Cuenta', 'Producto', 'Divisa', 'Neto local', 'EUR/divisa', 'Neto EUR', 'Bruto EUR', 'Ret. origen EUR', 'Ret. local EUR', 'Conversión'], m.actual.payments.slice().sort((a, b) => b.date.localeCompare(a.date))
                        .map(row => [shortDate(row.date), row.account, row.name, row.ccy, num(row.localAmount), Number.isFinite(row.fx) ? row.fx.toLocaleString('es-ES', { maximumFractionDigits: 6 }) : '—', money(row.amount), money(row.grossEUR), money(row.sourceTaxEUR), money(row.localTaxEUR), row.conversion]))}</details>`),
            section(header('Vencimientos y TIR de los bonos') +
                muted('El nominal representa principal recuperado. Los vencimientos y cupones se leen del nombre cuando el formato lo permite. El nominal inferido usa el último cupón o movimiento disponible. Completa la TIR por bono en su ficha. La línea une únicamente los bonos del mismo grupo de curva.') +
                (m.bonds.length ? cards([['Bonos identificados', num(m.bonds.length)], ['Nominal identificado', money(sum(m.bonds, bond => bond.nominal))]]) +
                    '<div class="grid grid-cols-1 xl:grid-cols-2 gap-4"><div data-maturity class="min-w-0 h-72"></div><div data-curve class="min-w-0 h-72"></div></div>' : '') +
                table(['Producto', 'Vencimiento', 'Trimestre', 'Nominal EUR', 'Cupón', 'TIR', 'Grupo'], m.bonds.map(bond => [
                    bond.name, shortDate(bond.maturity), quarter(bond.maturity), money(bond.nominal), couponPct(bond.coupon), pct(bond.ytm), bond.group
                ]))),
            section(header('Sensibilidad a tipos') +
                muted('Variación instantánea = −valor de renta fija × duración modificada × cambio de tipos. La línea muestra (ingreso previsto + variación de valoración) / objetivo.') +
                cards([['Renta fija', money(m.rfValue)], ['Duración modificada RF', Number.isFinite(m.duration) && m.duration >= 0 ? num(m.duration) + ' años' : '—'],
                    ['TIR ponderada RF', pct(m.ytm)], ['Impacto del cambio de referencia', money(m.shockImpact)]]) +
                (m.sensitivity.some(row => Number.isFinite(row.change)) ? '<div data-sensitivity class="h-80"></div>' : '') +
                table(['Cambio', 'RF', 'Impacto EUR', 'Cartera', 'Valor estimado', 'Objetivo incl. valoración'], m.sensitivity.map(row => [
                    signedBp(row.bp), pct(row.rfPct), money(row.change), pct(row.portfolioPct), money(row.value),
                    forecast ? pct(row.coverage) : '—'
                ]))),
            section(header('Plusvalías latentes y simulación de ventas') +
                (m.activeSnapshot ? muted(`Posición a ${shortDate(m.activeSnapshot.date)} · ${m.activeSnapshot.assets.length} ISIN · Valor en EUR ${money(m.snapshotTotal)}`) : '') +
                (changedPositions ? muted(`${changedPositions} posición(es) con operaciones posteriores a la valoración quedan fuera de la simulación. Carga una foto actualizada o completa los datos manualmente.`) : '') +
                (m.activeSnapshot?.issues.length ? muted(`${m.activeSnapshot.issues.length} fila(s) con cantidad, contravalor o coste incompletos. Las filas sin base de cálculo quedan fuera de las plusvalías.`) : '') +
                muted('El máximo ilustrativo suma las plusvalías positivas disponibles al ingreso previsto. Las ventas simuladas aplican el porcentaje de cada posición al precio del escenario. El calendario presupone mantener los activos hasta cobrar sus pagos; si adelantas una venta, ajusta los pagos pendientes en la ficha del activo. El resultado de la venta se muestra antes de impuestos y comisiones. El coste en EUR de posiciones extranjeras es estimado al cambio de valoración hasta que se introduce su coste histórico. La variación de las posiciones retenidas se muestra como valoración.') +
                cards([['Ingreso previsto', money(base)], ['Plusvalías positivas disponibles', money(m.assets.length ? m.possible : NaN)],
                    ['Máximo ilustrativo', money(m.assets.length ? base + m.possible : NaN)],
                    ['Margen sobre objetivo (máximo)', money(m.goal > 0 && m.assets.length ? base + m.possible - m.goal : NaN)]]) +
                (m.assets.length ? table(['Venta simulada', 'Importe'], [
                    ['Efectivo bruto de venta', money(m.proceeds)],
                    ['Resultado de la venta (importe que suma al objetivo)', money(m.selected)],
                    ['Ingresos previstos + resultado de la venta', money(base + m.selected)],
                    ['Cobertura del objetivo a precios actuales', coverage(base + m.selected)],
                    ['Efectivo de las ventas con hipótesis y fecha válida', money(m.projectedProceeds)],
                    ['Ganancias con hipótesis y fecha válida', money(m.projectedSelected)],
                    ['Ingresos + ganancias proyectadas', money(base + m.projectedSelected)],
                    ['Cobertura del objetivo con hipótesis', coverage(base + m.projectedSelected)]
                ]) : '') +
                salesTable(m.assets, salesOpen, m.end) +
                table(['Escenario', 'Resultado de ventas', 'Ingresos + ventas', 'Objetivo en caja', 'Variación de posiciones retenidas'],
                    (m.assets.length ? [{ name: 'Precios actuales', realized: m.selected, retained: 0 }, { name: 'Hipótesis por activo', realized: m.projectedSelected, retained: 0 }, ...m.scenarios] : [])
                        .map(row => [row.name, money(row.realized), money(base + row.realized), coverage(base + row.realized), money(row.retained)])) +
                (m.scenarios.length ? `<div class="mt-4">${table(['Escenario', 'Activo', 'Variación', 'Precio estimado', 'Plusvalía total potencial'],
                    m.scenarios.flatMap(row => row.details.map(detail => [row.name, detail.name, pct(detail.change * 100),
                        num(detail.price) + ' ' + detail.ccy, money(detail.gain)])))}</div>` : '') +
                (m.assets.length && Number.isFinite(m.shockImpact) ? muted('Para combinar el cambio de tipos con las revalorizaciones, confirma que los activos simulados están fuera de la renta fija y que se mantiene la exposición RF.') : '') +
                (m.assets.length && Number.isFinite(m.shockImpact) ? `<details class="mt-3"><summary class="cursor-pointer font-semibold text-sm">Escenario combinado con tipos (activos simulados fuera de RF)</summary>
                    ${table(['Escenario', 'Variación RF', 'Variación retenida', 'Resultado total incl. valoración', '% objetivo'],
                        [{ name: 'Precios actuales', realized: m.selected, retained: 0 }, { name: 'Hipótesis por activo', realized: m.projectedSelected, retained: 0 }, ...m.scenarios].map(row => {
                            const outcome = base + row.realized + row.retained + m.shockImpact;
                            return [row.name, money(m.shockImpact), money(row.retained), money(outcome), coverage(outcome)];
                        }))}</details>` : ''))
        ].join('');
        plot(target, m, forecast);
    }

    function quarter(date) {
        return `T${Math.ceil(Number(date.slice(5, 7)) / 3)} ${date.slice(0, 4)}`;
    }

    const monthFormat = new Intl.DateTimeFormat('es-ES', { month: 'short', year: '2-digit', timeZone: 'UTC' });
    const monthLabel = month => monthFormat.format(new Date(month + '-01T00:00:00Z'));

    function plot(target, m, forecast) {
        if (!window.Plotly) return;
        const draw = (selector, traces, layout) => {
            const element = target.querySelector(selector);
            if (element) window.Plotly.newPlot(element, traces, {
                margin: { l: 65, r: 55, t: 42, b: 55 }, font: { color: '#334155', size: 12 },
                legend: { orientation: 'h', y: -0.25 }, ...layout
            }, { responsive: true, displayModeBar: false });
        };
        if (m.bonds.length) {
            const buckets = new Map();
            for (const bond of m.bonds) {
                const month = bond.maturity.slice(0, 7);
                buckets.set(month, (buckets.get(month) || 0) + bond.nominal);
            }
            draw('[data-maturity]', [{
                type: 'bar', x: [...buckets.keys()].map(month => monthLabel(month) + '<br>' + quarter(month)),
                y: [...buckets.values()], marker: { color: '#25618b' },
                hovertemplate: '%{x}<br>%{y:,.0f} €<extra></extra>'
            }], { title: 'Nominal por mes de vencimiento', xaxis: { type: 'category' }, yaxis: { ticksuffix: ' €' } });
            const years = bond => (Date.parse(bond.maturity) - Date.parse(m.cutoff)) / 31557600000;
            const groups = new Map();
            for (const bond of m.bonds.filter(bond => Number.isFinite(bond.ytm))) {
                if (!groups.has(bond.group)) groups.set(bond.group, []);
                groups.get(bond.group).push(bond);
            }
            const dots = (bonds, field, label, mode) => ({
                type: 'scatter', mode, x: bonds.map(years), y: bonds.map(bond => bond[field]), text: bonds.map(bond => safe(bond.name)),
                name: safe(label), hovertemplate: '%{text}<br>%{x:.2f} años · %{y:.2f}%<extra></extra>'
            });
            draw('[data-curve]', [
                dots(m.bonds, 'coupon', 'Cupón', 'markers'),
                ...[...groups].map(([group, bonds]) => dots(bonds, 'ytm', group || 'TIR indicativa', group ? 'lines+markers' : 'markers'))
            ], { title: 'TIR y cupón por plazo', xaxis: { title: 'Años hasta vencimiento' }, yaxis: { ticksuffix: '%' } });
        }
        const rows = m.sensitivity;
        const x = rows.map(row => row.bp);
        const traces = [{
            type: 'bar', x, y: rows.map(row => row.change), name: 'Impacto RF',
            marker: { color: rows.map(row => row.change < 0 ? '#b0444b' : '#20735b') }
        }];
        if (forecast && m.goal > 0) traces.push({
            type: 'scatter', mode: 'lines+markers', x, y: rows.map(row => row.coverage),
            name: '% objetivo con valoración', yaxis: 'y2', line: { color: '#22578c' }
        });
        draw('[data-sensitivity]', traces, {
            title: 'Impacto estimado en la cartera', xaxis: { title: 'Cambio paralelo (pb)', type: 'category', categoryorder: 'array', categoryarray: x },
            yaxis: { ticksuffix: ' €' }, yaxis2: { overlaying: 'y', side: 'right', ticksuffix: '%', showgrid: false }
        });
    }

    function attachToRatesPanel() {
        const ratesPanel = document.getElementById('workspaceInitialRates');
        if (!ratesPanel) return;

        const panel = document.createElement('div');
        panel.id = 'workspacePortfolioMandate';
        panel.className = 'mt-6';
        panel.addEventListener('input', event => event.stopPropagation());
        ratesPanel.append(panel);
        mount(panel, () => ({
            value: (typeof portfolioCalculationSettings !== 'function' || portfolioCalculationSettings().currency === 'EUR')
                ? ratesPanel.querySelector('#initialRateAmount').value : '',
            rf: ratesPanel.querySelector('#initialRateWeight').value,
            duration: ratesPanel.querySelector('#initialRateDuration').value,
            ytm: ratesPanel.querySelector('#initialRateYtm').value,
            shock: ratesPanel.querySelector('#initialRateShock').value
        }));

        const jump = document.createElement('button');
        jump.type = 'button';
        jump.className = `${buttonStyle} mt-2`;
        jump.textContent = 'Ir a ingresos, vencimientos y plusvalías';
        jump.addEventListener('click', () => {
            panel.querySelector('h3').focus({ preventScroll: true });
            panel.scrollIntoView({ block: 'start' });
        });
        ratesPanel.querySelector('h3').after(jump);
    }

    if (typeof module !== 'undefined' && module.exports) module.exports = { readWorkbook, calculate };
    else attachToRatesPanel();
})();
