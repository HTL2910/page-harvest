'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const plain = v => JSON.parse(JSON.stringify(v));

// Minimal zero-dependency DOM harness for testing extractor.js, panel.js, error.js in Node.
class MockClassList {
  constructor(initial = '') {
    this._set = new Set(String(initial || '').trim().split(/\s+/).filter(Boolean));
  }
  contains(c) { return this._set.has(c); }
  add(...cs) { for (const c of cs) this._set.add(c); }
  remove(...cs) { for (const c of cs) this._set.delete(c); }
  toggle(c, force) {
    const on = force === undefined ? !this._set.has(c) : Boolean(force);
    if (on) this._set.add(c); else this._set.delete(c);
    return on;
  }
  [Symbol.iterator]() { return this._set[Symbol.iterator](); }
}

class MockStyle {
  constructor(initial = {}) {
    this._props = new Map();
    this._important = new Set();
    this._cssText = '';
    for (const [k, v] of Object.entries(initial)) this._props.set(k, v);
  }
  get cssText() { return this._cssText; }
  set cssText(val) {
    this._cssText = String(val);
    this._props.clear();
    this._important.clear();
    for (const decl of this._cssText.split(';')) {
      const idx = decl.indexOf(':');
      if (idx === -1) continue;
      const prop = decl.slice(0, idx).trim();
      let raw = decl.slice(idx + 1).trim();
      const imp = /!important$/i.test(raw);
      if (imp) raw = raw.replace(/!important$/i, '').trim();
      this._props.set(prop, raw);
      if (imp) this._important.add(prop);
    }
  }
  setProperty(prop, value, priority = '') {
    this._props.set(prop, String(value));
    if (priority === 'important') this._important.add(prop);
    else this._important.delete(prop);
  }
  getPropertyValue(prop) { return this._props.get(prop) || ''; }
  getPropertyPriority(prop) { return this._important.has(prop) ? 'important' : ''; }
  get display() { return this._props.get('display') || ''; }
  set display(v) { if (!this._important.has('display')) this._props.set('display', v); }
  get visibility() { return this._props.get('visibility') || ''; }
  set visibility(v) { if (!this._important.has('visibility')) this._props.set('visibility', v); }
}

class MockText {
  constructor(text) {
    this.nodeType = 3;
    this.textContent = String(text);
    this.parentElement = null;
  }
}

