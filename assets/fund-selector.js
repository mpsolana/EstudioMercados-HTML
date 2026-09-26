const FundSelector = (() => {
    const panels = new Map();
    const size = 40;
    const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const norm = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    function rows(state) {
        const q = norm(state.query);
        const matches = state.items.filter(rec => !q || norm(`${rec.isin} ${rec.name} ${rec.category} ${rec.manager}`).includes(q));
        state.offset = Math.min(state.offset, Math.max(0, Math.floor((matches.length - 1) / size) * size));
        const visible = matches.slice(state.offset, state.offset + size);
        const content = visible.map(rec => `<button type="button" class="fund-option" data-option-search="${esc(rec.isin)}" onclick="${esc(state.selectCall(rec.isin))}; closeCompactFundComboboxes();"><strong>${esc(rec.name || rec.isin)}</strong><small>${esc(rec.isin)} · ${esc(rec.category || 'Sin categoria')} · Calidad ${QualityCore.label(rec.score)} · TER ${Number.isFinite(rec.ter) ? rec.ter.toFixed(2) + '%' : '-'}</small></button>`).join('');
        return `${content || '<p class="p-3 text-sm">Sin coincidencias.</p>'}<div class="fund-selector-page"><span aria-live="polite">${matches.length ? state.offset + 1 : 0}-${Math.min(state.offset + size, matches.length)} / ${matches.length}</span><button type="button" title="Pagina anterior" aria-label="Pagina anterior" onclick="FundSelector.page('${state.id}',-1)" ${state.offset ? '' : 'disabled'}>&larr;</button><button type="button" title="Pagina siguiente" aria-label="Pagina siguiente" onclick="FundSelector.page('${state.id}',1)" ${state.offset + size < matches.length ? '' : 'disabled'}>&rarr;</button></div>`;
    }
    function render(items, selectCall, placeholder, options = {}) {
        const id = options.id || `fund-selector-${Math.random().toString(36).slice(2)}`;
        const normalized = (items || []).map(item => item?.universe || item?.record || item).filter(r => r?.isin);
        const selected = options.selected?.universe || options.selected?.record || options.selected;
        const state = { id, items: normalized, selectCall, query: '', offset: 0 };
        panels.set(id, state);
        if (panels.size > 1000) panels.delete(panels.keys().next().value);
        return `<div class="relative"><button type="button" class="fund-selector-trigger" aria-expanded="false" aria-controls="${id}" onclick="toggleCompactFundCombobox('${id}')">${esc(selected ? `${selected.isin} · ${selected.name || ''}` : options.buttonText || 'Seleccionar fondo')}</button><div id="${id}" data-compact-fund-panel class="hidden fund-selector-panel"><input type="search" aria-label="Buscar en todos los fondos disponibles" placeholder="${esc(placeholder || 'ISIN, nombre o categoria')}" oninput="filterCompactFundCombobox(this,'${id}')"><div data-fund-selector-results>${rows(state)}</div></div></div>`;
    }
    function update(id) { const state = panels.get(id), target = document.getElementById(id)?.querySelector('[data-fund-selector-results]'); if (state && target) target.innerHTML = rows(state); }
    function search(query, id) { const state = panels.get(id); if (state) { state.query = query; state.offset = 0; update(id); } }
    function page(id, direction) { const state = panels.get(id); if (state) { state.offset = Math.max(0, state.offset + direction * size); update(id); } }
    return { render, search, page };
})();
