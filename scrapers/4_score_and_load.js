#!/usr/bin/env node
/**
 * STEP 4 — Score confidence, assign category, load into businesses (review_status='pending').
 *
 * Confidence (cap 100):
 *   +20 OSM name present (always true here)
 *   +20 postcode came from an explicit tag (not nearest-guess)
 *   +35 ABN matched & active
 *   +15 has website
 *   +10 has phone
 *
 * Category: OSM tag default (config) refined by name keywords (config).
 * Dedup: skip if osm_id already loaded, or (business_name, postcode) already exists.
 * Writes nothing to disk — loads straight into the DB.
 */
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { paths, OSM_TAG_RULES, NAME_KEYWORD_RULES } = require('./config');
const { evaluate } = require('../lib/eligibility');

const dbPath = path.join(__dirname, '../data/88days.db');

/** Pick category from OSM tags (first matching rule). */
function categoryFromTags(tags) {
  for (const rule of OSM_TAG_RULES) {
    const [k, v] = Object.entries(rule.match)[0];
    if (tags[k] === v) return { id: rule.category_id, name: rule.category_name };
  }
  return { id: null, name: null };
}

/** Refine category by name keywords (overrides tag default on hit). */
function refineByName(name, fallback) {
  const lower = (name || '').toLowerCase();
  for (const rule of NAME_KEYWORD_RULES) {
    if (rule.keywords.some((kw) => lower.includes(kw))) {
      return { id: rule.category_id, name: rule.category_name };
    }
  }
  return fallback;
}

/** Work types blurb per category for the public card. */
const WORK_TYPES = {
  1: 'Fruit picking, packing, pruning, thinning',
  2: 'Grape picking, pruning, vineyard hand, cellar work',
  3: 'Vegetable harvesting, planting, packing',
  4: 'Livestock handling, mustering, general farm hand',
  5: 'Nursery work, potting, propagation, greenhouse',
};

function scoreCandidate(c) {
  let score = 20; // OSM named
  const sources = ['osm'];
  if (c.postcode_source === 'tag') score += 20;
  if (c.abn && /active/i.test(c.abn_status || '')) { score += 35; sources.push('abn'); }
  if (c.website) score += 15;
  if (c.phone) score += 10;
  return { score: Math.min(score, 100), sources: sources.join(',') };
}

(async () => {
  console.log('STEP 4 — Score & load into review queue\n');

  const validated = JSON.parse(fs.readFileSync(path.join(__dirname, '..', paths.validated), 'utf-8'));
  const db = new sqlite3.Database(dbPath);

  // Existing osm_ids to avoid reloading the same OSM feature
  const existingOsm = await new Promise((resolve) => {
    db.all('SELECT osm_id FROM businesses WHERE osm_id IS NOT NULL', (err, rows) => {
      resolve(new Set((rows || []).map((r) => r.osm_id)));
    });
  });

  const insert = db.prepare(`
    INSERT OR IGNORE INTO businesses
      (business_name, postcode, town, region, job_category_id, job_category_name,
       website_url, phone_number, work_types_offered, hiring_status, source_found,
       latitude, longitude, abn, abn_status, sources, osm_id, confidence_score,
       work_categories, eligibility, eligibility_reason, review_status, verified)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',0)
  `);

  let loaded = 0, skippedDup = 0, mismatches = 0;
  await new Promise((resolve) => {
    db.serialize(() => {
      for (const c of validated) {
        if (existingOsm.has(c.osm_id)) { skippedDup++; continue; }

        const tagCat = categoryFromTags(c.tags || {});
        const cat = refineByName(c.name, tagCat);
        const { score, sources } = scoreCandidate(c);

        // Eligibility guard: does this work type match the postcode's categories?
        const elig = evaluate(cat.id, c.work_categories);
        const verdict = elig.eligible === true ? 'eligible' : elig.eligible === false ? 'mismatch' : null;
        if (verdict === 'mismatch') mismatches++;

        insert.run(
          [
            c.name,
            c.postcode,
            c.town,
            c.region,
            cat.id,
            cat.name,
            c.website || null,
            c.phone || null,
            WORK_TYPES[cat.id] || null,
            'unknown',
            `osm:${c.discovered_tile}`,
            c.lat,
            c.lon,
            c.abn || null,
            c.abn_status || null,
            sources,
            c.osm_id,
            score,
            c.work_categories || null,
            verdict,
            elig.reason,
          ],
          function () {
            if (this.changes) loaded++;
            else skippedDup++;
          }
        );
      }
      insert.finalize(resolve);
    });
  });

  const total = await new Promise((resolve) => {
    db.get("SELECT COUNT(*) c FROM businesses WHERE review_status='pending'", (e, r) => resolve(r.c));
  });

  db.close();
  console.log(`  Loaded:  ${loaded}`);
  console.log(`  Skipped (duplicate name+postcode or osm_id): ${skippedDup}`);
  console.log(`  ⚠️  Eligibility mismatches (work type ≠ postcode category): ${mismatches} — hidden from queue by default`);
  console.log(`\n✅ Pending review queue now holds ${total} candidates.`);
  console.log(`   Open http://localhost:3000 → Review Queue tab to verify them.`);
})();
