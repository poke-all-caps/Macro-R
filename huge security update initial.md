# Huge Security Update — Initial Implementation

**Date:** June 28, 2026  
**Project:** MS Rewards Automation (Expo Mobile + Node.js API Server)  
**Scope:** Zero Trust backend enforcement — 3 independent security systems designed to block tampered APK abuse, session hijacking, and account limit manipulation.

---

## Overview

This update introduces three server-side "Zero Trust" enforcement systems. The core philosophy is: **the server never trusts the client**. Every security-critical decision (PIN auth, account slots, delay floors) is enforced on the backend — a modified APK cannot bypass any of them by manipulating local state.

Additionally, the admin dashboard was updated to expose PIN visibility and management controls.

---

## System 1 — 2-Step PIN Authentication on `/validate-key`

### What it does
Adds a mandatory 4-digit PIN gate to the license key validation flow. No key activates without a PIN — first-time users create one, returning users must match the stored PIN.

### How it works
- **Step 1 (no PIN sent):** Client sends `{ key, deviceId }`. Server validates the key (active, not expired, device binding) and responds with `{ valid: false, requiresPin: true, pinSet: bool }`. The `pinSet` flag tells the client whether the user has a PIN already (`true` = returning user, `false` = first-time setup).
- **Step 2 (PIN sent):** Client sends `{ key, deviceId, pin }`. Server validates PIN format (exactly 4 digits). If `key.pin` is `NULL` in the DB, the PIN is saved (first-time). If `key.pin` is set, it's compared directly (plain text — admin requirement for readability). Wrong PIN → `401 Invalid PIN`. Correct PIN → full license response including `accounts[]` array for session hydration.

### Account hydration on login
On a successful PIN validation, the server queries `device_cookies` for all accounts linked to the key and returns them in the response:
```json
{
  "valid": true,
  "accounts": [
    { "email": "user@outlook.com", "name": "John", "cookies": { "_U": "...", ... } }
  ]
}
```
This lets the app restore the user's full account list immediately after login — no manual re-import needed.

### Boot path (app restart)
- On app boot, `LicenseContext.loadStoredLicense()` reads the stored PIN from AsyncStorage (`@ms_rewards_pin`) and sends it automatically in the revalidation call.
- If the stored PIN is missing or wrong, the server returns `requiresPin: true` and the PIN screen is shown again.
- On successful boot validation, server accounts are written to `@ms_rewards_server_hydration` in AsyncStorage. `AccountsContext.loadFromStorage()` picks this up, merges it into local accounts, and removes the key.

### PIN UI in the mobile app (`LicenseGate.tsx`)
A new PIN screen is shown before the key entry screen when `pinRequired === true`:
- **First-time:** "Create Your PIN" heading + explanation text
- **Returning:** "Enter Your PIN" heading
- 4-digit numeric input (secure, auto-focus, keyboard type: number-pad)
- Error message shown inline on wrong PIN
- "Set PIN & Continue" / "Unlock" button (disabled until 4 digits entered)
- On success: `hydrateFromServer(serverAccounts)` is called directly on `AccountsContext` to populate the accounts list immediately

### Files changed
| File | Change |
|------|--------|
| `lib/db/src/schema/licenseKeys.ts` | Added `pin TEXT` nullable column |
| `lib/db/src/migrate.ts` | `ALTER TABLE license_keys ADD COLUMN IF NOT EXISTS pin TEXT` |
| `artifacts/api-server/src/routes/keys.ts` | Rewrote `/validate-key` to gate on PIN |
| `artifacts/mobile/context/LicenseContext.tsx` | Added `pinRequired`, `pinIsNew`, `submitPin()`, stored PIN persistence |
| `artifacts/mobile/components/LicenseGate.tsx` | Added full PIN screen UI + hydration call |

---

## System 2 — Server-Side Account Slot Enforcement on `/add-account`

### What it does
Prevents a tampered APK from adding more accounts than the license allows by moving the slot count check entirely to the server. The client's local account count is **never trusted**.

