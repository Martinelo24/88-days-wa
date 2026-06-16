/**
 * Discovery pipeline configuration.
 *
 * Supports two scrape modes:
 *   agriculture  — landuse/farm tags → Cat 3 (Regional Australia specified work)
 *   tourism      — amenity/tourism tags → Cat 1/2 (Remote/Northern Australia tourism)
 *
 * Each REGION entry defines a named area to scrape:
 *   node scrapers/1_discover_osm.js               → pilot (agriculture, South West + Great Southern)
 *   node scrapers/1_discover_osm.js --region=6701 → tourism in Carnarvon / Coral Bay
 *
 * Step 2 strictly drops anything whose postcode is not in our eligible set, so a wide
 * bbox cannot introduce ineligible businesses.
 */

// ─── AGRICULTURE (specified work, Cat 3) ────────────────────────────────────

// Single combined bbox for the whole pilot agriculture region (South West + Great Southern).
// [south, west, north, east]
const PILOT_BBOX = [-35.20, 114.95, -32.95, 118.80];

// Per-tile fallback (pass --tiles flag)
const TILES = [
  { name: 'South West',       bbox: [-35.10, 114.95, -32.95, 116.30] },
  { name: 'SW Inland',        bbox: [-34.20, 116.00, -33.10, 116.90] },
  { name: 'Great Southern W', bbox: [-35.20, 116.40, -34.10, 117.95] },
  { name: 'Great Southern E', bbox: [-34.20, 117.30, -33.40, 118.80] },
];

/**
 * OSM tags → job_categories for AGRICULTURE runs.
 * NOTE: tourism:winery / craft:winery removed — secondary processors, not eligible.
 */
const OSM_TAG_RULES = [
  { match: { landuse: 'orchard' },       category_id: 1, category_name: 'Fruit Orchard' },
  { match: { landuse: 'vineyard' },      category_id: 2, category_name: 'Grape Vineyard' },
  { match: { landuse: 'plant_nursery' }, category_id: 5, category_name: 'Nursery & Horticulture' },
  { match: { shop: 'farm' },             category_id: 5, category_name: 'Nursery & Horticulture' },
  { match: { landuse: 'farmland' },      category_id: 4, category_name: 'Livestock Farm' },
  { match: { landuse: 'meadow' },        category_id: 4, category_name: 'Livestock Farm' },
];

// ─── TOURISM (Cat 1 / Cat 2 — Remote / Northern Australia) ──────────────────

/**
 * OSM tags → job_categories for TOURISM runs.
 * All map to category 9 (Hospitality Remote) — eligibility guard checks Cat 1/2 on the postcode.
 *
 * Covers all government-listed tourism/hospitality occupation types:
 *   Accommodation: hotel, motel, hostel, caravan/camp, guesthouse
 *   Food & Beverage: cafe, restaurant, bar, pub, fast food
 *   Tourist services: dive centre, tour operator, travel agency, attraction, museum
 */
const TOURISM_TAG_RULES = [
  // Accommodation
  { match: { tourism: 'hotel' },        category_id: 9, category_name: 'Hospitality Remote' },
  { match: { tourism: 'motel' },        category_id: 9, category_name: 'Hospitality Remote' },
  { match: { tourism: 'hostel' },       category_id: 9, category_name: 'Hospitality Remote' },
  { match: { tourism: 'guest_house' },  category_id: 9, category_name: 'Hospitality Remote' },
  { match: { tourism: 'caravan_site' }, category_id: 9, category_name: 'Hospitality Remote' },
  { match: { tourism: 'camp_site' },    category_id: 9, category_name: 'Hospitality Remote' },
  // Food & Beverage
  { match: { amenity: 'cafe' },         category_id: 9, category_name: 'Hospitality Remote' },
  { match: { amenity: 'restaurant' },   category_id: 9, category_name: 'Hospitality Remote' },
  { match: { amenity: 'fast_food' },    category_id: 9, category_name: 'Hospitality Remote' },
  { match: { amenity: 'bar' },          category_id: 9, category_name: 'Hospitality Remote' },
  { match: { amenity: 'pub' },          category_id: 9, category_name: 'Hospitality Remote' },
  { match: { amenity: 'food_court' },   category_id: 9, category_name: 'Hospitality Remote' },
  // Tourist services
  { match: { leisure: 'dive_centre' },  category_id: 9, category_name: 'Hospitality Remote' },
  { match: { tourism: 'attraction' },   category_id: 9, category_name: 'Hospitality Remote' },
  { match: { tourism: 'museum' },       category_id: 9, category_name: 'Hospitality Remote' },
  { match: { tourism: 'information' },  category_id: 9, category_name: 'Hospitality Remote' },
  { match: { shop: 'travel_agency' },   category_id: 9, category_name: 'Hospitality Remote' },
];

