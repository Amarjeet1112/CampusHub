const amqp = require('amqplib');

const mqHost = process.env.RABBITMQ_HOST || 'rabbitmq';
const mqPort = process.env.RABBITMQ_PORT || '5672';
const mqUser = process.env.RABBITMQ_DEFAULT_USER || 'campushub_admin';
const mqPass = process.env.RABBITMQ_DEFAULT_PASS || 'campushub_mq_secret';
const queueName = process.env.RABBITMQ_QUEUE || 'campushub_registrations';

const amqpUrl = `amqp://${encodeURIComponent(mqUser)}:${encodeURIComponent(mqPass)}@${mqHost}:${mqPort}`;

let connection = null;
let channel = null;

async function connectQueue(retries = 10, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      connection = await amqp.connect(amqpUrl);
      channel = await connection.createChannel();
      await channel.assertQueue(queueName, { durable: true });
      console.log(`[RABBITMQ] Connected to RabbitMQ at ${mqHost}:${mqPort}, queue '${queueName}' asserted.`);
      
      connection.on('error', (err) => {
        console.error('[RABBITMQ] Connection error:', err.message);
      });
      connection.on('close', () => {
        console.warn('[RABBITMQ] Connection closed. Reconnecting in 3s...');
        setTimeout(() => connectQueue(5, 3000), 3000);
      });
      
      return { connection, channel, queueName };
    } catch (err) {
      console.warn(`[RABBITMQ] Connection attempt ${i + 1}/${retries} failed: ${err.message}. Retrying in ${delay / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  console.error('[RABBITMQ] Failed to connect after multiple retries.');
  return null;
}

async function publishRegistration(payload) {
  try {
    if (!channel) {
      await connectQueue(3, 1000);
    }
    if (!channel) {
      throw new Error('RabbitMQ channel unavailable');
    }
    const messageBuffer = Buffer.from(JSON.stringify(payload));
    const sent = channel.sendToQueue(queueName, messageBuffer, { persistent: true });
    console.log(`[RABBITMQ] Published registration job #${payload.registrationId} for ${payload.studentEmail}`);
    return sent;
  } catch (err) {
    console.error('[RABBITMQ] Failed to publish message:', err.message);
    throw err;
  }
}

module.exports = {
  connectQueue,
  publishRegistration,
  getChannel: () => channel,
  isReady: () => !!channel,
  queueName
};