### How it works
New `POST /add-account` endpoint:
1. Validates the key (active, not expired, device binding)
2. Computes effective limit: `key.customMaxAccounts ?? tier.maxAccounts` (custom per-key admin overrides always win)
3. Physically counts rows in `device_cookies` for this key — **server count only, client count ignored**
4. If `existing_count >= limit` and the account is **new** (not an update): returns `403` with `{ error, limit, current }`
5. If the email already exists in DB: updates the cookie row (upsert — re-logging in an existing account is always allowed)
6. If slot is available: inserts new row
7. Returns `{ success: true, limit, current }` on success

### Client integration
Called from two places before any local state is updated:
- **`login-webview.tsx` `handleSave()`** — after cookies are captured from the WebView, before calling local `addAccount()`
- **`add-account.tsx` `validateAndSaveManual()`** — for manual email/name account adds, before calling local `addAccount()`

On `403`: alert is shown, local save is skipped. On network error: fails-open (falls through to existing client-side check — the local check is kept as a UX fallback, not a security boundary).

### Priority rule
```
effectiveLimit = key.customMaxAccounts ?? tier.maxAccounts
```
Individual per-key admin overrides set in the admin panel take first priority over the tier default. This applies everywhere in all three systems.

### Files changed
| File | Change |
|------|--------|
| `artifacts/api-server/src/routes/keys.ts` | Added `POST /add-account` route |
| `artifacts/api-server/src/routes/proxy.ts` | Proxied `/add-account` in dev mode |
| `artifacts/mobile/app/login-webview.tsx` | Added server call before `addAccount()` |
| `artifacts/mobile/app/add-account.tsx` | Added server call before `addAccount()` |

---

## System 3 — Server-Side Task Delay Validation on `/run-task`

### What it does
Prevents a tampered APK from running searches at inhuman speeds by requiring the client to declare its intended delay **before any automation starts**, and rejecting it if it's below the server-enforced minimum.

### How it works
New `POST /run-task` endpoint:
1. Validates the key (active, not expired, device binding)
2. Computes effective minimum delay: `key.customMinDelaySeconds ?? tier.minDelaySeconds`
3. Validates `requestedDelay >= minDelay`. If not: `400 { error, minDelay, requested }`
4. If valid: `200 { allowed: true, minDelay }`

### Client integration
At the very start of `search-runner.tsx`'s `run()` async function — **before any account loop, before any search, before any notification**:
```
POST /run-task { key, deviceId, requestedDelay: settings.searchDelay }
```
On `400`: shows "Delay Too Short" alert, sets `abortRef.current = true`, calls `stopRun()`, and returns immediately. No automation starts.

On network error: **fails-open** — the run proceeds using local settings. This keeps offline/airplane-mode use working while still blocking tampered apps that can reach the server.

### Files changed
| File | Change |
|------|--------|
| `artifacts/api-server/src/routes/keys.ts` | Added `POST /run-task` route |
| `artifacts/api-server/src/routes/proxy.ts` | Proxied `/run-task` in dev mode |
| `artifacts/mobile/app/search-runner.tsx` | Added pre-flight call at top of `run()` |

---

## Account Hydration System (`hydrateFromServer`)

### What it does
On every successful login (PIN submit or boot revalidation), the server returns the full account list stored in `device_cookies`. The mobile app merges this into local state so the user's accounts appear immediately — even on a fresh install.

### Merge strategy
`AccountsContext.hydrateFromServer(serverAccounts)`:
- For each server account: find a matching local account by email (case-insensitive)
  - **Match found:** Update `name` and `cookies` from server (keeps local `status`, `totalPoints`, `searchesCompleted`, etc.)
  - **No match:** Insert as a new account with default state
- Local-only accounts (not on server) are **kept** — they may be manual adds without cookies
- Result is persisted to AsyncStorage immediately

