#!/usr/bin/env node
/**
 * Idempotent migration: add Phase-2 columns to the businesses table.
 * Safe to run multiple times — duplicate-column errors are ignored.
 */
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../data/88days.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) { console.error('❌', err.message); process.exit(1); }
});

const columns = [
  ['abn', 'TEXT'],
  ['abn_status', 'TEXT'],
  ['latitude', 'REAL'],
  ['longitude', 'REAL'],
  ['confidence_score', 'INTEGER DEFAULT 0'],
  ['sources', 'TEXT'],
  ['osm_id', 'TEXT'],
  ['review_status', "TEXT DEFAULT 'pending'"],
  ['work_categories', 'TEXT'],
  ['eligibility', 'TEXT'],            // 'eligible' | 'mismatch' | NULL (unknown)
  ['eligibility_reason', 'TEXT'],
];

function addColumn(name, type) {
  return new Promise((resolve) => {
    db.run(`ALTER TABLE businesses ADD COLUMN ${name} ${type}`, (err) => {
      if (err) {
        if (/duplicate column/i.test(err.message)) {
          console.log(`  • ${name} — already exists, skipped`);
        } else {
          console.error(`  ✗ ${name} — ${err.message}`);
        }
      } else {
        console.log(`  ✓ ${name} added`);
      }
      resolve();
    });
  });
}

(async () => {
  console.log('Migrating businesses table...');
  for (const [name, type] of columns) {
    await addColumn(name, type);
  }

  await new Promise((resolve) => {
    db.run('CREATE INDEX IF NOT EXISTS idx_review_status ON businesses(review_status)', (err) => {
      if (err) console.error('  ✗ index:', err.message);
      else console.log('  ✓ idx_review_status ready');
      resolve();
    });
  });

  // Backfill: any existing rows with NULL review_status → 'pending'
  await new Promise((resolve) => {
    db.run("UPDATE businesses SET review_status = 'pending' WHERE review_status IS NULL", function () {
      if (this.changes) console.log(`  ✓ backfilled ${this.changes} rows to review_status='pending'`);
      resolve();
    });
  });

  db.close(() => {
    console.log('\n✅ Migration complete.');
    process.exit(0);
  });
})();
