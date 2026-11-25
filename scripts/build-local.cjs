const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'assets/vendor/local/manifest.json')));
for(const entry of manifest){const bytes=fs.readFileSync(path.join(root,'assets/vendor/local',entry.file));if(crypto.createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw Error(`Dependency hash mismatch: ${entry.file}`);}
let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
for(const entry of manifest)html=html.replaceAll(entry.url,`assets/vendor/local/${entry.file}`);
html=html.replace('https://cdn.tailwindcss.com','assets/vendor/local/tailwind.js');
if(/<(?:script|link)\b[^>]*(?:src|href)=["']https?:/i.test(html))throw Error('External startup dependency remains');
const csp="default-src 'none'; script-src 'self' file: 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' file: 'unsafe-inline'; img-src 'self' file: data: blob:; font-src 'self' file: data:; connect-src 'none'; worker-src 'self' blob:; frame-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'";
html=html.replace('<meta charset="UTF-8">',`<meta charset="UTF-8">\n    <meta http-equiv="Content-Security-Policy" content="${csp}">\n    <meta name="referrer" content="no-referrer">\n    <script src="assets/offline-runtime.js"></script>`);
fs.writeFileSync(path.join(root,'local.html'),html);
console.log('Built local.html with verified local libraries and network blocking.');
