const {chromium}=process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright'):require('playwright');
const path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_BIN||undefined,args:['--no-sandbox','--disable-gpu']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1050},acceptDownloads:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('file://'+path.join(root,'demo.html'));
  // Retain a test-only reference to the closed shadow root without changing its mode.
  await page.evaluate(()=>{const attach=Element.prototype.attachShadow;Element.prototype.attachShadow=function(options){const s=attach.call(this,options);window.testShadow=s;return s}});
  for(const f of ['extractor.js','xlsx.js','panel.js'])await page.addScriptTag({path:path.join(root,f)});
  const click=selector=>page.evaluate(s=>window.testShadow.querySelector(s).click(),selector);
  const read=selector=>page.evaluate(s=>window.testShadow.querySelector(s).textContent,selector);
  await click('#pick');await page.locator('.product h2').first().click();
  assert.equal(await read('#rowcount'),'3');
  assert.match(await read('tbody'),/Áo polo nam/);
  const before=Number(await read('#colcount'));await click('.column input[type=checkbox]');assert.equal(Number(await read('#colcount')),before-1);
  await page.evaluate(()=>{const el=testShadow.querySelector('.column:nth-child(2) input[type=text]');el.value='Product title';el.dispatchEvent(new Event('input'))});
  assert.match(await read('thead'),/Product title/);
  await page.screenshot({path:path.join(root,'tests/preview.png')});
  const downloadPromise=page.waitForEvent('download');await click('#export');const download=await downloadPromise;await download.saveAs(path.join(root,'tests/ui-export.xlsx'));
  // Refresh must incorporate new same-structure siblings.
  await page.evaluate(()=>document.querySelector('.grid').append(document.querySelector('.product').cloneNode(true)));
  await click('#scan');assert.equal(await read('#rowcount'),'4');await click('#dedup');assert.equal(await read('#rowcount'),'3');
  await click('#pick');await page.keyboard.press('Escape');assert.match(await read('.status'),/cancelled/);
  // Click a table cell while the panel remains above the right side of the page.
  await click('#pick');await page.locator('main table td').first().click();assert.equal(await read('#rowcount'),'3');assert.match(await read('thead'),/SKU/);
  await click('.close');assert.equal(await page.evaluate(()=>typeof __pageHarvest),'undefined');
  assert.deepEqual(errors,[]);console.log('PASS UI selection, rename/exclude, download, refresh, deduplication, Escape, table, close');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
