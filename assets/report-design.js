const ReportDesign = (() => {
    function styles() { return `<style>
        @page{size:A4;margin:16mm}
        .report,.proposal-report{font-family:Arial,Helvetica,sans-serif!important;color:#263342!important;background:white!important;max-width:100%!important;width:100%!important;padding:12px 22px!important;border:0!important;box-shadow:none!important}
        .report .cover{color:#263342!important;background:white!important;border:0!important;border-top:3px solid #215a90!important;border-bottom:1px solid #dce2e8!important;padding:22px 0!important;margin:0 0 25px!important}
        .report h1,.report .cover h1{color:#263342!important;font-size:28px!important;letter-spacing:0!important}
        .report .cover p,.report .eyebrow,.report h2,.report h3{color:#215a90!important}
        .report .stamp{border:0!important;background:white!important;color:#687787!important}
        .report .block,.report .table-block,.report figure,.report figure img{border:0!important;border-radius:0!important;box-shadow:none!important;background:white!important;padding:0!important;margin-bottom:20px!important}
        .report h2{border:0!important;border-bottom:1px solid #dce2e8!important;padding:8px 0!important;margin-top:25px!important;letter-spacing:0!important;break-after:avoid}
        .report .summary{display:flex!important;flex-wrap:wrap!important;gap:14px!important;border-bottom:1px solid #dce2e8!important;padding-bottom:16px!important}
        .report .summary>div{flex:1 1 130px!important;border:0!important;background:white!important;border-radius:0!important;padding:6px 0!important}
        .report .summary strong{color:#263342!important;font-size:21px!important;font-weight:500!important}
        .report th{background:#f0f3f6!important;color:#435466!important;border-right:0!important;font-size:10px!important;letter-spacing:0!important;text-transform:none!important}
        .report td{font-size:10px!important;line-height:1.45!important;border-bottom:1px solid #e5e9ed!important}
        .report table{table-layout:auto!important}.report .isin-cell{font-size:9px!important;white-space:normal!important;overflow:visible!important}
        .report .badge{background:#eef2f6!important;color:#263342!important}
        ${FinancialVisuals.quartiles.map((q,i)=>`.report .q${i+1},.proposal-report .q${i+1}{background:${q.background}!important;color:${q.color}!important}`).join('')}
        .report .report-good,.report .good{color:#247354!important}.report .report-bad,.report .bad{color:#b34b50!important}
        .report .analysis-note,.report .method-note{background:white!important;border:0!important;padding:6px 0!important;color:#687787!important}
        .report .indented{text-indent:0!important;text-align:left!important}.report p{font-size:11px!important;line-height:1.65!important}
        .report footer{border-top:1px solid #dce2e8!important;color:#687787!important;padding-top:12px!important;font-size:10px!important}
        .report .block,.report .table-block{break-inside:auto!important}.report tr,.report figure{break-inside:avoid}.report thead{display:table-header-group}
        .report .report-chart-page{break-before:page!important}.report .report-chart-page img{max-height:none!important;width:100%!important}.report .report-chart-page figure{margin:0!important}
        .report .compact-scoring-table{table-layout:fixed!important;width:100%!important}.report .compact-scoring-table :is(th,td){font-size:8px!important;line-height:1.15!important;padding:3px 2px!important;overflow-wrap:break-word}.report .compact-scoring-table .isin-cell{font-size:8px!important;white-space:nowrap!important}
        .manager-report{max-width:1120px!important}.manager-report .wide-report-table{table-layout:fixed!important;width:100%!important}.manager-report .wide-report-table :is(th,td){font-size:9px!important;padding:5px 3px!important;overflow-wrap:break-word}.manager-report .wide-report-table .num{white-space:nowrap}
        @media print{body{background:white!important;margin:0!important}.report{padding:0!important}.report .wide-report-table{font-size:9px!important}}
        </style>`; }
    function metadata(snapshot) {
        const settings = snapshot.settings;
        const policy = {period:'cada observacion',monthly:'mensual',hold:'comprar y mantener'}[settings.rebalance];
        const coverage = snapshot.kind === 'proposal' ? `Cobertura TER origen ${(snapshot.coverage.currentTer * 100).toFixed(1)}%, propuesta ${(snapshot.coverage.proposedTer * 100).toFixed(1)}%.` : `Cobertura TER resuelta ${(snapshot.coverage.proposedTer * 100).toFixed(1)}%.`;
        const assumptions = snapshot.kind === 'proposal' ? 'El ahorro TER supone AUM constante; el efecto compuesto supone rentabilidad bruta cero, sin impuestos ni costes de transaccion. Este analisis inicial no es un backtest de la cartera construida.' : snapshot.kind === 'aggregate' ? 'El agregado comercial no implica un backtest consolidado.' : `Backtest: rebalanceo ${policy}, coste ${settings.costBps} pb por volumen negociado; libre de riesgo ${(settings.riskFreeAnnual * 100).toFixed(2)}% anual. Escenarios: ${settings.simulation.method === 'bootstrap' ? 'bootstrap por bloques' : 'lognormal independiente'}, semilla ${settings.simulation.seed}, shock inicial ${(settings.simulation.initialShock * 100).toFixed(0)}%. Son hipotesis de simulacion, no predicciones.`;
        return `<p class="method-note">${snapshot.reportOptions?.final ? 'FINAL' : 'BORRADOR'} · Expediente ${snapshot.id} · Revision ${snapshot.revision} · Motor ${snapshot.engine} · ${snapshot.createdAt}. ${coverage} Score orientativo, no comparable entre categorias.</p><p class="method-note">${assumptions}</p>`;
    }
    function prepare(html, snapshot) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const landscape=Boolean(doc.querySelector('.manager-report,.compact-scoring-table'));
        const blocks=(snapshot.kind==='proposal'?snapshot.reportConfiguration?.initial:snapshot.kind==='aggregate'?snapshot.reportConfiguration?.manager:null)?.blocks||{};
        if (!snapshot.reportOptions.charts) doc.querySelectorAll('figure').forEach(el => el.remove());
        if (!snapshot.reportOptions.details) doc.querySelectorAll('section').forEach(el => {
            if (/analisis de sustitucion|detalle por|desglose por/i.test(el.querySelector('h2')?.textContent || '')) el.remove();
        });
        // Split flat wide tables into printable groups, repeating their identifying columns.
        doc.querySelectorAll('table').forEach(table => {
            if(landscape)return;
            const rows = [...table.rows], count = rows[0]?.cells.length || 0;
            if (count <= 8 || rows.some(row => row.cells.length !== count || [...row.cells].some(cell => cell.colSpan !== 1 || cell.rowSpan !== 1))) return;
            const parts = Math.ceil((count - 2) / 6);
            for (let part = 0; part < parts; part++) {
                const copy = table.cloneNode(true);
                copy.querySelectorAll('colgroup,caption').forEach(el => el.remove());
                [...copy.rows].forEach(row => [...row.cells].forEach((cell, index) => { if (index >= 2 && (index < 2 + part * 6 || index >= 8 + part * 6)) cell.remove(); }));
                copy.createCaption().textContent = `Parte ${part + 1} de ${parts}`;
                table.before(copy);
            }
            table.remove();
        });
        doc.head.insertAdjacentHTML('beforeend', styles());
        if(landscape)doc.head.insertAdjacentHTML('beforeend','<style>@page{size:A4 landscape;margin:12mm}</style>');
        const footer = doc.querySelector('footer') || doc.body.appendChild(doc.createElement('footer'));
        const declaredOrigins = (snapshot.proposal || []).filter(r => r.current?.originSource);
        if (blocks.sources!==false&&declaredOrigins.length) {
            const section = doc.createElement('section'); section.className = 'block';
            const heading = doc.createElement('h2'); heading.textContent = 'Origen de los datos: proxies y declaraciones'; section.append(heading);
            declaredOrigins.forEach(row => {
                const p = doc.createElement('p'), source = row.current.originSource;
                p.textContent = `${row.isin} - ${row.current.name}: ${source.mode === 'proxy' ? `metricas estimadas con el proxy ${source.proxyIsin} (${source.proxyName}). No son datos observados del fondo original ni acreditan una clase equivalente.` : 'datos introducidos manualmente por el usuario, no verificados contra el universo.'}`;
                section.append(p);
            });
            footer.before(section);
        }
        const notes=new DOMParser().parseFromString(metadata(snapshot),'text/html');
        if(blocks.sources!==false)footer.insertAdjacentHTML('beforeend',notes.body.children[0]?.outerHTML||'');
        if(blocks.methodology!==false)footer.insertAdjacentHTML('beforeend',notes.body.children[1]?.outerHTML||'');
        if(blocks.methodology===false)doc.querySelectorAll('.method-note:not(.chart-data-note)').forEach(el=>{if(!footer.contains(el))el.remove();});
        if(blocks.sources!==false){
            const labels={universe:'Universo',approved:'Aprobados',portfolio:'Cartera',aggregate:'Posiciones agregadas'};
            const files=Object.entries(snapshot.source||{}).filter(([,name])=>name).map(([key,name])=>`${labels[key]||key}: ${name}`);
            if(files.length){const p=doc.createElement('p');p.textContent=files.join(' · ');footer.append(p);}
        }
        return '<!DOCTYPE html>' + doc.documentElement.outerHTML;
    }
    async function printHtml(html) {
        const frame = document.createElement('iframe');
        frame.title = 'Informe para imprimir';
        frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1000px;height:1000px;border:0';
        document.body.appendChild(frame);
        await new Promise(resolve => { frame.onload = resolve; frame.srcdoc = html.replace('</head>', styles() + '</head>'); });
        const images = [...frame.contentDocument.images];
        await Promise.all(images.map(img => img.complete ? Promise.resolve() : new Promise(resolve => { img.onload = resolve; img.onerror = resolve; })));
        const remove = () => frame.remove();
        frame.contentWindow.addEventListener('afterprint', remove, { once: true });
        frame.contentWindow.focus(); frame.contentWindow.print();
        setTimeout(remove, 120000);
    }
    function preview(target, html) {
        if (!target) return;
        target.classList.remove('hidden');
        const frame = document.createElement('iframe'); frame.className = 'workspace-report-preview'; frame.title = 'Vista previa del informe';
        frame.setAttribute('sandbox', 'allow-same-origin');
        frame.onload = () => { frame.style.height = Math.max(600, frame.contentDocument.documentElement.scrollHeight + 25) + 'px'; };
        frame.srcdoc = html.replace('</head>', styles() + '</head>'); target.replaceChildren(frame);
    }
    let pdfLibraries;
    function loadScript(src) {
        return new Promise((resolve,reject) => {
            const script = document.createElement('script'); script.src = src;
            const timer = setTimeout(() => { script.remove(); reject(new Error('Tiempo agotado al cargar el exportador PDF.')); },30000);
            script.onload = () => { clearTimeout(timer); resolve(); };
            script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error('No se pudo cargar el exportador PDF. Revisa la conexion.')); };
            document.head.append(script);
        });
    }
    async function downloadPdf(html, filename) {
        try {
            if (!pdfLibraries) pdfLibraries = (async () => {
                await loadScript('https://cdn.jsdelivr.net/npm/pdfmake@0.2.20/build/pdfmake.min.js');
                await loadScript('https://cdn.jsdelivr.net/npm/pdfmake@0.2.20/build/vfs_fonts.js');
                await loadScript('https://cdn.jsdelivr.net/npm/html-to-pdfmake@2.5.33/browser.js');
            })().catch(error => { pdfLibraries = null; throw error; });
            await pdfLibraries;
            const doc = new DOMParser().parseFromString(html,'text/html');
            const landscape=Boolean(doc.querySelector('.manager-report,.compact-scoring-table'));
            const pageWidth=landscape?841.89:595.28,usableWidth=pageWidth-(landscape?60:84);
            // Preserve the report's column proportions before removing HTML-only styles.
            doc.querySelectorAll('table').forEach(table=>{
                const columns=[...table.querySelectorAll('colgroup col')].map(col=>parseFloat(col.style.width));
                if(columns.length&&columns.every(n=>Number.isFinite(n)&&n>0))table.dataset.pdfWidths=JSON.stringify(columns);
            });
            doc.querySelectorAll('script,style,colgroup').forEach(el => el.remove());
            doc.body.querySelectorAll('*').forEach(el => { el.removeAttribute('style'); el.removeAttribute('width'); el.removeAttribute('height'); });
            FinancialVisuals.quartiles.forEach((q,i)=>doc.querySelectorAll(`.q${i+1}`).forEach(el=>el.setAttribute('style',`background-color:${q.background};color:${q.color}`)));
            for (const [selector,color] of [['.report-good,.good',FinancialVisuals.colors.positive],['.report-bad,.bad',FinancialVisuals.colors.negative]]) doc.querySelectorAll(selector).forEach(el=>el.style.color=color);
            doc.querySelectorAll('.summary').forEach(summary => {
                const cells = [...summary.children].filter(el => el.querySelector('strong'));
                if (!cells.length) return;
                const table = doc.createElement('table'); table.className = 'pdf-kpis';
                for (let i=0;i<cells.length;i+=4) {
                    const row = table.insertRow();
                    for (let j=0;j<4;j++) { const cell=row.insertCell(), item=cells[i+j]; if (!item) continue;
                        const label=doc.createElement('div'); label.textContent=item.querySelector('span')?.textContent || '';
                        const value=doc.createElement('strong'); value.textContent=item.querySelector('strong').textContent;
                        cell.append(label,doc.createElement('br'),value);
                    }
                }
                summary.replaceWith(table);
            });
            doc.querySelectorAll('img').forEach(el => el.setAttribute('data-pdfmake',JSON.stringify({fit:[usableWidth,el.closest('.report-chart-page')?(landscape?360:620):landscape?360:310],margin:[0,6,0,12]})));
            doc.querySelectorAll('.report-chart-page').forEach(el=>el.setAttribute('data-pdfmake',JSON.stringify({pageBreak:'before'})));
            doc.querySelectorAll('.report-keep-together').forEach(el=>el.setAttribute('data-pdfmake',JSON.stringify({unbreakable:true})));
            const tableWidths=[...doc.querySelectorAll('table')].map(table=>({widths:table.dataset.pdfWidths?JSON.parse(table.dataset.pdfWidths):null,compact:table.classList.contains('compact-scoring-table')}));
            doc.querySelectorAll('section,header,footer,figure,figcaption').forEach(el => { const div=doc.createElement('div'); for(const attr of el.attributes)div.setAttribute(attr.name,attr.value); div.append(...el.childNodes); el.replaceWith(div); });
            // Source-code indentation is not report content or vertical spacing.
            const walker=doc.createTreeWalker(doc.body,4),indentation=[];
            while(walker.nextNode())if(/^\s+$/.test(walker.currentNode.textContent)&&/[\r\n]/.test(walker.currentNode.textContent))indentation.push(walker.currentNode);
            indentation.forEach(node=>node.remove());
            const content = htmlToPdfmake(doc.body.innerHTML,{window,defaultStyles:{h1:{fontSize:23,color:'#263342',bold:true,margin:[0,6,0,14]},h2:{fontSize:13,color:'#215a90',bold:true,margin:[0,16,0,7]},h3:{fontSize:11,color:'#215a90',bold:true},p:{margin:[0,4,0,8]},th:{bold:true,fillColor:'#edf1f5'}}});
            function format(node) {
                if (!node || typeof node !== 'object') return;
                if (Array.isArray(node)) { node.forEach(format); return; }
                if (node.table) {
                    const count=node.table.body[0].length,spec=tableWidths.shift()||{},weights=spec.widths;
                    const available=usableWidth-count*6;
                    node.table.widths = weights?.length===count?weights.map(w=>available*w/weights.reduce((a,b)=>a+b,0)):Array(count).fill('*');
                    node.table.dontBreakRows = true;node.table.headerRows=1;node.table.keepWithHeaderRows=1;
                    node.layout = {hLineWidth:(i)=>i===1?0.7:0.35,vLineWidth:()=>0,hLineColor:()=>'#dce2e8',paddingLeft:()=>3,paddingRight:()=>3,paddingTop:()=>spec.compact?3:5,paddingBottom:()=>spec.compact?3:5};
                    const fontSize = spec.compact?7.5:landscape?8:count > 6 ? 7 : 8;
                    const sizeCells = cell => { if (!cell || typeof cell !== 'object') return; if (Array.isArray(cell)) return cell.forEach(sizeCells); cell.fontSize=fontSize; if(cell.text && typeof cell.text === 'object') sizeCells(cell.text); if(cell.stack) sizeCells(cell.stack); };
                    node.table.body.forEach(sizeCells);
                }
                Object.values(node).forEach(format);
            }
            format(content);
            const definition = {pageSize:'A4',pageOrientation:landscape?'landscape':'portrait',pageMargins:landscape?[30,32,30,36]:[42,40,42,45],defaultStyle:{font:'Roboto',fontSize:9,color:'#263342',lineHeight:1.2},content,footer:(page,pages)=>({text:`${page} / ${pages}`,alignment:'right',margin:[42,12,42,0],fontSize:8,color:'#687787'})};
            await new Promise(resolve => pdfMake.createPdf(definition).download(filename,resolve));
            return true;
        } catch(error) { alert(`No se ha descargado el PDF: ${error.message}`); return false; }
    }
    return { styles, metadata, prepare, printHtml, preview, downloadPdf };
})();
