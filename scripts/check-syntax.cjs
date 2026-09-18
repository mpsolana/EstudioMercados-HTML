const fs = require('node:fs'), vm = require('node:vm');
const html = fs.readFileSync('index.html', 'utf8');
for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) new vm.Script(match[1]);
for (const name of fs.readdirSync('assets').filter(n => n.endsWith('.js'))) new vm.Script(fs.readFileSync('assets/' + name,'utf8'),{filename:name});
const names=[...html.matchAll(/^\s*(?:async )?function (\w+)\(/gm)].map(m=>m[1]);
if(new Set(names).size!==names.length) throw new Error('Duplicate legacy function definitions remain.');
console.log('Inline and asset syntax OK; no duplicate function declarations.');
