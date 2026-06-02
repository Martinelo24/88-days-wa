const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Database connection (read-write so we can edit postcodes)
const dbPath = path.join(__dirname, 'data/88days.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Database connection error:', err.message);
    process.exit(1);
  }
  console.log('✓ Connected to SQLite database at ' + dbPath);
});
db.configure('busyTimeout', 5000);

// ============ API ENDPOINTS ============

// Get all postcodes — searches across town name AND all localities
app.get('/api/postcodes', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  const search = req.query.search || '';

  try {
    const searchParam = `%${search}%`;
    // Search town, postcode, AND all localities
    const where = `WHERE town LIKE ? OR postcode LIKE ? OR localities LIKE ?`;
    const params = [searchParam, searchParam, searchParam];

    db.get(`SELECT COUNT(*) as count FROM postcodes ${where}`, params, (err, countRow) => {
      if (err) return res.status(500).json({ error: err.message });

      db.all(
        `SELECT * FROM postcodes ${where} ORDER BY CAST(postcode AS INTEGER) LIMIT ? OFFSET ?`,
        [...params, limit, offset],
        (err, rows) => {
          if (err) return res.status(500).json({ error: err.message });
          res.json({
            data: rows || [],
            pagination: {
              page, limit,
              total: countRow ? countRow.count : 0,
              totalPages: countRow ? Math.ceil(countRow.count / limit) : 0
            }
          });
        }
      );
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single postcode detail
app.get('/api/postcodes/:postcode', (req, res) => {
  db.get('SELECT * FROM postcodes WHERE postcode = ?', [req.params.postcode], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Postcode not found' });
    db.all('SELECT * FROM businesses WHERE postcode = ? ORDER BY business_name', [req.params.postcode], (err, businesses) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ postcode: row, businesses: businesses || [] });
    });
  });
});

// ✏️  PATCH — edit a postcode's primary town name
app.patch('/api/postcodes/:postcode', (req, res) => {
  const { town } = req.body;
  if (!town || !town.trim()) return res.status(400).json({ error: 'town is required' });

  db.run(
    'UPDATE postcodes SET town = ? WHERE postcode = ?',
    [town.trim(), req.params.postcode],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Postcode not found' });
      res.json({ success: true, postcode: req.params.postcode, town: town.trim() });
    }
  );
});

// Get all job categories
app.get('/api/categories', (req, res) => {
  db.all('SELECT * FROM job_categories ORDER BY parent_category, category_name', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ data: rows || [] });
  });
});

// Get single category
app.get('/api/categories/:id', (req, res) => {
  db.get('SELECT * FROM job_categories WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Category not found' });
    db.all('SELECT * FROM businesses WHERE job_category_id = ? ORDER BY town, business_name', [req.params.id], (err, businesses) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ category: row, businesses: businesses || [] });
    });
  });
});

// Get APPROVED businesses (the public dataset — verified = 1 only)
app.get('/api/businesses', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  const { town, category } = req.query;

  let where = 'WHERE verified = 1';
  let params = [];
  if (town)     { where += ' AND town = ?';            params.push(town); }
  if (category) { where += ' AND job_category_id = ?'; params.push(category); }

  db.get(`SELECT COUNT(*) as count FROM businesses ${where}`, params, (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    db.all(`SELECT * FROM businesses ${where} ORDER BY town, business_name LIMIT ? OFFSET ?`, [...params, limit, offset], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ data: rows || [], pagination: { page, limit, total: row.count, totalPages: Math.ceil(row.count / limit) } });
    });
  });
});

// ============ REVIEW QUEUE (human verification gate) ============

// Get candidates awaiting review, sorted by confidence (highest first)
app.get('/api/review/queue', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  const status = req.query.status || 'pending';

  const where = 'WHERE review_status = ?';
  const params = [status];

  db.get(`SELECT COUNT(*) as count FROM businesses ${where}`, params, (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    db.all(
      `SELECT * FROM businesses ${where}
       ORDER BY confidence_score DESC, business_name ASC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
      (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: rows || [], pagination: { page, limit, total: row.count, totalPages: Math.ceil(row.count / limit) } });
      }
    );
  });
});

// Approve a candidate → becomes part of the public dataset
app.post('/api/review/:id/approve', (req, res) => {
  db.run(
    `UPDATE businesses
     SET review_status = 'approved', verified = 1, verified_date = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Not found' });
      res.json({ success: true, id: req.params.id, review_status: 'approved' });
    }
  );
});

// Reject a candidate → hidden from queue, never public
app.post('/api/review/:id/reject', (req, res) => {
  db.run(
    `UPDATE businesses
     SET review_status = 'rejected', verified = 0, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Not found' });
      res.json({ success: true, id: req.params.id, review_status: 'rejected' });
    }
  );
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

  db.run(
    `UPDATE businesses SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    params,
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Not found' });
      res.json({ success: true, id: req.params.id });
    }
  );
});

// Get database stats
app.get('/api/stats', (req, res) => {
  db.get(`
    SELECT
      (SELECT COUNT(*) FROM postcodes) as postcodes,
      (SELECT COUNT(*) FROM job_categories) as categories,
      (SELECT COUNT(*) FROM businesses WHERE verified = 1) as businesses,
      (SELECT COUNT(*) FROM businesses WHERE verified = 1) as verified_businesses,
      (SELECT COUNT(*) FROM businesses WHERE review_status = 'pending') as pending_review
  `, (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row || { postcodes: 0, categories: 0, businesses: 0, verified_businesses: 0, pending_review: 0 });
  });
});

// ============ SERVER START ============
app.listen(PORT, () => {
  console.log(`\n✓ Server running at http://localhost:${PORT}\n`);
});

process.on('SIGINT', () => {
  db.close(() => { console.log('\n✓ Database closed'); process.exit(0); });
});
