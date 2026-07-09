# Decisions

## Identity

Identity uses server-side sessions with opaque tokens. The client receives a random session token, while only its SHA-256 hash is stored in the sessions table. Passwords are stored using Argon2id. Tenant isolation is enforced by querying users and sessions with brandId, not by userId alone. JWT-only authentication was intentionally avoided because the assignment requires a sessions table and server-side invalidation/expiration is clearer for this MVP.

## Callback ingestion

PSP/GSP adapters only validate tenant context, persist raw callback payloads, and apply idempotency. They do not update balances or ledger state directly. This keeps external-provider ingestion separate from future ledger/accounting logic and makes callbacks safe to replay.

Idempotency is scoped by `brandId`, provider type, provider, and external event id. Duplicate callbacks return a successful deduplicated response instead of failing the request. The database unique constraint remains the final protection against concurrent duplicate deliveries.

## Tenant isolation

Identity and callback data include `brandId`. Profile resolution loads users by `userId + brandId`, not by `userId` alone. Callback idempotency and raw event storage also include `brandId`, so repeated event IDs from different tenants do not collide.

## Observability

The service emits structured logs via pino and includes trace context when available. A global middleware accepts `x-correlation-id` on every request; if missing, a new id is generated, returned in the response header, attached to the active OpenTelemetry span, and included in request logs. Callback responses also echo `correlationId` in the JSON body. OpenTelemetry traces are exported to Jaeger locally.

## Webhook authentication

PSP/GSP adapters intentionally do **not** verify provider signatures in this MVP. The assignment asks for callback stubs that persist raw payloads with tenant isolation and idempotency. Signature verification (HMAC/JWT per provider) is deferred until real provider credentials and rotation policy are introduced.

## Webhook rate limiting

Callback routes use `@SkipThrottle()`. Global IP throttling is appropriate for identity endpoints, but PSP/GSP providers retry aggressively; returning `429` before persistence would defeat idempotent ingest. Abuse protection for public webhooks should come from signature verification and/or a dedicated high-limit bucket once providers are real.

## Session cleanup

Expired and revoked sessions are **not deleted automatically** by the application today. The `resolveSession` method rejects them at validation time, but rows remain in the `sessions` table indefinitely. A scheduled cleanup job (e.g., a NestJS cron task or an external scheduler running `DELETE FROM sessions WHERE expires_at < NOW() OR revoked_at IS NOT NULL`) should be added before the table grows unbounded in production.
