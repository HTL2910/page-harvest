(() => {
  const ROW_LIMIT=5000, COLUMN_LIMIT=100;
  const excluded = new Set(['SCRIPT','STYLE','NOSCRIPT','TEMPLATE','INPUT','TEXTAREA','SELECT','OPTION']);
  const text = el => (el.innerText ?? el.textContent ?? '').replace(/\s+/g,' ').trim();
  const visible = el => !excluded.has(el.tagName) && !el.closest('[hidden],[aria-hidden="true"]') && el.getClientRects().length>0 && getComputedStyle(el).visibility!=='hidden';
  const classes = el => [...el.classList].filter(c=>! /^(active|selected|hover|focus|featured|first|last|odd|even)$/i.test(c));
  function similar(a,b){
    if(a.tagName!==b.tagName)return false;
    if(classes(a).some(c=>b.classList.contains(c)))return true;
    const tags=el=>new Set([...el.children].map(c=>c.tagName));
    const x=tags(a),y=tags(b),union=new Set([...x,...y]);
    return union.size===0 || [...x].filter(t=>y.has(t)).length/union.size>=0.6;
  }
  function candidates(target){
    const groups=[],table=target.closest('table');
    if(table)groups.push({type:'table',root:table,elements:[...table.rows],label:`Table · ${table.rows.length} rows (including headers)`});
    let node=table?table:target;
    for(let depth=0;node?.parentElement && depth<12;depth++,node=node.parentElement){
      if(['BODY','HTML'].includes(node.tagName))break;
      const elements=[...node.parentElement.children].filter(e=>visible(e)&&similar(node,e));
      if(elements.length<2||elements.length>20000)continue;
      if(groups.some(g=>g.elements.length===elements.length&&g.elements[0]===elements[0]))continue;
      groups.push({type:'cards',root:node.parentElement,elements,label:`${node.tagName.toLowerCase()}${classes(node)[0]?'.'+classes(node)[0]:''} · ${elements.length} items`});
    }
    return groups;
  }
  function tableData(table){
    const source=[...table.rows].filter(visible).slice(0,ROW_LIMIT+20),grid=[],warnings=[];
    if(table.rows.length>ROW_LIMIT)warnings.push('Large table: export limited to 5,000 data rows.');
    for(let r=0;r<source.length;r++){
      grid[r]??=[];let col=0;
      for(const cell of source[r].cells){
        while(grid[r][col]!==undefined)col++;
        if(col>=COLUMN_LIMIT){warnings.push('Only the first 100 columns are included.');break}
        const colspan=Math.min(cell.colSpan||1,COLUMN_LIMIT-col);
        const rowSpan=cell.rowSpan===0 ? source.length-r : Math.min(cell.rowSpan||1,source.length-r);
        for(let dy=0;dy<rowSpan;dy++)for(let dx=0;dx<colspan;dx++){
          grid[r+dy]??=[];grid[r+dy][col+dx]=text(cell);
        }
        col+=colspan;
      }
    }
    let headerCount=0;
    while(headerCount<source.length && (source[headerCount].parentElement.tagName==='THEAD'||[...source[headerCount].cells].every(c=>c.tagName==='TH')))headerCount++;
    const width=Math.min(COLUMN_LIMIT,Math.max(0,...grid.map(r=>r.length)));
    const headers=Array.from({length:width},(_,c)=>[...new Set(grid.slice(0,headerCount).map(r=>r[c]).filter(Boolean))].join(' / ')||`Column ${c+1}`);
    return {headers,rows:grid.slice(headerCount,headerCount+ROW_LIMIT).map(r=>headers.map((_,c)=>r[c]??'')),warnings};
  }
  // Paths use tag/class identity plus an occurrence number; optional fields do not shift later columns.
  function keyPart(el){return el.tagName.toLowerCase()+classes(el).sort().map(c=>'.'+c).join('')}
  function fieldMap(root){
    const values=new Map();let scanned=0,limited=false;
    function walk(el,path){
      if(++scanned>2000){limited=true;return}
      if(!visible(el))return;
      const put=(kind,value)=>{if(value)values.set(path+'|'+kind,{label:(el.getAttribute('data-label')||el.getAttribute('aria-label')||classes(el)[0]||el.tagName.toLowerCase())+' '+kind,value})};
      if(el.tagName==='A') {try{const url=new URL(el.getAttribute('href'),document.baseURI);if(el.hasAttribute('href')&&['https:','http:','mailto:','tel:'].includes(url.protocol))put('link',url.href)}catch{}}
      if(el.tagName==='IMG'){try{const url=new URL(el.currentSrc||el.getAttribute('src')||el.getAttribute('data-src')||'',document.baseURI);if((el.currentSrc||el.getAttribute('src')||el.getAttribute('data-src'))&&['https:','http:','file:'].includes(url.protocol))put('image',url.href)}catch{}put('alt',el.getAttribute('alt'))}
      const children=[...el.children].filter(e=>!excluded.has(e.tagName));
      if(!children.length)put('text',text(el));
      else {
        const direct=[...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join(' ').replace(/\s+/g,' ').trim();put('text',direct);
        const occurrences=new Map();
        for(const child of children){const part=keyPart(child),n=(occurrences.get(part)||0)+1;occurrences.set(part,n);walk(child,path+'/'+part+':'+n)}
      }
    }
    walk(root,'item');return {values,limited};
  }
  function extract(group){
    if(!group)throw new Error('Choose a repeated group first.');
    let result;
    if(group.type==='table')result=tableData(group.root);
    else {
      const warnings=[],fields=new Map(),maps=group.elements.slice(0,ROW_LIMIT).map(el=>fieldMap(el));
      if(group.elements.length>ROW_LIMIT)warnings.push('Only the first 5,000 items are included.');
      if(maps.some(m=>m.limited))warnings.push('Complex items were limited to 2,000 elements each.');
      let overflow=false;
      for(const {values} of maps)for(const [key,entry] of values)if(!fields.has(key)){if(fields.size<COLUMN_LIMIT)fields.set(key,entry.label);else overflow=true}
      if(overflow)warnings.push('Only the first 100 detected columns are included.');
      const labels=new Map(),headers=[...fields.values()].map(label=>{const n=(labels.get(label)||0)+1;labels.set(label,n);return label+(n>1?' '+n:'')});
      result={headers,rows:maps.map(m=>[...fields.keys()].map(k=>m.values.get(k)?.value??'')),warnings};
    }
    if(result.rows.some(r=>r.some(v=>v.length>32767)))result.warnings.push('Long cells will be truncated to Excel’s 32,767-character limit.');
    result.warnings=[...new Set(result.warnings)];return result;
  }
  globalThis.HarvestExtract={candidates,extract};
})();
