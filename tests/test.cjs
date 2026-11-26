const { chromium } = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/playwright') : require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
(async () => {
  const browser = await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_BIN||undefined,args:['--no-sandbox','--disable-gpu']});
  try {
    const page = await browser.newPage();
    await page.setContent(`<main><section><article class="card"><h2>Áo thun</h2><span class="price">00120</span><p class="optional">Cotton</p><a href="https://example.com/1">View</a></article><article class="card featured"><h2>Áo polo</h2><span class="price">250</span><a href="https://example.com/2">View</a></article><article class="card"><h2>Áo khoác</h2><span class="price">400</span><p class="optional">Warm</p><a href="https://example.com/3">View</a></article></section><table><thead><tr><th>Name</th><th>Price</th><th>Stock</th></tr></thead><tbody><tr><td>A</td><td></td><td>3</td></tr><tr><td rowspan="2">B</td><td>5</td><td>4</td></tr><tr><td>6</td><td>2</td></tr></tbody></table></main>`);
    for (const f of ['extractor.js', 'xlsx.js']) if(fs.existsSync(path.join(root,f))) await page.addScriptTag({path:path.join(root,f)});
    assert.equal(await page.evaluate(()=>typeof globalThis.HarvestExtract), 'object', 'extraction engine must exist');
    const cards=await page.evaluate(()=>{const g=HarvestExtract.candidates(document.querySelector('h2')).find(g=>g.elements.length===3 && g.elements[0].tagName==='ARTICLE');return HarvestExtract.extract(g)});
    assert.equal(cards.rows.length,3);
    const title=cards.rows[0].indexOf('Áo thun'), optional=cards.rows[0].indexOf('Cotton');
    assert.ok(title>=0 && optional>=0); assert.equal(cards.rows[1][title],'Áo polo'); assert.equal(cards.rows[1][optional],'');
    assert.ok(cards.rows[1].includes('https://example.com/2'));
    const table=await page.evaluate(()=>HarvestExtract.extract(HarvestExtract.candidates(document.querySelector('td'))[0]));
    assert.deepEqual(table.headers,['Name','Price','Stock']);
    assert.deepEqual(table.rows,[['A','','3'],['B','5','4'],['B','6','2']]);
    const bytes=await page.evaluate(()=>Array.from(HarvestXlsx.build(['Name','Literal','Code'],[['Áo & <thun>','=SUM(1,2)','00120'],['😀','https://example.com','']])));
    fs.writeFileSync(path.join(root,'tests/output.xlsx'),Buffer.from(bytes));
    console.log('PASS extraction alignment, table blanks/spans, XLSX generation');
  } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
