/**
 * Pilot scope configuration for the discovery pipeline.
 *
 * Region: South West + Great Southern agricultural belt of WA.
 * Categories: agriculture / horticulture only.
 *
 * The bounding box covers the known ag towns (Bunbury, Busselton, Margaret River,
 * Manjimup, Pemberton, Donnybrook, Harvey, Collie, Albany, Mount Barker, Denmark,
 * Katanning, Kojonup, Gnowangerup, Cranbrook). It is intentionally a little generous —
 * step 2 strictly drops anything whose postcode is not in our eligible set, so a wide
 * box cannot introduce ineligible businesses.
 *
 * Split into tiles to keep each Overpass query small and avoid timeouts.
 */

// Single combined bbox covering the whole pilot region (South West + Great Southern).
// Used by default to minimise request count (one query instead of four) — public
// Overpass mirrors rate-limit aggressively, so fewer requests is much safer.
// [south, west, north, east]
const PILOT_BBOX = [-35.20, 114.95, -32.95, 118.80];

// [south, west, north, east] — Overpass bbox order (fallback per-tile mode)
const TILES = [
  // South West coastal + forest (Bunbury → Margaret River → Manjimup → Walpole)
  { name: 'South West',     bbox: [-35.10, 114.95, -32.95, 116.30] },
  // Inland South West / Wheatbelt fringe (Collie, Donnybrook, Boyup Brook, Bridgetown)
  { name: 'SW Inland',      bbox: [-34.20, 116.00, -33.10, 116.90] },
  // Great Southern west (Albany, Denmark, Mount Barker, Cranbrook)
  { name: 'Great Southern W', bbox: [-35.20, 116.40, -34.10, 117.95] },
  // Great Southern east (Katanning, Kojonup, Gnowangerup, Jerramungup)
  { name: 'Great Southern E', bbox: [-34.20, 117.30, -33.40, 118.80] },
];

/**
 * OSM tag → our job_categories mapping.
 * `category_id` values match the job_categories table.
 * `default` is the starting category; step 4 refines via name keywords.
 *
 * NOTE: Wineries (craft:winery, tourism:winery) are explicitly excluded because
 * they are secondary processors (winemaking, not grape-picking).
 */
const OSM_TAG_RULES = [
  { match: { landuse: 'orchard' },        category_id: 1, category_name: 'Fruit Orchard' },
  { match: { landuse: 'vineyard' },       category_id: 2, category_name: 'Grape Vineyard' },
  { match: { landuse: 'plant_nursery' },  category_id: 5, category_name: 'Nursery & Horticulture' },
  // REMOVED: tourism:winery and craft:winery — these are secondary processors (winemaking), not eligible.
  { match: { shop: 'farm' },              category_id: 5, category_name: 'Nursery & Horticulture' },
  { match: { landuse: 'farmland' },       category_id: 4, category_name: 'Livestock Farm' },
  { match: { landuse: 'meadow' },         category_id: 4, category_name: 'Livestock Farm' },
];

/**
 * EXCLUSION keywords: if a business name matches any of these, skip it entirely
 * (secondary processing, never eligible per government rules).
 * Checked BEFORE category assignment to ensure secondary processors never make it through.
 */
const EXCLUSION_KEYWORDS = [
  'winery', 'wine', 'wines', 'winemaking', 'cellar door', 'cellar',
  'cider', 'cidery',
  'brewery', 'brewer', 'brewing',
  'distillery', 'distill',
  'mill', 'milling',
  'cheese', 'cheesemaker',
  'production facility', 'processor', 'processing plant', 'manufacturing',
  'factory',
];

/**
 * Name-keyword refinement applied in step 4 (overrides the tag default when a keyword hits).
 * Order matters — first match wins.
 * NOTE: Secondary processing keywords are in EXCLUSION_KEYWORDS instead and checked separately.
 */
const NAME_KEYWORD_RULES = [
  { keywords: ['vineyard', 'grape'], category_id: 2, category_name: 'Grape Vineyard' },
  { keywords: ['orchard', 'apple', 'cherry', 'stone fruit', 'citrus', 'avocado', 'mango', 'berry', 'berries'], category_id: 1, category_name: 'Fruit Orchard' },
  { keywords: ['nursery', 'greenhouse', 'glasshouse', 'seedling'], category_id: 5, category_name: 'Nursery & Horticulture' },
  { keywords: ['dairy', 'cattle', 'beef', 'sheep', 'wool', 'livestock', 'station', 'pastoral', 'poultry', 'piggery'], category_id: 4, category_name: 'Livestock Farm' },
  { keywords: ['vegetable', 'veg ', 'potato', 'onion', 'market garden', 'fresh produce'], category_id: 3, category_name: 'Vegetable Farm' },
];

// Overpass endpoints (try in order if one is busy)
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

// Nominatim reverse-geocode endpoint (postcode fallback)
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';
const USER_AGENT = '88DaysWA-tool/1.0 (backpacker job finder; contact: admin@88daysinwa)';

module.exports = {
  PILOT_BBOX,
  TILES,
  OSM_TAG_RULES,
  NAME_KEYWORD_RULES,
  EXCLUSION_KEYWORDS,
  OVERPASS_ENDPOINTS,
  NOMINATIM_URL,
  USER_AGENT,
  // intermediate artefact paths
  paths: {
    raw:        'data/candidates_raw.json',
    located:    'data/candidates_located.json',
    validated:  'data/candidates_validated.json',
  },
};
