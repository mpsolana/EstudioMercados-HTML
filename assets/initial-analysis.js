const InitialAnalysis = (() => {
    const origins = new Map();
    const metrics = [['score','Score'],['ter','TER (%)'],['ret1','Retorno 1A (%)'],['ret3','Retorno 3A (%)'],['ret5','Retorno 5A (%)'],['risk1','Riesgo 1A (%)'],['risk3','Riesgo 3A (%)'],['risk5','Riesgo 5A (%)'],['dd1','Caida maxima 1A (%)'],['dd3','Caida maxima 3A (%)'],['dd5','Caida maxima 5A (%)']];
    let dialog, editingIsin, selectedProxy;
    function resolve(isin) { return origins.get(isin) || null; }
    function originControl(row, index) {
        if (row.current && !row.current.originSource) return '';
        const source = row.current?.originSource;
        const note = source ? source.mode === 'proxy' ? `Proxy: ${source.proxyIsin} · ${source.proxyName}` : 'Datos declarados por el usuario' : '';
        return `<div class="initial-origin-note">${escapeHtml(note)}</div><button type="button" class="initial-origin-button" onclick="InitialAnalysis.edit(${index})">${source ? 'Editar origen' : 'Definir origen: proxy / manual'}</button>`;
    }
    function edit(index) {
        const row = fundProposalState.rows[index]; if (!row) return;
        editingIsin = row.isin; selectedProxy = null;
        if (!dialog) {
            dialog = document.createElement('dialog'); dialog.className = 'initial-origin-dialog'; document.body.append(dialog);
            dialog.addEventListener('close', () => dialog.replaceChildren());
        }
        const current = resolve(row.isin);
        dialog.innerHTML = `<form id="initialOriginForm"><div class="initial-origin-heading"><h3>Datos del fondo de origen</h3><button type="button" aria-label="Cerrar" title="Cerrar" onclick="InitialAnalysis.close()">&times;</button></div><p>${escapeHtml(row.isin)}</p><label>Nombre del fondo del cliente<input id="initialOriginName" required maxlength="180"></label><label>Fuente de datos<select id="initialOriginMode"><option value="proxy">Proxy del universo</option><option value="manual">Datos manuales</option></select></label><section id="initialProxyFields"><label>Fondo proxy</label><div id="initialProxyPicker"></div><p id="initialProxySelection" role="status"></p></section><section id="initialManualFields" class="initial-metric-grid"><label>Categoria<input id="initialOriginCategory" maxlength="150"></label><label>Moneda<input id="initialOriginCurrency" maxlength="3" placeholder="EUR"></label>${metrics.map(([key,label]) => `<label>${label}<input id="initialMetric-${key}" type="number" step="any" ${key === 'ter' ? 'min="0" max="99.99"' : key.startsWith('risk') || key === 'score' ? 'min="0"' : ''}></label>`).join('')}</section><p id="initialOriginError" role="alert"></p><div class="workspace-tools"><button type="submit">Aplicar al analisis</button><button type="button" onclick="InitialAnalysis.reset()">Restablecer origen</button></div></form>`;
        dialog.querySelector('#initialOriginName').value = current?.name || row.current?.name || '';
        dialog.querySelector('#initialOriginMode').value = current?.originSource?.mode || 'proxy';
        dialog.querySelector('#initialOriginCategory').value = current?.category || '';
        dialog.querySelector('#initialOriginCurrency').value = current?.currency || 'EUR';
        metrics.forEach(([key]) => { dialog.querySelector(`#initialMetric-${key}`).value = Number.isFinite(current?.[key]) ? current[key] : ''; });
        dialog.querySelector('#initialProxyPicker').innerHTML = renderCompactFundCombobox(fundUniverseState?.records || [], isin => `InitialAnalysis.selectProxy('${isin}')`, 'ISIN, nombre o categoria', {id:'initialOriginProxy'});
        if (current?.originSource?.proxyIsin) selectProxy(current.originSource.proxyIsin);
        dialog.querySelector('#initialOriginMode').addEventListener('change', modeChanged);
        dialog.querySelector('form').addEventListener('submit', event => { event.preventDefault(); save(); });
        modeChanged(); dialog.showModal();
    }
    function modeChanged() {
        const manual = dialog.querySelector('#initialOriginMode').value === 'manual';
        dialog.querySelector('#initialManualFields').hidden = !manual;
        dialog.querySelector('#initialProxyFields').hidden = manual;
        dialog.querySelector('#initialOriginCategory').required = manual;
        for (const key of ['score','ter']) dialog.querySelector(`#initialMetric-${key}`).required = manual;
    }
    function selectProxy(isin) {
        selectedProxy = fundUniverseState?.isinIndex.get(isin) || null;
        dialog.querySelector('#initialProxySelection').textContent = selectedProxy ? `${selectedProxy.isin} · ${selectedProxy.name}` : 'El proxy no esta disponible en el universo actual.';
    }
    function save() {
        const form = dialog.querySelector('form'); if (!form.reportValidity()) return;
        const name = dialog.querySelector('#initialOriginName').value.trim();
        const mode = dialog.querySelector('#initialOriginMode').value;
        let record;
        if (mode === 'proxy') {
            if (!selectedProxy) { dialog.querySelector('#initialOriginError').textContent = 'Selecciona un fondo proxy del universo.'; return; }
            record = {...selectedProxy, name, isin:editingIsin, originSource:{mode,proxyIsin:selectedProxy.isin,proxyName:selectedProxy.name}};
        } else {
            record = {isin:editingIsin,name,category:dialog.querySelector('#initialOriginCategory').value.trim(),currency:dialog.querySelector('#initialOriginCurrency').value.trim().toUpperCase(),originSource:{mode}};
            metrics.forEach(([key]) => { const value = dialog.querySelector(`#initialMetric-${key}`).valueAsNumber; record[key] = Number.isFinite(value) ? key.startsWith('dd') ? -Math.abs(value) : value : NaN; });
        }
        if (!name || !record.category) { dialog.querySelector('#initialOriginError').textContent = 'Indica nombre y categoria.'; return; }
        origins.set(editingIsin, record); updateRow(record); dialog.close();
    }
    function updateRow(record) {
        const row = fundProposalState.rows.find(r => r.isin === editingIsin); if (!row) return;
        invalidatePortfolioReports();
        row.current = record; row.missing = !record;
        row.recommendations = record ? getBetterFundRecommendations(record,5000) : [];
        row.proposed = row.recommendations[0] || record;
        row.cheaperClasses = [];
        renderFundProposalPortfolio(); portfolioWorkflowRefresh();
    }
    function reset() { origins.delete(editingIsin); updateRow(fundUniverseState?.isinIndex.get(editingIsin) || null); dialog.close(); }
    function useLoadedPortfolio() {
        if (!fundPortfolioRows.length) { alert('Carga primero el archivo de cartera scoring en Datos.'); return; }
        const fraction = document.getElementById('fundWeightUnit').value === 'fraction';
        document.getElementById('fundProposalPortfolioInput').value = fundPortfolioRows.map(r => `${r.isin};${fraction ? r.weight / 100 : r.weight}`).join('\n');
        invalidatePortfolioReports(); analyzeFundProposalPortfolio(); portfolioWorkflowRefresh();
    }
    return {resolve,originControl,edit,selectProxy,reset,useLoadedPortfolio,close:()=>dialog?.close()};
})();
