const {test}=require('node:test'),assert=require('node:assert/strict');
const core=require('../assets/shared-data-core.js');
const sheet=(name,...rows)=>({name,rows});
test('recognizes content and accents, never a filename alone',()=>{
 assert.equal(core.classify([sheet('Categorización',['ISIN','Tipo Activo','TIPO ACTIVO +'])]),'categories');
 assert.equal(core.classify([sheet('CATEGORIZACION',['ISIN','TIPO ACTIVO','TIPO ACTIVO +'])]),'categories');
 assert.equal(core.classify([sheet('Posis',['ISIN','INSTRUMENT','ACCOUNT','DIV INSTITUTION COUNTER VALUE'])]),'positions');
 assert.equal(core.classify([sheet('Saldos',['TRANSACTIONAL ACCOUNT','BALANCE','CURRENCY'])]),'balances');
 assert.equal(core.classify([sheet('Ranking Completo',['ISIN','Name','Score'])]),'universe');
 assert.equal(core.classify([sheet('Ranking Completo',['Nombre'])]),null);
});
test('committee detection precedes generic masters',()=>{
 const master=[sheet('weights',['ticker','weight']),sheet('prices',['date','ABC'])];
 assert.equal(core.classify(master),'master');
 assert.equal(core.classify([...master,sheet('Carteras Modelo'),sheet('GDC Estado')]),'gdc');
 assert.equal(core.classify([...master,sheet('Carteras Modelo'),sheet('GDC Estado'),sheet('GICI Estado')]),'gici');
 assert.equal(core.classify([sheet('weights',['ticker','weight'])]),null);
});
test('Control DNI uses the existing positional contract',()=>{
 const header=Array(65).fill('');header[2]='CUENTA (Inversis)';header[49]='PERFIL GESTION ID';
 assert.equal(core.classify([sheet('Control DNI & TEST',[],[],header)]),'control');
 header[49]='Nombre';assert.equal(core.classify([sheet('Control DNI & TEST',[],[],header)]),null);
});
test('duplicates remain candidates and version depends on contents',()=>{
 assert.equal(core.group([{role:'master',id:'a'},{role:'master',id:'b'}]).master.length,2);
 assert.equal(core.sameVersion({sha256:'a'},{sha256:'b'}),false);
 assert.equal(core.sameVersion({sha256:'a'},{sha256:'a'}),true);
 assert.equal(core.sameVersion(null,{sha256:'a'}),false);
 assert.equal(core.eligible('~$Posis.xlsx'),false);assert.equal(core.eligible('Posis.xlsx'),true);assert.equal(core.eligible('Posis.exe'),false);
});
test('local build bundles every startup dependency and denies network connections',()=>{
 const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),root=path.resolve(__dirname,'..');
 cp.execFileSync(process.execPath,['scripts/build-local.cjs'],{cwd:root});
 const html=fs.readFileSync(path.join(root,'local.html'),'utf8');
 assert.match(html,/connect-src 'none'/);assert.match(html,/form-action 'none'/);
 assert.ok(html.indexOf('Content-Security-Policy')<html.indexOf('<script'));
 assert.ok(html.indexOf('offline-runtime.js')<html.indexOf('finance-core.js'));
 assert.doesNotMatch(html,/<(?:script|link)\b[^>]*(?:src|href)=["']https?:/i);
});
