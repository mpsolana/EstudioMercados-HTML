(function (root) {
    const fields = {
        revenue: 'annualTotalRevenue', netIncome: 'annualNetIncome', operatingCashFlow: 'annualOperatingCashFlow',
        freeCashFlow: 'annualFreeCashFlow', operatingIncome: 'annualOperatingIncome', ebitda: 'annualEBITDA',
        debt: 'annualTotalDebt', cash: 'annualCashAndCashEquivalents', shares: 'annualOrdinarySharesNumber',
        equity: 'annualStockholdersEquity', assets: 'annualTotalAssets', currentLiabilities: 'annualCurrentLiabilities',
        taxRate: 'annualTaxRateForCalcs'
    };
    const ratio = (numerator, denominator) => Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0 ? numerator / denominator : null;
    function parse(payload) {
        const entries = payload?.timeseries?.result || [];
        const years = new Map();
        for (const [field, key] of Object.entries(fields)) {
            const values = entries.find(item => Array.isArray(item[key]))?.[key] || [];
            for (const item of values) {
                const date = item.asOfDate;
                const value = item.reportedValue?.raw;
                if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(value)) continue;
                if (!years.has(date)) years.set(date, { date });
                years.get(date)[field] = value;
            }
        }
        const ordered = [...years.values()].sort((a, b) => a.date.localeCompare(b.date));
        return ordered.map((row, index) => {
            const previous = ordered[index - 1];
            const avg = field => Number.isFinite(previous?.[field]) && Number.isFinite(row[field]) ? (previous[field] + row[field]) / 2 : null;
            const invested = item => Number.isFinite(item?.equity) && Number.isFinite(item?.debt) && Number.isFinite(item?.cash) ? item.equity + item.debt - item.cash : null;
            const avgInvested = previous && Number.isFinite(invested(previous)) && Number.isFinite(invested(row)) ? (invested(previous) + invested(row)) / 2 : null;
            const tax = row.taxRate != null ? (row.taxRate > 1 ? row.taxRate / 100 : row.taxRate) : null;
            return {
                ...row,
                operatingMargin: ratio(row.operatingIncome, row.revenue), netMargin: ratio(row.netIncome, row.revenue),
                roe: ratio(row.netIncome, avg('equity')), roa: ratio(row.netIncome, avg('assets')),
                roic: tax != null && tax >= 0 && tax < 1 && Number.isFinite(row.operatingIncome) ? ratio(row.operatingIncome * (1 - tax), avgInvested) : null,
                netDebtEbitda: Number.isFinite(row.debt) && Number.isFinite(row.cash) ? ratio(row.debt - row.cash, row.ebitda) : null,
                cashRatio: ratio(row.cash, row.currentLiabilities)
            };
        });
    }
    function drawdown(payload) {
        const result = payload?.chart?.result?.[0];
        const adjusted = result?.indicators?.adjclose?.[0]?.adjclose;
        const close = result?.indicators?.quote?.[0]?.close || [];
        const values = result?.timestamp?.map((_, index) => adjusted?.[index] ?? close[index]).filter(value => Number.isFinite(value) && value > 0) || [];
        return values.length > 1 ? values.at(-1) / Math.max(...values) - 1 : null;
    }
    const api = { fields, parse, drawdown };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.CompanyFundamentalsCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
