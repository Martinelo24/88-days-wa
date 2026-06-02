#!/usr/bin/env node
/**
 * STEP 2 — Assign a postcode to each candidate and keep only eligible ones.
 *
 * Postcode source priority:
 *   1. OSM addr:postcode tag (if eligible)          → postcode_source = 'tag'
 *   2. Nominatim reverse geocode (if eligible)      → postcode_source = 'nominatim'
 *   3. Nearest eligible-postcode centroid (≤25 km)  → postcode_source = 'nearest'
 *
 * Anything that cannot be tied to an eligible postcode is dropped.
 * Writes data/candidates_located.json.
 */
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { paths } = require('./config');
const { nearestEligiblePostcode, reverseGeocodePostcode, sleep } = require('../lib/geo');

const dbPath = path.join(__dirname, '../data/88days.db');

function loadEligiblePostcodes() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);
    db.all(
      'SELECT postcode, town, region, latitude, longitude, work_categories, category_labels FROM postcodes WHERE eligible_88days = 1',
      (err, rows) => {
        db.close();
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
}

(async () => {
  console.log('STEP 2 — Assign postcodes & filter to eligible\n');

  const eligible = await loadEligiblePostcodes();
  const byPostcode = new Map(eligible.map((p) => [p.postcode, p]));
  console.log(`  Loaded ${eligible.length} eligible postcodes`);

  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '..', paths.raw), 'utf-8'));
  console.log(`  Processing ${raw.length} candidates...\n`);

  const located = [];
  let viaTag = 0, viaNominatim = 0, viaNearest = 0, dropped = 0;

  for (const c of raw) {
    let postcode = null;
    let source = null;

    // 1. addr:postcode tag
    if (c.addr_postcode && byPostcode.has(c.addr_postcode)) {
      postcode = c.addr_postcode;
      source = 'tag';
      viaTag++;
    }

    // 2. Nominatim reverse geocode (throttled to 1 req/sec)
    if (!postcode) {
      const pc = await reverseGeocodePostcode(c.lat, c.lon);
      await sleep(1100);
      if (pc && byPostcode.has(pc)) {
        postcode = pc;
        source = 'nominatim';
        viaNominatim++;
      }
    }

    // 3. Nearest eligible centroid (cap at 25 km to avoid wild guesses)
    if (!postcode) {
      const near = nearestEligiblePostcode(c.lat, c.lon, eligible);
      if (near && near.distanceKm <= 25) {
        postcode = near.row.postcode;
        source = 'nearest';
        viaNearest++;
      }
    }

    if (!postcode) {
      dropped++;
      continue;
    }

    const pcRow = byPostcode.get(postcode);
    located.push({
      ...c,
      postcode,
      postcode_source: source,
      town: pcRow.town,
      region: pcRow.region,
      work_categories: pcRow.work_categories,
      category_labels: pcRow.category_labels,
    });
  }

  const outPath = path.join(__dirname, '..', paths.located);
  fs.writeFileSync(outPath, JSON.stringify(located, null, 2));

  console.log(`  postcode via tag:       ${viaTag}`);
  console.log(`  postcode via nominatim: ${viaNominatim}`);
  console.log(`  postcode via nearest:   ${viaNearest}`);
  console.log(`  dropped (ineligible):   ${dropped}`);
  console.log(`\n✅ ${located.length} eligible candidates → ${paths.located}`);
})();
