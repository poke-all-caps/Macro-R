---
name: Zero Trust backend systems
description: Three server-side enforcement systems for the MS Rewards Automation app that prevent tampered APK abuse.
---

## System 1 — 2-step PIN authentication (`/validate-key`)
- First call (no pin) → server returns `{ valid: false, requiresPin: true, pinSet: bool }` — client shows PIN screen.
- Second call (with pin) → server validates or creates PIN, returns `{ valid: true, accounts: [...] }` with full account hydration.
- PIN stored plain-text in `license_keys.pin` column (admin requirement to read directly). No hashing.
- `LicenseContext.activateKey` → triggers PIN step. `LicenseContext.submitPin(pin)` → completes auth + returns `serverAccounts`.
- `LicenseGate` calls `hydrateFromServer(serverAccounts)` after `submitPin` succeeds.
- Boot path: stored PIN read from `@ms_rewards_pin`, sent on revalidation. Server accounts written to `@ms_rewards_server_hydration` AsyncStorage key; `AccountsContext.loadFromStorage` merges and removes it.

## System 2 — Server-side account slot validation (`/add-account`)
- Server physically counts rows in `device_cookies` for the key → rejects with 403 if at limit.
- Client count is never trusted. Effective limit = `key.customMaxAccounts ?? tier.maxAccounts`.
- Called from `login-webview.tsx` handleSave (before local addAccount) and `add-account.tsx` validateAndSaveManual.
- 403 shows alert and returns without saving locally. Network errors fail-open (fall through to local check).

## System 3 — Server-side delay validation (`/run-task`)
- Client sends `{ key, deviceId, requestedDelay }` before any automation starts.
- Server validates `requestedDelay >= minDelay` (custom override takes priority over tier default). 400 if too short.
- Called at the start of `search-runner.tsx` run() — blocks the run if 400. Network errors fail-open (proceed).

## Priority rule (everywhere)
`key.customMaxAccounts ?? tier.maxAccounts` and `key.customMinDelaySeconds ?? tier.minDelaySeconds`.
Custom per-key admin overrides ALWAYS win over tier defaults.

## DB schema additions
- `license_keys.pin TEXT` (nullable) — added via `ALTER TABLE ADD COLUMN IF NOT EXISTS`.
- `license_keys.customMaxAccounts INTEGER` (nullable).
- `license_keys.customMinDelaySeconds INTEGER` (nullable).

**Why:** Prevent tampered APKs from bypassing limits. Server is the single source of truth.
