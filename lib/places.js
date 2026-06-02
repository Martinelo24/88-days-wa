/**
 * Google Places enrichment — STUBBED / OFF BY DEFAULT.
 *
 * This is the deferred "decide later" paid step. When you're ready, set
 * GOOGLE_PLACES_API_KEY in .env and flip ENABLED. It will fetch phone, website,
 * and business_status for a candidate via the Places Text Search + Place Details
 * endpoints (field-masked to keep cost minimal).
 *
 * Until then, enrich() is a no-op that returns null so the pipeline runs free.
 */
const API_KEY = process.env.GOOGLE_PLACES_API_KEY || null;
const ENABLED = false; // ← set true (and provide API key) to turn on paid enrichment

function isEnabled() {
  return ENABLED && !!API_KEY;
}

/**
 * @param {object} candidate { name, town, postcode, lat, lon }
 * @returns {object|null} { phone, website, business_status } or null when disabled
 */
async function enrich(candidate) {
  if (!isEnabled()) return null;

  // --- Implementation outline for when enabled (kept here so it's ready) ---
  // 1. Text Search:  POST https://places.googleapis.com/v1/places:searchText
  //      body: { textQuery: `${candidate.name} ${candidate.town} WA ${candidate.postcode}` }
  //      header: X-Goog-FieldMask: places.id,places.displayName
  // 2. Place Details: GET https://places.googleapis.com/v1/places/{id}
  //      header: X-Goog-FieldMask: internationalPhoneNumber,websiteUri,businessStatus
  // 3. Return { phone, website, business_status }.
  // Left unimplemented intentionally until the budget decision is made.
  return null;
}

module.exports = { isEnabled, enrich };
