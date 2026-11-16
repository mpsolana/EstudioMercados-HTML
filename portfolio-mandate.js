(function () {
    'use strict';

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

    function readWorkbook(workbook, xlsx) {
        const result = {};
        for (const sheet of workbook.SheetNames) {
            const type = sheetTypes[normalize(sheet)];
            if (!type) continue;
            if (result[type]) throw new Error('El libro contiene dos hojas del mismo tipo.');
            const [headers = [], ...rows] = xlsx.utils.sheet_to_json(workbook.Sheets[sheet], {
                header: 1, raw: true, defval: null, blankrows: false
            });
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
                    return { code: id(code), confirmed: normalize(status) === 'DEFINITIVA', kind: classify(event),
                        date: isoDate(date ?? get(row, 'VALUE DATE') ?? get(row, 'TRADE DATE')),
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
        if (!Object.keys(result).length) throw new Error('El libro debe contener Operaciones o Movimientos de efectivo.');
        return result;
    }

    function received({ trades = [], cash = [] }, cutoff) {
        const operations = new Map();
        const booked = new Set();
        const seenCash = new Set();
        let unresolved = 0;
        for (const row of trades) {
            if (row.confirmed && row.kind && row.code) operations.set(row.code, row);
        }
        const withinYear = row => row.date && row.date <= cutoff && row.date.slice(0, 4) === cutoff.slice(0, 4);
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
            const ccy = row.ccy || matched?.ccy;
            const fx = ccy === 'EUR' ? 1 : ccy === matched?.ccy && matched?.fx > 0 ? matched.fx : row.fx;
            if (!ccy || !(fx > 0) || !Number.isFinite(row.amount) || !['ABONO', 'CARGO'].includes(row.direction)) {
                unresolved++;
                continue;
            }
            const amount = Math.abs(row.amount) * fx * (row.direction === 'CARGO' ? -1 : 1);
            payments.push({ ...row, amount, isin: row.isin || matched?.isin || '', name: matched?.name || row.name });
        }
        const seenTrades = new Set();
        let fromTrades = 0;
        for (const row of trades) {
            if (!row.kind || !row.confirmed || !withinYear(row) || booked.has(row.code) || seenTrades.has(row.code)) continue;
            if (row.code) seenTrades.add(row.code);
            const fx = row.ccy === 'EUR' ? 1 : row.fx;
            if (!row.ccy || !(fx > 0) || !Number.isFinite(row.amount)) {
                unresolved++;
                continue;
            }
            payments.push({ ...row, amount: row.amount * fx });
            fromTrades++;
        }
        return { payments, unresolved, fromTrades };
    }

    const sum = (rows, value) => rows.reduce((total, row) => total + value(row), 0);
    const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });
    const decimal = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });
    const money = value => Number.isFinite(value) ? eur.format(value + 0) : '—';
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
    const fields = ['cutoff', 'value', 'rf', 'duration', 'ytm', 'goal', 'alternatives', 'shock', 'paymentRows', 'bondRows', 'assetRows', 'scenarioRows'];
    const summaryCard = (title, value) => `<div class="border border-slate-200 bg-slate-50 rounded-lg p-3"><div class="text-xs font-semibold text-slate-600">${title}</div><div class="text-lg sm:text-xl font-bold text-slate-900 mt-1">${value}</div></div>`;
    const table = (headers, rows) => rows.length ? `<div class="overflow-x-auto"><table class="w-full text-sm text-left whitespace-nowrap"><thead class="bg-slate-100 text-slate-700"><tr>${headers.map(h => `<th scope="col" class="px-3 py-2">${h}</th>`).join('')}</tr></thead><tbody class="divide-y divide-slate-100">${rows.map(row => `<tr>${row.map(cell => `<td class="px-3 py-2">${safe(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<p class="text-sm text-slate-500">Sin datos para mostrar.</p>';

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

    function calculate(state, sources) {
        const errors = [];
        const dates = Object.values(sources).flatMap(rows => rows.map(r => r.date).filter(Boolean));
        const cutoff = isoDate(state.cutoff) || dates.sort().at(-1) || '';
        const year = cutoff.slice(0, 4);
        const actual = received(sources, cutoff);
        const hasYearData = dates.some(date => date.startsWith(year));
        const coupons = sum(actual.payments.filter(row => row.kind === 'Cupón'), row => row.amount);
        const dividends = sum(actual.payments.filter(row => row.kind === 'Dividendo'), row => row.amount);

        const paymentRows = parseRows(state.paymentRows, 'Pagos', 5, ([date, name, type, isin, net]) => {
            const kind = normalize(type) === 'CUPON' ? 'Cupón' : normalize(type) === 'DIVIDENDO' ? 'Dividendo' : '';
            const amount = numeric(net);
            if (!isoDate(date) || !name || !kind || (net && !(amount >= 0)) || (!net && (kind !== 'Dividendo' || !isin))) return null;
            return { date: isoDate(date), name, kind, isin: isin.toUpperCase(), amount };
        }, errors);
        const bonds = parseRows(state.bondRows, 'Bonos', 6, ([name, maturity, nominal, coupon, ytm, group]) => {
            if (!name || !isoDate(maturity) || !(numeric(nominal) > 0) || !(numeric(coupon) >= 0)
                || (ytm && !Number.isFinite(numeric(ytm)))) return null;
            return { name, maturity: isoDate(maturity), nominal: numeric(nominal), coupon: numeric(coupon), ytm: numeric(ytm), group };
        }, errors).filter(bond => cutoff && bond.maturity > cutoff).sort((a, b) => a.maturity.localeCompare(b.maturity));

        const matchesPayment = row => actual.payments.some(payment => payment.kind === row.kind && payment.date === row.date &&
            (row.isin ? payment.isin === row.isin : normalize(payment.name) === normalize(row.name)));
        const overdue = paymentRows.filter(row => row.date.startsWith(year) && row.date <= cutoff && !matchesPayment(row));
        const calendar = paymentRows.flatMap(row => {
            if (!cutoff || row.date <= cutoff || !row.date.startsWith(year)) return [];
            const history = actual.payments.filter(p => p.isin === row.isin && p.kind === row.kind && p.amount > 0);
            const estimated = !Number.isFinite(row.amount);
            const amount = estimated ? (history.length ? sum(history, p => p.amount) / history.length : NaN) : row.amount;
            return [{ ...row, estimated, amount,
                range: estimated && history.length ? [Math.min(...history.map(p => p.amount)), Math.max(...history.map(p => p.amount))] : null }];
        }).sort((a, b) => a.date.localeCompare(b.date));
        const pendingCoupons = sum(calendar.filter(r => r.kind === 'Cupón'), r => r.amount);
        const pendingDividends = sum(calendar.filter(r => r.kind === 'Dividendo' && Number.isFinite(r.amount)), r => r.amount);
        const base = coupons + dividends + pendingCoupons + pendingDividends;
        const value = numeric(state.value);
        const rf = numeric(state.rf) / 100;
        const duration = numeric(state.duration);
        const ytm = numeric(state.ytm);
        const goal = numeric(state.goal);
        const shock = numeric(state.shock);
        const rfValue = value > 0 && rf >= 0 && rf <= 1 ? value * rf : NaN;
        const impact = bp => duration >= 0 && Number.isFinite(rfValue) ? -rfValue * duration * bp / 10000 : NaN;
        const sensitivity = [-200, -100, -50, -25, 0, 25, 50, 100, 200].map(bp => {
            const change = impact(bp);
            return { bp, change, rfPct: duration >= 0 ? -duration * bp / 100 : NaN, portfolioPct: change / value * 100,
                value: value + change, coverage: cutoff && goal > 0 ? (base + change) / goal * 100 : NaN };
        });

        const assets = parseRows(state.assetRows, 'Activos', 8, ([key, name, units, price, ccy, fx, cost, sale]) => {
            const asset = { key: key.toUpperCase(), name, units: numeric(units), price: numeric(price), ccy: currency(ccy),
                fx: currency(ccy) === 'EUR' && !fx ? 1 : numeric(fx), cost: numeric(cost), sale: numeric(sale) / 100 };
            if (!asset.key || !name || !/^[A-Z]{3}$/.test(asset.ccy) || !(asset.units > 0) || !(asset.price > 0) ||
                !(asset.fx > 0) || !(asset.cost >= 0) || !(asset.sale >= 0 && asset.sale <= 1)) return null;
            return asset;
        }, errors);
        const prices = new Map();
        for (const asset of assets) {
            if (prices.has(asset.key)) errors.push('Código de activo duplicado: ' + asset.key);
            else prices.set(asset.key, asset);
        }
        const gain = (asset, change = 0) => asset.units * asset.price * asset.fx * (1 + change) - asset.cost;
        const possible = sum([...prices.values()], asset => Math.max(0, gain(asset)));
        const selected = sum([...prices.values()], asset => gain(asset) * asset.sale);
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
            const retained = sum([...prices.values()], asset => asset.units * asset.price * asset.fx * (shifts.get(asset.key) || 0) * (1 - asset.sale));
            return { name, realized, retained, details: [...shifts].map(([key, change]) => {
                const asset = prices.get(key);
                return { name: asset.name, ccy: asset.ccy, change, price: asset.price * (1 + change), gain: gain(asset, change) };
            }) };
        });
        return { cutoff, actual, hasYearData, errors, coupons, dividends, calendar, overdue, pendingCoupons, pendingDividends, base, bonds,
            value, rf, rfValue, duration, ytm, goal, shockImpact: impact(shock), sensitivity, possible, selected, assets: [...prices.values()], scenarios };
    }

    function mount(root) {
        root.classList.add('space-y-4');
        root.innerHTML = `
            <section class="${cardStyle}">
                <h3 class="text-xl font-bold text-slate-900">Duración, sensibilidad e ingresos</h3>
                <div class="mt-4 flex flex-wrap items-end gap-3">
                    <label class="block text-sm font-semibold">Extractos YTD (.xlsx o .xls)<input data-extract type="file" multiple accept=".xlsx,.xls" class="${inputStyle}"></label>
                    <button type="button" data-save class="${buttonStyle}">Guardar supuestos</button>
                    <label class="${buttonStyle} cursor-pointer">Cargar supuestos<input data-load type="file" accept=".json" class="sr-only"></label>
                    <button type="button" data-reset class="${buttonStyle}">Limpiar cartera</button>
                </div>
                <p data-import role="status" class="mt-2 text-sm text-slate-600">Carga un libro con ambas hojas o los dos extractos por separado. Cada carga reemplaza la hoja anterior del mismo tipo.</p>
                <form novalidate>
                    <div class="grid sm:grid-cols-2 xl:grid-cols-4 gap-3 mt-4">
                        <label class="block text-sm font-semibold">Fecha de corte<input name="cutoff" type="date" class="${inputStyle}"></label>
                        ${numField('value', 'Valor de cartera (€)', 'min="0"')}
                        ${numField('rf', 'Peso renta fija (%)', 'min="0" max="100"')}
                        ${numField('duration', 'Duración modificada RF (años)', 'min="0"')}
                        ${numField('ytm', 'TIR ponderada RF (%)')}
                        ${numField('goal', 'Objetivo anual (€)', 'min="0"')}
                        ${numField('shock', 'Cambio de tipos de referencia (pb)', 'value="-25"')}
                        <label class="block text-sm font-semibold">Otros objetivos (€)<input name="alternatives" class="${inputStyle}" placeholder="100000; 150000"></label>
                    </div>
                    <p class="mt-2 text-xs text-slate-600">Con la fecha vacía se toma la última fecha del extracto. La TIR es una métrica de cartera y el presupuesto se calcula con cobros y pagos previstos.</p>
                    <details class="mt-4 border-t border-slate-200 pt-3">
                        <summary class="font-semibold cursor-pointer">Editar calendario, bonos y escenarios</summary>
                        <p class="mt-2 text-sm text-slate-600">Pega filas de Excel sin encabezados o escribe una fila por línea, separando las columnas con punto y coma. Fechas AAAA-MM-DD o DD/MM/AAAA. Importes sin separadores de miles.</p>
                        ${area('paymentRows', 'Pagos pendientes', 'Fecha · producto · cupón/dividendo · ISIN · neto EUR. Para estimar un dividendo por la media de los abonos del mismo ISIN, deja vacía la última columna.')}
                        ${area('bondRows', 'Bonos en cartera', 'Producto · vencimiento · nominal EUR · cupón % · TIR % · grupo de curva. La TIR y el grupo pueden quedar vacíos. Usa un grupo común solo para emisiones comparables.')}
                        ${area('assetRows', 'Posiciones y ventas simuladas', 'Código/ISIN · activo · unidades · precio local · divisa · EUR por unidad de divisa · coste total EUR · % a vender. En EUR puedes dejar vacío el cambio.')}
                        ${area('scenarioRows', 'Escenarios de revalorización', 'Escenario · código/ISIN · variación %. Repite el nombre del escenario para cambiar varios activos a la vez. Usa 0 para mantener su precio.')}
                    </details>
                    <p data-errors role="status" class="mt-3 text-sm text-red-700"></p>
                </form>
            </section>
            <div data-dashboard class="space-y-4"></div>`;

        const form = root.querySelector('form');
        const input = name => form.elements.namedItem(name);
        const dashboard = root.querySelector('[data-dashboard]');
        const status = root.querySelector('[data-import]');
        let sources = {};
        let revision = 0;
        let model;
        const readState = () => Object.fromEntries(fields.map(name => [name, input(name).value]));
        const render = () => {
            model = calculate(readState(), sources);
            root.querySelector('[data-errors]').textContent = model.errors.length ? 'Revisa estas filas: ' + model.errors.join(' · ') : '';
            renderDashboard(dashboard, model, input('alternatives').value, Object.keys(sources).length > 0);
        };

        form.addEventListener('submit', event => event.preventDefault());
        form.addEventListener('input', render);
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
                        throw new Error('La selección contiene dos extractos del mismo tipo. Carga solo la versión vigente.');
                    }
                    Object.assign(replacement, parsed);
                }
                if (current !== revision) return;
                sources = { ...sources, ...replacement };
                status.textContent = `Operaciones: ${sources.trades?.length ?? 'sin cargar'} · Movimientos de efectivo: ${sources.cash?.length ?? 'sin cargar'}`;
                render();
            } catch (error) {
                if (current === revision) status.textContent = 'No se pudo importar. ' + error.message;
            }
        });

        root.querySelector('[data-save]').addEventListener('click', () => {
            const blob = new Blob([JSON.stringify({ version: 1, inputs: readState() }, null, 2)], { type: 'application/json' });
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
                if (data.version !== 1 || !data.inputs || fields.some(name => typeof data.inputs[name] !== 'string')) {
                    throw new Error('Elige un archivo de supuestos guardado desde el panel.');
                }
                const hadSources = Object.keys(sources).length > 0;
                sources = {};
                for (const name of fields) input(name).value = data.inputs[name];
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
            status.textContent = 'Panel limpio. Carga los extractos de la cartera.';
            render();
        });
        render();
    }

    function renderDashboard(target, m, alternatives, imported) {
        const actualReady = Boolean(m.cutoff && imported && m.hasYearData);
        const unresolvedForecast = m.calendar.filter(row => !Number.isFinite(row.amount)).length;
        const forecast = actualReady && !m.actual.unresolved && !unresolvedForecast && !m.overdue.length && !m.errors.some(error => error.startsWith('Pagos,'));
        const base = forecast ? m.base : NaN;
        const coverage = amount => m.goal > 0 ? pct(amount / m.goal * 100) : '—';
        const signedBp = bp => (bp > 0 ? '+' : '') + bp + ' pb';
        const header = text => `<h4 class="font-bold text-lg text-slate-900 mb-3">${text}</h4>`;
        const muted = text => `<p class="text-sm text-slate-600 mb-3">${text}</p>`;
        const cards = items => `<div class="grid sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-4">${items.map(([label, value]) => summaryCard(label, value)).join('')}</div>`;
        const section = html => `<section class="${cardStyle}">${html}</section>`;
        const goalList = [...new Set([m.goal, ...String(alternatives).split(';').map(numeric)].filter(goal => goal > 0))];
        const warnings = [];
        if (imported && !m.hasYearData) warnings.push('El extracto no contiene movimientos del año de corte.');
        if (m.overdue.length) warnings.push(`Pagos previstos que ya han vencido sin cobro identificado: ${m.overdue.map(row => row.name + ' (' + row.date + ')').join(', ')}. Revisa la fecha, el ISIN y el extracto.`);
        if (m.actual.unresolved) warnings.push(`${m.actual.unresolved} cobro(s) sin divisa, cambio, sentido o importe verificable. Carga ambas hojas para completar la conciliación.`);
        if (m.actual.fromTrades) warnings.push(`${m.actual.fromTrades} cobro(s) proceden de operaciones definitivas sin contrapartida en efectivo.`);
        if (unresolvedForecast) warnings.push(`${unresolvedForecast} dividendo(s) pendiente(s) sin histórico para estimar. Introduce el neto previsto.`);

        if (window.Plotly) target.querySelectorAll('.js-plotly-plot').forEach(chart => window.Plotly.purge(chart));
        target.innerHTML = [
            section(header('Ingresos y objetivo anual') +
                muted(m.cutoff ? `Corte: ${safe(m.cutoff)} · ${m.actual.payments.length} cobros identificados` : 'Carga los extractos para obtener los cobros acumulados.') +
                cards([['Cupones cobrados', money(actualReady ? m.coupons : NaN)], ['Dividendos cobrados', money(actualReady ? m.dividends : NaN)],
                    ['Cupones pendientes conocidos', money(m.cutoff ? m.pendingCoupons : NaN)], ['Dividendos pendientes conocidos', money(m.cutoff ? m.pendingDividends : NaN)]]) +
                (warnings.length ? `<p class="text-sm text-amber-800 mb-3">${safe(warnings.join(' '))}</p>` : '') +
                `<div class="grid grid-cols-1 xl:grid-cols-2 gap-4"><div><h5 class="font-semibold mb-2">Calendario de pagos pendientes</h5>
                    ${table(['Fecha', 'Producto', 'Tipo', 'Neto EUR', 'Origen / rango'], m.calendar.map(row => [
                        row.date, row.name, row.kind, money(row.amount), row.range ? `Media · ${money(row.range[0])} a ${money(row.range[1])}` : row.estimated ? 'Sin histórico' : 'Introducido'
                    ]))}</div>
                    <div><h5 class="font-semibold mb-2">Puente hasta el cierre</h5>
                    ${table(['Concepto', 'EUR'], [
                        ['Cobrado hasta el corte', money(actualReady ? m.coupons + m.dividends : NaN)], ['Cupones pendientes', money(m.cutoff ? m.pendingCoupons : NaN)],
                        ['Dividendos pendientes', money(m.cutoff ? m.pendingDividends : NaN)], ['Ingreso previsto con el calendario indicado', money(base)]
                    ])}</div></div>` +
                (goalList.length ? `<h5 class="font-semibold mt-4 mb-2">Ingresos previstos frente a objetivos</h5>
                    <div class="space-y-2">${goalList.map(goal => {
                        const ratio = base / goal * 100;
                        return `<div class="grid grid-cols-[minmax(5rem,auto)_minmax(0,1fr)_4rem] items-center gap-2 text-sm">
                            <span>${safe(money(goal))}</span><div class="h-3 rounded bg-slate-100 overflow-hidden"><div class="h-full bg-blue-800" style="width:${Number.isFinite(ratio) ? Math.max(0, Math.min(100, ratio)) : 0}%"></div></div>
                            <strong class="text-right">${pct(ratio)}</strong></div>`;
                    }).join('')}</div>` : '') +
                `<details class="mt-4"><summary class="cursor-pointer font-semibold text-sm">Detalle de cobros importados</summary>
                    ${table(['Fecha valor', 'ISIN', 'Producto', 'Tipo', 'EUR'], m.actual.payments.slice().sort((a, b) => b.date.localeCompare(a.date))
                        .map(row => [row.date, row.isin, row.name, row.kind, money(row.amount)]))}</details>`),
            section(header('Vencimientos y TIR de los bonos') +
                muted('El nominal representa principal recuperado. Las TIR son observaciones introducidas para la cartera. La línea une únicamente los bonos del mismo grupo de curva.') +
                (m.bonds.length ? cards([['Bonos pendientes', num(m.bonds.length)], ['Nominal pendiente', money(sum(m.bonds, bond => bond.nominal))]]) +
                    '<div class="grid grid-cols-1 xl:grid-cols-2 gap-4"><div data-maturity class="min-w-0 h-72"></div><div data-curve class="min-w-0 h-72"></div></div>' : '') +
                table(['Producto', 'Vencimiento', 'Trimestre', 'Nominal EUR', 'Cupón', 'TIR', 'Grupo'], m.bonds.map(bond => [
                    bond.name, bond.maturity, quarter(bond.maturity), money(bond.nominal), pct(bond.coupon), pct(bond.ytm), bond.group
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
            section(header('Realización de plusvalías y escenarios') +
                muted('El máximo ilustrativo suma todas las plusvalías positivas introducidas al ingreso previsto. Las ventas simuladas aplican el porcentaje de cada posición al precio del escenario. El resultado de ventas se muestra antes de impuestos y costes de venta. El efecto sobre las posiciones retenidas figura como valoración. Usa las fechas de pago compatibles con las ventas simuladas.') +
                cards([['Ingreso previsto', money(base)], ['Plusvalías positivas disponibles', money(m.assets.length ? m.possible : NaN)],
                    ['Máximo ilustrativo', money(m.assets.length ? base + m.possible : NaN)],
                    ['Margen sobre objetivo (máximo)', money(m.goal > 0 && m.assets.length ? base + m.possible - m.goal : NaN)]]) +
                table(['Escenario', 'Resultado de ventas', 'Ingresos + ventas', 'Objetivo en caja', 'Variación de posiciones retenidas'],
                    (m.assets.length ? [{ name: 'Precios actuales', realized: m.selected, retained: 0 }, ...m.scenarios] : [])
                        .map(row => [row.name, money(row.realized), money(base + row.realized), coverage(base + row.realized), money(row.retained)])) +
                (m.scenarios.length ? `<div class="mt-4">${table(['Escenario', 'Activo', 'Variación', 'Precio estimado', 'Plusvalía total potencial'],
                    m.scenarios.flatMap(row => row.details.map(detail => [row.name, detail.name, pct(detail.change * 100),
                        num(detail.price) + ' ' + detail.ccy, money(detail.gain)])))}</div>` : '') +
                (m.assets.length && Number.isFinite(m.shockImpact) ? muted('Para combinar el cambio de tipos con las revalorizaciones, confirma que los activos simulados están fuera de la renta fija y que se mantiene la exposición RF.') : '') +
                (m.assets.length && Number.isFinite(m.shockImpact) ? `<details class="mt-3"><summary class="cursor-pointer font-semibold text-sm">Escenario combinado con tipos (activos simulados fuera de RF)</summary>
                    ${table(['Escenario', 'Variación RF', 'Variación retenida', 'Resultado total incl. valoración', '% objetivo'],
                        [{ name: 'Precios actuales', realized: m.selected, retained: 0 }, ...m.scenarios].map(row => {
                            const outcome = base + row.realized + row.retained + m.shockImpact;
                            return [row.name, money(m.shockImpact), money(row.retained), money(outcome), coverage(outcome)];
                        }))}</details>` : ''))
        ].join('');
        plot(target, m, forecast);
    }

    function quarter(date) {
        return `T${Math.ceil(Number(date.slice(5, 7)) / 3)} ${date.slice(0, 4)}`;
    }

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
                type: 'bar', x: [...buckets.keys()].map(month => month + '<br>' + quarter(month)),
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
            name: '% objetivo incl. valoración', yaxis: 'y2', line: { color: '#22578c' }
        });
        draw('[data-sensitivity]', traces, {
            title: 'Impacto estimado en la cartera', xaxis: { title: 'Cambio paralelo (pb)', tickvals: x },
            yaxis: { ticksuffix: ' €' }, yaxis2: { overlaying: 'y', side: 'right', ticksuffix: '%', showgrid: false }
        });
    }

    if (typeof module !== 'undefined' && module.exports) module.exports = { readWorkbook, calculate };
    if (typeof document !== 'undefined') {
        const root = document.getElementById('portfolioSubtabContent-mandate');
        if (root) mount(root);
    }
})();
