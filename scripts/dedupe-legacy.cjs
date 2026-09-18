const fs = require('node:fs');
const file = 'index.html';
let source = fs.readFileSync(file, 'utf8');
for (const name of ['renderPortfolioBacktestChart','setFundPortfolioRows','loadFundPortfolioFromText','clearFundScoringState']) {
    const pattern = new RegExp('^            (?:async )?function ' + name + '\\([^\\n]*\\{[\\s\\S]*?^            \\}', 'gm');
    const matches = [...source.matchAll(pattern)];
    for (const match of matches.slice(0, -1).reverse()) source = source.slice(0, match.index) + source.slice(match.index + match[0].length);
}
fs.writeFileSync(file, source);
