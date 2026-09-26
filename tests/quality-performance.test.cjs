const test=require('node:test'),assert=require('node:assert/strict'),rolling=require('../assets/rolling-core.js'),quality=require('../assets/quality-core.js'),visuals=require('../assets/financial-visuals.js');
test('quality uses exact, non-overlapping boundaries without rounding or imputed missing data',()=>{
 assert.deepEqual([0,.99999,1,1.9999,2,2.9999,3,3.99999,4].map(quality.rating),[1,1,2,2,3,3,4,4,5]);
 for(const n of [NaN,null,undefined,-.1,4.0001,Infinity])assert.equal(quality.rating(n),null);
 assert.match(quality.methodology,/no recalcula/);assert.equal(quality.label(4),'★★★★★');
});
test('linear rolling calculations equal direct windows including flat and negative markets',()=>{
 const a=Array.from({length:1600},(_,i)=>Math.sin(i*.37)*.03+.001),b=a.map((r,i)=>r*.3+Math.cos(i)*.01),series=[{price:100}];a.forEach(r=>series.push({price:series.at(-1).price*(1+r)}));
 for(const width of [1,12,252,1000]){
  const dd=rolling.drawdowns(series,width),compound=rolling.compounded(a,width),corr=rolling.correlations(a,b,width);
  for(let i=0;i<compound.length;i++){
   const expected=a.slice(i,i+width).reduce((v,r)=>v*(1+r),1)-1;assert.ok(Math.abs(compound[i]-expected)<1e-10);
   let peak=series[i].price,mdd=0;for(let j=i;j<=i+width;j++){peak=Math.max(peak,series[j].price);mdd=Math.min(mdd,series[j].price/peak-1);}assert.ok(Math.abs(dd[i]-mdd)<1e-12);
   if(width>1){const x=a.slice(i,i+width),y=b.slice(i,i+width),mx=x.reduce((s,v)=>s+v,0)/width,my=y.reduce((s,v)=>s+v,0)/width;let xy=0,xx=0,yy=0;for(let j=0;j<width;j++){xy+=(x[j]-mx)*(y[j]-my);xx+=(x[j]-mx)**2;yy+=(y[j]-my)**2;}assert.ok(Math.abs(corr[i]-xy/Math.sqrt(xx*yy))<1e-8);}
  }
 }
 assert.ok(rolling.correlations([1,1,1],[2,2,2],2).every(Number.isNaN));assert.deepEqual(rolling.compounded([.1,-1,.2],2),[-1,-1]);
});
test('visual thinning preserves endpoints and extrema without altering calculation series',()=>{
 const x=Array.from({length:10000},(_,i)=>i),y=x.map(i=>Math.sin(i));y[4321]=50;y[6543]=-60;
 const trace={x,y,mode:'lines',customdata:x.map(String)},thin=visuals.thinLine(trace);
 assert.ok(thin.y.length<=1602);assert.equal(thin.x[0],0);assert.equal(thin.x.at(-1),9999);assert.ok(thin.y.includes(50)&&thin.y.includes(-60));assert.equal(trace.y.length,10000);assert.equal(thin.customdata[thin.x.indexOf(4321)],'4321');
});
