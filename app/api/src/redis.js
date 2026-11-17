const { createClient } = require('redis');

const redisHost = process.env.REDIS_HOST || 'redis';
const redisPort = process.env.REDIS_PORT || '6379';
const redisUrl = `redis://${redisHost}:${redisPort}`;

const client = createClient({
  url: redisUrl,
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 10) return new Error('Redis reconnection attempts exhausted');
      return Math.min(retries * 500, 3000);
    }
  }
});

client.on('error', (err) => {
  console.warn('[REDIS] Client warning:', err.message);
});

client.on('connect', () => {
  console.log(`[REDIS] Connected successfully to ${redisHost}:${redisPort}`);
});

let isConnected = false;

async function connectRedis() {
  if (!isConnected) {
    try {
      await client.connect();
      isConnected = true;
    } catch (err) {
      console.warn('[REDIS] Initial connection failed, will retry in background:', err.message);
    }
  }
  return client;
}

module.exports = {
  client,
  connectRedis,
  get: async (key) => {
    try {
      if (!isConnected) return null;
      return await client.get(key);
    } catch (err) {
      console.warn('[REDIS] Error reading key:', key, err.message);
      return null;
    }
  },
  set: async (key, value, options) => {
    try {
      if (!isConnected) return;
      await client.set(key, value, options);
    } catch (err) {
      console.warn('[REDIS] Error setting key:', key, err.message);
    }
  },
  del: async (key) => {
    try {
      if (!isConnected) return;
      await client.del(key);
    } catch (err) {
      console.warn('[REDIS] Error deleting key:', key, err.message);
    }
  },
  isReady: () => isConnected
};