class MockElement {
  constructor(tagName, attrs = {}, opts = {}) {
    this.nodeType = 1;
    this.tagName = opts.preserveCase ? tagName : tagName.toUpperCase();
    this.attrs = new Map();
    this.classList = new MockClassList(attrs.class || '');
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') continue;
      this.attrs.set(k, String(v));
    }
    this.style = new MockStyle(opts.style || {});
    this._rects = opts.rects !== undefined ? opts.rects : null;
    this.childNodes = [];
    this.parentElement = null;
    this.isConnected = opts.connected !== false;
    this.hidden = attrs.hidden !== undefined;
    this.disabled = false;
    this.checked = false;
    this.value = '';
    this.colSpan = Number(attrs.colspan || 1);
    this.rowSpan = attrs.rowspan !== undefined ? Number(attrs.rowspan) : 1;
    this.currentSrc = opts.currentSrc || '';
    this._listeners = new Map();
    this._shadowRoot = null;
  }
  get id() { return this.attrs.get('id') || ''; }
  set id(v) { this.attrs.set('id', String(v)); }
  get children() { return this.childNodes.filter(n => n.nodeType === 1); }
  append(...nodes) {
    for (const n of nodes) {
      const node = typeof n === 'string' ? new MockText(n) : n;
      node.parentElement = this;
      this.childNodes.push(node);
    }
    return this;
  }
  replaceChildren(...nodes) {
    this.childNodes = [];
    return this.append(...nodes);
  }
  remove() {
    if (!this.parentElement) return;
    this.parentElement.childNodes = this.parentElement.childNodes.filter(c => c !== this);
    this.parentElement = null;
    this.isConnected = false;
  }
  hasAttribute(k) { return k === 'hidden' ? (this.hidden || this.attrs.has('hidden')) : this.attrs.has(k); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  setAttribute(k, v) { this.attrs.set(k, String(v)); if (k === 'hidden') this.hidden = true; }
  get textContent() {
    return this.childNodes.map(n => n.textContent).join('');
  }
  set textContent(v) {
    this.childNodes = v === '' ? [] : [new MockText(v)];
  }
  get innerText() {
    if (this.tagName === 'svg' || this.tagName === 'defs' || this.tagName === 'path' || this.tagName === 'title') {
      return undefined; // Mimic SVGElement having no innerText
    }
    const parts = [];
    for (const n of this.childNodes) {
      if (n.nodeType === 3) parts.push(n.textContent);
      else if (n.nodeType === 1) {
        if (n.style.display === 'none' || n.hidden || n.getAttribute('aria-hidden') === 'true') continue;
        parts.push(n.innerText ?? n.textContent);
      }
    }
    return parts.join('');
  }
  getClientRects() {
    if (this._rects !== null) return this._rects;
    if (this.style.display === 'none' || this.style.display === 'contents' || this.hidden) return [];
    for (let p = this.parentElement; p; p = p.parentElement) {
      if (p.style.display === 'none' || p.hidden) return [];
    }
    return [{ left: 0, top: 0, width: 100, height: 20 }];
  }
  getBoundingClientRect() {
    const r = this.getClientRects()[0];
    return r || { left: 10, top: 20, width: 120, height: 30 };
  }
  matches(sel) {
    return sel.split(',').map(s => s.trim()).some(part => {
      if (part === '[hidden]') return this.hidden || this.attrs.has('hidden');
      if (part === '[aria-hidden="true"]') return this.attrs.get('aria-hidden') === 'true';
      if (part === 'a[href]') return this.tagName === 'A' && this.hasAttribute('href');
      if (part === 'img') return this.tagName === 'IMG';
      if (part.startsWith('#')) return this.id === part.slice(1);
      if (part.startsWith('.')) return this.classList.contains(part.slice(1));
      return this.tagName.toLowerCase() === part.toLowerCase();
    });
  }
  closest(sel) {
    for (let cur = this; cur; cur = cur.parentElement) {
      if (cur.matches(sel)) return cur;
    }
    return null;
  }
  querySelectorAll(sel) {
    const out = [];
    const walk = node => {
      for (const child of node.children) {
        if (child.matches(sel)) out.push(child);
        walk(child);
      }
    };
    walk(this);
    return out;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  get rows() {
    if (this.tagName !== 'TABLE') return [];
    const head = [], body = [], foot = [];
    for (const child of this.children) {
      if (child.tagName === 'THEAD') head.push(...child.children.filter(c => c.tagName === 'TR'));
      else if (child.tagName === 'TBODY') body.push(...child.children.filter(c => c.tagName === 'TR'));
      else if (child.tagName === 'TFOOT') foot.push(...child.children.filter(c => c.tagName === 'TR'));
      else if (child.tagName === 'TR') body.push(child);
    }
    return [...head, ...body, ...foot];
  }
  get cells() {
    if (this.tagName !== 'TR') return [];
    return this.children.filter(c => c.tagName === 'TD' || c.tagName === 'TH');
  }
  attachShadow() {
    this._shadowRoot = new MockElement('shadow-root');
    return this._shadowRoot;
  }
}

function el(tag, attrs = {}, children = [], opts = {}) {
  const node = new MockElement(tag, attrs, opts);
  for (const child of children) node.append(child);
  return node;
}

function loadExtractor(baseURI = 'https://shop.example.com/catalog') {
  const ctx = {
    document: { baseURI },
    URL,
    getComputedStyle: node => ({
      display: node.style.display || 'block',
      visibility: node.style.visibility || 'visible'
    })
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'extractor.js'), 'utf8'), ctx);
  return ctx.HarvestExtract;
}

function parseZipEntries(bytes) {
  const buf = Buffer.from(bytes);
  const entries = new Map();
  let off = 0;
  while (off + 30 <= buf.length && buf.readUInt32LE(off) === 0x04034b50) {
    const compSize = buf.readUInt32LE(off + 18);
    const nameLen = buf.readUInt16LE(off + 26);
    const extraLen = buf.readUInt16LE(off + 28);
    const name = buf.toString('utf8', off + 30, off + 30 + nameLen);
    const dataStart = off + 30 + nameLen + extraLen;
    entries.set(name, buf.toString('utf8', dataStart, dataStart + compSize));
    off = dataStart + compSize;
  }
  return entries;
}

// ============================================================================
// P0-1: error.js malformed URI handling & worker.js guards / tab reuse
// ============================================================================
test('P0-1: error.js handles valid and malformed percent-encoding without throwing', () => {
  const src = fs.readFileSync(path.join(root, 'error.js'), 'utf8');
  for (const [hash, expected] of [
    ['#Cannot%20access%20chrome%3A%2F%2F', 'Cannot access chrome://'],
    ['#%E0%A4%A', '%E0%A4%A'],
    ['#100%', '100%'],
    ['', '']
  ]) {
    const detailEl = { textContent: 'stale' };
    const ctx = {
      location: { hash },
      document: { getElementById: id => (id === 'detail' ? detailEl : null) }
    };
    vm.createContext(ctx);
    assert.doesNotThrow(() => vm.runInContext(src, ctx));
    assert.equal(detailEl.textContent, expected);
  }
});

