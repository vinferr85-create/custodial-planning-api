// db.js — PostgreSQL connection pool
// Render provides the DATABASE_URL environment variable automatically
// when you link a Postgres database to your web service.

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }  // Required for Render's managed Postgres
    : false,
});

// Test the connection on startup
pool.connect((err, client, release) => {
  if (err) {
    console.error('Database connection error:', err.message);
  } else {
    console.log('✅ Connected to PostgreSQL database');
    release();
  }
});

module.exports = pool;
