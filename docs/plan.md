# Page Harvest Implementation Plan

**Goal:** Select repeating website content, review aligned data, export a real XLSX locally.
**Architecture:** Toolbar service worker injects extractor, XLSX writer and isolated panel. Extractor is independent of UI. Export uses OOXML inline strings and a stored ZIP writer.
**Tech Stack:** Plain JavaScript, Chrome Manifest V3, Playwright tests, Python openpyxl validation.
**Spec:** design.md

## Global constraints
No remote runtime dependencies; user-initiated activeTab access; current top frame only; 5,000 rows / 100 columns; extracted values rendered as text and exported as literal strings.

## Tasks
1. Define browser tests before production code: extract three cards with an optional field, preserve table blanks/spans, choose ancestor groups, export Unicode and formula-like strings. Run tests and confirm missing functionality.
2. Implement `HarvestExtract.candidates(element)` and `HarvestExtract.extract(group)` in extractor.js; `HarvestXlsx.build(headers, rows)` in xlsx.js returns Uint8Array. Run tests and open generated workbook using openpyxl.
3. Implement worker.js toolbar injection and panel.js selection UI. Add column controls, group selector, deduplication, rescan, CSV-free XLSX download and errors. Add Manifest V3 config and demo.html.
4. Exercise selection through export with Chromium and load the unpacked extension. Inspect screenshot. Write README including limits and Windows installation. Package complete folder in page-harvest.zip and save deliverable.
