const test = require('node:test');
const assert = require('node:assert/strict');
const theme = require('../assets/financial-visuals.js');
const trace = (color='red') => ({x:[1,2,3],y:[2,-1,4],name:'Serie',line:{color,width:2}});
test('single and paired series have consistent colours without mutating financial data',()=>{
    const input=[trace(),trace('green')],original=JSON.stringify(input);
    const result=theme.prepare('price',input);
    assert.equal(result.data[0].line.color,theme.colors.blue);
    assert.equal(result.data[1].line.color,theme.colors.gray);
    assert.equal(theme.prepare('other',[trace('orange')]).data[0].line.color,theme.colors.blue);
    assert.equal(JSON.stringify(input),original);
    assert.deepEqual(result.data.map(t=>t.y),input.map(t=>t.y));
});
test('endpoint labels and annotations follow their series; bands remain invisible',()=>{
    const data=[trace(),{x:[3],y:[4],showlegend:false,mode:'markers+text',marker:{color:'red'}},{...trace(),line:{color:'rgba(0,0,0,0)'},fill:'tonexty',fillcolor:'rgba(1,2,3,0.35)'}];
    const result=theme.prepare('price',data,{annotations:[{font:{color:'red'},text:'last'}]});
    assert.equal(result.data[1].marker.color,theme.colors.blue);
    assert.equal(result.layout.annotations[0].font.color,theme.colors.blue);
    assert.equal(result.data[2].line.color,'rgba(0,0,0,0)');
    assert.match(result.data[2].fillcolor,/,0.35\)$/);
});
test('returns use sign, zero/missing are neutral; frequencies and prices do not use sign',()=>{
    const source={type:'bar',x:['a','b','c','d'],y:[10,-4,0,null]};
    assert.deepEqual(theme.prepare('monthlyChart',[source]).data[0].marker.color,[theme.colors.positive,theme.colors.negative,theme.colors.neutral,theme.colors.neutral]);
    assert.equal(theme.prepare('annualDistHistChart',[source]).data[0].marker.color,theme.colors.blue);
    const grouped=theme.prepare('rollingTotalChart',[source,{...source,name:'other'}]).data;
    assert.notEqual(grouped[0].marker.pattern.shape,grouped[1].marker.pattern.shape);
});
test('large comparisons add dashes and keep numeric scales and sizes intact',()=>{
    const result=theme.prepare('massive',Array.from({length:25},(_,i)=>({...trace(),name:String(i)}))).data;
    assert.notEqual(result[0].line.dash,result[12].line.dash);
    const scatter={marker:{color:[1,4,9],size:[10,15,20],colorscale:'Viridis'}};
    const styled=theme.prepare('fundUniverseScreenerScatter',[scatter]).data[0];
    assert.deepEqual(styled.marker.color,[1,4,9]); assert.deepEqual(styled.marker.size,[10,15,20]);
    assert.deepEqual(styled.marker.colorscale,theme.sequential);
});
test('correlation and return heatmaps have different meanings and zero centres',()=>{
    const data=[{type:'heatmap',z:[[-2,0,10]],textfont:{color:'white'}}];
    const corr=theme.prepare('corrMatrixChart',data).data[0];
    const ret=theme.prepare('monthlyHeatmapChart',data).data[0];
    assert.deepEqual(corr.colorscale,theme.correlation);assert.equal(corr.zmin,-1);assert.equal(corr.zmax,1);
    assert.deepEqual(ret.colorscale,theme.diverging);assert.equal(ret.zmin,-10);assert.equal(ret.zmax,10);
    assert.deepEqual(ret.z,data[0].z);
    assert.equal(new Set(theme.quartiles.map(q=>q.background)).size,4);
});
test('every application chart uses the shared renderer',()=>{
    const html=require('node:fs').readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
    assert.equal(/Plotly\.(newPlot|react)\(/.test(html),false);
    assert.ok((html.match(/FinancialVisuals.newPlot\(/g)||[]).length>50);
});
test('large pies extend tones and repeated old colours do not detach endpoint labels',()=>{
    const pie=theme.prepare('pie',[{type:'pie',values:Array(24).fill(1)}]).data[0];
    assert.equal(new Set(pie.marker.colors).size,24);
    const data=[trace('red'),trace('red'),{mode:'markers+text',showlegend:false,marker:{color:'red'}}];
    assert.equal(theme.prepare('price',data).data[2].marker.color,theme.colors.gray);
});
