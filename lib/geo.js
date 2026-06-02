/**
 * Geo helpers for postcode assignment.
 *
 * Strategy (most → least trusted):
 *   1. OSM addr:postcode tag (if it's one of our eligible postcodes)   → source 'tag'
 *   2. Nominatim reverse geocode lat/lon → postcode                     → source 'nominatim'
 *   3. Nearest eligible-postcode centroid                               → source 'nearest'
 */
const { NOMINATIM_URL, USER_AGENT } = require('../scrapers/config');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Haversine distance in km between two lat/lon points. */
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Find the nearest eligible postcode to a point.
 * `eligible` is an array of { postcode, town, region, latitude, longitude, ... } (centroids).
 * Returns { postcode, distanceKm } or null.
 */
function nearestEligiblePostcode(lat, lon, eligible) {
  let best = null;
  for (const pc of eligible) {
    if (pc.latitude == null || pc.longitude == null) continue;
    const d = haversineKm(lat, lon, pc.latitude, pc.longitude);
    if (!best || d < best.distanceKm) best = { row: pc, distanceKm: d };
  }
  return best;
}

/**
 * Reverse geocode a point to an Australian postcode via Nominatim.
 * Respects the 1 req/sec usage policy — caller must throttle.
 * Returns a 4-digit postcode string or null.
 */
async function reverseGeocodePostcode(lat, lon) {
  const url = `${NOMINATIM_URL}?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) return null;
    const json = await res.json();
    const pc = json?.address?.postcode;
    if (pc && /^\d{4}$/.test(pc.trim())) return pc.trim();
    return null;
  } catch {
    return null;
  }
}

module.exports = { haversineKm, nearestEligiblePostcode, reverseGeocodePostcode, sleep };
