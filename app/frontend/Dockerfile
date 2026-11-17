# Stage 1: Build the React + Vite static bundle
FROM node:20-alpine AS builder
WORKDIR /app

# Copy dependency definitions and install cleanly
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi

# Copy source and build static distribution
COPY . .
RUN npm run build

# Stage 2: Serve strictly using unprivileged Nginx (no Node.js or node_modules)
FROM nginxinc/nginx-unprivileged:alpine

# Copy built distribution from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom unprivileged Nginx server configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Explicitly ensure running as non-root user
USER nginx

EXPOSE 8080

# Built-in lightweight healthcheck
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
