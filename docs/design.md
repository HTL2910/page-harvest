# Page Harvest design

Build a Chrome/Edge Manifest V3 extension for user-triggered extraction from the current page. Clicking the toolbar action injects bundled code in an isolated world and opens a Shadow DOM panel. No remote code, API keys, analytics, backend, or persistent website access.

The user selects a repeated card or table row. The detector walks its ancestors, proposes structurally similar siblings, and exposes multiple candidate groups when ambiguous. Tables preserve cell positions and expand spans. Cards expose text leaves, links, and images by paths relative to the card, aligning fields across similar structures. Missing fields stay blank. Preview columns can be renamed/excluded; users can remove duplicate rows. Extraction is heuristic, so preview is mandatory.

Export an actual ZIP/OOXML XLSX with inline string cells, preserving Unicode, leading zeros, and formula-like text literally. All code is bundled and dependency-free. Limits: 5,000 rows, 100 columns, and 32,767 UTF-16 units per cell with visible notices. Only the current top-frame light DOM is supported. Infinite scrolling must be performed manually before extraction; pagination, virtualized history, nested frames, shadow roots, images of text, and CAPTCHA bypass are out of scope.

Provide a demo with cards and tables, installation instructions, automated Chromium tests, and an independent openpyxl check of the produced workbook. Deliver source, tests and docs in one ZIP.
