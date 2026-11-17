const Minio = require('minio');

const endPoint = process.env.MINIO_ENDPOINT || 'minio';
const port = parseInt(process.env.MINIO_PORT || '9000', 10);
const accessKey = process.env.MINIO_ROOT_USER || 'campushub_minio';
const secretKey = process.env.MINIO_ROOT_PASSWORD || 'campushub_storage_secret';
const bucketName = process.env.MINIO_BUCKET || 'campushub';

const minioClient = new Minio.Client({
  endPoint,
  port,
  useSSL: false,
  accessKey,
  secretKey
});

let storageReady = false;

async function initStorage(retries = 10, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      const exists = await minioClient.bucketExists(bucketName);
      if (!exists) {
        await minioClient.makeBucket(bucketName);
        console.log(`[MINIO] Created bucket '${bucketName}'`);
      } else {
        console.log(`[MINIO] Bucket '${bucketName}' already exists.`);
      }

      // Set anonymous read-only policy so Nginx Gateway can proxy GET requests
      const publicReadPolicy = {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { AWS: ['*'] },
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${bucketName}/*`]
          }
        ]
      };

      try {
        await minioClient.setBucketPolicy(bucketName, JSON.stringify(publicReadPolicy));
        console.log(`[MINIO] Anonymous read policy enabled for '${bucketName}'`);
      } catch (policyErr) {
        console.warn('[MINIO] Policy set note:', policyErr.message);
      }

      // Seed a default SVG placeholder banner if not exists
      try {
        await minioClient.statObject(bucketName, 'welcome-banner.png');
      } catch {
        const svgBanner = Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" viewBox="0 0 800 400">
            <defs>
              <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#1e3a8a;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#3b82f6;stop-opacity:1" />
              </linearGradient>
            </defs>
            <rect width="800" height="400" fill="url(#grad)" />
            <text x="50%" y="45%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="44" font-weight="bold" fill="#ffffff">🎓 CampusHub 2026</text>
            <text x="50%" y="60%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="22" fill="#bfdbfe">University Events &amp; Workshops</text>
          </svg>`,
          'utf-8'
        );
        await minioClient.putObject(bucketName, 'welcome-banner.png', svgBanner, svgBanner.length, {
          'Content-Type': 'image/svg+xml'
        });
        console.log('[MINIO] Seeded default banner object: welcome-banner.png');
      }

      storageReady = true;
      return minioClient;
    } catch (err) {
      console.warn(`[MINIO] Storage init attempt ${i + 1}/${retries} failed: ${err.message}. Retrying in ${delay / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  console.error('[MINIO] Could not initialize MinIO storage.');
  return null;
}

async function uploadFile(buffer, filename, contentType) {
  if (!storageReady) {
    await initStorage(3, 1000);
  }
  await minioClient.putObject(bucketName, filename, buffer, buffer.length, {
    'Content-Type': contentType || 'application/octet-stream'
  });
  return {
    bucket: bucketName,
    filename,
    url: `/storage/campushub/${filename}`
  };
}

module.exports = {
  minioClient,
  initStorage,
  uploadFile,
  isReady: () => storageReady,
  bucketName
};
