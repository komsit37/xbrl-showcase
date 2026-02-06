#!/usr/bin/env node
import { parseHTML } from 'linkedom';
import { findIxbrlHtml, resolveIndexUrlFromSymbolOrCik } from './edgar-ixbrl-utils.js';

const args = process.argv.slice(2);
// Read a single CLI flag value (e.g., --symbol AAPL).
const getArg = (flag) => {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
};

// Print help text with supported CLI modes.
const usage = () => {
  console.error(
    'Usage:\n' +
    '  SEC_UA="Your Name your@email.com" npm start -- --symbol AAPL\n' +
    '  SEC_UA="Your Name your@email.com" npm start -- --cik 0000320193\n' +
    '  SEC_UA="Your Name your@email.com" npm start -- --index https://www.sec.gov/Archives/.../index.json\n' +
    'Options:\n' +
    '  --form 10-K | 10-Q (optional; default: latest 10-K/10-Q with iXBRL)'
  );
};

let indexUrl = getArg('--index');
let symbol = getArg('--symbol');
let cik = getArg('--cik');
const formArg = getArg('--form');

if (!indexUrl && !symbol && !cik && args.length === 1 && !args[0].startsWith('--')) {
  if (args[0].startsWith('http')) {
    indexUrl = args[0];
  } else {
    symbol = args[0];
  }
}

if (indexUrl && !indexUrl.endsWith('/index.json')) {
  console.error('Index URL must end with /index.json');
  usage();
  process.exit(1);
}
if (!indexUrl && !symbol && !cik) {
  usage();
  process.exit(1);
}

const INCOME_TAGS = ['us-gaap:ProfitLoss', 'us-gaap:NetIncomeLoss'];
const IX_NONFRACTION_TAG = 'ix:nonfraction';

// Build a map of contextRef -> period dates for table header labels.
function buildContextMap(document) {
  const map = new Map();
  let contexts = document.querySelectorAll('xbrli\\:context');
  if (!contexts || contexts.length === 0) {
    contexts = findElementsByTag(document, 'xbrli:context');
  }
  for (const ctx of contexts) {
    const id = ctx.getAttribute('id');
    if (!id) continue;
    const periodStart = getFirstTextByTag(ctx, 'xbrli:startdate');
    const periodEnd = getFirstTextByTag(ctx, 'xbrli:enddate');
    const instant = getFirstTextByTag(ctx, 'xbrli:instant');
    map.set(id, { periodStart, periodEnd, instant });
  }
  return map;
}

// Convert a contextRef into a readable period label.
function ctxLabel(ctxMap, id) {
  const ctx = ctxMap.get(id);
  if (!ctx) return id || '';
  if (ctx.periodEnd) {
    return ctx.periodStart ? `${ctx.periodStart}..${ctx.periodEnd}` : ctx.periodEnd;
  }
  if (ctx.instant) return ctx.instant;
  return id || '';
}

// Parse ix:nonfraction number with sign and scale.
function parseNonfraction(nf) {
  const raw = (nf.textContent || '').trim();
  const isNegParens = raw.startsWith('(') && raw.endsWith(')');
  const numeric = raw.replace(/[(),]/g, '');
  const base = Number.parseFloat(numeric);
  if (Number.isNaN(base)) return null;

  const signAttr = nf.getAttribute('sign') === '-' ? -1 : 1;
  const sign = (isNegParens ? -1 : 1) * signAttr;

  const scaleAttr = nf.getAttribute('scale');
  const scale = scaleAttr ? Math.pow(10, Number(scaleAttr)) : 1;

  return sign * base * scale;
}

// Fallback tag search for namespaced tags (e.g., xbrli:context).
function findElementsByTag(root, tagLower) {
  const out = [];
  const all = root.querySelectorAll ? root.querySelectorAll('*') : [];
  for (const el of all) {
    const name = (el.tagName || '').toLowerCase();
    if (name === tagLower) out.push(el);
  }
  return out;
}

