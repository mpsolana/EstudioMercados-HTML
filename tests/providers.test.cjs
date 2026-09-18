const test=require('node:test'),assert=require('node:assert/strict');
function response(){return {code:0,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(body){this.body=body;return this;},end(){return this;}};}
test('providers reject unsupported methods and cross-origin requests',async()=>{
 const {default:yahoo}=await import('../api/yahoo.js');
 const r=response();await yahoo({method:'POST',headers:{host:'example.com'},query:{}},r);assert.equal(r.code,405);
 const foreign=response();await yahoo({method:'GET',headers:{host:'example.com',origin:'https://other.example'},query:{}},foreign);assert.equal(foreign.code,403);
});
test('Yahoo validates ranges, symbols and intervals before fetching',async()=>{
 const {default:yahoo}=await import('../api/yahoo.js');const r=response();
 await yahoo({method:'GET',headers:{},query:{ticker:'SPY&bad=true',period1:'1',period2:'2'}},r);assert.equal(r.code,400);
});
test('OpenFIGI validates mapping batches',async()=>{
 const {default:figi}=await import('../api/openfigi.js');const r=response();await figi({method:'POST',headers:{},body:'{invalid'},r);assert.equal(r.code,400);
});
