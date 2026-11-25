// Explicit allowlist: never package source folders, workbooks, .git or test fixtures.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),output=path.join(root,'local-release');
execFileSync(process.execPath,[path.join(__dirname,'build-local.cjs')],{stdio:'inherit'});
fs.mkdirSync(output,{recursive:true});
fs.cpSync(path.join(root,'assets'),path.join(output,'assets'),{recursive:true});
fs.copyFileSync(path.join(root,'local.html'),path.join(output,'local.html'));
fs.copyFileSync(path.join(root,'README.local.md'),path.join(output,'LEEME.md'));
console.log('Local package prepared in local-release. Distribute the entire folder.');
