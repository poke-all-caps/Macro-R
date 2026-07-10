import { pool } from "./index";

/**
 * Creates all tables if they don't already exist.
 * Safe to run on every startup — uses CREATE TABLE IF NOT EXISTS.
 * No drizzle-kit CLI required at runtime.
 */
export async function initSchema(): Promise<void> {
  console.log("[db] Connecting to database...");

  let client;
  try {
    client = await pool.connect();
    console.log("[db] Connection established.");
  } catch (err) {
    console.error("[db] FATAL: Could not connect to database:", err);
    throw err;
  }

  try {
    // ── Verify connectivity ──────────────────────────────────────────────────
    const { rows } = await client.query("SELECT NOW() AS now");
    console.log(`[db] DB time check OK: ${rows[0]?.now}`);

    // ── Core tables ──────────────────────────────────────────────────────────
    console.log("[db] Creating core tables...");
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
    console.log("[db] Core tables OK.");

    // ── Seed feature_config defaults ────────────────────────────────────────
    await client.query(`
      INSERT INTO feature_config (key_type, max_accounts, max_searches, min_delay_seconds, background_enabled, custom_queries_enabled, daily_set_enabled, pc_search_enabled) VALUES
        ('basic',     2,   20,  5, FALSE, FALSE, TRUE,  FALSE),
        ('premium',   5,   40,  3, TRUE,  TRUE,  TRUE,  TRUE),
        ('unlimited', 999, 999, 3, TRUE,  TRUE,  TRUE,  TRUE),
        ('admin',     999, 999, 1, TRUE,  TRUE,  TRUE,  TRUE)
      ON CONFLICT (key_type) DO NOTHING;
    `);
    console.log("[db] feature_config seeded.");

    // ── license_keys column additions (idempotent) ───────────────────────────
    console.log("[db] Applying license_keys column migrations...");
    await client.query(`
      ALTER TABLE license_keys ADD COLUMN IF NOT EXISTS custom_max_accounts INTEGER;
      ALTER TABLE license_keys ADD COLUMN IF NOT EXISTS custom_min_delay_seconds INTEGER;
      ALTER TABLE license_keys ADD COLUMN IF NOT EXISTS pin TEXT;
    `);
    console.log("[db] license_keys columns OK.");

    // ── deleted_accounts ──────────────────────────────────────────────────────
    console.log("[db] Creating deleted_accounts table...");
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
    console.log("[db] deleted_accounts OK.");

    // ── Phase 1: invite_codes ─────────────────────────────────────────────────
    console.log("[db] Creating invite_codes table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS invite_codes (
        id         UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
        code       TEXT      NOT NULL UNIQUE,
        status     TEXT      NOT NULL DEFAULT 'unused',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    console.log("[db] invite_codes OK.");

    // ── Phase 1: kyc_submissions ──────────────────────────────────────────────
    console.log("[db] Creating kyc_submissions table...");
    await client.query(`
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
    console.log("[db] kyc_submissions OK.");

    // ── Phase 2: kyc_submissions column additions (idempotent) ──────────────
    console.log("[db] Applying kyc_submissions column migrations...");
    await client.query(`
      ALTER TABLE kyc_submissions ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';
      ALTER TABLE kyc_submissions ADD COLUMN IF NOT EXISTS license_key_id UUID;
      ALTER TABLE kyc_submissions ADD COLUMN IF NOT EXISTS review_email_sent_at TIMESTAMP;
      ALTER TABLE kyc_submissions ADD COLUMN IF NOT EXISTS approval_email_sent_at TIMESTAMP;
    `);
    console.log("[db] kyc_submissions columns OK.");

    // ── Phase 3: invite_codes column additions (idempotent) ─────────────────
    console.log("[db] Applying invite_codes column migrations...");
    await client.query(`
      ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS license_key_id UUID;
    `);
    console.log("[db] invite_codes columns OK.");

    // ── Phase 2: feature_config trial tier ───────────────────────────────────
    await client.query(`
      INSERT INTO feature_config (key_type, max_accounts, max_searches, min_delay_seconds, background_enabled, custom_queries_enabled, daily_set_enabled, pc_search_enabled) VALUES
        ('trial', 3, 20, 5, FALSE, FALSE, TRUE, FALSE)
      ON CONFLICT (key_type) DO NOTHING;
    `);
    console.log("[db] trial tier seeded.");

    // ── Final verification: list all tables ───────────────────────────────────
    const { rows: tables } = await client.query(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename;
    `);
    console.log("[db] Tables in public schema:", tables.map((r: { tablename: string }) => r.tablename).join(", "));
    console.log("[db] Schema initialization complete.");

  } catch (err) {
    console.error("[db] Schema initialization FAILED:", err);
    throw err;
  } finally {
    client.release();
  }
}
