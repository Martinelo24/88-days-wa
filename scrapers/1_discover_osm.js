#!/usr/bin/env node
/**
 * STEP 1 — Discover candidates from OpenStreetMap via Overpass.
 *
 * For each pilot tile, query named agricultural features. Deduplicate by OSM id,
 * keep the raw tags, and write data/candidates_raw.json.
 */
const fs = require('fs');
const path = require('path');
const { PILOT_BBOX, TILES, paths } = require('./config');
const { buildQuery, runQuery, elementLatLon, sleep } = require('../lib/overpass');

// Use per-tile mode only if invoked with `--tiles` (combined single query is the default).
const USE_TILES = process.argv.includes('--tiles');

function ingest(seen, elements, label) {
  let added = 0;
  for (const el of elements) {
    const key = `${el.type}/${el.id}`;
    if (seen.has(key)) continue;
    const { lat, lon } = elementLatLon(el);
    if (lat == null) continue;
    const tags = el.tags || {};
    if (!tags.name) continue;
    seen.set(key, {
      osm_id: key,
      name: tags.name.trim(),
      lat,
      lon,
      tags,
      addr_postcode: tags['addr:postcode'] || null,
      addr_city: tags['addr:city'] || tags['addr:town'] || tags['addr:suburb'] || null,
      website: tags.website || tags['contact:website'] || null,
      phone: tags.phone || tags['contact:phone'] || null,
      discovered_tile: label,
    });
    added++;
  }
  return added;
}

(async () => {
  console.log('STEP 1 — Discover candidates from OpenStreetMap\n');
  const seen = new Map();

  if (USE_TILES) {
    for (const tile of TILES) {
      process.stdout.write(`  • ${tile.name} [${tile.bbox.join(', ')}] ... `);
      try {
        const elements = await runQuery(buildQuery(tile.bbox));
        const added = ingest(seen, elements, tile.name);
        console.log(`${elements.length} elements, ${added} new`);
      } catch (err) {
        console.log(`FAILED: ${err.message}`);
      }
      await sleep(8000);
    }
  } else {
    // Default: ONE combined query for the whole pilot region (fewest requests).
    console.log(`  • Combined pilot region [${PILOT_BBOX.join(', ')}]`);
    console.log('    (Overpass mirrors rate-limit hard; the client backs off and retries — be patient)\n');
    const elements = await runQuery(buildQuery(PILOT_BBOX), { retries: 6 });
    const added = ingest(seen, elements, 'pilot');
    console.log(`    ${elements.length} elements, ${added} named candidates`);
  }

  const candidates = [...seen.values()];
  fs.writeFileSync(path.join(__dirname, '..', paths.raw), JSON.stringify(candidates, null, 2));
  console.log(`\n✅ ${candidates.length} unique candidates → ${paths.raw}`);
})();