// Check if element is ix:nonfraction (lowercased tagName).
function isIxNonfraction(el) {
  const name = (el.tagName || '').toLowerCase();
  return name === IX_NONFRACTION_TAG;
}

// Collect all ix:nonfraction elements under a root node.
function getIxNonfractionElements(root) {
  const out = [];
  const all = root.querySelectorAll ? root.querySelectorAll('*') : [];
  for (const el of all) {
    if (isIxNonfraction(el)) out.push(el);
  }
  return out;
}

// Read textContent from the first element matching a tag name.
function getFirstTextByTag(root, tagLower) {
  const matches = findElementsByTag(root, tagLower);
  if (matches.length === 0) return '';
  const text = matches[0].textContent || '';
  return text.trim();
}

// Locate the table that contains ProfitLoss / NetIncomeLoss tags.
function findIncomeStatementTable(document) {
  const nfs = getIxNonfractionElements(document);
  for (const nf of nfs) {
    const name = nf.getAttribute('name') || nf.getAttribute('Name');
    if (!name) continue;
    if (INCOME_TAGS.includes(name)) {
      const table = nf.closest('table');
      if (table) return table;
    }
  }
  return null;
}

// Extract labeled rows + contextRef values from the income statement table.
function parseTable(table, ctxMap) {
  const rows = [];
  const trs = table.querySelectorAll('tr');
  for (const tr of trs) {
    const cells = tr.querySelectorAll('th,td');
    if (cells.length === 0) continue;

    const label = (cells[0].textContent || '').trim().replace(/\s+/g, ' ');
    const nfs = getIxNonfractionElements(tr);
    if (nfs.length === 0) continue;

    const values = [];
    const ctxRefs = [];
    for (const nf of nfs) {
      values.push(parseNonfraction(nf));
      ctxRefs.push(nf.getAttribute('contextref') || nf.getAttribute('contextRef') || '');
    }

    rows.push({ label, values, ctxRefs });
  }

  const header = rows.length ? rows[0].ctxRefs.map((id) => ctxLabel(ctxMap, id)) : [];
  return { header, rows };
}

// (shared SEC/iXBRL helpers live in edgar-ixbrl-utils.js)

(async () => {
  // 1) Resolve filing from symbol/CIK/index.
  let effectiveIndexUrl = indexUrl;
  if (!effectiveIndexUrl) {
    const resolved = await resolveIndexUrlFromSymbolOrCik({
      symbolArg: symbol,
      cikArg: cik,
      formArg
    });
    // 2) Log the selected filing metadata.
    effectiveIndexUrl = resolved.indexUrl;
    const form = resolved.filing.form;
    const filed = resolved.filing.filingDate || '';
    const acc = resolved.filing.accessionNumber || '';
    const inline = resolved.filing.isInlineXBRL;
    console.log(`Selected filing: ${resolved.ticker || ''} ${resolved.company || ''}`.trim());
    console.log(`Form ${form} filed ${filed} accession ${acc}`);
    if (!(inline === 1 || inline === '1' || inline === true)) {
      console.warn('Filing not flagged as inline XBRL. Attempting HTML scan anyway.');
    }
  }

  // 3) Download iXBRL HTML and parse DOM.
  const { url: htmlUrl, html } = await findIxbrlHtml(effectiveIndexUrl);
  const { document } = parseHTML(html);

  // 4) Build context map and locate the income statement table.
  const ctxMap = buildContextMap(document);
  const table = findIncomeStatementTable(document);
  if (!table) {
    console.error('Income statement table not found (no ProfitLoss/NetIncomeLoss tag).');
    process.exit(2);
  }

  // 5) Parse table rows + headers and print to console.
  const { header, rows } = parseTable(table, ctxMap);

  console.log(`Income Statement (from ${htmlUrl})`);
  if (header.length) {
    console.log(['Label', ...header].join('\t'));
  } else {
    console.log('Label\tValues...');
  }

  for (const row of rows) {
    const values = row.values.map((v) => (v === null || v === undefined) ? '' : v.toLocaleString());
    console.log([row.label, ...values].join('\t'));
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
