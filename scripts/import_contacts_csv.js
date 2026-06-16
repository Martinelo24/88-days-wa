#!/usr/bin/env node
/**
 * Import contact details (website, phone, email, notes) from a CSV file into the businesses table.
 *
 * Usage:
 *   node scripts/import_contacts_csv.js <path-to-csv> [--postcode=6701] [--delimiter=;]
 *
 * CSV format (first row must be a header — column names are flexible):
 *   business_name (or "Business Name"), website, phone, email, notes
 *   Delimiter: comma by default, use --delimiter=; for semicolon files
 *
 * Rules:
 *   - Matches on business_name (case-insensitive trim) within the given postcode
 *   - Only overwrites a field if the CSV value is non-empty (never blanks existing data)
 *   - "None was found unfortunately :(" and similar placeholders are treated as empty
 *   - Unknown columns (e.g. row numbers) are silently ignored
 */

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const Database = require('better-sqlite3');

const csvArg       = process.argv[2];
const postcodeArg  = (process.argv.find((a) => a.startsWith('--postcode='))  || '').replace('--postcode=', '')  || '6701';
const delimiterArg = (process.argv.find((a) => a.startsWith('--delimiter=')) || '').replace('--delimiter=', '') || ',';

if (!csvArg) {
  console.error('Usage: node scripts/import_contacts_csv.js <path-to-csv> [--postcode=XXXX] [--delimiter=;]');
  process.exit(1);
}

const csvPath = path.resolve(csvArg);
if (!fs.existsSync(csvPath)) {
  console.error(`❌ File not found: ${csvPath}`);
  process.exit(1);
}

// Strip BOM if present (common in Excel exports)
let raw = fs.readFileSync(csvPath, 'utf-8').replace(/^﻿/, '');

const records = parse(raw, {
  columns: true,
  skip_empty_lines: true,
  trim: true,
  delimiter: delimiterArg,
  relax_column_count: true,
});

// Normalise column names: lowercase + collapse spaces/underscores so
// "Business Name", "business_name", "BUSINESS NAME" all map the same way.
const normalise = (s) => (s || '').toLowerCase().replace(/[\s_]+/g, '_').trim();

// Map normalised header → our field name
const FIELD_MAP = {
  business_name: 'name',
  'business name': 'name',
  name: 'name',
  website: 'website',
  phone: 'phone',
  email: 'email',
  notes: 'notes',
};

// Values that mean "nothing found" — treat as empty
const EMPTY_PHRASES = [
  'none was found unfortunately :(',
  'none was found',
  'not found',
  'n/a',
  'none',
  '-',
];

function clean(v) {
  if (!v) return '';
  const t = v.trim();
  if (EMPTY_PHRASES.some((p) => t.toLowerCase().startsWith(p))) return '';
  return t;
}

// Build a normalised key→rawHeader map from the first record
const firstRecord = records[0] || {};
const colMap = {}; // fieldName → rawHeader
for (const rawHeader of Object.keys(firstRecord)) {
  const field = FIELD_MAP[normalise(rawHeader)];
  if (field && !colMap[field]) colMap[field] = rawHeader;
}

console.log(`\nImporting contacts from: ${csvPath}`);
console.log(`Postcode filter:         ${postcodeArg}`);
console.log(`Delimiter:               "${delimiterArg}"`);
console.log(`Rows in CSV:             ${records.length}`);
console.log(`Columns mapped:          ${Object.entries(colMap).map(([f, h]) => `${f}←"${h}"`).join(', ')}\n`);

const dbPath = path.join(__dirname, '../data/88days.db');
const db = new Database(dbPath);

const lookup = db.prepare(`
  SELECT id, business_name, website_url, phone_number, email, notes
  FROM businesses
  WHERE LOWER(TRIM(business_name)) = LOWER(TRIM(?)) AND postcode = ?
`);

const update = db.prepare(`
  UPDATE businesses
  SET
    website_url  = CASE WHEN ? != '' THEN ? ELSE website_url END,
    phone_number = CASE WHEN ? != '' THEN ? ELSE phone_number END,
    email        = CASE WHEN ? != '' THEN ? ELSE email END,
    notes        = CASE WHEN ? != '' THEN ? ELSE notes END,
    updated_at   = CURRENT_TIMESTAMP
  WHERE id = ?
`);

let updated = 0, notFound = 0, skipped = 0;
const notFoundList = [];

for (const row of records) {
  const name    = clean(row[colMap.name]    || '');
  const website = clean(row[colMap.website] || '');
  const phone   = clean(row[colMap.phone]   || '');
  const email   = clean(row[colMap.email]   || '');
  const notes   = clean(row[colMap.notes]   || '');

  if (!name) { skipped++; continue; }

  const existing = lookup.get(name, postcodeArg);

  if (!existing) {
    notFoundList.push(name);
    notFound++;
    continue;
  }

  if (!website && !phone && !email && !notes) { skipped++; continue; }

  update.run(website, website, phone, phone, email, email, notes, notes, existing.id);
  updated++;

  const changes = [];
  if (website) changes.push(`website → ${website}`);
  if (phone)   changes.push(`phone   → ${phone}`);
  if (email)   changes.push(`email   → ${email}`);
  if (notes)   changes.push(`notes   → ${notes.slice(0, 80)}${notes.length > 80 ? '…' : ''}`);
  console.log(`  ✓ ${name}`);
  changes.forEach((c) => console.log(`      ${c}`));
}

console.log(`\n─────────────────────────────────────────────`);
console.log(`  Updated:   ${updated}`);
console.log(`  Skipped:   ${skipped}  (empty rows or no new values)`);
console.log(`  Not found: ${notFound}`);
if (notFoundList.length) {
  console.log('\n  ⚠️  These names had no match in the DB (check spelling):');
  notFoundList.forEach((n) => console.log(`     - ${n}`));
}
console.log(`\n✅ Done. Open http://localhost:3000 to verify.\n`);
