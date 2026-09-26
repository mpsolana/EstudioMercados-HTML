(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RollingCore=api;})(globalThis,function(){
    function compounded(values,width){
        if(width<1||width>values.length)return [];
        const logs=[0],zero=[0],bad=[0];
        for(const r of values){logs.push(logs.at(-1)+(Number.isFinite(r)&&r>-1?Math.log1p(r):0));zero.push(zero.at(-1)+(r===-1));bad.push(bad.at(-1)+(!Number.isFinite(r)||r< -1));}
        return Array.from({length:values.length-width+1},(_,i)=>bad[i+width]!==bad[i]?NaN:zero[i+width]!==zero[i]?-1:Math.expm1(logs[i+width]-logs[i]));
    }
    function correlations(a,b,width){
        const out=[],length=Math.min(a.length,b.length);if(width<2||width>length)return out;
        const ax=a[0],by=b[0];let sx=0,sy=0,xx=0,yy=0,xy=0;
        const add=(i,sign)=>{const x=a[i]-ax,y=b[i]-by;sx+=sign*x;sy+=sign*y;xx+=sign*x*x;yy+=sign*y*y;xy+=sign*x*y;};
        for(let i=0;i<length;i++){
            add(i,1);if(i>=width)add(i-width,-1);if(i<width-1)continue;
            if(i%512===0){sx=sy=xx=yy=xy=0;for(let j=i-width+1;j<=i;j++)add(j,1);}
            const vx=xx-sx*sx/width,vy=yy-sy*sy/width,den=Math.sqrt(Math.max(0,vx)*Math.max(0,vy));
            out.push(den>0?Math.max(-1,Math.min(1,(xy-sx*sy/width)/den)):NaN);
        }
        return out;
    }
    // Two-stack queue with an ordered drawdown summary: each price is merged a constant number of times.
    function drawdowns(series,width){
        const front=[],back=[],out=[];
        const merge=(a,b)=>!a?b:!b?a:{max:Math.max(a.max,b.max),min:Math.min(a.min,b.min),dd:Math.min(a.dd,b.dd,b.min/a.max-1)};
        const push=value=>back.push({value,summary:merge(back.at(-1)?.summary,value)});
        const shift=()=>{if(!front.length)while(back.length){const value=back.pop().value;front.push({value,summary:merge(value,front.at(-1)?.summary)});}front.pop();};
        for(let i=0;i<series.length;i++){
            const price=series[i].price;push({min:price,max:price,dd:0});if(i>width)shift();
            if(i>=width)out.push(merge(front.at(-1)?.summary,back.at(-1)?.summary).dd);
        }
        return out;
    }
    return {compounded,correlations,drawdowns};
});
