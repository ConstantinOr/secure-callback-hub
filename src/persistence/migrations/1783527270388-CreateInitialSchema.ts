import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInitialSchema1783527270388 implements MigrationInterface {
  name = 'CreateInitialSchema1783527270388';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";
    `);

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "brand_id" varchar(64) NOT NULL,
        "email" varchar(255) NOT NULL,
        "password_hash" varchar(255) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),

        CONSTRAINT "pk_users" PRIMARY KEY ("id"),
        CONSTRAINT "uq_users_brand_email" UNIQUE ("brand_id", "email")
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "sessions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "brand_id" varchar(64) NOT NULL,
        "token_hash" varchar(255) NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "revoked_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),

        CONSTRAINT "pk_sessions" PRIMARY KEY ("id"),
        CONSTRAINT "fk_sessions_user"
          FOREIGN KEY ("user_id")
          REFERENCES "users" ("id")
          ON DELETE CASCADE
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "raw_events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "brand_id" varchar(64) NOT NULL,

        "provider_type" varchar(16) NOT NULL,
        "provider" varchar(64) NOT NULL,

        "external_event_id" varchar(128) NULL,
        "idempotency_key" varchar(255) NOT NULL,
        "correlation_id" varchar(128) NULL,

        "payload" jsonb NOT NULL,
        "headers" jsonb NULL,

        "status" varchar(32) NOT NULL DEFAULT 'received',
        "error_message" text NULL,

        "created_at" timestamptz NOT NULL DEFAULT now(),
        "processed_at" timestamptz NULL,

        CONSTRAINT "pk_raw_events" PRIMARY KEY ("id"),
        CONSTRAINT "chk_raw_events_provider_type"
          CHECK ("provider_type" IN ('PSP', 'GSP')),
        CONSTRAINT "chk_raw_events_status"
          CHECK ("status" IN ('received', 'duplicate', 'processing', 'processed', 'failed'))
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "idempotency_keys" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "brand_id" varchar(64) NOT NULL,
        "scope" varchar(64) NOT NULL,
        "idempotency_key" varchar(255) NOT NULL,
        "raw_event_id" uuid NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),

        CONSTRAINT "pk_idempotency_keys" PRIMARY KEY ("id"),
        CONSTRAINT "uq_idempotency_keys_brand_scope_key"
          UNIQUE ("brand_id", "scope", "idempotency_key"),
        CONSTRAINT "fk_idempotency_keys_raw_event"
          FOREIGN KEY ("raw_event_id")
          REFERENCES "raw_events" ("id")
          ON DELETE SET NULL
      );
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_users_brand_id"
      ON "users" ("brand_id");
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_sessions_user_id"
      ON "sessions" ("user_id");
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_sessions_brand_id"
      ON "sessions" ("brand_id");
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_sessions_token_hash"
      ON "sessions" ("token_hash");
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_sessions_user_id_brand"
      ON "sessions" ("user_id", "brand_id");
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_sessions_expires_revoked"
      ON "sessions" ("expires_at", "revoked_at");
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_raw_events_brand_id"
      ON "raw_events" ("brand_id");
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_raw_events_provider"
      ON "raw_events" ("provider_type", "provider");
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_raw_events_external_event_id"
      ON "raw_events" ("external_event_id");
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_raw_events_idempotency_key"
      ON "raw_events" ("brand_id", "idempotency_key");
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_raw_events_status_created_at"
      ON "raw_events" ("status", "created_at");
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_idempotency_keys_brand_scope"
      ON "idempotency_keys" ("brand_id", "scope");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_idempotency_keys_brand_scope";
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_raw_events_idempotency_key";
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_raw_events_external_event_id";
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_raw_events_provider";
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_raw_events_brand_id";
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "uq_sessions_token_hash";
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_sessions_brand_id";
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_sessions_user_id";
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_users_brand_id";
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS "idempotency_keys";
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS "raw_events";
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS "sessions";
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS "users";
    `);
  }
}
