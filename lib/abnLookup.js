/**
 * ABN Lookup client (Australian Business Register).
 *
 * Uses the public MatchingNames JSON endpoint, which requires a free GUID
 * (register at https://abr.business.gov.au/Tools/WebServices). The GUID is read
 * from process.env.ABR_GUID. If it is absent, every call returns null and the
 * pipeline simply proceeds without ABN validation (candidates score lower).
 */
const { USER_AGENT } = require('../scrapers/config');

const GUID = process.env.ABR_GUID || null;
const ENDPOINT = 'https://abr.business.gov.au/json/MatchingNames.aspx';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isEnabled() {
  return !!GUID;
}

/** Normalise a business name for comparison (lowercase, strip punctuation/suffixes). */
function normalise(name) {
  return (name || '')
    .toLowerCase()
    .replace(/\b(pty|ltd|limited|the|and|co|company|wines?|estate|farm|orchard|vineyard)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Crude token-overlap similarity 0..1. */
function similarity(a, b) {
  const ta = new Set(normalise(a).split(' ').filter(Boolean));
  const tb = new Set(normalise(b).split(' ').filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.max(ta.size, tb.size);
}

/**
 * Look up a business name on the ABR.
 * @param {string} name     candidate business name
 * @param {object} opts     { postcode, state='WA' }
 * @returns {object|null}   { abn, abn_status, matched_name, postcode, state, score } or null
 */
async function lookupByName(name, { postcode, state = 'WA' } = {}) {
  if (!GUID || !name) return null;

  const url = `${ENDPOINT}?name=${encodeURIComponent(name)}&maxResults=20&guid=${GUID}`;
  let json;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) return null;
    const text = await res.text();
    // Response may be wrapped as JSONP: callback({...}); extract the JSON object.
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    json = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }

  const names = json?.Names || [];
  if (!names.length) return null;

  // Restrict to the right state, then rank by (status active, postcode match, name similarity).
  const candidates = names
    .filter((n) => !state || n.State === state)
    .map((n) => {
      const sim = similarity(name, n.Name);
      const pcMatch = postcode && n.Postcode === String(postcode) ? 1 : 0;
      const active = /active/i.test(n.AbnStatus || '') ? 1 : 0;
      // weighted rank
      const rank = sim * 0.6 + pcMatch * 0.3 + active * 0.1;
      return { n, sim, pcMatch, active, rank };
    })
    .filter((c) => c.sim >= 0.34) // require a real name overlap to avoid false positives
    .sort((a, b) => b.rank - a.rank);

  if (!candidates.length) return null;
  const best = candidates[0];

  return {
    abn: best.n.Abn,
    abn_status: best.n.AbnStatus,
    matched_name: best.n.Name,
    postcode: best.n.Postcode,
    state: best.n.State,
    score: Math.round(best.rank * 100),
  };
}

module.exports = { isEnabled, lookupByName, sleep, similarity, normalise };
