(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.QualityCore=api;})(globalThis,function(){
    const methodology='Calidad: eficiencia de la rentabilidad ajustada al riesgo, teniendo en cuenta momentum e histórico, según el score del ranking importado. Conversión interna, sin redondear: [0,1) = 1 estrella; [1,2) = 2; [2,3) = 3; [3,4) = 4; 4 exacto = 5. Sin dato o fuera de 0–4: sin clasificación. La calidad de cartera se obtiene del score ponderado sobre el peso con datos, no de la media de estrellas. Las categorías y coberturas distintas no son directamente comparables. Se mantienen los ajustes manuales declarados. Esta escala no recalcula el ranking, no es una calificación Morningstar ni garantiza resultados futuros; la fórmula y los pesos del score corresponden al proveedor del ranking.';
    function rating(value){return Number.isFinite(value)&&value>=0&&value<=4?Math.floor(value)+1:null;}
    function label(value){const n=rating(value);return n?'★'.repeat(n)+'☆'.repeat(5-n):'Sin clasificación';}
    function html(value){return `<span class="quality-rating" title="Score técnico: ${Number.isFinite(value)?value:'sin dato'}" aria-label="Calidad ${rating(value)||'sin clasificación'}${rating(value)?' de 5':''}">${label(value)}</span>`;}
    function decorateReport(doc){
        const convert=cell=>{const text=cell?.textContent.trim();if(cell&&/^-?\d+(?:[.,]\d+)?$/.test(text))cell.textContent=label(Number(text.replace(',','.')));};
        for(const table of doc.querySelectorAll('table')){
            const headers=[...(table.rows[0]?.cells||[])],indices=headers.map((h,i)=>/score|scoring|calidad/i.test(h.textContent)&&!/variaci|delta|Δ|diferencia/i.test(h.textContent)?i:-1).filter(i=>i>=0);
            for(const row of [...table.rows].slice(1)){
                indices.forEach(i=>convert(row.cells[i]));
                if(/^(score|calidad)( ponderado)?$/i.test(row.cells[0]?.textContent.trim()||''))for(let i=1;i<row.cells.length;i++)if(!/variaci|datos|cobertura|peers|muestras|diferencia|Δ/i.test(headers[i]?.textContent||''))convert(row.cells[i]);
            }
        }
        for(const item of doc.querySelectorAll('.summary>div')){const name=item.querySelector('span')?.textContent||'';if(/score|calidad/i.test(name)&&!/variaci|mejora|delta|Δ/i.test(name))convert(item.querySelector('strong'));}
        const walker=doc.createTreeWalker(doc.body,4),texts=[];while(walker.nextNode())texts.push(walker.currentNode);
        for(const node of texts){if(node.parentElement?.closest('script,style'))continue;if(/\bscore\b|scoring/i.test(node.textContent))node.textContent=node.textContent.replace(/scoring/gi,'Calidad').replace(/\bscore\b(?! técnico)/gi,'Calidad');}
        const foot=doc.createElement('p');foot.className='quality-methodology';foot.textContent=methodology;(doc.querySelector('footer')||doc.body).append(foot);
    }
    return {rating,label,html,methodology,decorateReport};
});
