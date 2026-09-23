(function(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.FinancialVisuals = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    const colors = Object.freeze({blue:'#204f78', gray:'#78828c', positive:'#247354', negative:'#b34b50', neutral:'#697580', ink:'#263342'});
    const palette = ['#204f78','#78828c','#38889a','#846b91','#ab8044','#51786b','#9a6375','#547bac','#454b53','#8d9470','#986c50','#427076'];
    const sequential = [[0,'#edf2f6'],[.33,'#bed1e0'],[.66,'#7199b8'],[1,colors.blue]];
    const diverging = [[0,'#d99094'],[.5,'#ffffff'],[1,'#83b7a2']];
    const correlation = [[0,'#b0b8c1'],[.5,'#ffffff'],[1,'#7ca5c6']];
    const quartiles = [{background:'#204f78',color:'#ffffff'},{background:'#a7c2d7',color:'#203b50'},{background:'#dde6ed',color:'#34495a'},{background:'#f0f2f4',color:'#536170'}];
    // Explicit policies distinguish returns from prices, frequencies, and risk measurements.
    const signedBars = new Set(['weeklyChart','monthlyChart','quarterlyChart','vixBarChart','oilBarChart','ratesBarChart','dipBarChart','athForwardChart','rollingAnnualizedChart','rollingTotalChart','annualDistChart']);
    const returnHeatmaps = new Set(['monthlyHeatmapChart','ratesHeatmapChart']);
    const correlationHeatmaps = new Set(['portfolioCorrMatrixChart','corrMatrixChart']);
    const dashStyles = ['solid','dash','dot','dashdot','longdash','longdashdot'];
    function seriesColor(index) { return palette[index % palette.length]; }
    function sliceColor(index) {
        const base=seriesColor(index), amount=Math.min(.45,Math.floor(index/palette.length)*.22);
        return '#'+[1,3,5].map(start=>Math.round(parseInt(base.slice(start,start+2),16)*(1-amount)+255*amount).toString(16).padStart(2,'0')).join('');
    }
    function signColor(value) { return !Number.isFinite(value) || value === 0 ? colors.neutral : value > 0 ? colors.positive : colors.negative; }
    function extent(values) { return values.reduce((max,value)=>Number.isFinite(value)?Math.max(max,Math.abs(value)):max,1e-9); }
    function alpha(color, opacity) {
        return `rgba(${parseInt(color.slice(1,3),16)},${parseInt(color.slice(3,5),16)},${parseInt(color.slice(5,7),16)},${opacity})`;
    }
    function prepare(id, data, layout = {}) {
        const remap = new Map(), assignments = new Map(), ordinals = new Map();
        let next = 0;
        const auxiliary = trace => (trace.showlegend === false && !trace.name) || trace.line?.width === 0 || /rgba\([^)]*,\s*0\)$/.test(trace.line?.color || '');
        const oldColor = trace => trace.line?.color || (typeof trace.marker?.color === 'string' ? trace.marker.color : null);
        data.forEach((trace,index) => {
            if (auxiliary(trace) || trace.type === 'heatmap' || trace.type === 'pie') return;
            let color;
            if (trace.meta?.financialRole==='origin') color=colors.blue;
            else if (trace.meta?.financialRole==='proposal') color=colors.gray;
            else if (/^(Universo\b|Peer group\b)/i.test(trace.name || '')) color = '#b6c4cf';
            else if (/^Media\b/i.test(trace.name || '') && trace.marker?.symbol === 'diamond') color = '#454b53';
            else { ordinals.set(index,next); color = seriesColor(next++); }
            assignments.set(index,color);
            if (oldColor(trace) && !remap.has(oldColor(trace))) remap.set(oldColor(trace),color);
        });
        const traces = data.map((source,index) => {
            if(source.meta?.financialRole==='connector')return {...source,line:{...source.line}};
            if(source.type==='sankey')return {...source,node:{...source.node},link:{...source.link}};
            const t = {...source, line:{...source.line}, marker:{...source.marker}, textfont:{...source.textfont}};
            const preceding = index > 0 && oldColor(source) === oldColor(data[index-1]) ? assignments.get(index-1) : null;
            const color = assignments.get(index) || preceding || remap.get(oldColor(source)) || colors.blue;
            if (t.type === 'heatmap') {
                t.colorscale = correlationHeatmaps.has(id) ? correlation : returnHeatmaps.has(id) ? diverging : sequential;
                t.reversescale = false;
                t.textfont.color = colors.ink;
                if (correlationHeatmaps.has(id)) { t.zmin=-1; t.zmax=1; t.zmid=0; }
                if (returnHeatmaps.has(id)) {
                    const limit = extent((t.z || []).flat());
                    t.zmin=-limit; t.zmax=limit; t.zmid=0;
                }
                return t;
            }
            if (t.type === 'pie') {
                t.marker.colors = (t.labels || t.values || []).map((_,i)=>sliceColor(i));
                t.marker.line = {color:'#ffffff',width:1};
                t.sort = false;
                return t;
            }
            // Invisible boundaries must stay invisible: they define confidence bands.
            if (!/rgba\([^)]*,\s*0\)$/.test(source.line?.color || '')) t.line.color = color;
            if (next > palette.length && !source.line?.dash) t.line.dash = dashStyles[Math.floor((ordinals.get(index)||0)/palette.length)%dashStyles.length];
            const numericScale = source.marker?.colorscale && Array.isArray(source.marker?.color);
            if (numericScale) {
                const returns = id === 'assetClassScreenerScatter';
                t.marker.colorscale = returns ? diverging : sequential;
                if (returns) {
                    const limit = extent(source.marker.color);
                    t.marker.cmin=-limit; t.marker.cmax=limit; t.marker.cmid=0;
                }
            } else {
                t.marker.color = id === 'bestDaysBarChart' ? (source.y || []).map((_,i)=>seriesColor(i)) : color;
            }
            if (source.marker?.line) t.marker.line = {...source.marker.line,color};
            if (source.fillcolor) {
                const opacity = Number(source.fillcolor.match(/,\s*([\d.]+)\)$/)?.[1]);
                t.fillcolor = alpha(color,Number.isFinite(opacity) && opacity > 0 ? Math.min(opacity,.45) : .13);
            }
            t.textfont.color = color;
            if (t.type === 'bar') t.insidetextfont = {...source.insidetextfont,color:'#ffffff'};
            if (signedBars.has(id) && t.type === 'bar') {
                t.marker.color = (t.orientation === 'h' ? t.x : t.y).map(signColor);
                const peers = data.filter(trace=>trace.type==='bar');
                if (peers.length > 1) t.marker.pattern = {shape:['','/','x','-'][peers.indexOf(source)%4],solidity:.18};
                t.textfont.color = colors.ink;
            }
            if (id === 'drawdownChart' && index === 0) {
                t.line.color=colors.negative; t.fillcolor=alpha(colors.negative,.12);
            }
            if (id === 'annualDistChart' && index === 1) { t.marker.color=colors.negative; t.marker.symbol='diamond'; t.textfont.color=colors.negative; }
            return t;
        });
        const styled = {...layout, colorway:palette.slice(), paper_bgcolor:'#ffffff', plot_bgcolor:'#ffffff', font:{...layout.font,family:'Arial, Helvetica, sans-serif',color:colors.ink}};
        for (const key of Object.keys(layout).filter(key=>/^[xy]axis\d*$/.test(key))) {
            styled[key] = {...layout[key],gridcolor:'#e5e9ed',zerolinecolor:'#a4afb9',linecolor:'#c8d0d8',tickfont:{...layout[key].tickfont,color:colors.ink}};
        }
        if (layout.annotations) styled.annotations=layout.annotations.map(a=>({...a,font:{...a.font,color:remap.get(a.font?.color)||colors.ink},...(a.bordercolor ? {bordercolor:remap.get(a.bordercolor)||'#c8d0d8'} : {})}));
        if (layout.shapes) styled.shapes=layout.shapes.map(s=>({...s,line:{...s.line,color: ['drawdownChart','returnsHistogram'].includes(id) ? colors.negative : colors.gray}}));
        return {data:traces,layout:styled};
    }
    function newPlot(target, data, layout, config) {
        const styled = prepare(typeof target === 'string' ? target : target.id, data, layout);
        return globalThis.Plotly.newPlot(target,styled.data,styled.layout,config);
    }
    return {colors,palette,sequential,diverging,correlation,quartiles,seriesColor,signColor,alpha,prepare,newPlot};
});
