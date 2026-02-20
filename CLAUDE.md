# ISMS Manager - Project Reference

## Stack Overview

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18 + TypeScript + Vite 5 |
| **UI Components** | Radix UI + Tailwind CSS + shadcn/ui |
| **State** | Zustand (auth store), TanStack React Query (server state) |
| **Backend** | Express 4 + TypeScript (tsx watch for dev) |
| **ORM** | Prisma 5 with PostgreSQL |
| **Database** | PostgreSQL 16 (pgvector extension) |
| **Cache/Sessions** | Redis 7 (Alpine) |
| **Object Storage** | MinIO (S3-compatible) |
| **Auth** | Passport.js (Local + Google OAuth + JWT) |
| **Containerization** | Docker Compose |

## Project Structure

```
isms-manager/
  frontend/          # React SPA (Vite + TypeScript)
    src/
      pages/         # Page components (SoAPage, DashboardPage, etc.)
      components/    # Shared UI components (shadcn/ui based)
      stores/        # Zustand stores (auth.store.ts)
      lib/           # API client (api.ts), utilities (utils.ts)
  backend/           # Express API (TypeScript)
    src/
      routes/        # Express route handlers
      middleware/     # Auth, error handling, security
      services/      # Business logic (audit, storage, etc.)
      config/        # Passport config
      utils/         # Logger, helpers
    prisma/
      schema.prisma  # Database schema
      seed.ts        # Seed data (controls, frameworks)
  nginx/             # Nginx config (reverse proxy)
  config/            # Service account keys
  docker-compose.yml # Container orchestration
```

## Development - Docker Compose

All services run via Docker Compose. Both frontend and backend have hot reload enabled.

```bash
# Start all services
docker compose up -d

# Rebuild a specific service
docker compose up -d --build backend
docker compose up -d --build frontend

# View logs
docker logs -f isms-frontend
docker logs -f isms-backend

# Restart a service
docker compose restart backend
```

### Ports

| Service | Internal Port | External Port |
|---------|--------------|---------------|
| Frontend (Vite) | 5173 | **8888** |
| Backend (Express) | 4000 | (internal only, proxied via frontend /api) |
| PostgreSQL | 5432 | (internal only) |
| Redis | 6379 | (internal only) |
| MinIO | 9000/9001 | (internal only) |

### Hot Reload

- **Frontend**: Vite dev server with `usePolling: true` + `CHOKIDAR_USEPOLLING=true` for Docker bind mounts. HMR WebSocket on port 8888.
- **Backend**: `tsx watch src/index.ts` with `CHOKIDAR_USEPOLLING=true`. Auto-restarts on any file change in `backend/src/`.

## Database Access

### Connect via docker exec (psql)

```bash
docker exec -it isms-postgres psql -U isms_user -d isms_db
```

### Default Credentials (from .env / docker-compose defaults)

| Service | Key | Value |
|---------|-----|-------|
| PostgreSQL | User | `isms_user` |
| PostgreSQL | Password | `isms_secure_password` |
| PostgreSQL | Database | `isms_db` |
| PostgreSQL | Connection URL | `postgresql://isms_user:isms_secure_password@postgres:5432/isms_db` |
| Redis | Password | `redis_secure_password` |
| MinIO | Access Key | `minio_admin` |
| MinIO | Secret Key | `minio_secure_password` |

### Redis CLI

```bash
docker exec -it isms-redis redis-cli -a redis_secure_password
```

### Prisma Commands (run inside backend container)

```bash
docker exec -it isms-backend npx prisma studio      # Visual DB browser
docker exec -it isms-backend npx prisma db push      # Push schema changes
docker exec -it isms-backend npx prisma migrate dev  # Create migration
docker exec -it isms-backend npx prisma generate     # Regenerate client
docker exec -it isms-backend npx tsx prisma/seed.ts  # Run seed
```

## Key Frameworks & Controls

The system manages compliance across 3 frameworks:

| Framework | Slug | Controls |
|-----------|------|----------|
| ISO/IEC 27001:2022 | `iso27001` | 93 controls (A.5-A.8 categories) |
| ISO/IEC 42001:2023 | `iso42001` | 33 controls (AI governance) |
| DPDPA 2023 | `dpdpa` | 26 controls (Data protection) |

### ISO 27001 Annex A Categories

- **A.5** - Organizational Controls (37)
- **A.6** - People Controls (8)
- **A.7** - Physical Controls (14)
- **A.8** - Technological Controls (34)

## API Routes

All backend routes are prefixed with `/api`:

```
/api/auth          - Authentication (login, register, Google OAuth)
/api/users         - User management
/api/organizations - Organization management
/api/assets        - Asset register
/api/risks         - Risk assessment
/api/controls      - Control library
/api/soa           - Statement of Applicability
/api/audits        - Internal audits
/api/incidents     - Incident management
/api/files         - File uploads (MinIO)
/api/drive         - Google Drive integration
/api/rag           - RAG/AI features (OpenAI embeddings)
/api/reports       - Report generation
/api/dashboard     - Dashboard stats
/api/frameworks    - Compliance frameworks
/api/checklist     - Control checklists
```

## SoA Approval Workflow

DRAFT -> PENDING_FIRST_APPROVAL -> PENDING_SECOND_APPROVAL -> APPROVED (or REJECTED at any stage)

- 1st Level Approval: LOCAL_ADMIN or ADMIN
- 2nd Level Approval: ADMIN only
- Version bumps: minor on edit, major on full approval