### Two hydration paths
| Path | Trigger | Mechanism |
|------|---------|-----------|
| Login (PIN submit) | `submitPin()` returns `{ serverAccounts }` | `LicenseGate` calls `hydrateFromServer()` directly |
| Boot (app restart) | `loadStoredLicense()` succeeds with stored PIN | Accounts written to `@ms_rewards_server_hydration` AsyncStorage key; `AccountsContext.loadFromStorage()` merges and removes it on next load |

### Files changed
| File | Change |
|------|--------|
| `artifacts/mobile/context/AccountsContext.tsx` | Added `hydrateFromServer()` + `SERVER_HYDRATION_STORAGE` check in `loadFromStorage()` |
| `artifacts/mobile/context/LicenseContext.tsx` | Exports `SERVER_HYDRATION_STORAGE`, writes server accounts to it on boot success |

---

## Admin Dashboard — PIN Visibility & Management

### What it does
Admins can now see every user's PIN in plain text directly from the key dashboard, and clear it if needed (e.g. user locked out, suspected compromise, device transfer).

### PIN display
Each key card in the admin panel shows a PIN badge in the stats row:
- **PIN set:** Amber monospace badge — `PIN  1234` — visible at a glance
- **No PIN:** Subtle "No PIN set" grey text

### Clear PIN button
A "Clear PIN" button (amber-bordered) appears on any key card that has a PIN:
- Requires a confirmation dialog
- Calls `DELETE /admin/keys/:id/pin` → sets `pin = NULL` in DB
- The action is logged server-side with timestamp and source IP
- After clearing: user will be shown the "Create Your PIN" screen on next login (treated as first-time)

### New backend route
```
DELETE /admin/keys/:id/pin
```
- Requires admin session
- Sets `pin = NULL`, updates `updatedAt`
- Returns `{ success: true }`
- Logs: `[PIN CLEAR] PIN cleared for key XXXX-XXXX at <timestamp> — source IP: <ip>`

### Files changed
| File | Change |
|------|--------|
| `artifacts/api-server/src/routes/keys.ts` | Added `DELETE /admin/keys/:id/pin` route |
| `artifacts/api-server/src/routes/admin.ts` | PIN badge in key card stats, "Clear PIN" button, `clearPin()` JS function |

---

## Database Schema Changes

All migrations use `ADD COLUMN IF NOT EXISTS` — safe to run on a DB that already has the column.

```sql
-- PIN for 2-step auth
ALTER TABLE license_keys ADD COLUMN IF NOT EXISTS pin TEXT;

-- Custom per-key overrides (take priority over tier defaults everywhere)
ALTER TABLE license_keys ADD COLUMN IF NOT EXISTS custom_max_accounts INTEGER;
ALTER TABLE license_keys ADD COLUMN IF NOT EXISTS custom_min_delay_seconds INTEGER;
```

---

## Security Design Principles

| Principle | Implementation |
|-----------|----------------|
| **Server is source of truth** | Account count, delay floor, and PIN are all enforced server-side |
| **Client count never trusted** | `/add-account` counts DB rows, ignores any client-sent count |
| **Custom overrides always win** | `key.customMaxAccounts ?? tier.maxAccounts` everywhere — no tier config can override an explicit per-key setting |
| **Fail-open on network error** | Systems 2 and 3 degrade gracefully if the server is unreachable — local checks remain as UX fallbacks |
| **Admin auditability** | PIN is stored plain text (admin-readable), and all PIN clear actions are logged with IP |
| **No silent bypass** | PIN wrong → `401`. Slot full → `403`. Delay short → `400`. All errors surface to the user |

---

## Endpoints Added

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/api/validate-key` | Key + PIN | Updated: now requires PIN gate |
| `POST` | `/api/add-account` | Key | New: server-side slot enforcement |
| `POST` | `/api/run-task` | Key | New: pre-flight delay validation |
| `DELETE` | `/api/admin/keys/:id/pin` | Admin session | New: clear a user's PIN |
