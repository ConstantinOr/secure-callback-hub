# Secure Callback Hub

Small NestJS + TypeScript backend assignment demonstrating identity basics, safe PSP/GSP callback ingestion, tenant isolation, and readiness for future ledger integration.

## Features

- Identity module with `POST /auth/register`, `POST /auth/login`, `GET /profile/me`
- Server-side sessions with opaque random tokens
- Only SHA-256 session token hashes are stored in PostgreSQL
- Passwords are hashed with Argon2id
- PSP/GSP webhook stubs persist raw payloads to `raw_events`
- Idempotency for repeated callbacks via `idempotency_keys`
- Tenant isolation by `brandId`
- Structured errors via NestJS exceptions and DTO validation
- Global `x-correlation-id` middleware (request header + response header + logs)
- OpenTelemetry tracing + Jaeger
- Swagger UI at `/docs`

## Requirements

- Node.js 20+
- pnpm
- Docker and Docker Compose

## Quick Start

```bash
pnpm install
cp .env.example .env
pnpm dev
```

`pnpm dev` starts Docker infrastructure, runs migrations, and starts NestJS in watch mode.

Application:

```text
http://localhost:3000
```

Swagger UI:

```text
http://localhost:3000/docs
```

Jaeger UI:

```text
http://localhost:16686
```

## Manual Local Run

Start Postgres and Jaeger:

```bash
docker compose up -d
```

Run migrations:

```bash
pnpm migration:run
```

Start the app:

```bash
pnpm start:dev
```

## Docker Compose App Mode

To run the app itself in Docker as well:

```bash
docker compose --profile app up --build
```

The app container runs migrations before starting `node dist/main`.

## Tests

Unit tests:

```bash
pnpm test
```

E2E/integration tests require Postgres to be running and migrated:

```bash
pnpm dev:setup
pnpm test:e2e
```

Full validation:

```bash
pnpm build
pnpm lint
pnpm test
pnpm test:e2e
```

## Useful Commands

```bash
pnpm dev:setup        # docker compose up -d + migrations
pnpm dev              # setup + start:dev
pnpm migration:run
pnpm migration:revert
pnpm lint
pnpm test
pnpm test:e2e
```

## Environment

See `.env.example` for all local defaults. Important variables:

```env
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=callback_hub
POSTGRES_USER=callback_hub_user
POSTGRES_PASSWORD=callback_hub_password
SESSION_TTL_HOURS=24
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://localhost:4318/v1/traces
```

## API Examples

See [`API.md`](./API.md) for request/response examples.

## Design Decisions

See [`DECISIONS.md`](./DECISIONS.md).
