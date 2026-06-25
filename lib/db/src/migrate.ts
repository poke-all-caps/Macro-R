import { pool } from "./index";

/**
 * Creates all tables if they don't already exist.
 * Safe to run on every startup — uses CREATE TABLE IF NOT EXISTS.
 * No drizzle-kit CLI required at runtime.
 */
export async function initSchema(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS license_keys (
        id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        key         TEXT        NOT NULL UNIQUE,
        label       TEXT,
        key_type    TEXT        NOT NULL DEFAULT 'basic',
        max_accounts INTEGER    NOT NULL DEFAULT 3,
        is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
        bound_device_id TEXT,
        expires_at  TIMESTAMP   NOT NULL,
        created_at  TIMESTAMP   NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMP   NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS feature_config (
        key_type               TEXT    PRIMARY KEY,
        max_accounts           INTEGER NOT NULL DEFAULT 3,
        max_searches           INTEGER NOT NULL DEFAULT 30,
        min_delay_seconds      INTEGER NOT NULL DEFAULT 5,
        background_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
        custom_queries_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        daily_set_enabled      BOOLEAN NOT NULL DEFAULT TRUE,
        pc_search_enabled      BOOLEAN NOT NULL DEFAULT TRUE
      );

      CREATE TABLE IF NOT EXISTS device_cookies (
        id               UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
        license_key_id   UUID      NOT NULL REFERENCES license_keys(id) ON DELETE CASCADE,
        device_id        TEXT      NOT NULL,
        account_email    TEXT      NOT NULL,
        account_name     TEXT,
        cookies          TEXT      NOT NULL,
        updated_at       TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_key_email UNIQUE (license_key_id, account_email)
      );
    `);
    console.log("[db] Schema ready.");
  } finally {
    client.release();
  }
}
