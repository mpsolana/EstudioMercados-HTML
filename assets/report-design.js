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
        .report .q1,.report .q2,.report .q3,.report .q4,.report .badge{background:#eef2f6!important;color:#263342!important}
        .report .analysis-note,.report .method-note{background:white!important;border:0!important;padding:6px 0!important;color:#687787!important}
        .report .indented{text-indent:0!important;text-align:left!important}.report p{font-size:11px!important;line-height:1.65!important}
        .report footer{border-top:1px solid #dce2e8!important;color:#687787!important;padding-top:12px!important;font-size:10px!important}
        .report .block,.report .table-block{break-inside:auto!important}.report tr,.report figure{break-inside:avoid}.report thead{display:table-header-group}
        @media print{body{background:white!important;margin:0!important}.report{padding:0!important}.report .wide-report-table{font-size:9px!important}}
        </style>`; }
    function metadata(snapshot) {
        const settings = snapshot.settings;
        const policy = {period:'cada observacion',monthly:'mensual',hold:'comprar y mantener'}[settings.rebalance];
        return `<p class="method-note">${snapshot.reportOptions?.final ? 'FINAL' : 'BORRADOR'} · Expediente ${snapshot.id} · Revision ${snapshot.revision} · Motor ${snapshot.engine} · ${snapshot.createdAt}. Cobertura TER origen ${(snapshot.coverage.currentTer * 100).toFixed(1)}%, propuesta ${(snapshot.coverage.proposedTer * 100).toFixed(1)}%. Score orientativo, no comparable entre categorias. El ahorro TER supone AUM constante; el efecto compuesto supone rentabilidad bruta cero, sin impuestos ni costes de transaccion.</p><p class="method-note">Backtest: rebalanceo ${policy}, coste ${settings.costBps} pb por volumen negociado; libre de riesgo ${(settings.riskFreeAnnual * 100).toFixed(2)}% anual. Escenarios: ${settings.simulation.method === 'bootstrap' ? 'bootstrap por bloques' : 'lognormal independiente'}, semilla ${settings.simulation.seed}, shock inicial ${(settings.simulation.initialShock * 100).toFixed(0)}%. Son hipotesis de simulacion, no predicciones. El agregado comercial no implica un backtest consolidado.</p>`;
    }
    function prepare(html, snapshot) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        if (!snapshot.reportOptions.charts) doc.querySelectorAll('figure').forEach(el => el.remove());
        if (!snapshot.reportOptions.details) doc.querySelectorAll('section').forEach(el => {
            if (/analisis de sustitucion|detalle por|desglose por/i.test(el.querySelector('h2')?.textContent || '')) el.remove();
        });
        // Split flat wide tables into printable groups, repeating their identifying columns.
        doc.querySelectorAll('table').forEach(table => {
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
        const footer = doc.querySelector('footer') || doc.body.appendChild(doc.createElement('footer'));
        footer.insertAdjacentHTML('beforeend', metadata(snapshot));
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
    return { styles, metadata, prepare, printHtml, preview };
})();
