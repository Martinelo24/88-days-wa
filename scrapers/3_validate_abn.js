#!/usr/bin/env node
/**
 * STEP 3 — Validate each candidate against the ABN register.
 *
 * Requires ABR_GUID in .env. If absent, this step is a pass-through that simply
 * copies the located file forward (candidates carry no ABN and will score lower).
 * Writes data/candidates_validated.json.
 */
const fs = require('fs');
const path = require('path');
require('../lib/env').loadEnv();
const { paths } = require('./config');
const abn = require('../lib/abnLookup');

(async () => {
  console.log('STEP 3 — Validate against ABN register\n');

  const located = JSON.parse(fs.readFileSync(path.join(__dirname, '..', paths.located), 'utf-8'));

  if (!abn.isEnabled()) {
    console.log('  ⚠️  ABR_GUID not set — skipping ABN validation (candidates proceed without ABN).');
    console.log('     Register free at https://abr.business.gov.au/Tools/WebServices and add ABR_GUID to .env.\n');
    const passthrough = located.map((c) => ({ ...c, abn: null, abn_status: null, abn_matched_name: null }));
    fs.writeFileSync(path.join(__dirname, '..', paths.validated), JSON.stringify(passthrough, null, 2));
    console.log(`✅ ${passthrough.length} candidates → ${paths.validated} (no ABN)`);
    return;
  }

  console.log(`  Validating ${located.length} candidates via ABN Lookup...\n`);
  const validated = [];
  let matched = 0;

  for (const c of located) {
    const result = await abn.lookupByName(c.name, { postcode: c.postcode, state: 'WA' });
    await abn.sleep(350); // gentle rate limiting
    if (result) {
      matched++;
      validated.push({
        ...c,
        abn: result.abn,
        abn_status: result.abn_status,
        abn_matched_name: result.matched_name,
      });
    } else {
      validated.push({ ...c, abn: null, abn_status: null, abn_matched_name: null });
    }
  }

  fs.writeFileSync(path.join(__dirname, '..', paths.validated), JSON.stringify(validated, null, 2));
  console.log(`  ABN matched: ${matched}/${located.length}`);
  console.log(`\n✅ ${validated.length} candidates → ${paths.validated}`);
})();
