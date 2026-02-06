const USER_AGENT = process.env.SEC_UA || 'your.email@email.com';

// Fetch text with SEC-friendly headers.
export async function fetchText(url) {
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
export async function fetchJson(url) {
  return JSON.parse(await fetchText(url));
}

// Normalize CIK to 10 digits (zero-padded).
export function padCik(cikValue) {
  const digits = String(cikValue).replace(/\D/g, '');
  return digits.padStart(10, '0');
}

// Normalize CIK to an integer string (no leading zeros).
export function normalizeCik(cikValue) {
  const digits = String(cikValue).replace(/\D/g, '');
  return String(parseInt(digits || '0', 10));
}

// Build the filing index.json URL from CIK + accession number.
export function accessionToIndexUrl(cikValue, accessionNumber) {
  const cikNoZero = normalizeCik(cikValue);
  const accNoDash = accessionNumber.replace(/-/g, '');
  return `https://www.sec.gov/Archives/edgar/data/${cikNoZero}/${accNoDash}/index.json`;
}

// Resolve ticker -> CIK using SEC's company_tickers.json.
export async function lookupCikBySymbol(ticker) {
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
export function normalizeRecentFilings(recent) {
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
export async function resolveIndexUrlFromSymbolOrCik({ symbolArg, cikArg, formArg }) {
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

// Scan all HTML files in a filing and return the first iXBRL document.
export async function findIxbrlHtml(indexJsonUrl) {
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
