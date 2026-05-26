#!/usr/bin/env node
/**
 * Flowra PDF Generation Script
 * Converts Markdown documentation to styled PDF files.
 * Uses system Chrome via puppeteer.
 */

const puppeteer = require('puppeteer')
const { marked }   = require('marked')
const fs           = require('fs')
const path         = require('path')

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const ROOT        = path.join(__dirname, '..')
const OUT_DIR     = path.join(ROOT, 'release-package', 'pdfs')

// Documents to convert: [source_path, output_filename]
const DOCS = [
  // Turkish docs
  ['docs/KURULUM_KILAVUZU.md',              'KURULUM_KILAVUZU.pdf'],
  ['docs/GUNCELLEME_KILAVUZU.md',           'GUNCELLEME_KILAVUZU.pdf'],
  ['docs/SORUN_GIDERME_KILAVUZU.md',        'SORUN_GIDERME_KILAVUZU.pdf'],
  ['docs/CANLIYA_ALMA_KILAVUZU.md',         'CANLIYA_ALMA_KILAVUZU.pdf'],
  ['docs/SURUM_NOTLARI.md',                 'SURUM_NOTLARI.pdf'],
  ['docs/SISTEM_MIMARISI.md',               'SISTEM_MIMARISI.pdf'],
  ['docs/ORTAKLAR_VE_YONETISIM_REHBERI.md', 'ORTAKLAR_VE_YONETISIM_REHBERI.pdf'],
  ['docs/SISTEM_YONETICI_KILAVUZU.md',      'SISTEM_YONETICI_KILAVUZU.pdf'],
  ['docs/KULLANICI_KILAVUZU.md',            'KULLANICI_KILAVUZU.pdf'],
  ['docs/CFO_MUHASEBE_EL_KITABI.md',        'CFO_MUHASEBE_EL_KITABI.pdf'],
  // English docs
  ['MASTER_INSTALL.md',                     'MASTER_INSTALL.pdf'],
  ['MASTER_UPGRADE.md',                     'MASTER_UPGRADE.pdf'],
  ['PRODUCTION_DEPLOYMENT.md',              'PRODUCTION_DEPLOYMENT.pdf'],
  ['TROUBLESHOOTING.md',                    'TROUBLESHOOTING.pdf'],
  ['docs/ADMIN_GUIDE.md',                   'ADMIN_GUIDE.pdf'],
  ['docs/USER_GUIDE.md',                    'USER_GUIDE.pdf'],
  ['docs/CFO_HANDBOOK.md',                  'CFO_HANDBOOK.pdf'],
  ['docs/RELEASE_CERTIFICATION.md',         'RELEASE_CERTIFICATION.pdf'],
  ['README.md',                             'README.pdf'],
]

const CSS = `
  @page { margin: 20mm 18mm; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.6;
    color: #1a1a2e;
    max-width: 100%;
  }
  h1 {
    font-size: 22pt;
    color: #7c3aed;
    border-bottom: 3px solid #7c3aed;
    padding-bottom: 8px;
    margin-top: 0;
    page-break-after: avoid;
  }
  h2 {
    font-size: 15pt;
    color: #1a1a2e;
    border-bottom: 1px solid #e5e7eb;
    padding-bottom: 4px;
    margin-top: 24px;
    page-break-after: avoid;
  }
  h3 {
    font-size: 12pt;
    color: #374151;
    margin-top: 16px;
    page-break-after: avoid;
  }
  h4 { font-size: 11pt; color: #6b7280; page-break-after: avoid; }
  p { margin: 6px 0 10px; orphans: 3; widows: 3; }
  code {
    background: #f3f4f6;
    border: 1px solid #e5e7eb;
    border-radius: 3px;
    padding: 1px 5px;
    font-family: 'SF Mono', Consolas, 'Courier New', monospace;
    font-size: 9.5pt;
    color: #7c3aed;
  }
  pre {
    background: #1e1e2e;
    color: #cdd6f4;
    border-radius: 6px;
    padding: 12px 16px;
    overflow-x: auto;
    font-size: 9pt;
    line-height: 1.5;
    page-break-inside: avoid;
  }
  pre code {
    background: none;
    border: none;
    padding: 0;
    color: inherit;
    font-size: inherit;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0;
    font-size: 10pt;
    page-break-inside: auto;
  }
  th {
    background: #7c3aed;
    color: white;
    padding: 7px 10px;
    text-align: left;
    font-weight: 600;
  }
  td {
    padding: 6px 10px;
    border-bottom: 1px solid #e5e7eb;
    vertical-align: top;
  }
  tr:nth-child(even) td { background: #f9fafb; }
  ul, ol { margin: 6px 0 10px 20px; }
  li { margin: 3px 0; }
  blockquote {
    border-left: 4px solid #7c3aed;
    margin: 12px 0;
    padding: 8px 16px;
    background: #faf5ff;
    color: #4c1d95;
    border-radius: 0 6px 6px 0;
  }
  hr {
    border: none;
    border-top: 2px solid #e5e7eb;
    margin: 20px 0;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 0 16px;
    border-bottom: 3px solid #7c3aed;
    margin-bottom: 24px;
  }
  .brand { font-size: 20pt; font-weight: 800; color: #7c3aed; letter-spacing: -0.5px; }
  .meta { font-size: 9pt; color: #9ca3af; text-align: right; }
`

function mdToHtml(mdContent, title) {
  const body = marked(mdContent)
  const date = new Date().toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric' })
  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>${CSS}</style>
</head>
<body>
  <div class="header">
    <div class="brand">Flowra</div>
    <div class="meta">${title}<br>${date}</div>
  </div>
  ${body}
</body>
</html>`
}

async function generatePdfs() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })

  let browser
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    })
  } catch (err) {
    console.error('Failed to launch Chrome:', err.message)
    process.exit(1)
  }

  const page = await browser.newPage()
  let generated = 0
  let skipped   = 0

  for (const [srcRel, outFile] of DOCS) {
    const srcPath = path.join(ROOT, srcRel)
    const outPath = path.join(OUT_DIR, outFile)

    if (!fs.existsSync(srcPath)) {
      console.log(`  ⏭  SKIP (not found): ${srcRel}`)
      skipped++
      continue
    }

    const md      = fs.readFileSync(srcPath, 'utf8')
    const title   = path.basename(srcRel, '.md')
    const html    = mdToHtml(md, title)

    await page.setContent(html, { waitUntil: 'load', timeout: 60000 })
    await page.pdf({
      path:   outPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' },
    })
    console.log(`  ✅  ${outFile}`)
    generated++
  }

  await browser.close()
  console.log(`\nDone: ${generated} PDFs generated, ${skipped} skipped → ${OUT_DIR}`)
}

generatePdfs().catch(err => { console.error(err); process.exit(1) })
