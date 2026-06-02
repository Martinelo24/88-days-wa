/**
 * Thin Overpass API client.
 * Queries OSM for named agricultural features within a bounding box.
 */
const { OVERPASS_ENDPOINTS, USER_AGENT } = require('../scrapers/config');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Build an Overpass QL query for one bbox.
 * Only returns elements that carry a `name` tag (we never want anonymous polygons).
 * bbox = [south, west, north, east]
 */
function buildQuery(bbox) {
  const b = bbox.join(',');
  // nwr = nodes, ways, relations. `out center` gives a representative lat/lon for ways/relations.
  return `
[out:json][timeout:180];
(
  nwr["landuse"="orchard"]["name"](${b});
  nwr["landuse"="vineyard"]["name"](${b});
  nwr["landuse"="plant_nursery"]["name"](${b});
  nwr["landuse"="farmland"]["name"](${b});
  nwr["landuse"="meadow"]["name"](${b});
  nwr["tourism"="winery"]["name"](${b});
  nwr["craft"="winery"]["name"](${b});
  nwr["shop"="farm"]["name"](${b});
);
out center tags;
`.trim();
}

// Overpass returns these when busy / rate-limited / timed out — all retryable.
const RETRYABLE = new Set([429, 406, 504, 503, 502, 500]);

/**
 * Run a query against Overpass, cycling endpoints and backing off on rate limits.
 * Returns the array of OSM elements. Surfaces server `remark` (e.g. timeouts).
 */
async function runQuery(query, { retries = 4 } = {}) {
  let lastErr;
  // Interleave endpoints across attempts so we don't pin one busy server.
  for (let attempt = 0; attempt <= retries; attempt++) {
    const endpoint = OVERPASS_ENDPOINTS[attempt % OVERPASS_ENDPOINTS.length];
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT,
          'Accept': 'application/json',
        },
        body: 'data=' + encodeURIComponent(query),
      });

      if (RETRYABLE.has(res.status)) {
        const retryAfter = parseInt(res.headers.get('retry-after') || '0', 10);
        const wait = Math.max(retryAfter * 1000, 12000 * (attempt + 1)); // ≥12s, grows
        console.log(`    ⏳ ${endpoint} → ${res.status} (rate-limited/busy), waiting ${Math.round(wait / 1000)}s...`);
        await sleep(wait);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      // Parse defensively — a busy server can return a non-JSON notice with 200.
      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        console.log(`    ⏳ ${endpoint} returned non-JSON (busy), waiting ${12 * (attempt + 1)}s...`);
        await sleep(12000 * (attempt + 1));
        continue;
      }

      if (json.remark && /timed out|runtime error/i.test(json.remark)) {
        // Server-side timeout — back off and retry (often succeeds on a quieter slot).
        console.log(`    ⚠️  remark: ${json.remark.trim().slice(0, 120)}`);
        await sleep(10000 * (attempt + 1));
        continue;
      }
      return json.elements || [];
    } catch (err) {
      lastErr = err;
      await sleep(5000 * (attempt + 1));
    }
  }
  throw new Error(`All Overpass attempts failed: ${lastErr?.message || 'rate-limited'}`);
}

/** Extract a {lat, lon} from an element (node has lat/lon; way/relation has center). */
function elementLatLon(el) {
  if (typeof el.lat === 'number') return { lat: el.lat, lon: el.lon };
  if (el.center) return { lat: el.center.lat, lon: el.center.lon };
  return { lat: null, lon: null };
}

module.exports = { buildQuery, runQuery, elementLatLon, sleep };
