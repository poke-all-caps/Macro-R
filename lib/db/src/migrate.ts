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

      INSERT INTO feature_config (key_type, max_accounts, max_searches, min_delay_seconds, background_enabled, custom_queries_enabled, daily_set_enabled, pc_search_enabled) VALUES
        ('basic',     2,   20,  5, FALSE, FALSE, TRUE,  FALSE),
        ('premium',   5,   40,  3, TRUE,  TRUE,  TRUE,  TRUE),
        ('unlimited', 999, 999, 3, TRUE,  TRUE,  TRUE,  TRUE),
        ('admin',     999, 999, 1, TRUE,  TRUE,  TRUE,  TRUE)
      ON CONFLICT (key_type) DO NOTHING;
    `);

    await client.query(`
      ALTER TABLE license_keys ADD COLUMN IF NOT EXISTS custom_max_accounts INTEGER;
      ALTER TABLE license_keys ADD COLUMN IF NOT EXISTS custom_min_delay_seconds INTEGER;
      ALTER TABLE license_keys ADD COLUMN IF NOT EXISTS pin TEXT;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS deleted_accounts (
        id                  UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
        license_key_id      UUID      NOT NULL,
        license_key         TEXT      NOT NULL,
        account_email       TEXT      NOT NULL,
        account_name        TEXT,
        cookies             TEXT,
        device_id           TEXT,
        deleted_at          TIMESTAMP NOT NULL DEFAULT NOW(),
        original_created_at TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS invite_codes (
        id         UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
        code       TEXT      NOT NULL UNIQUE,
        status     TEXT      NOT NULL DEFAULT 'unused',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS kyc_submissions (
        id               UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
        invite_code      TEXT      NOT NULL UNIQUE,
        full_name        TEXT      NOT NULL,
        father_name      TEXT      NOT NULL,
        mother_name      TEXT      NOT NULL,
        grandfather_name TEXT      NOT NULL,
        id_front         TEXT      NOT NULL,
        id_back          TEXT      NOT NULL,
        kyc_status       TEXT      NOT NULL DEFAULT 'pending',
        admin_note       TEXT,
        created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    console.log("[db] Schema ready.");
  } finally {
    client.release();
  }
}
