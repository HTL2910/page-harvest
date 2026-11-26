(() => {
  const ROW_LIMIT = 5000, COLUMN_LIMIT = 100, DEPTH_LIMIT = 30;
  const excluded = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'SVG', 'DEFS', 'CANVAS']);
  const TABLE_PARTS = new Set(['TD', 'TH', 'TR', 'THEAD', 'TBODY', 'TFOOT']);
  const INLINE_FORMAT_TAGS = new Set(['STRONG', 'B', 'EM', 'I', 'MARK', 'SMALL', 'SPAN', 'SUB', 'SUP', 'U', 'S', 'DEL', 'INS', 'ABBR', 'CODE', 'TIME', 'BR', 'WBR']);
  const TEXT_HOST_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'A', 'BUTTON', 'LABEL', 'DT', 'DD', 'FIGCAPTION', 'BLOCKQUOTE', 'CITE', 'SUMMARY']);
  const STATE_CLASS_RE = /^(?:active|selected|hover|focus|featured|first|last|odd|even|disabled|enabled|open|closed|expanded|collapsed|checked|current|highlighted|sale|sold[-_]?out|in[-_]?stock|out[-_]?of[-_]?stock|loading|error|valid|invalid|show|hide)$|^(?:is|has|state)[-_]|--(?:active|selected|featured|disabled|open|sale|first|last)$/i;
  const UTILITY_CLASS_RE = /^(?:(?:sm|md|lg|xl|2xl|hover|focus|active|dark|disabled|group-hover):.*|flex|inline-flex|grid|inline-grid|block|inline-block|relative|absolute|fixed|sticky|container|row|col|d-(?:flex|grid|block|inline|none)|col-(?:xs|sm|md|lg|xl|auto|\d+)(?:-\d+)?|(?:m|mx|my|mt|mr|mb|ml|p|px|py|pt|pr|pb|pl|gap|space-[xy]|w|h|min-w|max-w|min-h|max-h|z|order)-(?:auto|full|screen|px|fit|min|max|\d+(?:\.\d+)?|\[.+\])|(?:bg|text|border|ring|fill|stroke|from|via|to)-(?:transparent|current|black|white|inherit|xs|sm|base|lg|xl|\dxl|left|center|right|justify|wrap|nowrap|ellipsis|[a-z]+-\d{2,3}(?:\/\d+)?|\[.+\])|(?:rounded|shadow|opacity|font|leading|tracking|items|justify|self|place|overflow|whitespace|transition|duration|ease|cursor|pointer-events|select|fw|fs)(?:-[a-z0-9./[\]]+)?|truncate|sr-only|clearfix)$/i;

  const tag = el => (el?.tagName || '').toUpperCase();
  const text = el => (el.innerText ?? el.textContent ?? '').replace(/\s+/g, ' ').trim();
  const classes = el => [...(el.classList || [])].filter(c => !STATE_CLASS_RE.test(c));
  const structuralClasses = el => classes(el).filter(c => !UTILITY_CLASS_RE.test(c));

  function inDisplayNone(el) {
    for (let p = el.parentElement; p; p = p.parentElement) {
      if (typeof getComputedStyle === 'function' && getComputedStyle(p).display === 'none') return true;
    }
    return false;
  }

  function visible(el) {
    if (!el || excluded.has(tag(el))) return false;
    if (el.closest && el.closest('[hidden],[aria-hidden="true"]')) return false;
    const style = typeof getComputedStyle === 'function' ? getComputedStyle(el) : null;
    if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
    if (el.getClientRects && el.getClientRects().length > 0) return true;
    if (style && style.display === 'contents') {
      if (inDisplayNone(el)) return false;
      for (const child of el.children) if (visible(child)) return true;
      return Boolean(text(el));
    }
    return false;
  }

  function similar(a, b) {
    if (tag(a) !== tag(b)) return false;
    const ca = structuralClasses(a), cb = structuralClasses(b);
    if (ca.length && cb.length) {
      const setB = new Set(cb);
      const shared = ca.filter(c => setB.has(c)).length;
      if (shared > 0 && shared / new Set([...ca, ...cb]).size >= 0.5) return true;
      return false;
    }
    if (ca.length !== cb.length) return false;
    const childTags = el => new Set([...el.children].filter(e => !excluded.has(tag(e))).map(tag));
    const x = childTags(a), y = childTags(b), union = new Set([...x, ...y]);
    if (union.size === 0) {
      const ua = classes(a), ub = classes(b);
      if (!ua.length && !ub.length) return true;
      if (!ua.length || !ub.length) return false;
      const setUB = new Set(ub);
      return ua.filter(c => setUB.has(c)).length / new Set([...ua, ...ub]).size >= 0.5;
    }
    return [...x].filter(t => y.has(t)).length / union.size >= 0.6;
  }

  function extractHref(el) {
    if (!el.hasAttribute || !el.hasAttribute('href')) return '';
    const raw = (el.getAttribute('href') || '').trim();
    if (!raw || raw.startsWith('#')) return '';
    try {
      const url = new URL(raw, document.baseURI);
      if (!['https:', 'http:', 'mailto:', 'tel:'].includes(url.protocol)) return '';
      return url.href;
    } catch {
      return '';
    }
  }

  function extractImgSrc(el) {
    const sources = [
      el.currentSrc,
      el.getAttribute && el.getAttribute('src'),
      el.getAttribute && el.getAttribute('data-src'),
      el.getAttribute && el.getAttribute('data-lazy-src'),
      el.getAttribute && el.getAttribute('data-original')
    ];
    for (const raw of sources) {
      const val = (raw || '').trim();
      if (!val || /^data:/i.test(val)) continue;
      try {
        const url = new URL(val, document.baseURI);
        if (['https:', 'http:', 'file:'].includes(url.protocol)) return url.href;
      } catch {}
    }
    return '';
  }

  function tableVisibleRows(table) {
    const allVisible = [...table.rows].filter(visible);
    const nonFoot = allVisible.filter(r => tag(r.parentElement) !== 'TFOOT');
    return nonFoot.length ? nonFoot : allVisible;
  }

  function candidates(target) {
    const groups = [], table = target.closest ? target.closest('table') : null;
    if (table) {
      const visibleRows = tableVisibleRows(table);
      if (visibleRows.length) {
        groups.push({ type: 'table', root: table, elements: visibleRows, label: `Table · ${visibleRows.length} rows (including headers)` });
      }
    }
    let node = target;
    for (let depth = 0; node?.parentElement && depth < DEPTH_LIMIT; depth++, node = node.parentElement) {
      const t = tag(node);
      if (t === 'BODY' || t === 'HTML') break;
      if (table && TABLE_PARTS.has(t) && node.closest && node.closest('table') === table) continue;
      const elements = [...node.parentElement.children].filter(e => visible(e) && similar(node, e));
      if (elements.length < 2 || elements.length > 20000) continue;
      if (groups.some(g => g.elements.length === elements.length && g.elements[0] === elements[0])) continue;
      const firstClass = structuralClasses(node)[0] || classes(node)[0];
      groups.push({ type: 'cards', root: node.parentElement, elements, label: `${t.toLowerCase()}${firstClass ? '.' + firstClass : ''} · ${elements.length} items` });
    }
    return groups;
  }

  function cellLink(cell) {
    if (!cell.querySelectorAll) return '';
    for (const a of cell.querySelectorAll('a[href]')) {
      if (!visible(a)) continue;
      const href = extractHref(a);
      if (href) return href;
    }
    return '';
  }

  function cellImage(cell) {
    if (!cell.querySelectorAll) return '';
    for (const img of cell.querySelectorAll('img')) {
      if (!visible(img)) continue;
      const src = extractImgSrc(img);
      if (src) return src;
    }
    return '';
  }

  function tableData(table) {
    const allRows = tableVisibleRows(table), warnings = [];
    let headerCount = 0;
    while (headerCount < allRows.length) {
      const row = allRows[headerCount];
      const cells = [...row.cells].filter(visible);
      if (tag(row.parentElement) === 'THEAD' || (cells.length > 0 && cells.every(c => tag(c) === 'TH'))) {
        headerCount++;
      } else {
        break;
      }
    }
    const dataRowCount = allRows.length - headerCount;
    if (dataRowCount > ROW_LIMIT) warnings.push('Large table: export limited to 5,000 data rows.');
    const source = allRows.slice(0, headerCount + ROW_LIMIT);
    const sectionEnd = source.map((row, i) => {
      let end = i + 1;
      while (end < source.length && source[end].parentElement === row.parentElement) end++;
      return end;
    });
    const grid = [], linkGrid = [], imgGrid = [];
    for (let r = 0; r < source.length; r++) {
      grid[r] ??= []; linkGrid[r] ??= []; imgGrid[r] ??= [];
      let col = 0;
      for (const cell of [...source[r].cells].filter(visible)) {
        while (grid[r][col] !== undefined) col++;
        if (col >= COLUMN_LIMIT) { warnings.push('Only the first 100 columns are included.'); break; }
        const colspan = Math.min(cell.colSpan || 1, COLUMN_LIMIT - col);
        const maxSectionSpan = sectionEnd[r] - r;
        const rowSpan = cell.rowSpan === 0 ? maxSectionSpan : Math.min(cell.rowSpan || 1, maxSectionSpan);
        const cellText = text(cell);
        const href = r >= headerCount ? cellLink(cell) : '';
        const img = r >= headerCount ? cellImage(cell) : '';
        for (let dy = 0; dy < rowSpan; dy++) for (let dx = 0; dx < colspan; dx++) {
          grid[r + dy] ??= []; linkGrid[r + dy] ??= []; imgGrid[r + dy] ??= [];
          grid[r + dy][col + dx] = cellText;
          if (href) linkGrid[r + dy][col + dx] = href;
          if (img) imgGrid[r + dy][col + dx] = img;
        }
        col += colspan;
      }
    }
    const width = Math.min(COLUMN_LIMIT, Math.max(0, ...grid.map(r => r.length)));
    const baseHeaders = Array.from({ length: width }, (_, c) => [...new Set(grid.slice(0, headerCount).map(r => r[c]).filter(Boolean))].join(' / ') || `Column ${c + 1}`);
    const dataSlice = grid.slice(headerCount, headerCount + ROW_LIMIT);
    const linkSlice = linkGrid.slice(headerCount, headerCount + ROW_LIMIT);
    const imgSlice = imgGrid.slice(headerCount, headerCount + ROW_LIMIT);
    const colSpecs = [];
    let overflow = false;
    for (let c = 0; c < width; c++) {
      if (colSpecs.length < COLUMN_LIMIT) colSpecs.push({ label: baseHeaders[c], kind: 'text', idx: c });
      else overflow = true;
      if (linkSlice.some(r => r && r[c])) {
        if (colSpecs.length < COLUMN_LIMIT) colSpecs.push({ label: `${baseHeaders[c]} link`, kind: 'link', idx: c });
        else overflow = true;
      }
      if (imgSlice.some(r => r && r[c])) {
        if (colSpecs.length < COLUMN_LIMIT) colSpecs.push({ label: `${baseHeaders[c]} image`, kind: 'img', idx: c });
        else overflow = true;
      }
    }
    if (overflow) warnings.push('Only the first 100 columns are included.');
    const headers = colSpecs.map(s => s.label);
    const rows = dataSlice.map((_, ri) => colSpecs.map(s => {
      if (s.kind === 'link') return linkSlice[ri]?.[s.idx] ?? '';
      if (s.kind === 'img') return imgSlice[ri]?.[s.idx] ?? '';
      return dataSlice[ri]?.[s.idx] ?? '';
    }));
    return { headers, rows, warnings };
  }

  function hasMediaOrLink(el) {
    return Boolean(el.querySelector && el.querySelector('a[href], img'));
  }

  function allInlineSubtree(nodes) {
    for (const child of nodes) {
      if (!INLINE_FORMAT_TAGS.has(tag(child))) return false;
      const grand = [...child.children].filter(visible);
      if (grand.length && !allInlineSubtree(grand)) return false;
    }
    return true;
  }

  function shouldMergeInline(el, visibleChildren, path) {
    if (!visibleChildren.length) return false;
    if (hasMediaOrLink(el)) return false;
    if (!allInlineSubtree(visibleChildren)) return false;
    const direct = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(' ').replace(/\s+/g, ' ').trim();
    if (direct) return true;
    if (TEXT_HOST_TAGS.has(tag(el))) return true;
    if (path === 'item') return false;
    if (visibleChildren.length === 1) return true;
    return visibleChildren.every(c => structuralClasses(c).length === 0);
  }

  // Paths use normalized semantic tag/class identity plus visible occurrence index.
  function keyPart(el) {
    return tag(el).toLowerCase() + structuralClasses(el).sort().map(c => '.' + c).join('');
  }

  function fieldMap(root) {
    const values = new Map();
    let scanned = 0, limited = false;
    function walk(el, path) {
      if (excluded.has(tag(el))) return;
      if (++scanned > 2000) { limited = true; return; }
      if (!visible(el)) return;
      const t = tag(el);
      const put = (kind, value) => {
        if (value) {
          const name = el.getAttribute?.('data-label') || el.getAttribute?.('aria-label') || structuralClasses(el)[0] || classes(el)[0] || t.toLowerCase();
          values.set(path + '|' + kind, { label: name + ' ' + kind, value });
        }
      };
      if (t === 'A') {
        const href = extractHref(el);
        if (href) put('link', href);
      }
      if (t === 'IMG') {
        const src = extractImgSrc(el);
        if (src) put('image', src);
        const alt = (el.getAttribute?.('alt') || '').replace(/\s+/g, ' ').trim();
        if (alt) put('alt', alt);
      }
      const children = [...el.children].filter(visible);
      if (!children.length || shouldMergeInline(el, children, path)) {
        put('text', text(el));
      } else {
        const direct = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(' ').replace(/\s+/g, ' ').trim();
        put('text', direct);
        const occurrences = new Map();
        for (const child of children) {
          const part = keyPart(child), n = (occurrences.get(part) || 0) + 1;
          occurrences.set(part, n);
          walk(child, path + '/' + part + ':' + n);
        }
      }
    }
    walk(root, 'item');
    return { values, limited };
  }

  function exceedsCellLimit(value) {
    if (value.length > 32767) return true;
    return value.replace(/_x([0-9a-fA-F]{4})_/g, '_x005F_x$1_').length > 32767;
  }

  function extract(group) {
    if (!group) throw new Error('Choose a repeated group first.');
    let result;
    if (group.type === 'table') result = tableData(group.root);
    else {
      const warnings = [], fields = new Map(), maps = group.elements.slice(0, ROW_LIMIT).map(el => fieldMap(el));
      if (group.elements.length > ROW_LIMIT) warnings.push('Only the first 5,000 items are included.');
      if (maps.some(m => m.limited)) warnings.push('Complex items were limited to 2,000 elements each.');
      let overflow = false;
      for (const { values } of maps) for (const [key, entry] of values) if (!fields.has(key)) {
        if (fields.size < COLUMN_LIMIT) fields.set(key, entry.label);
        else overflow = true;
      }
      if (overflow) warnings.push('Only the first 100 detected columns are included.');
      const labels = new Map(), headers = [...fields.values()].map(label => {
        const n = (labels.get(label) || 0) + 1;
        labels.set(label, n);
        return label + (n > 1 ? ' ' + n : '');
      });
      result = { headers, rows: maps.map(m => [...fields.keys()].map(k => m.values.get(k)?.value ?? '')), warnings };
    }
    if (result.rows.some(r => r.some(exceedsCellLimit))) {
      result.warnings.push('Long cells will be truncated to Excel’s 32,767-character limit.');
    }
    result.warnings = [...new Set(result.warnings)];
    return result;
  }

  globalThis.HarvestExtract = { candidates, extract };
})();
