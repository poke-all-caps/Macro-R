# Macro Rewards — Full Project Documentation

## Table of Contents
1. [Project Overview](#1-project-overview)
2. [Environment Variables](#2-environment-variables)
3. [Database Tables](#3-database-tables)
4. [API Reference](#4-api-reference)
5. [License Key System](#5-license-key-system)
6. [Key Storage (Mobile)](#6-key-storage-mobile)
7. [Code Changes Made](#7-code-changes-made)
8. [Build APK — Step by Step](#8-build-apk--step-by-step)

---

## 1. Project Overview

| Part | Tech | Purpose |
|------|------|---------|
| Mobile app | Expo SDK 54, React Native | Android app that automates Microsoft Rewards searches and Daily Set |
| API server | Express 5, TypeScript | License key management, admin panel, cookie sync |
| Database | PostgreSQL + Drizzle ORM | Stores license keys, feature configs, device cookies |
| Auth | Session cookies (httpOnly) | Admin panel login |

---

## 2. Environment Variables

### API Server (set in Replit Secrets)

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | Yes | Port the Express server listens on. Set automatically by Replit. |
| `ADMIN_SECRET` | Yes | Secret password for the admin panel and admin API. Pick any strong random string. Example: `s3cr3t-admin-key-abc123` |
| `DATABASE_URL` | Yes | PostgreSQL connection string. Set automatically when you add a Replit database. |
| `REPLIT_DEV_DOMAIN` | Auto | Set by Replit. Used for CORS in production. Do not set manually. |

### Mobile App (set in Replit Secrets or `.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `EXPO_PUBLIC_API_URL` | Yes | Base URL of the API server. Example: `https://your-replit-domain.replit.app/api` |
| `EXPO_PUBLIC_OWNER_MODE` | No | Set to `"true"` to bypass the license gate entirely (owner/dev builds only). Default: `false` |
| `EXPO_PUBLIC_ADMIN_SECRET` | No | Same value as `ADMIN_SECRET`. Only needed when `OWNER_MODE=true` so the app can call admin APIs directly. |

> **Never put secrets in code or commit them to git. Always use Replit Secrets.**

---

## 3. Database Tables

### `license_keys`
Stores all license keys.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Auto-generated unique ID |
| `key` | text (unique) | The license key shown to users. Format: `XXXX-XXXX-XXXX-XXXX` |
| `label` | text (nullable) | Optional human-readable label (e.g. "Personal", "Friend") |
| `key_type` | text | One of: `basic`, `premium`, `unlimited`, `admin` |
| `max_accounts` | integer | Max MS accounts the key allows |
| `is_active` | boolean | Whether the key is currently valid |
| `bound_device_id` | text (nullable) | Android device ID the key is locked to after first use |
| `expires_at` | timestamp | When the key expires |
| `created_at` | timestamp | Auto-set on insert |
| `updated_at` | timestamp | Auto-updated on every change |

### `feature_config`
Per-key-type feature limits. One row per key type. Editable from the admin panel.

| Column | Type | Description |
|--------|------|-------------|
| `key_type` | text (PK) | One of: `basic`, `premium`, `unlimited`, `admin` |
| `max_accounts` | integer | Max accounts allowed for this tier |
| `max_searches` | integer | Max searches per run for this tier |
| `min_delay_seconds` | integer | Minimum delay between searches (seconds) |
| `background_enabled` | boolean | Whether background/scheduled search is allowed |
| `custom_queries_enabled` | boolean | Whether custom search query lists are allowed |
| `daily_set_enabled` | boolean | Whether Daily Set automation is allowed |

**Default values seeded on startup:**

| Key Type | Max Accounts | Max Searches | Min Delay | Background | Custom Queries | Daily Set |
|----------|-------------|-------------|-----------|------------|----------------|-----------|
| basic | 2 | 20 | 5s | No | No | Yes |
| premium | 5 | 40 | 3s | Yes | Yes | Yes |
| unlimited | 999 | 999 | 3s | Yes | Yes | Yes |
| admin | 999 | 999 | 1s | Yes | Yes | Yes |

### `device_cookies`
Stores per-account cookie snapshots synced from the mobile app, used for cross-device login handoff.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Auto-generated |
| `license_key_id` | UUID (FK → license_keys.id) | Which license key this belongs to |
| `device_id` | text | Android device ID of the uploader |
| `account_email` | text | Microsoft account email |
| `account_name` | text (nullable) | Display name |
| `cookies` | text | JSON string of cookie key-value pairs |
| `updated_at` | timestamp | Last sync time |

Unique constraint: one row per `(license_key_id, account_email)`.

---

## 4. API Reference

All routes are prefixed with `/api`.

### Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/health` | None | Returns `{ status: "ok" }` |

### Admin Panel (Browser UI)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/admin` | Session cookie or `?secret=` | Shows login page or dashboard |
| POST | `/api/admin/login` | Body: `{ secret }` | Logs in, sets httpOnly session cookie |
| POST | `/api/admin/logout` | Session cookie | Clears session cookie |

### License Key Management (Admin only)

Auth: `X-Admin-Secret: <ADMIN_SECRET>` header **or** valid session cookie.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/keys` | List all license keys |
| POST | `/api/admin/keys` | Create a new key. Body: `{ label?, maxAccounts, expiresAt, keyType }` |
| PUT | `/api/admin/keys/:id` | Update a key. Body: any of `{ label, maxAccounts, expiresAt, keyType, isActive }` |
| DELETE | `/api/admin/keys/:id` | Delete a key permanently |
| PUT | `/api/admin/keys/:id/reset-device` | Unbind the device from a key (allows it to be used on a new device) |

### Feature Config (Admin only)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/feature-config` | Get all feature configs for all key types |
| PUT | `/api/admin/feature-config/:keyType` | Update config for a key type. Body: any feature fields |

### License Validation (Mobile app calls these)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/validate-key` | None | Validate a license key. Body: `{ key, deviceId }`. Returns `{ valid, keyType, maxAccounts, expiresAt, featureConfig }` |
| POST | `/api/validate-admin` | None | Check if a value is the admin secret. Body: `{ secret }`. Returns `{ valid, isAdmin }` |

### Cookie Sync (Mobile app calls these)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/cookies/sync` | `X-License-Key` header | Upload cookies for an account |
| GET | `/api/cookies` | `X-License-Key` header | Get all synced cookies for this key |

### Photos (Google Drive backup)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/admin/keys/:id/photos` | Admin | List backed-up photos for a key |
| GET | `/api/admin/keys/:id/photos/:photoId/view` | Admin | View a specific photo |
| POST | `/api/upload-photo` | `X-License-Key` header | Upload a photo for backup |

---

## 5. License Key System

### Key Types and What They Unlock

| Type | Who Gets It | Access Level |
|------|-------------|-------------|
| `basic` | Regular users | 2 accounts, 20 searches, daily set only |
| `premium` | Paying users | 5 accounts, 40 searches, all features |
| `unlimited` | Power users | 999 accounts, 999 searches, all features |
| `admin` | You / trusted people | 999 accounts, 999 searches, all features + in-app admin panel |

### Admin Key vs OWNER_MODE

| | `OWNER_MODE=true` build | Admin license key |
|-|-------------------------|-------------------|
| How activated | Env var at build time | Entered in license screen |
| Can expire | No | Yes (you set the date) |
| Can be revoked | No | Yes (deactivate from admin panel) |
| Shareable | No (requires a custom build) | Yes |
| isAdmin flag | Yes | Yes |
| Full feature config | Yes (999/999) | Yes (999/999) |

### Device Binding
When a user first validates their key on a device, the device's Android ID is stored in `bound_device_id`. The same key cannot be used on a different device unless you reset it from the admin panel (PUT `/api/admin/keys/:id/reset-device`).

---

## 6. Key Storage (Mobile)

The mobile app uses React Native `AsyncStorage` with these keys:

| AsyncStorage Key | Contents |
|-----------------|----------|
| `@ms_rewards_accounts` | JSON array of all MS accounts (name, email, cookies) |
| `@ms_rewards_logs` | JSON array of run logs |
| `@ms_rewards_settings_v2` | JSON object of user settings (search count, delay, etc.) |
| `@ms_rewards_queries_v2` | JSON array of custom search queries |
| `@ms_rewards_license_key` | The activated license key string |
| `@ms_rewards_license_data` | JSON object: `{ key, maxAccounts, expiresAt, keyType, validatedAt, featureConfig }` |
| `@ms_rewards_admin_secret` | Stored admin secret (when logged in via admin secret, not key) |
| `@ms_rewards_admin_validated_at` | Timestamp (ms) of last successful admin secret validation |
| `@ms_rewards_feature_config` | Cached feature config from server |

---

## 7. Code Changes Made

### New Files Created
| File | Purpose |
|------|---------|
| `artifacts/api-server/src/adminSession.ts` | Shared session management. Single source of truth for session tokens (Map), `createSession`, `isValidSession`, `deleteSession`, `getSessionFromCookie`, `requireAdmin` middleware. All three route files import from here. |
| `artifacts/mobile/utils/bingSearch.ts` | Shared Bing search utilities: `sleep`, `randomHex`, `buildCookieHeader`, `performBingSearch`, `fetchRewardsPoints`, `BING_UA`. Eliminates code duplication between `search-runner.tsx` and `backgroundSearch.ts`. |

### Modified Files

**`artifacts/api-server/src/routes/admin.ts`**
- Removed inline session management (sessions Map, createSession, isValidSession, getSessionFromCookie, requireAdmin) — now imported from `adminSession.ts`
- Admin secret no longer appears in URL — replaced with POST login form + httpOnly session cookie
- All user data in HTML output now goes through `esc()` (XSS prevention)
- Removed `import.meta.url` (was incompatible with CommonJS build)

**`artifacts/api-server/src/routes/keys.ts`**
- Removed inline `requireAdmin` function (header-only) — now imported from `adminSession.ts` (accepts header OR session cookie)
- Removed inline `ADMIN_SECRET` constant — `validate-admin` endpoint now reads from `process.env["ADMIN_SECRET"]` directly
- Device binding now re-queries the DB to confirm bind instead of relying on fragile `rowCount`

**`artifacts/api-server/src/routes/photos.ts`**
- Removed inline `requireAdmin` — now imported from `adminSession.ts`

**`artifacts/mobile/app/search-runner.tsx`**
- Removed local duplicates of `sleep`, `randomHex`, `buildCookieHeader`, `performBingSearch`, `fetchRewardsPoints`, `BING_UA` — now imported from `@/utils/bingSearch`
- Added `loadEventBufferedRef` and `msgEventQueueRef` — WebView load and message events that fire before a waiter is installed are buffered and drained rather than silently dropped (race condition fix)
- Added `accountsRef` kept in sync with live accounts state — the run loop now reads the freshest account cookies on every iteration instead of using a stale mount-time snapshot

**`artifacts/mobile/utils/backgroundSearch.ts`**
- Fixed `pointsEarned` bug: was always 0 on first run; now correctly uses the `earned` variable
- Replaced all `any` types with proper typed interfaces
- Imports shared utilities from `bingSearch.ts`

**`artifacts/mobile/context/AccountsContext.tsx`**
- `syncCookiesToServer` now logs errors instead of silently swallowing them

**`artifacts/mobile/context/LicenseContext.tsx`**
- Admin-type license keys now grant `isAdmin: true` and `OWNER_FEATURE_CONFIG` (999 accounts, 999 searches, all features) — applies across all three loading paths (fresh load, cached load, offline fallback)
- Offline admin session now expires after 7 days (was never expiring)
- Non-null assertions replaced with validated reads

**`artifacts/mobile/utils/notifications.ts`**
- `promptBatteryOptimization` is now properly `await`ed

---

## 8. Build APK — Step by Step

### Prerequisites — Install These Once

```bash
# 1. Install Node.js (v18 or later)
# Download from https://nodejs.org or use nvm:
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install 18
nvm use 18

# 2. Install pnpm
npm install -g pnpm

# 3. Install the EAS CLI (Expo Application Services — builds APKs in the cloud)
npm install -g eas-cli

# 4. Log in to your Expo account
eas login
# Enter your Expo username and password
# (Create a free account at https://expo.dev if you don't have one)
```

### One-Time Project Setup

```bash
# 5. Clone/download this project and enter it
cd /path/to/your/project

# 6. Install all dependencies
pnpm install

# 7. Configure EAS for this project (only needed once per machine)
cd artifacts/mobile
eas build:configure
# Choose "Android" when prompted
# It will update eas.json automatically
```

### Build a Debug APK (for testing — no Play Store needed)

```bash
cd artifacts/mobile

# Build a preview APK — installs directly on any Android device
eas build --platform android --profile preview
```

This uploads your code to Expo's cloud servers and builds the APK there. When done (usually 5–15 minutes), you get a download link in the terminal and at https://expo.dev.

### Build a Release APK (for distribution)

```bash
cd artifacts/mobile

# Build a production-signed APK
eas build --platform android --profile production
```

### Install the APK on Your Android Device

```bash
# Option A — ADB (USB cable)
adb install path/to/downloaded.apk

# Option B — just open the download link from EAS on your phone
# (scan the QR code shown in the terminal)
```

### Set Environment Variables Before Building

If you want `OWNER_MODE` baked into the APK:

```bash
# In the artifacts/mobile directory, create a .env file:
echo "EXPO_PUBLIC_OWNER_MODE=true" > .env
echo "EXPO_PUBLIC_API_URL=https://your-api-domain.replit.app/api" >> .env
echo "EXPO_PUBLIC_ADMIN_SECRET=your-admin-secret-here" >> .env

# Then build:
eas build --platform android --profile preview
```

Or set them as EAS secrets (better for production — keeps them out of the code):

```bash
eas secret:create --scope project --name EXPO_PUBLIC_API_URL --value "https://your-domain.replit.app/api"
eas secret:create --scope project --name EXPO_PUBLIC_OWNER_MODE --value "false"
eas secret:create --scope project --name EXPO_PUBLIC_ADMIN_SECRET --value "your-secret-here"
```

### eas.json Reference

The `artifacts/mobile/eas.json` file controls build profiles:

```json
{
  "build": {
    "preview": {
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "android": {
        "buildType": "apk"
      }
    }
  }
}
```

### Quick Reference — All Build Commands

```bash
# Install dependencies
pnpm install

# Log in to Expo
eas login

# Build debug APK (fastest, for testing)
cd artifacts/mobile && eas build --platform android --profile preview

# Build production APK
cd artifacts/mobile && eas build --platform android --profile production

# Check build status
eas build:list

# Download latest build
eas build:download

# Update OTA (over-the-air JS update — no APK rebuild needed for JS changes)
cd artifacts/mobile && eas update --branch production --message "your update message"
```

> **OTA Updates:** Because the app uses Expo Updates, you can push JavaScript-only changes directly to users' installed apps without a new APK using `eas update`. Only native code changes (permissions, new plugins) require a new APK build.
