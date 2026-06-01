#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const dbPath = path.join(__dirname, '../data/88days.db');

// Create/open database
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exit(1);
  }
  console.log('✓ Connected to SQLite database');
});

// Run queries sequentially
db.serialize(() => {
  // Drop existing tables (for fresh setup)
  db.run('DROP TABLE IF EXISTS search_logs');
  db.run('DROP TABLE IF EXISTS businesses');
  db.run('DROP TABLE IF EXISTS job_categories');
  db.run('DROP TABLE IF EXISTS postcodes');

  // 1. CREATE POSTCODES TABLE
  db.run(`
    CREATE TABLE postcodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      postcode VARCHAR(4) NOT NULL UNIQUE,
      town VARCHAR(100) NOT NULL,
      region VARCHAR(50) NOT NULL,
      state VARCHAR(2) DEFAULT 'WA',
      latitude DECIMAL(10,8),
      longitude DECIMAL(11,8),
      eligible_88days BOOLEAN DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) console.error('Error creating postcodes table:', err);
    else console.log('✓ Created postcodes table');
  });

  // 2. CREATE JOB_CATEGORIES TABLE
  db.run(`
    CREATE TABLE job_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_name VARCHAR(100) NOT NULL UNIQUE,
      parent_category VARCHAR(100),
      description TEXT,
      eligible_88days BOOLEAN DEFAULT 1,
      search_keywords TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) console.error('Error creating job_categories table:', err);
    else console.log('✓ Created job_categories table');
  });

  // 3. CREATE BUSINESSES TABLE (main table)
  db.run(`
    CREATE TABLE businesses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_name VARCHAR(200) NOT NULL,
      postcode VARCHAR(4) NOT NULL,
      town VARCHAR(100) NOT NULL,
      region VARCHAR(50),
      job_category_id INTEGER,
      job_category_name VARCHAR(100),
      website_url VARCHAR(500),
      phone_number VARCHAR(20),
      business_description TEXT,
      hiring_status VARCHAR(50) DEFAULT 'unknown',
      work_types_offered TEXT,
      source_found VARCHAR(100),
      verified BOOLEAN DEFAULT 0,
      verified_date TIMESTAMP,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (postcode) REFERENCES postcodes(postcode),
      FOREIGN KEY (job_category_id) REFERENCES job_categories(id),
      UNIQUE(business_name, postcode)
    )
  `, (err) => {
    if (err) console.error('Error creating businesses table:', err);
    else console.log('✓ Created businesses table');
  });

  // 4. CREATE SEARCH_LOGS TABLE (analytics)
  db.run(`
    CREATE TABLE search_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_identifier VARCHAR(100),
      search_town VARCHAR(100),
      search_category VARCHAR(100),
      search_postcode VARCHAR(4),
      results_count INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) console.error('Error creating search_logs table:', err);
    else console.log('✓ Created search_logs table');
  });

  // 5. CREATE INDEXES
  setTimeout(() => {
    db.run('CREATE INDEX idx_postcode ON businesses(postcode)');
    db.run('CREATE INDEX idx_town ON businesses(town)');
    db.run('CREATE INDEX idx_category ON businesses(job_category_id)');
    db.run('CREATE INDEX idx_verified ON businesses(verified)');
    db.run('CREATE INDEX idx_hiring_status ON businesses(hiring_status)');
    db.run('CREATE INDEX idx_postcodes_postcode ON postcodes(postcode)');
    console.log('✓ Created database indexes');
  }, 500);

  // 6. SEED POSTCODES from CSV
  setTimeout(() => {
    const postcodeCsv = fs.readFileSync(path.join(__dirname, '../data/postcodes.csv'), 'utf-8');
    const postcodes = parse(postcodeCsv, { columns: true });

    const stmt = db.prepare(`
      INSERT INTO postcodes (postcode, town, region, state, latitude, longitude, eligible_88days)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    postcodes.forEach((row) => {
      stmt.run([
        row.postcode,
        row.town,
        row.region,
        row.state,
        parseFloat(row.latitude),
        parseFloat(row.longitude),
        row.eligible_88days === 'yes' ? 1 : 0
      ]);
    });

    stmt.finalize((err) => {
      if (err) console.error('Error seeding postcodes:', err);
      else console.log(`✓ Seeded ${postcodes.length} postcodes`);
    });
  }, 1000);

  // 7. SEED JOB_CATEGORIES from CSV
  setTimeout(() => {
    const categoriesCsv = fs.readFileSync(path.join(__dirname, '../data/job_categories.csv'), 'utf-8');
    const categories = parse(categoriesCsv, { columns: true });

    const stmt = db.prepare(`
      INSERT INTO job_categories (category_name, parent_category, description, eligible_88days, search_keywords)
      VALUES (?, ?, ?, ?, ?)
    `);

    categories.forEach((row) => {
      stmt.run([
        row.category_name,
        row.parent_category,
        row.description,
        row.eligible_88days === 'yes' ? 1 : 0,
        row.search_keywords
      ]);
    });

    stmt.finalize((err) => {
      if (err) console.error('Error seeding categories:', err);
      else console.log(`✓ Seeded ${categories.length} job categories`);
    });
  }, 1500);

  // 8. FINAL SUCCESS MESSAGE
  setTimeout(() => {
    db.all("SELECT COUNT(*) as count FROM postcodes", (err, rows) => {
      if (err) return;
      console.log(`\n✓ Database setup complete!`);
      console.log(`  Database: ${dbPath}`);
      console.log(`  Postcodes: ${rows[0].count}`);
    });
  }, 2500);
});

db.on('error', (err) => {
  console.error('Database error:', err.message);
  process.exit(1);
});

process.on('SIGINT', () => {
  db.close((err) => {
    if (err) console.error(err);
    console.log('Database connection closed');
    process.exit(0);
  });
});