// ─── NAMED REGIONS ──────────────────────────────────────────────────────────

/**
 * Add new regions here as we expand. Each entry:
 *   bbox     [south, west, north, east]
 *   tagRules OSM_TAG_RULES or TOURISM_TAG_RULES (or a custom mix)
 *   mode     'agriculture' | 'tourism' — controls exclusion logic in step 4
 */
const REGIONS = {
  pilot: {
    name: 'South West + Great Southern (Agriculture)',
    bbox: PILOT_BBOX,
    tagRules: OSM_TAG_RULES,
    mode: 'agriculture',
  },
  6701: {
    name: 'Carnarvon / Coral Bay — postcode 6701 (Tourism, Cat 2 Northern Australia)',
    // Split into two tiles — towns are 200km apart, single query times out
    tiles: [
      { name: 'Carnarvon',  bbox: [-25.10, 113.40, -24.50, 114.00] },
      { name: 'Coral Bay',  bbox: [-23.35, 113.55, -22.85, 114.00] },
    ],
    tagRules: TOURISM_TAG_RULES,
    mode: 'tourism',
  },
  6707: {
    name: 'Exmouth — postcode 6707 (Tourism, Cat 2 Northern Australia)',
    bbox: [-22.10, 113.90, -21.75, 114.30],
    tagRules: TOURISM_TAG_RULES,
    mode: 'tourism',
  },
  6714: {
    name: 'Karratha — postcode 6714 (Tourism, Cat 2 Northern Australia)',
    // Covers Karratha town, Baynton, Bulgarra, Millars Well, Nickol, Pegs Creek, Burrup, Maitland
    bbox: [-20.90, 116.65, -20.50, 117.10],
    tagRules: TOURISM_TAG_RULES,
    mode: 'tourism',
  },
  6536: {
    name: 'Kalbarri — postcode 6536 (Tourism, Cat 1 Remote & Very Remote)',
    // Covers Kalbarri town, Kalbarri National Park visitor area, Zuytdorp cliffs coast
    bbox: [-27.85, 114.05, -27.60, 114.25],
    tagRules: TOURISM_TAG_RULES,
    mode: 'tourism',
  },
  6721: {
    name: 'Port Hedland — postcode 6721 (Tourism, Cat 2 Northern Australia)',
    // Covers Port Hedland town + South Hedland; outer localities are remote pastoral with no OSM venues
    bbox: [-20.50, 118.45, -20.20, 118.75],
    tagRules: TOURISM_TAG_RULES,
    mode: 'tourism',
  },
  6725: {
    name: 'Broome — postcode 6725 (Tourism, Cat 2 Northern Australia)',
    // Two tiles: main Broome town (Cable Beach, Chinatown, Djugun, Minyirr) +
    // Dampier Peninsula (Kooljaman/Cape Leveque area eco-resorts)
    tiles: [
      { name: 'Broome',            bbox: [-18.05, 122.10, -17.85, 122.35] },
      { name: 'Dampier Peninsula', bbox: [-16.55, 122.80, -16.30, 123.05] },
    ],
    tagRules: TOURISM_TAG_RULES,
    mode: 'tourism',
  },
};

