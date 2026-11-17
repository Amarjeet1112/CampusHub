const db = require('./db');

async function runMigrations(retries = 10, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`[MIGRATION] Attempting schema migration (${i + 1}/${retries})...`);

      // 1. Create events table
      await db.query(`
        CREATE TABLE IF NOT EXISTS events (
          id SERIAL PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          description TEXT NOT NULL,
          date VARCHAR(100) NOT NULL,
          location VARCHAR(255) NOT NULL,
          image_url VARCHAR(500),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 2. Create registrations table
      await db.query(`
        CREATE TABLE IF NOT EXISTS registrations (
          id SERIAL PRIMARY KEY,
          event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
          student_name VARCHAR(255) NOT NULL,
          student_email VARCHAR(255) NOT NULL,
          registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      console.log('[MIGRATION] Database schema verified and tables created successfully.');

      // 3. Check if seed data exists
      const countRes = await db.query('SELECT COUNT(*) FROM events;');
      const count = parseInt(countRes.rows[0].count, 10);

      if (count === 0) {
        console.log('[SEED] No events found. Inserting 3 initial default campus events...');
        const initialEvents = [
          [
            'Campus Hackathon 2026',
            '48-hour collaborative development sprint building AI, Web, and Cloud solutions. Prizes and mentorship included!',
            'Oct 24 - 26, 2026',
            'Student Innovation Center - Hall A',
            '/storage/campushub/welcome-banner.png'
          ],
          [
            'AI & Machine Learning Symposium',
            'Keynote addresses and interactive workshops on modern LLMs, autonomous agents, and production deployments.',
            'Nov 12, 2026',
            'Main University Auditorium',
            '/storage/campushub/welcome-banner.png'
          ],
          [
            'Annual Tech Career Fair',
            'Connect directly with hiring engineers and recruiters from top technology and engineering enterprises.',
            'Dec 05, 2026',
            'Campus Exhibition Center',
            '/storage/campushub/welcome-banner.png'
          ]
        ];

        for (const ev of initialEvents) {
          await db.query(
            `INSERT INTO events (title, description, date, location, image_url)
             VALUES ($1, $2, $3, $4, $5);`,
            ev
          );
        }
        console.log('[SEED] Default initial campus events seeded successfully into PostgreSQL.');
      } else {
        console.log(`[SEED] Events table already contains ${count} records. Skipping seed.`);
      }

      return true;
    } catch (err) {
      console.warn(`[MIGRATION] Attempt ${i + 1} failed: ${err.message}. Retrying in ${delay / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error('[MIGRATION] Database migration and seeding failed after multiple attempts.');
}

module.exports = { runMigrations };
