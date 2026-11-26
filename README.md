# Page Harvest — Website to Excel

A dependency-free Chrome/Edge extension: select a repeated website item, review the extracted rows, and download a real `.xlsx` workbook. Processing happens locally in the tab. No API key, server, or account required.

## Install on Windows

1. Right-click `page-harvest.zip` → **Extract All**. Keep the extracted folder in a permanent location, for example `C:\dev\page-harvest`.
2. In Chrome, open `chrome://extensions`. In Edge, open `edge://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select the inner `page-harvest` folder that directly contains `manifest.json`.
5. Pin **Page Harvest — Website to Excel** from the browser’s Extensions menu.

This is an unpacked extension, not a Chrome Web Store listing. It requires no build step or npm install to use.

## Extract data

1. Open your target website. Wait for the content to load.
2. Click the Page Harvest toolbar icon.
3. Click **Select item on page**, then click a product title, article, list item, or table cell. Press **Esc** to cancel selection.
4. Choose the desired **Detected group** if several groups are offered. The detector looks for repeated siblings at different ancestor levels.
5. Check the preview. Rename columns and uncheck unwanted columns. Enable **Remove duplicate rows** if needed.
6. Click **Export .xlsx**. The browser downloads the file using its normal download settings.

The preview displays up to 50 rows; export includes all detected rows up to the 5,000-row limit. All values are exported as text, so product codes such as `00120` retain their zeros. Formula-like text is not executed as a formula. Convert numeric columns in Excel if you need calculations.

**Refresh extraction** rereads the selected group after new content is loaded. It resets column names and selections. Scroll or click the website’s Load more button yourself before refreshing. If the site replaces the selected element, select an item again. A page reload or navigation discards the current selection and preview.

## Try the demo

Open `demo.html`. On the extension’s Details page, enable **Allow access to file URLs** to let it read local HTML. Select a product title: expect three rows, including a blank description for the polo product. Select an inventory cell: expect three rows and four columns, preserving SKU zeros.

Alternatively, run `python -m http.server 8000` in this folder and visit `http://localhost:8000/demo.html`.

## What it supports

- Repeating sibling cards/list items with similar HTML structures.
- Text, supported link URLs, image URLs, and image alt text. Image files themselves are not downloaded.
- HTML tables, including empty cells and common merged-cell layouts.
- Column inclusion/renaming, group selection, duplicate removal, and refresh.
- UTF-8/Unicode Excel output, frozen header row and filters.

## Limits

- **Current page only.** No automatic pagination, whole-site crawl, or scheduled extraction.
- Only elements present in the current top-level page DOM. Virtualized lists may remove earlier rows while you scroll; those removed rows cannot be recovered by refreshing.
- No iframe content, shadow-root content, PDF/image OCR, browser settings pages, or extension-store pages.
- Matching is based on HTML structure, not semantic AI. Unusual layouts, changing class names, or inconsistent markup can produce extra/misaligned columns. Review the preview and try a different group. This is not guaranteed to work with every website.
- Maximum 5,000 rows, 100 columns and 2,000 visited elements per card. Cells exceeding Excel’s 32,767-character limit are truncated; limits generate notices. XLSX files are uncompressed, so very large extracts can use significant memory.
- Extracted form controls are excluded. Downloads contain text and URLs, not interactive HTML.

## Permissions and privacy

`activeTab` grants access when you click the toolbar icon. `scripting` injects the bundled extraction panel. The extension requests no persistent access to all websites, makes no network requests, and stores no extracted data. The demo has ordinary external example links that are only visited if you click them outside selection mode.

## Source files

| File | Purpose |
| --- | --- |
| `manifest.json`, `worker.js` | Extension configuration and user-triggered injection |
| `extractor.js` | Repeated group detection and field alignment |
| `panel.js` | Isolated selection/preview interface and download |
| `xlsx.js` | Dependency-free ZIP/OOXML export |
| `demo.html`, `demo.css` | Local test page |
| `error.html`, `error.js` | Help when a page cannot be accessed |
| `tests/` | Extraction, UI and workbook checks |

## Developer verification

Node.js 20+ and Python with openpyxl are required for tests, not for extension use.

```sh
npm install
npx playwright install chromium
npm test
python -m pip install openpyxl
python tests/verify_workbooks.py
```

Optional `CHROMIUM_BIN` selects an existing Chromium executable. The test harness also supports the host runtime’s `CODEX_PRIMARY_RUNTIME_NODE_MODULES` environment variable.

Verified during development in Chromium 153: card field alignment with missing optional content, table blank cells/row spans, selection, renaming/excluding columns, refresh, deduplication, Escape, close, and download. The actual downloaded workbook was opened with openpyxl to verify its dimensions and values. The screenshot in `docs/preview.png` is from the browser test.

**Remaining manual check:** loading the extension and invoking its toolbar action in regular Chrome/Edge. The available headless Chromium runtime ran the page scripts but did not expose an extension service worker. No real target website was supplied, so website-specific compatibility has not been verified.
