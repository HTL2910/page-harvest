(() => {
  if(globalThis.__pageHarvest){globalThis.__pageHarvest.show();return}
  const host=document.createElement('div');
  host.style.cssText='all:initial!important;position:fixed!important;top:16px!important;right:16px!important;z-index:2147483647!important;display:block!important;';
  const shadow=host.attachShadow({mode:'closed'});
  // Only static application markup uses innerHTML; extracted website data always uses textContent.
  shadow.innerHTML=`<style>
    :host{color-scheme:light}*{box-sizing:border-box} .panel{width:min(660px,calc(100vw - 32px));max-height:calc(100vh - 32px);display:flex;flex-direction:column;background:#fafbf8;color:#172c25;border:1px solid #d7e0d6;border-radius:18px;box-shadow:0 20px 80px #102b2540;font:13px/1.5 system-ui,sans-serif;overflow:hidden}
    header{display:flex;align-items:center;gap:12px;padding:18px 22px;background:#fff;border-bottom:1px solid #e1e7df}.logo{background:#1c6549;color:white;border-radius:10px;padding:6px 12px;font-size:23px;font-weight:800}.brand{flex:1}.brand strong{font-size:17px;display:block}.sub{color:#62766c;font-size:11px}button,input,select{font:inherit}button{cursor:pointer;border:1px solid #ced9cf;background:white;color:#203e31;border-radius:8px;padding:9px 13px;font-weight:650}button:hover{background:#e9f0e8}button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #e7b657;outline-offset:2px}button:disabled{opacity:.4;cursor:default}.primary{background:#216747;color:white;border-color:#216747}.primary:hover{background:#164c33}.close{font-size:22px;border:0;padding:0 6px}.body{padding:20px 22px;overflow:auto}.steps{color:#62756b;font-size:10px;letter-spacing:1.6px;font-weight:700;margin:0 0 14px}.intro{font-size:22px;line-height:1.2;margin:0 0 10px}p{margin:0 0 14px}.muted{color:#677b70}.actions{display:flex;gap:8px;flex-wrap:wrap}.status{margin:14px 0 0;padding:10px 12px;border-radius:8px;background:#eaf1e6;color:#344e3e}.status.error{background:#ffebdf;color:#843914}.label{display:block;font-size:11px;font-weight:750;margin:18px 0 6px;text-transform:uppercase;letter-spacing:1px}select{width:100%;border:1px solid #ccd8cb;border-radius:8px;background:white;padding:10px;color:#233d30}.stats{display:flex;gap:20px;margin:16px 0;border-top:1px solid #e1e7df;border-bottom:1px solid #e1e7df;padding:14px 0}.stats strong{font-size:23px;color:#1d6547}.stats span{color:#718274;font-size:11px}.columns{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;max-height:135px;overflow:auto}.column{display:flex;align-items:center;gap:6px}.column input[type=text]{width:100%;min-width:0;border:1px solid #d7e0d3;border-radius:5px;padding:6px;background:#fff;color:#254031}.column input[type=checkbox],.dedup input{accent-color:#216747}.tablewrap{max-height:235px;overflow:auto;border:1px solid #d9e1d5;border-radius:8px;background:white}table{border-collapse:collapse;font-size:11px;width:100%;white-space:nowrap}th{position:sticky;top:0;background:#edf2e8;color:#38513d;text-align:left;z-index:1}td,th{padding:9px 12px;border-bottom:1px solid #e7ece3;max-width:260px;overflow:hidden;text-overflow:ellipsis}td:first-child{color:#738574}.footnote{font-size:11px;color:#738574;margin-top:6px}.dedup{display:block;margin:15px 0}.footer{display:flex;align-items:center;justify-content:space-between;padding:14px 22px;background:white;border-top:1px solid #e1e7df;gap:12px}.local{color:#6b7e6d;font-size:11px}[hidden]{display:none!important}.panel.picking .body,.panel.picking .footer{display:none}.hint{padding:13px 22px;background:#eaf1e6}.warning{color:#865323;font-size:12px;margin-top:8px}
  </style><section class="panel" aria-label="Page Harvest"><header><div class="logo">↧</div><div class="brand"><strong>Page Harvest</strong><span class="sub">From webpage to spreadsheet.</span></div><button class="close" title="Close" aria-label="Close">×</button></header><div class="hint" hidden>Click one card or table cell. Press Esc to cancel.</div><div class="body"><p class="steps">01 SELECT &nbsp; / &nbsp; 02 REVIEW &nbsp; / &nbsp; 03 EXPORT</p><h2 class="intro">Collect the details that matter.</h2><p class="muted">Select one item. We’ll find similar items on this page and turn them into rows.</p><div class="actions"><button class="primary" id="pick">Select item on page</button><button id="scan" disabled>Refresh extraction</button></div><div class="status" role="status" aria-live="polite">Ready to select a product, article, or table cell.</div><div id="results" hidden><label class="label" for="group">Detected group</label><select id="group"></select><div class="stats"><div><strong id="rowcount">0</strong> <span>rows</span></div><div><strong id="colcount">0</strong> <span>columns selected</span></div></div><div class="label">Columns · rename or uncheck</div><div class="columns"></div><label class="dedup"><input type="checkbox" id="dedup"> Remove duplicate rows (using selected columns)</label><div class="tablewrap"><table><thead></thead><tbody></tbody></table></div><div class="footnote" id="previewnote"></div><div class="warning"></div></div></div><div class="footer"><span class="local">● Local processing · No account needed</span><button class="primary" id="export" disabled>Export .xlsx ↓</button></div></section>`;
  document.documentElement.append(host);
  const $=s=>shadow.querySelector(s), panel=$('.panel'),status=$('.status');
  const outline=document.createElement('div');
  outline.style.cssText='all:initial!important;position:fixed!important;pointer-events:none!important;z-index:2147483646!important;border:3px solid #25a56c!important;background:#25a56c20!important;display:none!important;box-sizing:border-box!important;';
  document.documentElement.append(outline);
  let selecting=false, anchor=null,groups=[],data=null,columns=[];
  function tell(message,error=false){status.textContent=message;status.classList.toggle('error',error)}
  function hideOutline(){outline.style.setProperty('display','none','important')}
  function showOutline(box){
    outline.style.setProperty('display','block','important');
    outline.style.setProperty('left',box.left+'px','important');
    outline.style.setProperty('top',box.top+'px','important');
    outline.style.setProperty('width',box.width+'px','important');
    outline.style.setProperty('height',box.height+'px','important');
  }
  function clearResults(){
    data=null;columns=[];
    $('#results').hidden=true;
    $('#export').disabled=true;
    $('.columns').replaceChildren();
    $('thead').replaceChildren();
    $('tbody').replaceChildren();
    $('#rowcount').textContent='0';
    $('#colcount').textContent='0';
    $('#previewnote').textContent='';
    $('.warning').textContent='';
  }
  function stop(){
    selecting=false;panel.classList.remove('picking');$('.hint').hidden=true;hideOutline();
    document.removeEventListener('pointermove',hover,true);
    document.removeEventListener('pointerdown',swallow,true);
    document.removeEventListener('mousedown',swallow,true);
    document.removeEventListener('click',choose,true);
    document.removeEventListener('keydown',onKeyDown,true);
  }
  function inPanel(event){return typeof event.composedPath==='function' && event.composedPath().includes(host)}
  function swallow(event){
    if(inPanel(event))return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  function hover(event){
    if(inPanel(event)||!(event.target instanceof Element)){hideOutline();return}
    showOutline(event.target.getBoundingClientRect());
  }
  function onKeyDown(event){if(event.key==='Escape'){event.preventDefault();stop();tell('Selection cancelled.')}}
  function choose(event){
    if(inPanel(event))return;
    event.preventDefault();event.stopImmediatePropagation();
    if(!(event.target instanceof Element))return;
    anchor=event.target;stop();detect();
  }
  function detect(previous){
    try {
      if(!anchor?.isConnected)throw new Error('The selected item was removed. Select an item again.');
      groups=HarvestExtract.candidates(anchor);$('#group').replaceChildren();
      if(!groups.length)throw new Error('No repeating group found. Try another card, its surrounding area, or a table cell.');
      for(let i=0;i<groups.length;i++){const option=document.createElement('option');option.value=i;option.textContent=groups[i].label;$('#group').append(option)}
      const matched=previous?groups.findIndex(g=>g.root===previous.root&&g.type===previous.type):-1;$('#group').value=matched>=0?matched:0;
      load();
    }catch(e){clearResults();$('#scan').disabled=true;tell(e.message,true)}
  }
  function load(){
    try{
      data=HarvestExtract.extract(groups[Number($('#group').value)]);
      if(!data.rows.length||!data.headers.length)throw new Error('This group contains no extractable data. Select another group or item.');
      columns=data.headers.map(name=>({name,enabled:true}));$('#results').hidden=false;$('#scan').disabled=false;
      $('.columns').replaceChildren();
      columns.forEach((column,i)=>{const wrap=document.createElement('div');wrap.className='column';const check=document.createElement('input');check.type='checkbox';check.checked=true;check.setAttribute('aria-label','Include '+column.name);check.onchange=()=>{column.enabled=check.checked;render()};const input=document.createElement('input');input.type='text';input.value=column.name;input.maxLength=120;input.setAttribute('aria-label','Column '+(i+1)+' name');input.oninput=()=>{column.name=input.value;render()};wrap.append(check,input);$('.columns').append(wrap)});
      $('.warning').textContent=data.warnings.join(' ');tell('Review the detected group and columns before exporting.');render();
    }catch(e){clearResults();tell(e.message,true)}
  }
  function selected(){
    const indices=columns.flatMap((c,i)=>c.enabled?[i]:[]),headers=indices.map(i=>columns[i].name.trim()||data.headers[i]);
    let rows=data.rows.map(row=>indices.map(i=>row[i]??''));
    if($('#dedup').checked){const seen=new Set();rows=rows.filter(r=>{const key=JSON.stringify(r);if(seen.has(key))return false;seen.add(key);return true})}
    return {headers,rows};
  }
  function render(){
    if(!data)return;const {headers,rows}=selected();$('#rowcount').textContent=rows.length;$('#colcount').textContent=headers.length;
    const head=document.createElement('tr');for(const name of ['#',...headers]){const th=document.createElement('th');th.textContent=name;head.append(th)}$('thead').replaceChildren(head);$('tbody').replaceChildren();
    rows.slice(0,50).forEach((row,i)=>{const tr=document.createElement('tr');for(const value of [String(i+1),...row]){const td=document.createElement('td');td.textContent=value;td.title=value.slice(0,500);tr.append(td)}$('tbody').append(tr)});
    $('#previewnote').textContent=`Showing ${Math.min(50,rows.length)} of ${rows.length} rows. Export includes all ${rows.length} rows.`;$('#export').disabled=!headers.length||!rows.length;
  }
  $('#pick').onclick=()=>{
    stop();selecting=true;panel.classList.add('picking');$('.hint').hidden=false;
    document.addEventListener('pointermove',hover,true);
    document.addEventListener('pointerdown',swallow,true);
    document.addEventListener('mousedown',swallow,true);
    document.addEventListener('click',choose,true);
    document.addEventListener('keydown',onKeyDown,true);
  };
  $('#group').onchange=load;$('#dedup').onchange=render;
  $('#scan').onclick=()=>detect(groups[Number($('#group').value)]);
  $('#export').onclick=()=>{
    try{
      const {headers,rows}=selected(),bytes=HarvestXlsx.build(headers,rows),url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
      const link=document.createElement('a');link.href=url;link.download=`page-harvest-${(location.hostname||'local').replace(/[^a-z0-9.-]/gi,'_')}-${new Date().toISOString().slice(0,10)}.xlsx`;shadow.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);tell(`Excel download requested: ${rows.length} rows, ${headers.length} columns.`);
    }catch(e){tell('Export failed: '+e.message,true)}
  };
  $('.close').onclick=()=>{stop();host.remove();outline.remove();delete globalThis.__pageHarvest};
  globalThis.__pageHarvest={show(){host.style.setProperty('display','block','important');if(selecting)stop()}};
})();
