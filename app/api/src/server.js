const express = require('express');
const cors = require('cors');
const multer = require('multer');
const db = require('./db');
const redisClient = require('./redis');
const queue = require('./queue');
const storage = require('./storage');
const { runMigrations } = require('./migrate');

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure multer for file uploads in memory (Max 5MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// -------------------------------------------------------------
// Health Check Endpoints (Both /health and /api/health supported)
// -------------------------------------------------------------
async function handleHealthCheck(req, res) {
  let pgStatus = 'disconnected';
  try {
    const pgRes = await db.query('SELECT 1;');
    if (pgRes.rows.length > 0) pgStatus = 'connected';
  } catch (err) {
    pgStatus = `error: ${err.message}`;
  }

  const redisStatus = redisClient.isReady() ? 'connected' : 'disconnected';
  const rabbitmqStatus = queue.isReady() ? 'connected' : 'disconnected';
  const minioStatus = storage.isReady() ? 'connected' : 'disconnected';

  const isHealthy = pgStatus === 'connected';

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'ok' : 'degraded',
    service: 'campushub-api',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    components: {
      postgres: pgStatus,
      redis: redisStatus,
      rabbitmq: rabbitmqStatus,
      minio: minioStatus
    }
  });
}

app.get('/health', handleHealthCheck);
app.get('/api/health', handleHealthCheck);

// -------------------------------------------------------------
// Events Endpoints (PostgreSQL + Redis Caching)
// -------------------------------------------------------------
app.get('/api/events', async (req, res) => {
  const cacheKey = 'campushub:events';

  try {
    // 1. Attempt retrieval from Redis cache
    const cachedEvents = await redisClient.get(cacheKey);
    if (cachedEvents) {
      console.log('[REDIS] Cache HIT for key:', cacheKey);
      return res.json({
        success: true,
        source: 'redis',
        cached: true,
        count: JSON.parse(cachedEvents).length,
        data: JSON.parse(cachedEvents)
      });
    }

    // 2. Cache Miss: Query PostgreSQL
    console.log('[REDIS] Cache MISS for key:', cacheKey, '- Querying PostgreSQL...');
    const result = await db.query('SELECT * FROM events ORDER BY id ASC;');
    const events = result.rows;

    // 3. Cache result in Redis for 60 seconds
    await redisClient.set(cacheKey, JSON.stringify(events), { EX: 60 });
    console.log('[REDIS] Cached', events.length, 'events with 60s TTL.');

    return res.json({
      success: true,
      source: 'postgres',
      cached: false,
      count: events.length,
      data: events
    });
  } catch (err) {
    console.error('[API] Error in GET /api/events:', err);
    return res.status(500).json({ success: false, error: 'Failed to retrieve events' });
  }
});

app.post('/api/events', async (req, res) => {
  const { title, description, date, location, imageUrl } = req.body;
  if (!title || !description || !date || !location) {
    return res.status(400).json({ success: false, error: 'Missing required event fields' });
  }

  try {
    const result = await db.query(
      `INSERT INTO events (title, description, date, location, image_url)
       VALUES ($1, $2, $3, $4, $5) RETURNING *;`,
      [title, description, date, location, imageUrl || '/storage/campushub/welcome-banner.png']
    );

    // Invalidate Redis cache
    await redisClient.del('campushub:events');
    console.log('[REDIS] Invalidated campushub:events cache upon new event creation.');

    return res.status(201).json({
      success: true,
      message: 'Event created successfully',
      event: result.rows[0]
    });
  } catch (err) {
    console.error('[API] Error in POST /api/events:', err);
    return res.status(500).json({ success: false, error: 'Failed to create event' });
  }
});

// -------------------------------------------------------------
// Registrations Endpoint (PostgreSQL + RabbitMQ Job Queue)
// -------------------------------------------------------------
app.post('/api/registrations', async (req, res) => {
  const { eventId, studentName, studentEmail } = req.body;

  if (!eventId || !studentName || !studentEmail) {
    return res.status(400).json({
      success: false,
      error: 'Fields eventId, studentName, and studentEmail are required'
    });
  }

  try {
    // 1. Verify event exists
    const eventResult = await db.query('SELECT * FROM events WHERE id = $1;', [eventId]);
    if (eventResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }
    const event = eventResult.rows[0];

    // 2. Persist registration in PostgreSQL
    const regResult = await db.query(
      `INSERT INTO registrations (event_id, student_name, student_email)
       VALUES ($1, $2, $3) RETURNING id, registered_at;`,
      [eventId, studentName, studentEmail]
    );
    const registration = regResult.rows[0];

    // 3. Queue asynchronous confirmation email job via RabbitMQ
    const jobPayload = {
      registrationId: registration.id,
      eventId: event.id,
      eventTitle: event.title,
      eventDate: event.date,
      eventLocation: event.location,
      studentName,
      studentEmail,
      registeredAt: registration.registered_at
    };

    await queue.publishRegistration(jobPayload);

    return res.status(201).json({
      success: true,
      message: 'Registration confirmed. Asynchronous confirmation job queued via RabbitMQ.',
      registration: {
        id: registration.id,
        eventId,
        eventTitle: event.title,
        studentName,
        studentEmail,
        registeredAt: registration.registered_at
      }
    });
  } catch (err) {
    console.error('[API] Error in POST /api/registrations:', err);
    return res.status(500).json({ success: false, error: 'Registration failed' });
  }
});

// -------------------------------------------------------------
// MinIO Image Upload Endpoint
// -------------------------------------------------------------
app.post('/api/upload', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No image file uploaded' });
  }

  try {
    const timestamp = Date.now();
    const sanitizedFilename = req.file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const objectName = `${timestamp}-${sanitizedFilename}`;

    const uploaded = await storage.uploadFile(req.file.buffer, objectName, req.file.mimetype);

    console.log(`[API] Image uploaded successfully to MinIO: ${objectName}`);
    return res.status(201).json({
      success: true,
      filename: objectName,
      url: uploaded.url,
      size: req.file.size,
      mimetype: req.file.mimetype
    });
  } catch (err) {
    console.error('[API] Error in POST /api/upload:', err);
    return res.status(500).json({ success: false, error: 'Failed to upload image to MinIO' });
  }
});

// -------------------------------------------------------------
// Initialization & Startup Sequence
// -------------------------------------------------------------
async function bootstrap() {
  console.log('[STARTUP] Starting CampusHub API Server initialization...');

  // 1. Run migrations and seed
  try {
    await runMigrations();
  } catch (err) {
    console.error('[STARTUP] Migration warning/error:', err.message);
  }

  // 2. Connect Redis in background
  redisClient.connectRedis().catch((err) => {
    console.warn('[STARTUP] Redis deferred connect note:', err.message);
  });

  // 3. Connect RabbitMQ in background
  queue.connectQueue().catch((err) => {
    console.warn('[STARTUP] RabbitMQ deferred connect note:', err.message);
  });

  // 4. Initialize MinIO Storage in background
  storage.initStorage().catch((err) => {
    console.warn('[STARTUP] MinIO deferred init note:', err.message);
  });

  // 5. Start listening
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[STARTUP] CampusHub API Server successfully listening on port ${PORT}`);
  });
}

bootstrap();
