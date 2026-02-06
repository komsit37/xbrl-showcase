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
    '  SEC_UA="Your Name your@email.com" npm run toc -- --symbol AAPL\n' +
    '  SEC_UA="Your Name your@email.com" npm run toc -- --cik 0000320193\n' +
    '  SEC_UA="Your Name your@email.com" npm run toc -- --index https://www.sec.gov/Archives/.../index.json\n' +
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

function normalizeText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function isIxElement(el) {
  const tag = (el?.tagName || '').toLowerCase();
  return tag.startsWith('ix:');
}

function getIxTagName(el) {
  if (!el) return '';
  const nameAttr = el.getAttribute?.('name') || el.getAttribute?.('Name');
  if (nameAttr) return nameAttr;
  const tag = (el.tagName || '').toLowerCase();
  return tag.startsWith('ix:') ? tag : '';
}

function findFirstIxDescendant(el) {
  const stack = Array.from(el?.children || []);
  while (stack.length) {
    const node = stack.shift();
    if (isIxElement(node)) return node;
    const kids = Array.from(node?.children || []);
    for (const kid of kids) stack.push(kid);
  }
  return null;
}

function findNearestIxAncestor(el) {
  let node = el?.parentNode || null;
  while (node) {
    if (isIxElement(node)) return node;
    node = node.parentNode || null;
  }
  return null;
}

function resolveIxName(el) {
  if (!el) return '';
  if (isIxElement(el)) return getIxTagName(el);
  const descendant = findFirstIxDescendant(el);
  if (descendant) return getIxTagName(descendant);
  const ancestor = findNearestIxAncestor(el);
  return getIxTagName(ancestor);
}

function getHeadingLevel(el) {
  const tag = (el?.tagName || '').toLowerCase();
  if (tag.length === 2 && tag.startsWith('h')) {
    const level = Number.parseInt(tag.slice(1), 10);
    if (Number.isFinite(level) && level >= 1 && level <= 6) return level;
  }
  if ((el?.getAttribute?.('role') || '').toLowerCase() === 'heading') {
    const level = Number.parseInt(el.getAttribute('aria-level'), 10);
    if (Number.isFinite(level) && level > 0) return level;
  }
  return 1;
}

function dedupeSequential(entries) {
  const out = [];
  for (const entry of entries) {
    const prev = out[out.length - 1];
    if (prev && prev.text === entry.text && prev.level === entry.level && prev.tag === entry.tag) {
      continue;
    }
    out.push(entry);
  }
  return out;
}

function collectHeadings(document) {
  const elements = Array.from(
    document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]')
  );
  const out = [];
  for (const el of elements) {
    const text = normalizeText(el.textContent || '');
    if (!text) continue;
    out.push({
      text,
      level: getHeadingLevel(el),
      tag: resolveIxName(el)
    });
  }
  return dedupeSequential(out);
}

const HEADING_TAG_SUFFIX = /(Abstract|Heading|Title|TextBlock)$/;

function extractHeadingFromText(text) {
  const lines = String(text || '').split(/\r?\n/).map(normalizeText).filter(Boolean);
  const candidate = lines[0] || normalizeText(text);
  if (!candidate) return '';
  return candidate.length > 120 ? `${candidate.slice(0, 117)}...` : candidate;
}

function collectTextBlockSections(document) {
  const all = document.querySelectorAll ? document.querySelectorAll('*') : [];
  const out = [];
  for (const el of all) {
    const tag = (el.tagName || '').toLowerCase();
    if (tag !== 'ix:nonnumeric') continue;
    const nameAttr = el.getAttribute?.('name') || el.getAttribute?.('Name');
    if (!nameAttr || !HEADING_TAG_SUFFIX.test(nameAttr)) continue;
    const text = extractHeadingFromText(el.textContent || '');
    if (!text) continue;
    out.push({ text, level: 1, tag: nameAttr });
  }
  return dedupeSequential(out);
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

  // 4) Build TOC from headings, with a fallback to text blocks.
  const headings = collectHeadings(document);
  const entries = headings.length ? headings : collectTextBlockSections(document);

  if (!entries.length) {
    console.log(`No headings or text block sections found in ${htmlUrl}`);
    process.exit(0);
  }

  const baseLevel = Math.max(1, Math.min(...entries.map((entry) => entry.level)));

  console.log(`iXBRL Table of Contents (from ${htmlUrl})`);
  for (const entry of entries) {
    const indent = '  '.repeat(Math.max(0, entry.level - baseLevel));
    const tagLabel = entry.tag ? `tag: ${entry.tag}` : 'tag: -';
    console.log(`${indent}- ${entry.text} (${tagLabel})`);
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
