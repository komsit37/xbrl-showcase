#!/usr/bin/env node
import { parseHTML } from 'linkedom';

const USER_AGENT = process.env.SEC_UA || 'your.email@email.com';

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
const IX_NONNUMERIC_TAG = 'ix:nonnumeric';

// Fetch text with SEC-friendly headers.
async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept-Encoding': 'gzip, deflate'
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

// Fetch and parse JSON from a URL.
async function fetchJson(url) {
  return JSON.parse(await fetchText(url));
}

// Normalize CIK to 10 digits (zero-padded).
function padCik(cikValue) {
  const digits = String(cikValue).replace(/\\D/g, '');
  return digits.padStart(10, '0');
}

// Normalize CIK to an integer string (no leading zeros).
function normalizeCik(cikValue) {
  const digits = String(cikValue).replace(/\\D/g, '');
  return String(parseInt(digits || '0', 10));
}

// Build the filing index.json URL from CIK + accession number.
function accessionToIndexUrl(cikValue, accessionNumber) {
  const cikNoZero = normalizeCik(cikValue);
  const accNoDash = accessionNumber.replace(/-/g, '');
  return `https://www.sec.gov/Archives/edgar/data/${cikNoZero}/${accNoDash}/index.json`;
}

// Resolve ticker -> CIK using SEC's company_tickers.json.
async function lookupCikBySymbol(ticker) {
  const json = await fetchJson('https://www.sec.gov/files/company_tickers.json');
  const upper = ticker.toUpperCase();
  const entries = Object.values(json);
  for (const entry of entries) {
    if (String(entry.ticker).toUpperCase() === upper) {
      return {
        cik: padCik(entry.cik_str),
        ticker: entry.ticker,
        title: entry.title
      };
    }
  }
  throw new Error(`Ticker not found in SEC company_tickers.json: ${ticker}`);
}

// Convert SEC recent filings columnar arrays into row objects.
function normalizeRecentFilings(recent) {
  const count = recent?.accessionNumber?.length || 0;
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    const row = {};
    for (const [key, values] of Object.entries(recent)) {
      row[key] = Array.isArray(values) ? values[i] : values;
    }
    rows.push(row);
  }
  return rows;
}

// Find the latest inline XBRL filing and return its index.json URL.
async function resolveIndexUrlFromSymbolOrCik({ symbolArg, cikArg, formArg }) {
  let resolved = null;
  if (symbolArg) {
    resolved = await lookupCikBySymbol(symbolArg);
  } else {
    resolved = { cik: padCik(cikArg), ticker: null, title: null };
  }

  const submissionsUrl = `https://data.sec.gov/submissions/CIK${resolved.cik}.json`;
  const submissions = await fetchJson(submissionsUrl);
  const recent = normalizeRecentFilings(submissions?.filings?.recent || {});

  const allowedForms = formArg
    ? [formArg]
    : ['10-K', '10-Q', '10-K/A', '10-Q/A'];

  const isInline = (f) => f.isInlineXBRL === 1 || f.isInlineXBRL === '1' || f.isInlineXBRL === true;
  const filtered = recent.filter((f) => allowedForms.includes(f.form));
  const sorted = filtered.sort((a, b) => (b.filingDate || '').localeCompare(a.filingDate || ''));
  const pick = sorted.find(isInline) || sorted[0];

  if (!pick) {
    throw new Error(`No recent filings found for forms: ${allowedForms.join(', ')}`);
  }

  return {
    cik: resolved.cik,
    company: resolved.title || submissions?.name || '',
    ticker: resolved.ticker || (submissions?.tickers?.[0] ?? ''),
    filing: pick,
    indexUrl: accessionToIndexUrl(resolved.cik, pick.accessionNumber)
  };
}

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

// Scan all HTML files in a filing and return the first iXBRL document.
async function findIxbrlHtml(indexJsonUrl) {
  const index = await fetchJson(indexJsonUrl);
  const baseUrl = indexJsonUrl.replace(/index\.json$/, '');
  const items = (index?.directory?.item || []).filter((i) =>
    i.name && /\.(htm|html)$/i.test(i.name)
  );
  const htmlNames = items
    .map((i) => i.name)
    .filter((name) => name && !/-index\.htm$/i.test(name));

  for (const item of items) {
    if (/-index\.htm$/i.test(item.name)) continue;
    const url = baseUrl + item.name;
    const html = await fetchText(url);
    if (/<ix:nonfraction|<ix:nonFraction|<ix:nonnumeric|<ix:nonNumeric/i.test(html)) {
      return { url, html };
    }
  }
  const hint = htmlNames.length
    ? `HTML files in this filing: ${htmlNames.slice(0, 12).join(', ')}${htmlNames.length > 12 ? ', ...' : ''}`
    : 'No HTML files listed in this filing.';
  throw new Error(
    `No iXBRL HTML document found in index.json. This filing may not be inline XBRL (e.g., Form 4). ${hint}`
  );
}

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
