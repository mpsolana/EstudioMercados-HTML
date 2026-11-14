(function(root){
    const clean=value=>String(value??'').trim();
    const normalize=value=>clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ' ).trim();
    const keys={id:['isin','ticker','symbol','codigo','fund isin','codigo activo'],weight:['peso','peso %','weight','allocation','target'],name:['name','nombre','fondo','fund name','activo'],category:['asset class','asset_class','categoria','category'],type:['tipo activo','asset type']};
    function field(row,names){const entries=Object.entries(row).map(([key,value])=>[normalize(key),value]);for(const name of names){const found=entries.find(([key])=>key===normalize(name));if(found&&clean(found[1])!=='')return found[1];}return null;}
    function hasColumn(row,names){return Object.keys(row).some(key=>names.some(name=>normalize(key)===normalize(name)));}
    function weight(value){if(typeof value==='number')return value;const raw=clean(value);if(!raw)return NaN;const percent=raw.endsWith('%'),text=raw.replace('%','').replace(/\s/g,'');const decimal=text.includes(',')?text.replace(/\./g,'').replace(',','.'):text;const result=Number(decimal);return percent?result:result;}
    function normalizeWeights(entries){
        if(!entries.length)throw new Error('No se encontraron identificadores y pesos en el Excel.');
        if(entries.some(item=>!Number.isFinite(item.weight)||item.weight<=0))throw new Error('Todos los pesos deben ser positivos y numéricos.');
        const total=entries.reduce((sum,item)=>sum+item.weight,0),factor=Math.abs(total-1)<=.001?100:1;
        if(Math.abs(total*factor-100)>.1)throw new Error(`Los pesos suman ${(total*factor).toFixed(2)}%. Corrige el Excel antes de importar.`);
        const seen=new Set();return entries.map(item=>{
            if(seen.has(item.id))throw new Error(`Identificador repetido: ${item.id}. Agrupa sus posiciones antes de importar.`);
            seen.add(item.id);return {...item,weight:item.weight*factor};
        });
    }
    function parseRows(rows){
        const entries=rows.map(row=>({id:clean(field(row,keys.id)).toUpperCase(),weight:weight(field(row,keys.weight)),name:clean(field(row,keys.name)),category:clean(field(row,keys.category)),type:clean(field(row,keys.type))})).filter(item=>item.id);
        return entries.length?normalizeWeights(entries):[];
    }
    function parseWorkbook(book,XLSX){
        const sheetNames=book.SheetNames||[],preferred=['cartera scoring','cartera individual','weights','pesos','cartera'];
        const ordered=[...sheetNames].sort((a,b)=>{const score=name=>{const index=preferred.indexOf(normalize(name));return index<0?99:index;};return score(a)-score(b);});
        for(const sheet of ordered){
            const rows=XLSX.utils.sheet_to_json(book.Sheets[sheet],{defval:null,raw:true});
            if(!rows.length||!hasColumn(rows[0],keys.id)||!hasColumn(rows[0],keys.weight))continue;
            const parsed=parseRows(rows);if(parsed.length)return {sheet,entries:parsed};
        }
        throw new Error('No se encontró una hoja con ISIN/ticker y peso (Maestro, weights o cartera).');
    }
    function snapshot(entries){return normalizeWeights(entries).map(item=>({category:item.category||'Sin categoría',type:item.type||'Pendiente',weight:item.weight,funds:[{isin:item.id,name:item.name||item.id}]}));}
    const api={parseRows,parseWorkbook,normalizeWeights,snapshot};
    if(typeof module==='object'&&module.exports)module.exports=api;
    else root.FinancialPlanningPortfolio=api;
})(globalThis);
