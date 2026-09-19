const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const fs=require('node:fs');
(async()=>{
    const output=process.env.BROWSER_OUTPUT_DIR;
    assert.ok(output); fs.mkdirSync(output,{recursive:true});
    const browser=await chromium.launch({headless:true});
    try {
        const page=await browser.newPage({viewport:{width:1440,height:1000}});
        const errors=[];page.on('pageerror',e=>errors.push(e.message));
        await page.route('https://**/*',r=>/tailwindcss|plotly|mathjs|xlsx|font-awesome/.test(r.request().url())?r.continue():r.abort());
        await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
        await page.evaluate(async()=>{
            document.querySelectorAll('.app-section').forEach(s=>s.classList.remove('active'));
            const section=document.createElement('section');section.id='visualVerification';section.className='app-section active';
            section.innerHTML='<div class="container mx-auto p-4"><h2>Verificacion visual con datos sinteticos</h2><div id="visualSamples" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,520px),1fr));gap:24px"></div></div>';
            document.body.append(section);
            const x=Array.from({length:24},(_,i)=>i+1);
            const series=(i)=>({x,y:x.map(v=>100+v*(i+1)/5+Math.sin(v/3+i)*5),name:'Activo '+(i+1),mode:'lines',line:{color:'orange'}});
            const examples=[
                ['singleSample','Una serie',[series(0)]],
                ['pairSample','Dos series',[series(0),series(1)]],
                ['manySample','18 activos',Array.from({length:18},(_,i)=>series(i))],
                ['monthlyChart','Rentabilidad mensual',[{x:['Ene','Feb','Mar','Abr'],y:[3,-2,0,4],type:'bar',text:['+3%','-2%','0%','+4%'],textposition:'auto'}]],
                ['corrMatrixChart','Correlacion',[{type:'heatmap',x:['A','B','C'],y:['A','B','C'],z:[[1,-.8,.2],[-.8,1,0],[.2,0,1]],texttemplate:'%{z:.1f}'}]],
                ['monthlyHeatmapChart','Rentabilidad por periodo',[{type:'heatmap',x:['Ene','Feb','Mar'],y:['2024','2025'],z:[[-8,0,5],[2,-1,10]],texttemplate:'%{z:.1f}%'}]],
                ['pieSample','Composicion',[{type:'pie',labels:Array.from({length:10},(_,i)=>'Activo '+(i+1)),values:[20,16,12,10,9,8,7,7,6,5],hole:.45}]],
                ['bandSample','Intervalo y mediana',[{x,y:x.map(v=>90+v),mode:'lines',showlegend:false,line:{width:0}},{x,y:x.map(v=>110+v),mode:'lines',name:'Intervalo',fill:'tonexty',fillcolor:'rgba(10,20,30,0.15)',line:{width:0}},series(0)]]
            ];
            for(const [id,title,traces] of examples){
                document.getElementById(id)?.remove();
                const element=document.createElement('div');element.id=id;element.style.cssText='min-width:0;height:440px;background:white';document.getElementById('visualSamples').append(element);
                await FinancialVisuals.newPlot(element,traces,{title:{text:title,font:{size:16}},margin:{t:50,b:85,l:50,r:30},legend:{orientation:'h',font:{size:10}},xaxis:{automargin:true},yaxis:{automargin:true}},{responsive:true,displayModeBar:false});
            }
            const table=document.createElement('table');table.id='quartileSample';table.innerHTML='<thead><tr><th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th></tr></thead><tbody><tr>'+[1,2,3,4].map(q=>'<td class="financial-q'+q+'" style="padding:20px">Cuartil '+q+'</td>').join('')+'</tr></tbody>';document.getElementById('visualSamples').append(table);
        });
        for (const width of [1440,390]) {
            await page.setViewportSize({width,height:1000});
            await page.evaluate(async()=>{for(const plot of document.querySelectorAll('#visualVerification .js-plotly-plot')) await Plotly.Plots.resize(plot);});
            await page.screenshot({path:path.join(output,`charts-${width}.png`),fullPage:true});
            const state=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,plots:document.querySelectorAll('#visualVerification .js-plotly-plot').length,paths:document.querySelectorAll('#visualVerification .scatterlayer .js-line').length,single:document.getElementById('singleSample').data[0].line.color,pair:document.getElementById('pairSample').data[1].line.color,signs:document.getElementById('monthlyChart').data[0].marker.color,quartiles:[...document.querySelectorAll('#quartileSample td')].map(td=>getComputedStyle(td).backgroundColor)}));
            assert.equal(state.overflow,false);assert.equal(state.plots,8);assert.ok(state.paths>20);
            assert.equal(state.single,'#204f78');assert.equal(state.pair,'#78828c');
            assert.deepEqual(state.signs,['#247354','#b34b50','#697580','#247354']);
            assert.equal(new Set(state.quartiles).size,4);
        }
        assert.deepEqual(errors,[]);console.log('Charts and quartiles verified at 1440/390 with rendered data.');
    }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