test('P0-1: worker.js normalizes errors, guards restricted URLs & file:// access, and reuses error.html tab', async () => {
  const src = fs.readFileSync(path.join(root, 'worker.js'), 'utf8');
  const calls = { execute: [], created: [], updated: [], focused: [] };
  let existingErrorTabs = [];
  let fileAccessAllowed = false;
  let executeError = null;

  const chrome = {
    action: { onClicked: { addListener: fn => { calls.listener = fn; } } },
    runtime: { getURL: p => `chrome-extension://test-id/${p}` },
    extension: { isAllowedFileSchemeAccess: cb => cb(fileAccessAllowed) },
    scripting: {
      executeScript: async args => {
        calls.execute.push(args);
        if (executeError) throw executeError;
      }
    },
    tabs: {
      query: async () => existingErrorTabs,
      create: async opts => {
        calls.created.push(opts);
        existingErrorTabs = [{ id: 99, windowId: 7, url: opts.url }];
      },
      update: async (id, opts) => { calls.updated.push({ id, opts }); }
    },
    windows: {
      update: async (id, opts) => { calls.focused.push({ id, opts }); }
    }
  };

  const ctx = { chrome, encodeURIComponent };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  const w = ctx.HarvestWorker;

  // Non-Error rejection normalization
  assert.equal(w.errorMessage('plain failure'), 'plain failure');
  assert.equal(w.errorMessage(null), 'Unable to access this page.');

  // Restricted chrome:// tab opens error.html without calling executeScript
  await w.handleActionClick({ id: 1, url: 'chrome://extensions' });
  assert.equal(calls.execute.length, 0);
  assert.equal(calls.created.length, 1);
  assert.match(calls.created[0].url, /^chrome-extension:\/\/test-id\/error\.html#/);

  // Second restricted click (Chrome Web Store) REUSES tab 99 instead of creating duplicate
  await w.handleActionClick({ id: 2, url: 'https://chromewebstore.google.com/detail/abc' });
  assert.equal(calls.created.length, 1);
  assert.equal(calls.updated.length, 1);
  assert.equal(calls.updated[0].id, 99);
  assert.equal(calls.focused.length, 1);

  // file:// blocked when isAllowedFileSchemeAccess is false
  await w.handleActionClick({ id: 3, url: 'file:///C:/demo.html' });
  assert.equal(calls.execute.length, 0);
  assert.match(decodeURIComponent(calls.updated[1].opts.url.split('#')[1]), /Allow access to file URLs/);

  // file:// allowed when isAllowedFileSchemeAccess is true
  fileAccessAllowed = true;
  await w.handleActionClick({ id: 4, url: 'file:///C:/demo.html' });
  assert.equal(calls.execute.length, 1);
  assert.deepEqual(plain(calls.execute[0].files), ['extractor.js', 'xlsx.js', 'panel.js']);

  // Non-Error rejection from executeScript still handled cleanly
  executeError = 'raw string rejection';
  await w.handleActionClick({ id: 5, url: 'https://example.com' });
  assert.match(decodeURIComponent(calls.updated[2].opts.url.split('#')[1]), /raw string rejection/);
});

// ============================================================================
// P0-2: display: contents subtrees preserved
// ============================================================================
test('P0-2: extractor.js preserves display: contents subtrees while excluding display: none', () => {
  const HarvestExtract = loadExtractor();
  const makeCard = (title, price) => el('article', { class: 'product' }, [
    el('div', { class: 'contents-wrap' }, [
      el('h2', {}, [title]),
      el('span', { class: 'price' }, [price])
    ], { style: { display: 'contents' }, rects: [] }),
    el('div', { class: 'hidden-wrap' }, [
      el('div', {}, [el('span', {}, ['Secret'])], { style: { display: 'contents' }, rects: [] })
    ], { style: { display: 'none' }, rects: [] })
  ]);

  const grid = el('div', { class: 'grid' }, [
    makeCard('Shirt', '$10'),
    makeCard('Jacket', '$50')
  ]);
  el('body', {}, [grid]);

  const groups = HarvestExtract.candidates(grid.children[0].querySelector('h2'));
  const cardGroup = groups.find(g => g.elements[0].tagName === 'ARTICLE');
  assert.ok(cardGroup);
  const res = HarvestExtract.extract(cardGroup);
  assert.equal(res.rows.length, 2);
  assert.ok(res.rows[0].includes('Shirt'));
  assert.ok(res.rows[0].includes('$10'));
  assert.ok(res.rows[1].includes('Jacket'));
  assert.ok(!res.rows.flat().includes('Secret'));
});

// ============================================================================
// P0-3: inline SVG / DEFS / CANVAS excluded
// ============================================================================
test('P0-3: extractor.js excludes lowercase <svg>/<defs>/<canvas> without burning 2,000-node cap or leaking <title>', () => {
  const HarvestExtract = loadExtractor();
  const makeSvg = () => {
    const svg = el('svg', {}, [
      el('title', {}, ['Star icon tooltip'], { preserveCase: true }),
      el('defs', {}, [el('style', {}, ['.s{fill:red}'], { preserveCase: true })], { preserveCase: true })
    ], { preserveCase: true });
    for (let i = 0; i < 2500; i++) {
      svg.append(el('path', { d: 'M0 0' }, [], { preserveCase: true }));
    }
    return svg;
  };
  const makeCard = name => el('article', { class: 'card' }, [
    makeSvg(),
    el('canvas', {}, ['Fallback canvas']),
    el('h2', {}, [name])
  ]);
  const list = el('section', {}, [makeCard('Item A'), makeCard('Item B')]);
  el('body', {}, [list]);

  const g = HarvestExtract.candidates(list.children[0].querySelector('h2')).find(x => x.elements[0].tagName === 'ARTICLE');
  const res = HarvestExtract.extract(g);
  assert.deepEqual(plain(res.rows), [['Item A'], ['Item B']]);
  assert.equal(res.warnings.length, 0, 'SVG paths must not trigger 2,000-element limit');
});

// ============================================================================
// P0-4: similar() tightened, utility/state classes normalized, hidden siblings skipped in occurrences
// ============================================================================
test('P0-4: similar() avoids Tailwind utility false merges, keyPart() aligns utility variants, hidden siblings do not shift occurrences', () => {
  const HarvestExtract = loadExtractor();

  const card1 = el('div', { class: 'flex p-4 product-card' }, [
    el('h2', { class: 'text-sm font-bold' }, ['Widget A']),
    el('span', { class: 'badge', hidden: '' }, ['Hidden Promo']),
    el('span', { class: 'badge bg-green-500 text-white' }, ['In Stock'])
  ]);
  const card2 = el('div', { class: 'flex p-4 product-card is-featured' }, [
    el('h2', { class: 'text-sm font-bold' }, ['Widget B']),
    el('span', { class: 'badge bg-red-500 text-white' }, ['Out of Stock'])
  ]);
  const unrelatedAd = el('div', { class: 'flex p-4 ad-banner' }, [
    el('p', {}, ['Buy Ads'])
  ]);
  const container = el('section', {}, [card1, card2, unrelatedAd]);
  el('body', {}, [container]);

  const groups = HarvestExtract.candidates(card1.querySelector('h2'));
  const cardGroup = groups.find(g => g.root === container);
  assert.ok(cardGroup);
  assert.equal(cardGroup.elements.length, 2, 'unrelated ad-banner sharing flex/p-4 must not merge');

  const res = HarvestExtract.extract(cardGroup);
  assert.equal(res.headers.length, 2, 'utility class variants and hidden siblings must align into 2 columns');
  assert.deepEqual(plain(res.rows), [
    ['Widget A', 'In Stock'],
    ['Widget B', 'Out of Stock']
  ]);
});

// ============================================================================
// P0-5: HTML table extraction fixes
// ============================================================================
test('P0-5: tableData filters hidden cells/rows, bounds rowSpan=0 to section, guards empty <tr>, separates <tfoot>, extracts links/images, accurate label & ROW_LIMIT', () => {
  const HarvestExtract = loadExtractor();
  const table = el('table', {}, [
    el('thead', {}, [
      el('tr', {}, [
        el('th', { rowspan: '0' }, ['Item']),
        el('th', { hidden: '' }, ['Secret Col']),
        el('th', {}, ['Photo'])
      ])
    ]),
    el('tbody', {}, [
      el('tr', {}, [
        el('td', {}, [el('a', { href: '/items/1' }, ['Widget 1'])]),
        el('td', { style: 'display:none' }, ['HiddenVal1'], { style: { display: 'none' }, rects: [] }),
        el('td', {}, [el('img', { src: 'data:image/gif;base64,R0lGOD', 'data-src': 'https://cdn.example.com/1.jpg' })])
      ]),
      el('tr', { hidden: '' }, [
        el('td', {}, ['Hidden Row']),
        el('td', {}, ['X']),
        el('td', {}, ['Y'])
      ]),
      el('tr', {}, [
        el('td', { rowspan: '0' }, ['Widget 2']),
        el('td', { hidden: '' }, ['HiddenVal2']),
        el('td', {}, ['No photo'])
      ]),
      el('tr', {}, [
        el('td', { hidden: '' }, ['HiddenVal3']),
        el('td', {}, ['Second row of Widget 2'])
      ])
    ]),
    el('tfoot', {}, [
      el('tr', {}, [el('td', {}, ['Total']), el('td', {}, ['3'])])
    ])
  ]);
  el('body', {}, [table]);

  const groups = HarvestExtract.candidates(table.querySelector('td'));
  assert.equal(groups[0].type, 'table');
  assert.equal(groups[0].label, 'Table · 4 rows (including headers)', 'dropdown label must exclude hidden & tfoot rows');

  const res = HarvestExtract.extract(groups[0]);
  assert.deepEqual(plain(res.headers), ['Item', 'Item link', 'Photo', 'Photo image']);
  assert.deepEqual(plain(res.rows), [
    ['Widget 1', 'https://shop.example.com/items/1', '', 'https://cdn.example.com/1.jpg'],
    ['Widget 2', '', 'No photo', ''],
    ['Widget 2', '', 'Second row of Widget 2', '']
  ]);
  assert.equal(res.warnings.length, 0);

  // Empty <tr></tr> at top of tbody without thead must NOT be treated as header
  const emptyTopTable = el('table', {}, [
    el('tbody', {}, [
      el('tr', {}, []),
      el('tr', {}, [el('td', {}, ['A']), el('td', {}, ['1'])])
    ])
  ]);
  el('body', {}, [emptyTopTable]);
  const resEmpty = HarvestExtract.extract(HarvestExtract.candidates(emptyTopTable.querySelector('td'))[0]);
  assert.deepEqual(plain(resEmpty.headers), ['Column 1', 'Column 2']);
  assert.equal(resEmpty.rows.length, 2);

  // Exact 5,000 data rows + 1 header row must NOT emit false ROW_LIMIT warning
  const tbody5000 = el('tbody', {}, []);
  for (let i = 0; i < 5000; i++) tbody5000.append(el('tr', {}, [el('td', {}, [String(i)])]));
  const bigTable = el('table', {}, [
    el('thead', {}, [el('tr', {}, [el('th', {}, ['ID'])])]),
    tbody5000
  ]);
  el('body', {}, [bigTable]);
  const res5000 = HarvestExtract.extract({ type: 'table', root: bigTable, elements: [] });
  assert.equal(res5000.rows.length, 5000);
  assert.equal(res5000.warnings.length, 0);
});

// ============================================================================
// P0-6: cards inside layout tables, depth > 12, empty/# href, lazy data-src, inline tags merged
// ============================================================================
test('P0-6: cards inside layout tables & deep DOMs (>12 levels), href=""/# ignored, lazy data-src preferred, inline tags merged', () => {
  const HarvestExtract = loadExtractor();

  const makeDeepCard = (title, priceMain, priceCents, imgUrl, altText) => {
    let deep = el('span', {}, [title]);
    for (let i = 0; i < 16; i++) deep = el('div', {}, [deep]);
    return el('article', { class: 'card' }, [
      deep,
      el('p', { class: 'price' }, [el('strong', {}, [priceMain]), priceCents]),
      el('a', { href: '#' }, ['Bookmark']),
      el('a', { href: '' }, ['Empty']),
      el('a', { href: 'https://shop.example.com/p/1' }, ['View ', el('b', {}, ['item'])]),
      el('img', { src: 'data:image/svg+xml;base64,PHN2Zz4=', 'data-src': imgUrl, alt: altText }, [], { currentSrc: 'data:image/svg+xml;base64,PHN2Zz4=' })
    ]);
  };

  const c1 = makeDeepCard('Alpha', '$19', '.99', 'https://cdn.example.com/a.jpg', '  Alpha\n  photo  ');
  const c2 = makeDeepCard('Beta', '$29', '.50', 'https://cdn.example.com/b.jpg', '   ');
  const layoutTable = el('table', {}, [
    el('tbody', {}, [
      el('tr', {}, [el('td', {}, [el('div', { class: 'cards' }, [c1, c2])])])
    ])
  ]);
  el('body', {}, [layoutTable]);

  // Target is 17 levels deep inside a layout table
  const deepestSpan = c1.querySelector('span');
  const groups = HarvestExtract.candidates(deepestSpan);
  const cardGroup = groups.find(g => g.type === 'cards' && g.elements[0].tagName === 'ARTICLE');
  assert.ok(cardGroup, 'must detect repeating cards nested >12 levels inside layout table');
  assert.equal(cardGroup.elements.length, 2);

  const res = HarvestExtract.extract(cardGroup);
  assert.ok(res.rows[0].includes('$19.99'), 'inline <strong> must merge into parent price text');
  assert.ok(res.rows[1].includes('$29.50'));
  assert.ok(res.rows[0].includes('View item'), 'inline <b> inside <a> must merge into link text');
  assert.ok(res.rows[0].includes('https://shop.example.com/p/1'));
  assert.ok(!res.rows[0].includes('https://shop.example.com/catalog'), 'empty/# href must not emit baseURI');
  assert.ok(res.rows[0].includes('https://cdn.example.com/a.jpg'), 'data-src must be extracted when currentSrc is data: placeholder');
  assert.ok(res.rows[0].includes('Alpha photo'), 'img alt must be trimmed and normalized');
});

// ============================================================================
// P0-7: panel.js error-state cleanup, Element guards, pointerdown/mousedown capture, outline CSS isolation
// ============================================================================
test('P0-7: panel.js clears/hides #results on load() error, guards non-Element events, intercepts pointerdown/mousedown, and isolates outline CSS', () => {
  const panelSrc = fs.readFileSync(path.join(root, 'panel.js'), 'utf8');
  const docListeners = new Map();
  const htmlRoot = el('html', {}, []);
  let createdDivs = [];
  let extractMode = 'valid';

  // Build shadow DOM element lookup backed by real MockElement nodes
  function buildShadowTree() {
    const pick = el('button', { id: 'pick' });
    const scan = el('button', { id: 'scan' });
    const close = el('button', { class: 'close' });
    const status = el('div', { class: 'status' });
    const hint = el('div', { class: 'hint', hidden: '' });
    const group = el('select', { id: 'group' });
    const rowcount = el('strong', { id: 'rowcount' }, ['0']);
    const colcount = el('strong', { id: 'colcount' }, ['0']);
    const columns = el('div', { class: 'columns' });
    const dedup = el('input', { id: 'dedup' });
    const thead = el('thead');
    const tbody = el('tbody');
    const previewnote = el('div', { id: 'previewnote' });
    const warning = el('div', { class: 'warning' });
    const results = el('div', { id: 'results', hidden: '' }, [group, rowcount, colcount, columns, dedup, thead, tbody, previewnote, warning]);
    const exp = el('button', { id: 'export' });
    const panel = el('section', { class: 'panel' }, [close, hint, pick, scan, status, results, exp]);
    return { panel, pick, scan, close, status, hint, group, rowcount, colcount, columns, dedup, thead, tbody, previewnote, warning, results, exp };
  }

  let shadowRefs = null;
  const mockDocument = {
    documentElement: htmlRoot,
    createElement: tagName => {
      const node = el(tagName);
      if (tagName === 'div') {
        createdDivs.push(node);
        node.attachShadow = () => {
          shadowRefs = buildShadowTree();
          return {
            set innerHTML(_) {},
            querySelector: sel => shadowRefs.panel.matches(sel) ? shadowRefs.panel : shadowRefs.panel.querySelector(sel),
            append: () => {}
          };
        };
      }
      return node;
    },
    addEventListener: (type, fn, cap) => {
      if (!docListeners.has(type)) docListeners.set(type, []);
      docListeners.get(type).push({ fn, cap });
    },
    removeEventListener: (type, fn, cap) => {
      const list = docListeners.get(type) || [];
      docListeners.set(type, list.filter(x => !(x.fn === fn && x.cap === cap)));
    }
  };

  const anchorEl = el('h2', {}, ['Title']);
  const ctx = {
    Element: MockElement,
    document: mockDocument,
    location: { hostname: 'example.com' },
    URL,
    Blob,
    setTimeout,
    HarvestExtract: {
      candidates: () => [
        { type: 'cards', root: el('div'), elements: [el('div'), el('div')], label: 'Group 1' },
        { type: 'cards', root: el('div'), elements: [el('div'), el('div')], label: 'Empty Group' }
      ],
      extract: g => {
        if (extractMode === 'empty' || g.label === 'Empty Group') return { headers: [], rows: [], warnings: [] };
        return { headers: ['Name'], rows: [['Alpha'], ['Beta']], warnings: ['Note'] };
      }
    },
    HarvestXlsx: { build: () => new Uint8Array([0x50, 0x4b]) }
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(panelSrc, ctx);

  const outline = createdDivs[1];
  assert.match(outline.style.cssText, /all\s*:\s*initial\s*!important/i, 'outline must enforce all:initial!important');
  assert.equal(outline.style.getPropertyValue('display'), 'none');
  assert.equal(outline.style.getPropertyPriority('display'), 'important');

  // Start picking -> pointerdown and mousedown must be captured alongside pointermove/click/keydown
  shadowRefs.pick.onclick();
  assert.equal((docListeners.get('pointerdown') || []).length, 1);
  assert.equal((docListeners.get('mousedown') || []).length, 1);
  assert.equal((docListeners.get('click') || []).length, 1);

  // pointerdown & mousedown outside panel are swallowed (preventDefault + stopImmediatePropagation)
  for (const evType of ['pointerdown', 'mousedown']) {
    let prevented = false, stopped = false;
    docListeners.get(evType)[0].fn({
      target: anchorEl,
      composedPath: () => [anchorEl],
      preventDefault: () => { prevented = true; },
      stopImmediatePropagation: () => { stopped = true; }
    });
    assert.equal(prevented, true, `${evType} must call preventDefault`);
    assert.equal(stopped, true, `${evType} must call stopImmediatePropagation`);
  }

  // Non-Element target in hover() and choose() must not throw
  const nonElementTarget = { nodeType: 9 };
  assert.doesNotThrow(() => docListeners.get('pointermove')[0].fn({ target: nonElementTarget, composedPath: () => [] }));
  assert.equal(outline.style.getPropertyValue('display'), 'none');
  assert.doesNotThrow(() => docListeners.get('click')[0].fn({
    target: nonElementTarget,
    composedPath: () => [],
    preventDefault: () => {},
    stopImmediatePropagation: () => {}
  }));

  // Valid hover shows outline with !important; valid click selects anchor and populates results
  docListeners.get('pointermove')[0].fn({ target: anchorEl, composedPath: () => [anchorEl] });
  assert.equal(outline.style.getPropertyValue('display'), 'block');
  assert.equal(outline.style.getPropertyPriority('display'), 'important');

  docListeners.get('click')[0].fn({
    target: anchorEl,
    composedPath: () => [anchorEl],
    preventDefault: () => {},
    stopImmediatePropagation: () => {}
  });
  assert.equal(shadowRefs.results.hidden, false);
  assert.equal(shadowRefs.rowcount.textContent, '2');
  assert.equal((docListeners.get('pointerdown') || []).length, 0, 'stop() must remove pointerdown listener');
  assert.equal((docListeners.get('mousedown') || []).length, 0, 'stop() must remove mousedown listener');

  // Switching to empty group causes load() error -> must hide #results and clear stale data
  shadowRefs.group.value = '1';
  shadowRefs.group.onchange();
  assert.equal(shadowRefs.results.hidden, true, '#results must be hidden on load() error');
  assert.equal(shadowRefs.exp.disabled, true);
  assert.equal(shadowRefs.rowcount.textContent, '0');
  assert.equal(shadowRefs.colcount.textContent, '0');
  assert.equal(shadowRefs.tbody.children.length, 0);
  assert.equal(shadowRefs.columns.children.length, 0);
  assert.equal(shadowRefs.status.classList.contains('error'), true);
});

// ============================================================================
// P0-8: xlsx.js Text (@) style, 32,767 cap + _xHHHH_ + surrogates, XML decls, byte-budget guard
// ============================================================================
test('P0-8: xlsx.js emits Text @ numFmtId=49, XML declarations on all 6 parts, safe 32,767 truncation around _xHHHH_ & surrogates, and byte-budget guard', () => {
  const ctx = { TextEncoder };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'xlsx.js'), 'utf8'), ctx);
  const { build } = ctx.HarvestXlsx;

  // 1. Surrogate pair straddling 32,767 boundary (32,766 'a' + '😀' [2 UTF-16 code units])
  const surrogateAtBoundary = 'a'.repeat(32766) + '😀';
  // 2. _x000A_ near 32,767 boundary (escaping adds +6 chars; must never exceed 32,767 or emit partial escape)
  const xEscapeAtBoundary = 'b'.repeat(32760) + '_x000A_' + 'tail';
  // 3. Normal _x000A_ + control chars + lone surrogate
  const special = 'Hi\u0000\u0007_x000A_\uD800End';

  const bytes = build(['H1', 'H2', 'H3'], [[surrogateAtBoundary, xEscapeAtBoundary, special]]);
  const entries = parseZipEntries(bytes);

  assert.equal(entries.size, 6);
  for (const [name, content] of entries) {
    assert.ok(content.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'), `${name} must start with XML declaration`);
  }

  const styles = entries.get('xl/styles.xml');
  assert.match(styles, /numFmtId="49"[^>]*applyNumberFormat="1"/, 'styles.xml must define Text @ numFmtId=49');

  const sheet = entries.get('xl/worksheets/sheet1.xml');
  assert.match(sheet, /r="A1" t="inlineStr" s="1"/);
  assert.match(sheet, /r="A2" t="inlineStr" s="2"/);

  const cellMatches = [...sheet.matchAll(/<c r="([A-Z]\d+)"[^>]*><is><t xml:space="preserve">([\s\S]*?)<\/t><\/is><\/c>/g)];
  const cells = Object.fromEntries(cellMatches.map(m => [m[1], m[2]]));

  // Surrogate pair at index 32,766 was NOT split into \uFFFD
  assert.equal(cells.A2.length, 32766);
  assert.ok(!cells.A2.includes('\uFFFD'));

  // _x000A_ near 32,767 stopped cleanly before exceeding 32,767
  assert.ok(cells.B2.length <= 32767, `B2 length ${cells.B2.length} exceeded 32767`);
  assert.equal(cells.B2, 'b'.repeat(32760));

  // Control chars stripped, _x000A_ escaped to _x005F_x000A_, lone surrogate turned into \uFFFD
  assert.equal(cells.C2, 'Hi_x005F_x000A_\uFFFDEnd');

  // Byte-budget guard rejects archives exceeding maxBytes before setUint32
  assert.throws(() => build(['A'], [['hello']], { maxBytes: 100 }), /maximum export size/i);
  assert.throws(() => build([], []), /Select at least one column/i);
  assert.throws(() => build(['A'], Array.from({ length: 5001 }, () => ['x'])), /Export limit/i);
});

