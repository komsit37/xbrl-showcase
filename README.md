# XBRL Showcase (EDGAR iXBRL Income Statement)

This script downloads an EDGAR filing, finds the inline XBRL income statement table, parses numeric rows, and prints them to the console.

## Requirements
- Node.js 18+ (uses built-in `fetch`)

## Install
```bash
cd xbrl-showcase
npm install
```

## Run (by symbol)
```bash
read10k/xbrl-showcase » npm start -- --symbol AAPL

Selected filing: AAPL Apple Inc.
Form 10-Q filed 2026-01-30 accession 0000320193-26-000006
Income Statement (from https://www.sec.gov/Archives/edgar/data/320193/000032019326000006/aapl-20251227.htm)
Label   2025-09-28..2025-12-27  2024-09-29..2024-12-28
Products        113,743,000,000 97,960,000,000
Services        30,013,000,000  26,340,000,000
Total net sales 143,756,000,000 124,300,000,000
Products        67,478,000,000  59,447,000,000
Services        7,047,000,000   6,578,000,000
Total cost of sales     74,525,000,000  66,025,000,000
Gross margin    69,231,000,000  58,275,000,000
Research and development        10,887,000,000  8,268,000,000
Selling, general and administrative     7,492,000,000   7,175,000,000
Total operating expenses        18,379,000,000  15,443,000,000
Operating income        50,852,000,000  42,832,000,000
Other income/(expense), net     150,000,000     -248,000,000
Income before provision for income taxes        51,002,000,000  42,584,000,000
Provision for income taxes      8,905,000,000   6,254,000,000
Net income      42,097,000,000  36,330,000,000
Basic   2.85    2.41
Diluted 2.84    2.4
Basic   14,748,158,000  15,081,724,000
Diluted 14,810,356,000  15,150,865,000

```

## Run (by CIK)
```bash
npm start -- --cik 0000320193
```

## Run (by index.json URL)
```bash
npm start -- --index https://www.sec.gov/Archives/edgar/data/320193/000032019326000006/index.json
```

## Optional: form filter
```bash
npm start -- --symbol AAPL --form 10-K
```

## Notes
- SEC requires a `User-Agent` identifying your requestor. Set it via `SEC_UA`. The script defaults to `your.email@email.com` if you don’t set it.
- The script selects the most recent 10-K/10-Q filing that is flagged as inline XBRL. If none are flagged, it falls back to the most recent filing and scans HTML files for iXBRL tags.
