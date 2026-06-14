#!/usr/bin/env node
/**
 * Backfill the eligibility verdict for every business already in the DB,
 * using the shared lib/eligibility matrix. Safe to re-run.
 */
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { evaluate } = require('../lib/eligibility');

const db = new sqlite3.Database(path.join(__dirname, '../data/88days.db'));

db.all(
  `SELECT b.id, b.business_name, b.job_category_id, p.work_categories
   FROM businesses b
   LEFT JOIN postcodes p ON b.postcode = p.postcode`,
  (err, rows) => {
    if (err) { console.error(err); process.exit(1); }

    const stmt = db.prepare('UPDATE businesses SET eligibility = ?, eligibility_reason = ? WHERE id = ?');
    let eligible = 0, mismatch = 0, unknown = 0;

    db.serialize(() => {
      for (const r of rows) {
        const v = evaluate(r.job_category_id, r.work_categories, r.business_name);
        const verdict = v.eligible === true ? 'eligible' : v.eligible === false ? 'mismatch' : null;
        if (verdict === 'eligible') eligible++;
        else if (verdict === 'mismatch') mismatch++;
        else unknown++;
        stmt.run([verdict, v.reason, r.id]);
      }
      stmt.finalize(() => {
        console.log(`✅ Backfilled ${rows.length} businesses:`);
        console.log(`   eligible: ${eligible}   mismatch: ${mismatch}   unknown: ${unknown}`);
        db.close(() => process.exit(0));
      });
    });
  }
);
