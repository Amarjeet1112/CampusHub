const amqp = require('amqplib');
const nodemailer = require('nodemailer');

const mqHost = process.env.RABBITMQ_HOST || 'rabbitmq';
const mqPort = process.env.RABBITMQ_PORT || '5672';
const mqUser = process.env.RABBITMQ_DEFAULT_USER || 'campushub_admin';
const mqPass = process.env.RABBITMQ_DEFAULT_PASS || 'campushub_mq_secret';
const queueName = process.env.RABBITMQ_QUEUE || 'campushub_registrations';

const mailHost = process.env.MAIL_HOST || 'mailhog';
const mailPort = parseInt(process.env.MAIL_PORT || '1025', 10);
const mailFrom = process.env.MAIL_FROM || 'noreply@campushub.edu';

const amqpUrl = `amqp://${encodeURIComponent(mqUser)}:${encodeURIComponent(mqPass)}@${mqHost}:${mqPort}`;

// Configure Nodemailer transporter for MailHog SMTP
const transporter = nodemailer.createTransport({
  host: mailHost,
  port: mailPort,
  secure: false, // MailHog does not require TLS
  ignoreTLS: true,
});

async function startWorker(retries = 20, delay = 2500) {
  console.log('[WORKER] CampusHub Background Email Worker starting...');
  console.log(`[WORKER] Target RabbitMQ: ${mqHost}:${mqPort}, Queue: ${queueName}`);
  console.log(`[WORKER] Target MailHog SMTP: ${mailHost}:${mailPort}`);

  for (let i = 0; i < retries; i++) {
    try {
      const conn = await amqp.connect(amqpUrl);
      const channel = await conn.createChannel();

      await channel.assertQueue(queueName, { durable: true });
      channel.prefetch(1); // Process one message at a time

      console.log(`[WORKER] Successfully connected to RabbitMQ. Waiting for messages in '${queueName}'...`);

      channel.consume(
        queueName,
        async (msg) => {
          if (!msg) return;

          try {
            const payload = JSON.parse(msg.content.toString());
            console.log(`[WORKER] Received registration job #${payload.registrationId} for ${payload.studentEmail}`);

            // Construct rich confirmation email
            const mailOptions = {
              from: `"CampusHub Events" <${mailFrom}>`,
              to: payload.studentEmail,
              subject: `🎉 Registration Confirmed: ${payload.eventTitle}`,
              text: `Hello ${payload.studentName},\n\nYou have successfully registered for ${payload.eventTitle}.\nDate: ${payload.eventDate}\nLocation: ${payload.eventLocation}\nRegistration ID: #${payload.registrationId}\n\nThank you,\nCampusHub Team`,
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
                  <div style="background-color: #2563eb; color: white; padding: 16px; border-radius: 6px; text-align: center;">
                    <h1 style="margin: 0; font-size: 24px;">🎓 CampusHub</h1>
                    <p style="margin: 4px 0 0; font-size: 14px;">Event Registration Confirmation</p>
                  </div>
                  <div style="padding: 20px 0;">
                    <h2>Hello ${payload.studentName}!</h2>
                    <p>Your registration for the following campus event has been confirmed:</p>
                    <div style="background-color: #f8fafc; border-left: 4px solid #2563eb; padding: 12px 16px; margin: 16px 0;">
                      <h3 style="margin: 0 0 8px; color: #1e3a8a;">${payload.eventTitle}</h3>
                      <p style="margin: 4px 0;"><strong>📅 Date:</strong> ${payload.eventDate}</p>
                      <p style="margin: 4px 0;"><strong>📍 Venue:</strong> ${payload.eventLocation}</p>
                      <p style="margin: 4px 0;"><strong>🆔 Registration ID:</strong> #${payload.registrationId}</p>
                    </div>
                    <p>We look forward to seeing you there!</p>
                  </div>
                  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
                  <p style="font-size: 12px; color: #64748b; text-align: center;">CampusHub Automated Dispatch Service • MailHog SMTP</p>
                </div>
              `
            };

            // Send via MailHog
            const info = await transporter.sendMail(mailOptions);
            console.log(`[WORKER] Email sent successfully to ${payload.studentEmail}. MailHog Message ID: ${info.messageId}`);

            // Acknowledge the message
            channel.ack(msg);
          } catch (processErr) {
            console.error('[WORKER] Error processing message:', processErr.message);
            // In case of error, negative acknowledge and requeue
            channel.nack(msg, false, true);
          }
        },
        { noAck: false }
      );

      conn.on('error', (err) => {
        console.error('[WORKER] RabbitMQ connection error:', err.message);
      });

      conn.on('close', () => {
        console.warn('[WORKER] RabbitMQ connection lost. Retrying in 4s...');
        setTimeout(() => startWorker(10, 4000), 4000);
      });

      return;
    } catch (err) {
      console.warn(`[WORKER] Connection attempt ${i + 1}/${retries} failed: ${err.message}. Retrying in ${delay / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  console.error('[WORKER] Failed to start worker after maximum retry attempts.');
  process.exit(1);
}

startWorker();
