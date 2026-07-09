# API

Base URL for local development:

```text
http://localhost:3000
```

Swagger UI is available at:

```text
http://localhost:3000/docs
```

Every response includes an `x-correlation-id` header. Send your own value or let the service generate one. Callback JSON bodies also echo `correlationId`. Raw callback rows store sanitized request headers (secrets like `authorization` are stripped).

## Identity

### Register

```http
POST /auth/register
Content-Type: application/json
```

Request:

```json
{
  "brandId": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "password": "StrongPassword123!"
}
```

Response `201`:

```json
{
  "id": "4df3e393-1bb7-4cf2-ae88-87f91bd4d7db",
  "brandId": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com"
}
```

Duplicate user in the same brand returns `409 Conflict`.

### Login

```http
POST /auth/login
Content-Type: application/json
```

Request:

```json
{
  "brandId": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "password": "StrongPassword123!"
}
```

Response `200`:

```json
{
  "accessToken": "opaque-session-token",
  "tokenType": "Bearer",
  "expiresAt": "2026-07-10T12:00:00.000Z"
}
```

Invalid credentials return `401 Unauthorized`.

### Current Profile

```http
GET /profile/me
Authorization: Bearer <accessToken>
```

Response `200`:

```json
{
  "id": "4df3e393-1bb7-4cf2-ae88-87f91bd4d7db",
  "brandId": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com"
}
```

Missing, invalid, revoked, or expired sessions return `401 Unauthorized`.

## PSP/GSP Callback Stubs

Callback endpoints persist raw payloads for later processing and do not update balances directly.

Required headers:

```http
x-brand-id: 550e8400-e29b-41d4-a716-446655440000
```

Required headers:

```http
x-brand-id: 550e8400-e29b-41d4-a716-446655440000
```

Optional headers:

```http
x-correlation-id: request-correlation-id
```

If `x-correlation-id` is missing, the service generates one, returns it as a response header on every route, and echoes it in the webhook JSON body. Values longer than 128 characters are truncated to fit storage.

`:provider` must be ≤ 60 characters (`[a-zA-Z0-9._-]`) so `PSP|GSP:{provider}` fits the idempotency scope column. `eventId` must be ≤ 128 characters.

Accepted callbacks persist the raw JSON payload plus sanitized request headers for later processing.

### PSP Callback

```http
POST /webhooks/psp/:provider
Content-Type: application/json
x-brand-id: 550e8400-e29b-41d4-a716-446655440000
x-correlation-id: psp-test-1
```

Example:

```bash
curl -X POST http://localhost:3000/webhooks/psp/stripe \
  -H 'Content-Type: application/json' \
  -H 'x-brand-id: 550e8400-e29b-41d4-a716-446655440000' \
  -H 'x-correlation-id: psp-test-1' \
  -d '{"eventId":"evt_001","type":"payment.succeeded","amount":1000}'
```

Response `201` for first delivery:

```json
{
  "status": "accepted",
  "duplicate": false,
  "rawEventId": "1f801292-6c77-47fc-8fe2-3fac7248fd32",
  "correlationId": "psp-test-1"
}
```

Repeated callback with the same `brandId`, provider, and `eventId` returns a deduplicated response:

```json
{
  "status": "duplicate",
  "duplicate": true,
  "rawEventId": "1f801292-6c77-47fc-8fe2-3fac7248fd32",
  "correlationId": "generated-or-request-correlation-id"
}
```

### GSP Callback

```http
POST /webhooks/gsp/:provider
Content-Type: application/json
x-brand-id: 550e8400-e29b-41d4-a716-446655440000
```

Example:

```bash
curl -X POST http://localhost:3000/webhooks/gsp/game-provider \
  -H 'Content-Type: application/json' \
  -H 'x-brand-id: 550e8400-e29b-41d4-a716-446655440000' \
  -d '{"eventId":"gsp_evt_001","type":"round.finished","roundId":"round_123"}'
```

Response shape is the same as PSP callbacks.

## Error Shape

Validation and auth errors use NestJS structured responses, for example:

```json
{
  "message": ["brandId must be a UUID"],
  "error": "Bad Request",
  "statusCode": 400
}
```
