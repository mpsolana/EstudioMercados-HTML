// Run only when updating dependencies. Downloads public libraries, never application data.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../assets/vendor/local');
const sources={
 'tailwind.js':'https://cdn.tailwindcss.com/3.4.17',
 'plotly.min.js':'https://cdn.jsdelivr.net/npm/plotly.js@2.27.0/dist/plotly.min.js',
 'solver.js':'https://cdn.jsdelivr.net/npm/javascript-lp-solver@0.4.24/prod/solver.js',
 'fontawesome/css/all.min.css':'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
 'math.min.js':'https://cdnjs.cloudflare.com/ajax/libs/mathjs/11.8.0/math.min.js',
 'xlsx.full.min.js':'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
 'html2pdf.bundle.min.js':'https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js',
 'html-docx.min.js':'https://cdn.jsdelivr.net/npm/html-docx-js@0.3.1/dist/html-docx.min.js',
 'katex/katex.min.css':'https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css',
 'katex/katex.min.js':'https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.js',
 'katex/auto-render.min.js':'https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/contrib/auto-render.min.js',
 'pdfmake.min.js':'https://cdn.jsdelivr.net/npm/pdfmake@0.2.20/build/pdfmake.min.js',
 'vfs_fonts.js':'https://cdn.jsdelivr.net/npm/pdfmake@0.2.20/build/vfs_fonts.js',
 'html-to-pdfmake.js':'https://cdn.jsdelivr.net/npm/html-to-pdfmake@2.5.33/browser.js'
};
async function main(){
 const manifest=[];
 async function get(name,url){
  const res=await fetch(url);if(!res.ok)throw Error(`${res.status} ${url}`);
  const data=Buffer.from(await res.arrayBuffer()),target=path.join(root,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,data);
  manifest.push({file:name,url,sha256:crypto.createHash('sha256').update(data).digest('hex')});
  if(name.endsWith('.css'))for(const match of data.toString().matchAll(/url\(["']?([^\s)'"?#]+)[^)]*\)/g)){
   if(/^(data:|https?:)/.test(match[1]))throw Error('Unexpected external font');
   const child=path.posix.normalize(path.posix.join(path.posix.dirname(name),match[1]));
   if(!manifest.some(item=>item.file===child))await get(child,new URL(match[1],url).href);
  }
 }
 for(const [name,url] of Object.entries(sources))await get(name,url);
 const packages={tailwindcss:'3.4.17','plotly.js':'2.27.0','javascript-lp-solver':'0.4.24','@fortawesome/fontawesome-free':'6.4.0',mathjs:'11.8.0',xlsx:'0.18.5','html2pdf.js':'0.10.1','html-docx-js':'0.3.1',katex:'0.16.8',pdfmake:'0.2.20','html-to-pdfmake':'2.5.33'};
 for(const [name,version]of Object.entries(packages)){
  let found=false;
  for(const license of ['LICENSE','LICENSE.txt','LICENSE.md']){
   const url=`https://cdn.jsdelivr.net/npm/${name}@${version}/${license}`;
   if(!(await fetch(url,{method:'HEAD'})).ok)continue;
   await get('licenses/'+name.replace(/[^a-z0-9.-]/gi,'_')+'.txt',url);found=true;break;
  }
  if(!found)throw Error('License missing: '+name);
 }
 fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 console.log(`Bundled ${manifest.length} public dependencies.`);
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
