#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const dbPath = path.join(__dirname, '../data/88days.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Database connection error:', err.message);
    process.exit(1);
  }
  console.log('✓ Connected to SQLite database');
});

db.serialize(() => {
  // Read missing postcodes CSV
  const missingCsv = fs.readFileSync(path.join(__dirname, '../data/missing_postcodes.csv'), 'utf-8');
  const postcodes = parse(missingCsv, { columns: true });

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO postcodes (postcode, town, region, state, latitude, longitude, eligible_88days)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  let addedCount = 0;
  let skippedCount = 0;

  postcodes.forEach((row) => {
    try {
      const result = stmt.run([
        row.postcode,
        row.town,
        row.region,
        row.state,
        parseFloat(row.latitude),
        parseFloat(row.longitude),
        row.eligible_88days === 'yes' ? 1 : 0
      ]);

      if (result.changes > 0) {
        addedCount++;
      } else {
        skippedCount++;
      }
    } catch (err) {
      console.error(`Error adding postcode ${row.postcode}:`, err.message);
    }
  });

  stmt.finalize((err) => {
    if (err) console.error('Statement finalize error:', err);

    // Get new total
    db.get('SELECT COUNT(*) as count FROM postcodes', (err, row) => {
      console.log(`\n✓ Operation complete!`);
      console.log(`  Added: ${addedCount} new postcodes`);
      console.log(`  Skipped: ${skippedCount} (already existed)`);
      console.log(`  Total postcodes in database: ${row.count}`);

      db.close();
      process.exit(0);
    });
  });
});

db.on('error', (err) => {
  console.error('Database error:', err.message);
  process.exit(1);
});
