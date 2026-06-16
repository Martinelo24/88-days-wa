#!/usr/bin/env node
/**
 * STEP 1 — Discover candidates from OpenStreetMap via Overpass.
 *
 * Usage:
 *   node scrapers/1_discover_osm.js                  → pilot agriculture region (South West + Great Southern)
 *   node scrapers/1_discover_osm.js --region=6701    → tourism in Carnarvon / Coral Bay
 *   node scrapers/1_discover_osm.js --tiles          → pilot in per-tile mode (fallback)
 *
 * Results written to data/candidates_raw.json.
 */
const fs = require('fs');
const path = require('path');
const { PILOT_BBOX, TILES, REGIONS, paths } = require('./config');
const { buildQuery, runQuery, elementLatLon, sleep } = require('../lib/overpass');

const USE_TILES  = process.argv.includes('--tiles');
const regionArg  = (process.argv.find((a) => a.startsWith('--region=')) || '').replace('--region=', '');
const region     = regionArg ? REGIONS[regionArg] : null;

if (regionArg && !region) {
  console.error(`❌ Unknown region "${regionArg}". Available: ${Object.keys(REGIONS).join(', ')}`);
  process.exit(1);
}

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

  if (region) {
    // Named region mode (e.g. --region=6701)
    console.log(`  • ${region.name}`);
    console.log(`    mode: ${region.mode} (${region.tagRules.length} OSM tag rules)`);
    console.log('    (Overpass mirrors rate-limit hard; the client backs off and retries — be patient)\n');

    if (region.tiles) {
      // Multi-tile mode: region has multiple smaller bboxes to avoid timeouts
      for (const tile of region.tiles) {
        process.stdout.write(`    → ${tile.name} [${tile.bbox.join(', ')}] ... `);
        try {
          const elements = await runQuery(buildQuery(tile.bbox, region.tagRules), { retries: 6 });
          const added = ingest(seen, elements, `${regionArg}/${tile.name}`);
          console.log(`${elements.length} elements, ${added} new`);
        } catch (err) {
          console.log(`FAILED: ${err.message}`);
        }
        await sleep(8000);
      }
    } else {
      // Single combined bbox
      console.log(`    bbox: [${region.bbox.join(', ')}]`);
      const elements = await runQuery(buildQuery(region.bbox, region.tagRules), { retries: 6 });
      const added = ingest(seen, elements, regionArg);
      console.log(`    ${elements.length} elements, ${added} named candidates`);
    }

  } else if (USE_TILES) {
    // Per-tile fallback for the pilot agriculture region
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
    // Default: one combined query for the whole pilot agriculture region
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
