# The Credit Score Handbook

A 50-page knowledge book on credit scores, credit bureaus, credit reports and borrowing strategy. It covers India in depth, the USA alongside it, and gives a short global overview.

- **PDF:** `The-Credit-Score-Handbook.pdf`
- **Source:** `src/*.html` (chapters) and `src/styles.css`
- **Rebuild:** `node build.js` (needs Node Playwright with Chromium, `pdftotext` and Python `pypdf`)

The build renders the HTML twice with Chromium. The first pass finds the page each chapter starts on, so the contents page and the PDF bookmarks get the correct page numbers. Fonts (Inter, Source Serif 4, JetBrains Mono; SIL Open Font License) are bundled in `fonts/`.
