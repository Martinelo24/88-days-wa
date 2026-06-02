/**
 * Work-type ↔ government-category eligibility guard.
 *
 * The crucial rule: a business's WORK TYPE must match what its postcode's
 * eligibility CATEGORY actually allows. Examples:
 *   - A vineyard (specified work) is only eligible in a Cat-3 (Regional) postcode.
 *   - A remote lodge (tourism) is only eligible in a Cat-1/Cat-2 postcode.
 *   - A flood-cleanup contractor (disaster recovery) only in a Cat-4/Cat-5 postcode.
 *
 * This module is the single source of truth, shared by the scraping pipeline,
 * the one-off backfill, and the server.
 */

// Which "nature of work" each job_categories.id represents.
const CATEGORY_NATURE = {
  1: 'specified',   // Fruit Orchard
  2: 'specified',   // Grape Vineyard
  3: 'specified',   // Vegetable Farm
  4: 'specified',   // Livestock Farm
  5: 'specified',   // Nursery & Horticulture
  6: 'specified',   // Mining Operation
  7: 'specified',   // Fish Processing
  8: 'specified',   // Regional Construction
  9: 'tourism',     // Hospitality Remote
  10: 'disaster',   // Disaster Recovery Work
  11: 'specified',  // Agricultural Processing
  12: 'specified',  // Cotton Picking
};

// Which government categories each nature of work requires (any one suffices).
const NATURE_REQUIRES = {
  specified: ['cat3'],          // Regional Australia — specified work
  tourism:   ['cat1', 'cat2'],  // Remote / Northern — tourism & hospitality
  disaster:  ['cat4', 'cat5'],  // Bushfire / Natural disaster recovery
};

const CAT_LABEL = {
  cat1: 'Cat 1 (Remote/Very Remote tourism)',
  cat2: 'Cat 2 (Northern Australia tourism)',
  cat3: 'Cat 3 (Regional Australia)',
  cat4: 'Cat 4 (Bushfire Recovery)',
  cat5: 'Cat 5 (Natural Disaster Recovery)',
};

const NATURE_LABEL = {
  specified: 'specified work',
  tourism: 'tourism/hospitality work',
  disaster: 'disaster recovery work',
};

/**
 * Evaluate whether a business is eligible at its postcode.
 * @param {number} jobCategoryId        businesses.job_category_id
 * @param {string} postcodeWorkCats     postcodes.work_categories, e.g. "cat3,cat5"
 * @returns {{ eligible: boolean, reason: string, matched: string[] }}
 */
function evaluate(jobCategoryId, postcodeWorkCats) {
  const nature = CATEGORY_NATURE[jobCategoryId];
  const pcCats = (postcodeWorkCats || '').split(',').map((s) => s.trim()).filter(Boolean);

  // Unknown / uncategorised business → can't judge; treat as needs-review (not a hard mismatch).
  if (!nature) {
    return { eligible: null, reason: 'Business has no work category yet — set one to check eligibility.', matched: [] };
  }

  const required = NATURE_REQUIRES[nature] || [];
  const matched = required.filter((c) => pcCats.includes(c));

  if (matched.length > 0) {
    const via = matched.map((c) => CAT_LABEL[c]).join(' / ');
    return {
      eligible: true,
      reason: `${NATURE_LABEL[nature]} is valid here via ${via}.`,
      matched,
    };
  }

  // Mismatch — explain what the postcode offers vs what this work needs.
  const offers = pcCats.length ? pcCats.map((c) => CAT_LABEL[c]).join(' / ') : 'no eligible category';
  const needs = required.map((c) => CAT_LABEL[c]).join(' or ');
  return {
    eligible: false,
    reason: `${NATURE_LABEL[nature]} needs ${needs}, but this postcode only offers ${offers}.`,
    matched: [],
  };
}

module.exports = { evaluate, CATEGORY_NATURE, NATURE_REQUIRES, CAT_LABEL };
