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
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('❌ Database connection error:', err.message);
    process.exit(1);
  }
  console.log('✓ Connected to SQLite database at ' + dbPath);
});

// Configure SQLite for better concurrency
db.configure('busyTimeout', 5000);

// ============ API ENDPOINTS ============

// Get all postcodes (with pagination)
app.get('/api/postcodes', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  const search = req.query.search || '';

  try {
    const searchParam = `%${search}%`;
    const countQuery = 'SELECT COUNT(*) as count FROM postcodes WHERE town LIKE ? OR postcode LIKE ?';
    const dataQuery = 'SELECT * FROM postcodes WHERE town LIKE ? OR postcode LIKE ? ORDER BY postcode LIMIT ? OFFSET ?';

    db.get(countQuery, [searchParam, searchParam], (err, countRow) => {
      if (err) {
        console.error('Count query error:', err);
        return res.status(500).json({ error: 'Count query failed: ' + err.message });
      }

      db.all(dataQuery, [searchParam, searchParam, limit, offset], (err, rows) => {
        if (err) {
          console.error('Data query error:', err);
          return res.status(500).json({ error: 'Data query failed: ' + err.message });
        }

        res.json({
          data: rows || [],
          pagination: {
            page,
            limit,
            total: countRow ? countRow.count : 0,
            totalPages: countRow ? Math.ceil(countRow.count / limit) : 0
          }
        });
      });
    });
  } catch (err) {
    console.error('Postcodes endpoint error:', err);
    res.status(500).json({ error: err.message });
  }
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
  try {
    db.all('SELECT * FROM job_categories ORDER BY parent_category, category_name', (err, rows) => {
      if (err) {
        console.error('Categories query error:', err);
        return res.status(500).json({ error: err.message });
      }
      res.json({ data: rows || [] });
    });
  } catch (err) {
    console.error('Categories endpoint error:', err);
    res.status(500).json({ error: err.message });
  }
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
  try {
    db.get(`
      SELECT
        (SELECT COUNT(*) FROM postcodes) as postcodes,
        (SELECT COUNT(*) FROM job_categories) as categories,
        (SELECT COUNT(*) FROM businesses) as businesses,
        (SELECT COUNT(*) FROM businesses WHERE verified = 1) as verified_businesses
    `, (err, row) => {
      if (err) {
        console.error('Stats query error:', err);
        return res.status(500).json({ error: err.message });
      }
      res.json(row || { postcodes: 0, categories: 0, businesses: 0, verified_businesses: 0 });
    });
  } catch (err) {
    console.error('Stats endpoint error:', err);
    res.status(500).json({ error: err.message });
  }
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
