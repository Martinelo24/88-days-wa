const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const cors = require('cors');
const { evaluate } = require('./lib/eligibility');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const dbPath = path.join(__dirname, 'data/88days.db');
let db;
try {
  db = new Database(dbPath);
  db.pragma('busy_timeout = 5000');
  console.log('✓ Connected to SQLite database at ' + dbPath);
} catch (err) {
  console.error('❌ Database connection error:', err.message);
  process.exit(1);
}

// ============ API ENDPOINTS ============

// Get all postcodes — searches across town name AND all localities
app.get('/api/postcodes', (req, res) => {
  try {
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const searchParam = `%${search}%`;
    const where = `WHERE town LIKE ? OR postcode LIKE ? OR localities LIKE ?`;

    const countRow = db.prepare(`SELECT COUNT(*) as count FROM postcodes ${where}`)
      .get(searchParam, searchParam, searchParam);
    const rows = db.prepare(`SELECT * FROM postcodes ${where} ORDER BY CAST(postcode AS INTEGER) LIMIT ? OFFSET ?`)
      .all(searchParam, searchParam, searchParam, limit, offset);

    res.json({
      data: rows || [],
      pagination: {
        page, limit,
        total: countRow ? countRow.count : 0,
        totalPages: countRow ? Math.ceil(countRow.count / limit) : 0,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single postcode detail
app.get('/api/postcodes/:postcode', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM postcodes WHERE postcode = ?').get(req.params.postcode);
    if (!row) return res.status(404).json({ error: 'Postcode not found' });
    const businesses = db.prepare('SELECT * FROM businesses WHERE postcode = ? ORDER BY business_name')
      .all(req.params.postcode);
    res.json({ postcode: row, businesses: businesses || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH — edit a postcode's primary town name
app.patch('/api/postcodes/:postcode', (req, res) => {
  const { town } = req.body;
  if (!town || !town.trim()) return res.status(400).json({ error: 'town is required' });
  try {
    const info = db.prepare('UPDATE postcodes SET town = ? WHERE postcode = ?')
      .run(town.trim(), req.params.postcode);
    if (info.changes === 0) return res.status(404).json({ error: 'Postcode not found' });
    res.json({ success: true, postcode: req.params.postcode, town: town.trim() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all job categories
app.get('/api/categories', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM job_categories ORDER BY parent_category, category_name').all();
    res.json({ data: rows || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single category
app.get('/api/categories/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM job_categories WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Category not found' });
    const businesses = db.prepare('SELECT * FROM businesses WHERE job_category_id = ? ORDER BY town, business_name')
      .all(req.params.id);
    res.json({ category: row, businesses: businesses || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get APPROVED businesses (the public dataset — verified = 1 only)
app.get('/api/businesses', (req, res) => {
  try {
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const { town, category } = req.query;

    let where = 'WHERE verified = 1';
    const params = [];
    if (town)     { where += ' AND town = ?';            params.push(town); }
    if (category) { where += ' AND job_category_id = ?'; params.push(category); }

    const countRow = db.prepare(`SELECT COUNT(*) as count FROM businesses ${where}`).get(...params);
    const rows     = db.prepare(`SELECT * FROM businesses ${where} ORDER BY town, business_name LIMIT ? OFFSET ?`)
      .all(...params, limit, offset);

    res.json({
      data: rows || [],
      pagination: { page, limit, total: countRow.count, totalPages: Math.ceil(countRow.count / limit) },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ REVIEW QUEUE (human verification gate) ============

app.get('/api/review/queue', (req, res) => {
  try {
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const status = req.query.status || 'pending';
    const showMismatches = req.query.showMismatches === 'true';

    let where = 'WHERE review_status = ?';
    const params = [status];
    if (showMismatches) {
      where += " AND eligibility = 'mismatch'";
    } else {
      where += " AND (eligibility = 'eligible' OR eligibility IS NULL)";
    }

    const mismatchRow = db.prepare(
      "SELECT COUNT(*) as c FROM businesses WHERE review_status = ? AND eligibility = 'mismatch'"
    ).get(status);
    const mismatchCount = mismatchRow ? mismatchRow.c : 0;

    const countRow = db.prepare(`SELECT COUNT(*) as count FROM businesses ${where}`).get(...params);
    const rows     = db.prepare(
      `SELECT * FROM businesses ${where} ORDER BY confidence_score DESC, business_name ASC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);

    res.json({
      data: rows || [],
      mismatchCount,
      pagination: { page, limit, total: countRow.count, totalPages: Math.ceil(countRow.count / limit) },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Approve a candidate → becomes part of the public dataset
app.post('/api/review/:id/approve', (req, res) => {
  try {
    const info = db.prepare(
      `UPDATE businesses SET review_status = 'approved', verified = 1,
       verified_date = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, id: req.params.id, review_status: 'approved' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reject a candidate → hidden from queue, never public
app.post('/api/review/:id/reject', (req, res) => {
  try {
    const info = db.prepare(
      `UPDATE businesses SET review_status = 'rejected', verified = 0,
       updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, id: req.params.id, review_status: 'rejected' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Edit a business's correctable fields (used from the review queue)
app.patch('/api/businesses/:id', (req, res) => {
  const allowed = ['business_name', 'postcode', 'town', 'region', 'job_category_id',
                   'job_category_name', 'website_url', 'phone_number', 'hiring_status', 'notes'];
  const sets = [];
  const params = [];
  for (const field of allowed) {
    if (field in req.body) { sets.push(`${field} = ?`); params.push(req.body[field]); }
  }
  if (!sets.length) return res.status(400).json({ error: 'No editable fields supplied' });
  params.push(req.params.id);

  try {
    const info = db.prepare(
      `UPDATE businesses SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(...params);
    if (info.changes === 0) return res.status(404).json({ error: 'Not found' });

    const touchedCat  = 'job_category_id' in req.body;
    const touchedPc   = 'postcode'        in req.body;
    const touchedName = 'business_name'   in req.body;
    if (!touchedCat && !touchedPc && !touchedName) return res.json({ success: true, id: req.params.id });

    const r = db.prepare(
      `SELECT b.business_name, b.job_category_id, p.work_categories
       FROM businesses b LEFT JOIN postcodes p ON b.postcode = p.postcode
       WHERE b.id = ?`
    ).get(req.params.id);

    if (!r) return res.json({ success: true, id: req.params.id });
    const v = evaluate(r.job_category_id, r.work_categories, r.business_name);
    const verdict = v.eligible === true ? 'eligible' : v.eligible === false ? 'mismatch' : null;
    db.prepare('UPDATE businesses SET eligibility = ?, eligibility_reason = ? WHERE id = ?')
      .run(verdict, v.reason, req.params.id);
    res.json({ success: true, id: req.params.id, eligibility: verdict, eligibility_reason: v.reason });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get database stats
app.get('/api/stats', (req, res) => {
  try {
    const row = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM postcodes) as postcodes,
        (SELECT COUNT(*) FROM job_categories) as categories,
        (SELECT COUNT(*) FROM businesses WHERE verified = 1) as businesses,
        (SELECT COUNT(*) FROM businesses WHERE verified = 1) as verified_businesses,
        (SELECT COUNT(*) FROM businesses WHERE review_status = 'pending') as pending_review
    `).get();
    res.json(row || { postcodes: 0, categories: 0, businesses: 0, verified_businesses: 0, pending_review: 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ SERVER START ============
app.listen(PORT, () => {
  console.log(`\n✓ Server running at http://localhost:${PORT}\n`);
});

process.on('SIGINT', () => {
  db.close();
  console.log('\n✓ Database closed');
  process.exit(0);
});
