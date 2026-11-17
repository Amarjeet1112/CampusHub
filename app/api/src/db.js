const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  database: process.env.POSTGRES_DB || 'campushub',
  user: process.env.POSTGRES_USER || 'campushub_user',
  password: process.env.POSTGRES_PASSWORD || 'campushub_dev_password',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[POSTGRES] Unexpected client error:', err.message);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