// ─── KEYWORD RULES ──────────────────────────────────────────────────────────

/**
 * EXCLUSION keywords for AGRICULTURE mode only.
 * Secondary processing businesses (winemaking, brewing, etc.) are never eligible
 * for specified work. NOT applied in tourism mode.
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
 * Name-keyword refinement for AGRICULTURE mode (step 4 overrides tag default on hit).
 * Order matters — first match wins.
 */
const NAME_KEYWORD_RULES = [
  { keywords: ['vineyard', 'grape'],                                                                  category_id: 2, category_name: 'Grape Vineyard' },
  { keywords: ['orchard', 'apple', 'cherry', 'stone fruit', 'citrus', 'avocado', 'mango', 'berry', 'berries'], category_id: 1, category_name: 'Fruit Orchard' },
  { keywords: ['nursery', 'greenhouse', 'glasshouse', 'seedling'],                                    category_id: 5, category_name: 'Nursery & Horticulture' },
  { keywords: ['dairy', 'cattle', 'beef', 'sheep', 'wool', 'livestock', 'station', 'pastoral', 'poultry', 'piggery'], category_id: 4, category_name: 'Livestock Farm' },
  { keywords: ['vegetable', 'veg ', 'potato', 'onion', 'market garden', 'fresh produce'],             category_id: 3, category_name: 'Vegetable Farm' },
];

/**
 * Name-keyword refinement for TOURISM mode.
 * All map to category 9; this just catches cases where OSM tags are missing but name is clear.
 */
const TOURISM_KEYWORD_RULES = [
  { keywords: ['hotel', 'motel', 'resort', 'lodge', 'inn'],                                          category_id: 9, category_name: 'Hospitality Remote' },
  { keywords: ['hostel', 'backpacker', 'bunkhouse'],                                                  category_id: 9, category_name: 'Hospitality Remote' },
  { keywords: ['caravan', 'holiday park', 'camping', 'campsite', 'camp ground'],                      category_id: 9, category_name: 'Hospitality Remote' },
  { keywords: ['cafe', 'coffee', 'restaurant', 'bistro', 'eatery', 'diner'],                          category_id: 9, category_name: 'Hospitality Remote' },
  { keywords: ['bar', 'pub', 'tavern', 'taproom', 'club'],                                            category_id: 9, category_name: 'Hospitality Remote' },
  { keywords: ['dive', 'snorkel', 'scuba', 'aquatic'],                                                category_id: 9, category_name: 'Hospitality Remote' },
  { keywords: ['tour', 'tours', 'charter', 'adventure', 'safari', 'expedition', 'cruises'],           category_id: 9, category_name: 'Hospitality Remote' },
  { keywords: ['museum', 'gallery', 'heritage', 'visitor centre', 'visitor center'],                  category_id: 9, category_name: 'Hospitality Remote' },
  { keywords: ['travel', 'tourism', 'tourist'],                                                        category_id: 9, category_name: 'Hospitality Remote' },
];

// ─── SHARED ──────────────────────────────────────────────────────────────────

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';
const USER_AGENT = '88DaysWA-tool/1.0 (backpacker job finder; contact: admin@88daysinwa)';

module.exports = {
  PILOT_BBOX,
  TILES,
  REGIONS,
  OSM_TAG_RULES,
  TOURISM_TAG_RULES,
  NAME_KEYWORD_RULES,
  TOURISM_KEYWORD_RULES,
  EXCLUSION_KEYWORDS,
  OVERPASS_ENDPOINTS,
  NOMINATIM_URL,
  USER_AGENT,
  paths: {
    raw:       'data/candidates_raw.json',
    located:   'data/candidates_located.json',
    validated: 'data/candidates_validated.json',
  },
};