// ============================================================================
// Backwards compatibility with demo.html & tests/test.cjs fixtures
// ============================================================================
test('Compat: demo.html cards (6 cols, optional description) and spanned table preserve exact behavior', () => {
  const HarvestExtract = loadExtractor('https://example.com/');

  const grid = el('div', { class: 'grid' }, [
    el('article', { class: 'product' }, [
      el('span', { class: 'category' }, ['Everyday essentials']),
      el('h2', {}, ['Áo thun cotton']),
      el('p', { class: 'price' }, ['120.000 ₫']),
      el('p', { class: 'description' }, ['Soft cotton · Size M']),
      el('a', { href: 'https://example.com/products/cotton' }, ['View product'])
    ]),
    el('article', { class: 'product featured' }, [
      el('span', { class: 'category' }, ['Everyday essentials']),
      el('h2', {}, ['Áo polo nam']),
      el('p', { class: 'price' }, ['250.000 ₫']),
      el('a', { href: 'https://example.com/products/polo' }, ['View product'])
    ]),
    el('article', { class: 'product' }, [
      el('span', { class: 'category' }, ['Outdoor collection']),
      el('h2', {}, ['Áo khoác nhẹ']),
      el('p', { class: 'price' }, ['400.000 ₫']),
      el('p', { class: 'description' }, ['Lightweight · Size L']),
      el('a', { href: 'https://example.com/products/jacket' }, ['View product'])
    ])
  ]);
  const spanTable = el('table', {}, [
    el('thead', {}, [el('tr', {}, [el('th', {}, ['Name']), el('th', {}, ['Price']), el('th', {}, ['Stock'])])]),
    el('tbody', {}, [
      el('tr', {}, [el('td', {}, ['A']), el('td', {}, ['']), el('td', {}, ['3'])]),
      el('tr', {}, [el('td', { rowspan: '2' }, ['B']), el('td', {}, ['5']), el('td', {}, ['4'])]),
      el('tr', {}, [el('td', {}, ['6']), el('td', {}, ['2'])])
    ])
  ]);
  el('body', {}, [grid, spanTable]);

  const cardGroup = HarvestExtract.candidates(grid.querySelector('h2')).find(g => g.elements.length === 3 && g.elements[0].tagName === 'ARTICLE');
  assert.ok(cardGroup);
  const cards = HarvestExtract.extract(cardGroup);
  assert.equal(cards.headers.length, 6);
  assert.equal(cards.rows.length, 3);
  assert.equal(cards.rows[1][1], 'Áo polo nam');
  assert.equal(cards.rows[1][3], '', 'polo description stays blank');
  assert.equal(cards.rows[1][4], 'https://example.com/products/polo');

  const tbl = HarvestExtract.extract(HarvestExtract.candidates(spanTable.querySelector('td'))[0]);
  assert.deepEqual(plain(tbl.headers), ['Name', 'Price', 'Stock']);
  assert.deepEqual(plain(tbl.rows), [['A', '', '3'], ['B', '5', '4'], ['B', '6', '2']]);
});

