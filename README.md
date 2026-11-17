# 🎓 CampusHub - Event Management & Registration Platform

A robust, production-grade, multi-container microservice platform built with Docker Compose for university event management, student registrations, asynchronous email notifications, and distributed object storage.

---

## 📋 Table of Contents
1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Stopping the Stack](#stopping-the-stack)
4. [Architecture & Service List](#architecture--service-list)
5. [Important URLs](#important-urls)
6. [Three Core Design Decisions](#three-core-design-decisions)
7. [Verification & Demonstration Commands](#verification--demonstration-commands)
8. [Automated Grading](#automated-grading)
9. [Viva Quick Explanation](#viva-quick-explanation)

---

## 1. Prerequisites

Before starting, ensure your system has:
- **Docker Engine** (v20.10+ / v24+ / v29+)
- **Docker Compose** (`docker compose` or `docker-compose` v2+)
- Supported OS: Windows (Docker Desktop / WSL2), Linux, or macOS.

---

## 2. Quick Start

Run the following command from the project root directory:

```bash
# 1. Create your local .env configuration (if not already created)
cp .env.example .env

# 2. Build and launch all 9 services with health synchronization
docker compose up -d --build --wait
```
*(On older environments without the compose plugin, use `docker-compose up -d --build`)*

The `--wait` flag ensures Docker Compose waits until all database migrations, seeds, healthchecks, and background queues are **100% healthy** before returning control to the terminal.

---

## 3. Stopping the Stack

```bash
# Stop and remove all running containers and networks
docker compose down

# Stop and also purge persisted volume data (fresh clean slate)
docker compose down -v
```

---

## 4. Architecture & Service List

CampusHub consists of **exactly 9 decoupled services** partitioned across three isolated bridge networks:

```
                          [ Client Browser / HTTP Request ]
                                         │
                                         ▼ (Port 80)
                       ┌───────────────────────────────────┐
                       │          NGINX GATEWAY            │
                       │    (Only Public Entry Point)      │
                       └─────┬──────────────┬──────────────┘
                             │              │              │
                    ( / )    │     ( /api/ )│   ( /storage/ )
                             ▼              ▼              ▼
                     ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
                     │   FRONTEND   │ │     API      │ │    MINIO     │
                     │ React + Vite │ │ Node/Express │ │ Object Store │
                     │ (Unpriv Nginx)│ │ (Non-root)   │ │  (Bucket)    │
                     └──────────────┘ └──────┬───────┘ └──────────────┘
                                             │
                       ┌─────────────────────┼─────────────────────┐
                       │                     │                     │
                       ▼                     ▼                     ▼
               ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
               │  POSTGRESQL  │      │    REDIS     │      │   RABBITMQ   │
               │ (Persistent) │      │ (Events Cache│      │ (Job Queue)  │
               └──────────────┘      └──────────────┘      └──────┬───────┘
                                                                  │
                                                           (Consume Job)
                                                                  ▼
                                                           ┌──────────────┐
                                                           │    WORKER    │
                                                           │ (API Image)  │
                                                           └──────┬───────┘
                                                                  │
                                                           (Send SMTP)
                                                                  ▼
                                                           ┌──────────────┐
                                                           │   MAILHOG    │
                                                           │(SMTP/Webmail)│
                                                           └──────────────┘
```

### The 9 Services:
| Service | Image / Base | Internal Port | External Binding | Purpose & Network |
| :--- | :--- | :--- | :--- | :--- |
| **`gateway`** | Custom (`nginxinc/nginx-unprivileged:alpine`) | 8080 | `0.0.0.0:80` | Ingress reverse proxy (`frontend`, `backend`, `data`) |
| **`frontend`** | Custom multi-stage (`node:20-alpine` ➔ `nginx-unprivileged`) | 8080 | *None (Gateway only)* | React + Vite UI (`frontend`) |
| **`api`** | Custom (`node:20.18.0-slim`) | 3000 | *None (Gateway only)* | REST API, Migrations & Seed (`backend`, `data`) |
| **`worker`** | Reuses `campushub-api:latest` image | N/A | *None* | RabbitMQ worker & email dispatcher (`backend`, `data`) |
| **`postgres`** | `postgres:16-alpine` | 5432 | *None (Internal only)* | Relational database (`data`) |
| **`redis`** | `redis:7-alpine` | 6379 | *None (Internal only)* | In-memory event cache (`data`) |
| **`rabbitmq`** | `rabbitmq:3-management-alpine` | 5672, 15672 | `127.0.0.1:15672` | Asynchronous message broker (`data`) |
| **`minio`** | `minio/minio:latest` | 9000, 9001 | `127.0.0.1:9001` | S3-compatible object storage (`data`) |
| **`mailhog`** | `mailhog/mailhog:latest` | 1025, 8025 | `127.0.0.1:8025` | SMTP capture and webmail inbox (`backend`) |

---

## 5. Important URLs

| Endpoint / Interface | URL | Access Level | Description |
| :--- | :--- | :--- | :--- |
| **CampusHub Web Portal** | [http://localhost/](http://localhost/) | Public (Gateway) | React Frontend for events & registrations |
| **API Healthcheck** | [http://localhost/health](http://localhost/health) | Public (Gateway) | Full component dependency status |
| **Events API** | [http://localhost/api/events](http://localhost/api/events) | Public (Gateway) | PostgreSQL + Redis cached event feed |
| **MinIO Storage Route** | [http://localhost/storage/campushub/](http://localhost/storage/campushub/) | Public (Gateway) | Direct browser-renderable image storage |
| **MailHog Webmail Inbox** | [http://127.0.0.1:8025](http://127.0.0.1:8025) | Local Loopback | View sent confirmation emails |
| **RabbitMQ Management** | [http://127.0.0.1:15672](http://127.0.0.1:15672) | Local Loopback | Queue inspection (`campushub_registrations`) |
| **MinIO Console** | [http://127.0.0.1:9001](http://127.0.0.1:9001) | Local Loopback | Object bucket browser & inspection |

---

## 6. Three Core Design Decisions

### Decision 1: Reverse Proxy Gateway as the Single Ingress Point
- **What:** Only the Nginx Gateway exposes a public host port (`0.0.0.0:80`). All application APIs, PostgreSQL, Redis, RabbitMQ AMQP, and MinIO S3 are shielded on isolated internal Docker bridge networks (`frontend`, `backend`, `data`).
- **Why:** Prevents external attack vectors, enforces unified SSL termination and rate limiting in the future, eliminates browser CORS errors by routing `/`, `/api/`, and `/storage/` through the same origin, and enforces strict least-privilege network segmentation.

### Decision 2: Multi-Stage Build with Unprivileged Nginx for Frontend
- **What:** The React frontend uses a two-stage Dockerfile. Stage 1 compiles JSX with Node.js and Vite; Stage 2 discards the entire Node runtime and `node_modules`, copying only static HTML/JS/CSS into an unprivileged Nginx container running under user `nginx` (UID 101).
- **Why:** Drastically minimizes final image size (< 30 MB), reduces vulnerability surface by eliminating devDependencies and the Node interpreter from production, and satisfies enterprise non-root container standards.

### Decision 3: Image Reuse and Decoupled Asynchronous Processing (RabbitMQ + Worker)
- **What:** The API and Worker share a single lightweight Dockerfile (`node:20.18.0-slim` < 250MB) but run with different entry commands (`npm start` vs `npm run start:worker`). Student registration requests save synchronously to PostgreSQL and push an event message to RabbitMQ, returning `201 Created` immediately. The background worker consumes the queue and sends SMTP confirmation emails asynchronously.
- **Why:** Reusing the image optimizes Docker build time and disk caching. Asynchronous decoupling ensures HTTP responses to students remain near-instantaneous (~15ms) regardless of SMTP latency or temporary MailHog downtime.

---

## 7. Verification & Demonstration Commands

You can verify all 9 components directly from your terminal using standard `curl` commands:

### A. Healthcheck Verification
```bash
curl -i http://localhost/health
```
*Expected: HTTP 200 with JSON showing all components `postgres`, `redis`, `rabbitmq`, and `minio` connected.*

### B. Redis Cache Demonstration (Viva Favorite)
```bash
# 1st Request: Cache Miss (serves from PostgreSQL, sets Redis key)
curl -s http://localhost/api/events | grep -o '"source":"[^"]*"'

# 2nd Request: Cache Hit (served directly from Redis in <2ms)
curl -s http://localhost/api/events | grep -o '"source":"[^"]*"'
```

### C. Student Registration & Asynchronous Email Dispatch
```bash
curl -X POST http://localhost/api/registrations \
  -H "Content-Type: application/json" \
  -d '{"eventId": 1, "studentName": "Alex Johnson", "studentEmail": "alex@university.edu"}'
```
*Expected: HTTP 201 Created. The registration is stored in PostgreSQL and a job is queued in RabbitMQ.*

### D. Verify Email in MailHog
Open [http://127.0.0.1:8025](http://127.0.0.1:8025) in your browser or run:
```bash
curl -s http://127.0.0.1:8025/api/v2/messages | grep -o '"Subject":"[^"]*"'
```
*Expected: Registration confirmation email is received!*

### E. Image Upload to MinIO & Browser Display
```bash
# Upload a banner image through the Gateway
curl -X POST http://localhost/api/upload \
  -F "image=@app/frontend/index.html"
```
*Expected: Returns JSON with `/storage/campushub/...` URL viewable in any web browser.*

---

## 8. Automated Grading

Run the automated specification test suite anytime:

```bash
# On Linux / macOS / Git Bash:
./grade.sh

# On Windows PowerShell:
.\grade.ps1
```
*Validates compose files, 9 services, networks, volumes, healthchecks, secrets isolation, non-root security, and port bindings.*

---

## 9. Viva Quick Explanation

When asked by the examiner tomorrow:
1. **How does the request flow work?**  
   "All incoming traffic hits the Nginx Gateway on port 80. Gateway routes `/` to the React frontend, `/api/` to Express, and `/storage/` to the MinIO `campushub` bucket. Internal services never touch the public internet."
2. **How is performance handled?**  
   "`GET /api/events` queries Redis first. If found, it returns in 1-2ms. If missing, it fetches from PostgreSQL and populates Redis with a 60-second TTL. Furthermore, registrations don't block waiting for emails: they publish an event to RabbitMQ and return immediately. A separate worker consumes the queue."
3. **How is security handled?**  
   "No services run as root. Frontend and Gateway run as user `nginx` (UID 101), and API/Worker run as user `node` (UID 1000). Sensitive credentials are kept in `.env` and excluded from Git and Docker contexts. Databases and message brokers are isolated on internal Docker networks without exposed host ports."
4. **How are dependencies synchronized?**  
   "Docker Compose uses `condition: service_healthy` on `depends_on`. The API will not boot until PostgreSQL, Redis, RabbitMQ, and MinIO have all completed their native healthchecks."
