// Builds The Credit Score Handbook PDF from src/*.html using Chromium (Playwright).
// Two passes: pass 1 locates each chapter's page via hidden markers; pass 2 renders
// the final PDF with real page numbers in the table of contents.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const OUT_HTML = path.join(SRC, '_book.html');
const OUT_PDF = path.join(ROOT, 'The-Credit-Score-Handbook.pdf');
const PASS1_PDF = path.join(ROOT, '.pass1.pdf');

function loadParts() {
  return fs.readdirSync(SRC)
    .filter(f => /^\d\d-.*\.html$/.test(f))
    .sort()
    .map(f => fs.readFileSync(path.join(SRC, f), 'utf8'))
    .join('\n');
}

function chaptersOf(body) {
  const re = /<section class="chapter[^"]*" id="([^"]+)" data-part="([^"]+)" data-title="([^"]+)"/g;
  const list = [];
  let m;
  while ((m = re.exec(body))) list.push({ id: m[1], part: m[2], title: m[3] });
  return list;
}

function tocHtml(chapters, pages) {
  let html = '<section class="toc" id="toc"><div class="eyebrow">Inside this book</div><h2>Contents</h2>';
  let lastPart = null;
  chapters.forEach(c => {
    if (c.part !== lastPart) { html += `<div class="part">${c.part}</div>`; lastPart = c.part; }
    const n = /^ch(\d+)$/.test(c.id) ? c.id.replace('ch', '') : '';
    const p = pages[c.id] != null ? pages[c.id] : '00';
    html += `<a href="#${c.id}"><span class="n">${n}</span><span class="t">${c.title}</span><span class="p">${p}</span></a>`;
  });
  return html + '</section>';
}

function page(body, chapters, pages, keepMarkers) {
  let b = body.replace('<!--TOC-->', tocHtml(chapters, pages));
  if (!keepMarkers) b = b.replace(/<span class="mk">@@[^@]+@@<\/span>/g, '');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>The Credit Score Handbook</title>
<link rel="stylesheet" href="styles.css"></head><body>${b}</body></html>`;
}

async function render(html, out) {
  fs.writeFileSync(OUT_HTML, html);
  const browser = await chromium.launch();
  const pg = await browser.newPage();
  await pg.goto('file://' + OUT_HTML, { waitUntil: 'networkidle' });
  await pg.evaluate(() => document.fonts.ready);
  await pg.pdf({ path: out, preferCSSPageSize: true, printBackground: true, tagged: true });
  await browser.close();
}

function findPages(pdf) {
  const text = execFileSync('pdftotext', ['-raw', pdf, '-'], { maxBuffer: 64 * 1024 * 1024 }).toString();
  const pagesText = text.split('\f');
  const found = {};
  pagesText.forEach((t, i) => {
    const re = /@@([a-z0-9-]+)@@/g; let m;
    while ((m = re.exec(t))) if (!(m[1] in found)) found[m[1]] = i + 1;
  });
  return { found, total: pagesText.filter(s => s.trim().length).length };
}

function setMetadata(pdf, marks) {
  // Clone the Chromium PDF (keeps outline, links and tags) and add document metadata.
  const py = `
import sys, json
from pypdf import PdfReader, PdfWriter
src = sys.argv[1]
marks = json.loads(sys.argv[2])
w = PdfWriter(clone_from=PdfReader(src))
w.add_metadata({
    "/Title": "The Credit Score Handbook",
    "/Subject": "Credit scores, credit bureaus, credit reports and borrowing strategy: India, USA and global",
    "/Keywords": "credit score, CIBIL, Experian, Equifax, CRIF High Mark, TransUnion, FICO, VantageScore, credit report",
    "/Creator": "Chromium (HTML to PDF)",
})
for m in marks:
    w.add_outline_item(m["title"], m["page"] - 1)
w.page_mode = "/UseOutlines"
with open(src, "wb") as f:
    w.write(f)
`;
  execFileSync('python3', ['-c', py, pdf, JSON.stringify(marks)]);
}

(async () => {
  const body = loadParts();
  const chapters = chaptersOf(body);
  await render(page(body, chapters, {}, true), PASS1_PDF);
  const { found, total } = findPages(PASS1_PDF);
  const missing = chapters.filter(c => !(c.id in found)).map(c => c.id);
  if (missing.length) console.warn('WARNING: markers not found for', missing.join(', '));
  await render(page(body, chapters, found, false), OUT_PDF);
  fs.unlinkSync(PASS1_PDF);
  const marks = [{ title: 'Foreword', page: 2 }, { title: 'Contents', page: 3 }].concat(
    chapters.map(c => ({
      title: (/^ch\d+$/.test(c.id) ? c.id.replace('ch', '') + ' · ' : '') + c.title.replace(/&amp;/g, '&'),
      page: found[c.id],
    })));
  setMetadata(OUT_PDF, marks);
  console.log(`Built ${OUT_PDF}`);
  console.log(`Pages (pass 1): ${total}; chapters: ${chapters.length}`);
  console.log(chapters.map(c => `${c.id.padEnd(9)} p.${String(found[c.id]).padStart(3)}  ${c.title}`).join('\n'));
})().catch(e => { console.error(e); process.exit(1); });
