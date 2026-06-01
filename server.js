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

// Database connection
const dbPath = path.join(__dirname, 'data/88days.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Database connection error:', err.message);
    process.exit(1);
  }
  console.log('✓ Connected to SQLite database');
});

// ============ API ENDPOINTS ============

// Get all postcodes (with pagination)
app.get('/api/postcodes', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  const search = req.query.search || '';

  let query = 'SELECT * FROM postcodes WHERE town LIKE ? OR postcode LIKE ? ORDER BY postcode';
  let countQuery = 'SELECT COUNT(*) as count FROM postcodes WHERE town LIKE ? OR postcode LIKE ?';
  let params = [`%${search}%`, `%${search}%`];

  db.get(countQuery, params, (err, row) => {
    if (err) return res.status(500).json({ error: err.message });

    db.all(query + ` LIMIT ? OFFSET ?`, [...params, limit, offset], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({
        data: rows,
        pagination: {
          page,
          limit,
          total: row.count,
          totalPages: Math.ceil(row.count / limit)
        }
      });
    });
  });
});

// Get single postcode with details
app.get('/api/postcodes/:postcode', (req, res) => {
  const { postcode } = req.params;
  db.get(
    'SELECT * FROM postcodes WHERE postcode = ?',
    [postcode],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'Postcode not found' });

      // Get businesses in this postcode
      db.all(
        'SELECT * FROM businesses WHERE postcode = ? ORDER BY business_name',
        [postcode],
        (err, businesses) => {
          if (err) return res.status(500).json({ error: err.message });
          res.json({
            postcode: row,
            businesses: businesses || []
          });
        }
      );
    }
  );
});

// Get all job categories
app.get('/api/categories', (req, res) => {
  db.all('SELECT * FROM job_categories ORDER BY parent_category, category_name', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ data: rows });
  });
});

// Get single category with details
app.get('/api/categories/:id', (req, res) => {
  const { id } = req.params;
  db.get('SELECT * FROM job_categories WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Category not found' });

    // Get businesses in this category
    db.all(
      'SELECT * FROM businesses WHERE job_category_id = ? ORDER BY town, business_name',
      [id],
      (err, businesses) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({
          category: row,
          businesses: businesses || []
        });
      }
    );
  });
});

// Get all businesses (with pagination & filters)
app.get('/api/businesses', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  const verified = req.query.verified;
  const town = req.query.town;
  const category = req.query.category;

  let query = 'SELECT * FROM businesses WHERE 1=1';
  let countQuery = 'SELECT COUNT(*) as count FROM businesses WHERE 1=1';
  let params = [];

  if (verified !== undefined) {
    query += ' AND verified = ?';
    countQuery += ' AND verified = ?';
    params.push(verified === 'true' ? 1 : 0);
  }

  if (town) {
    query += ' AND town = ?';
    countQuery += ' AND town = ?';
    params.push(town);
  }

  if (category) {
    query += ' AND job_category_id = ?';
    countQuery += ' AND job_category_id = ?';
    params.push(category);
  }

  query += ' ORDER BY town, business_name';

  db.get(countQuery, params, (err, row) => {
    if (err) return res.status(500).json({ error: err.message });

    db.all(query + ` LIMIT ? OFFSET ?`, [...params, limit, offset], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({
        data: rows,
        pagination: {
          page,
          limit,
          total: row.count,
          totalPages: Math.ceil(row.count / limit)
        }
      });
    });
  });
});

// Get database stats
app.get('/api/stats', (req, res) => {
  db.all(`
    SELECT
      (SELECT COUNT(*) FROM postcodes) as postcodes,
      (SELECT COUNT(*) FROM job_categories) as categories,
      (SELECT COUNT(*) FROM businesses) as businesses,
      (SELECT COUNT(*) FROM businesses WHERE verified = 1) as verified_businesses
  `, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows[0]);
  });
});

// ============ SERVER START ============

app.listen(PORT, () => {
  console.log(`\n✓ Server running at http://localhost:${PORT}`);
  console.log(`✓ Database browser ready!\n`);
});

process.on('SIGINT', () => {
  db.close((err) => {
    if (err) console.error(err);
    console.log('\n✓ Database closed');
    process.exit(0);
  });
});
