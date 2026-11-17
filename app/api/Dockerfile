# Lightweight Node Alpine image to keep image footprint well below 250MB threshold
FROM node:20.18.0-alpine

WORKDIR /app

# Optimize layer caching: copy dependency manifests first
COPY package*.json ./

# Install production dependencies only and purge npm cache to keep image small
RUN if [ -f package-lock.json ]; then npm ci --only=production --no-audit --no-fund; else npm install --omit=dev --no-audit --no-fund; fi && npm cache clean --force

# Copy application source code
COPY . .

# Run as non-root user (node user UID 1000 provided by official Node image)
USER node

EXPOSE 3000

# Built-in Node 20 fetch healthcheck (no external curl/wget binary needed)
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 3000) + '/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Default command starts the API service
CMD ["npm", "start"]
