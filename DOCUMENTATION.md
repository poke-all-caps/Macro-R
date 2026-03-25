# Macro Rewards — Complete Project Documentation

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Project Structure](#2-project-structure)
3. [Environment Variables](#3-environment-variables)
4. [Database Schema](#4-database-schema)
5. [API Reference](#5-api-reference)
6. [License Key System](#6-license-key-system)
7. [Search Automation](#7-search-automation)
8. [Daily Set Automation](#8-daily-set-automation)
9. [Background Execution](#9-background-execution)
10. [Admin Panel](#10-admin-panel)
11. [Cloud Photo Backup](#11-cloud-photo-backup)
12. [Code Changes Log](#12-code-changes-log)
13. [Known Issues and Fixes](#13-known-issues-and-fixes)
14. [Setup Guide (Remix / New Agent)](#14-setup-guide-remix--new-agent)
15. [Build APK — Step by Step](#15-build-apk--step-by-step)
16. [Deployment Guide](#16-deployment-guide)
17. [Troubleshooting](#17-troubleshooting)

---

## 1. Project Overview

**Macro Rewards** is a pnpm monorepo that automates Microsoft Rewards point earning through Bing searches and Daily Set activities across multiple accounts.

| Component | Tech Stack | Purpose |
|-----------|-----------|---------|
| Mobile app | Expo SDK 54, React Native, Expo Router | Android app that runs automated Bing searches and Daily Set tasks |
| API server | Express 5, TypeScript | License key management, admin panel, cookie sync, photo backup |
| Database | PostgreSQL + Drizzle ORM | Stores license keys, feature configs, device cookies |
| Photo storage | Google Drive API | Cloud backup of photos uploaded from the mobile app |

**Production URL:** `https://macro-r.replit.app`

---

## 2. Project Structure

```text
macro-rewards/
├── artifacts/
│   ├── api-server/                  # Express 5 API server
│   │   ├── src/
│   │   │   ├── index.ts             # Entry point (reads PORT env var)
│   │   │   ├── app.ts               # Express app setup (CORS, JSON parsing)
│   │   │   ├── adminSession.ts      # Session management + requireAdmin middleware
│   │   │   └── routes/
│   │   │       ├── index.ts          # Route aggregator
│   │   │       ├── health.ts         # GET /api/healthz
│   │   │       ├── keys.ts           # License key CRUD, validation, feature config, cookie sync
│   │   │       ├── admin.ts          # HTML admin panel (web browser UI)
│   │   │       └── photos.ts         # Photo upload + admin photo viewer (Google Drive)
│   │   ├── build.ts                  # Production build script (esbuild + DB schema push)
│   │   └── .replit-artifact/
│   │       └── artifact.toml         # Deployment config
│   │
│   ├── mobile/                       # Expo React Native mobile app
│   │   ├── app/
│   │   │   ├── _layout.tsx           # Root layout with all providers + notification handler
│   │   │   ├── (tabs)/
│   │   │   │   ├── _layout.tsx       # Tab bar layout
│   │   │   │   ├── index.tsx         # Home — accounts list/grid + action buttons
│   │   │   │   ├── logs.tsx          # Run logs history
│   │   │   │   ├── queries.tsx       # Search queries management
│   │   │   │   └── settings.tsx      # App settings + license info + admin button
│   │   │   ├── account/[id].tsx      # Account detail/edit modal
│   │   │   ├── add-account.tsx       # Manual account add form
│   │   │   ├── admin-panel.tsx       # Admin panel route
│   │   │   ├── login-webview.tsx     # WebView Microsoft login flow
│   │   │   └── search-runner.tsx     # Foreground search execution screen
│   │   ├── components/
│   │   │   ├── AccountCard.tsx       # Account list card
│   │   │   ├── AccountGridTile.tsx   # Account grid tile
│   │   │   ├── AdminPanel.tsx        # Full native admin panel component
│   │   │   ├── LicenseGate.tsx       # License activation lock screen + QR scanner
│   │   │   ├── ErrorBoundary.tsx     # React error boundary
│   │   │   ├── StatsBar.tsx          # Stats summary bar
│   │   │   └── ...
│   │   ├── context/
│   │   │   ├── AccountsContext.tsx   # Accounts state, run logic, cookie sync
│   │   │   ├── LicenseContext.tsx    # License validation, caching, feature config
│   │   │   ├── QueriesContext.tsx    # Search queries state
│   │   │   └── SettingsContext.tsx   # App settings persistence
│   │   ├── utils/
│   │   │   ├── bingSearch.ts         # Core Bing search utilities (shared)
│   │   │   ├── backgroundSearch.ts   # Background search engine
│   │   │   ├── notifications.ts     # Notification scheduling + channels
│   │   │   └── photoBackup.ts       # Photo backup upload to API
│   │   ├── constants/
│   │   │   └── colors.ts            # Light/dark theme colors
│   │   ├── app.config.ts            # Expo config (permissions, plugins, owner mode)
│   │   └── eas.json                 # EAS Build profiles
│   │
│   └── mockup-sandbox/              # Vite + React UI prototyping sandbox
│
├── lib/
│   ├── db/                           # Drizzle ORM database layer
│   │   ├── src/
│   │   │   ├── index.ts              # DB connection (reads DATABASE_URL)
│   │   │   └── schema/
│   │   │       ├── index.ts          # Schema barrel file
│   │   │       ├── licenseKeys.ts    # license_keys table
│   │   │       ├── featureConfig.ts  # feature_config table
│   │   │       └── deviceCookies.ts  # device_cookies table
│   │   └── drizzle.config.ts         # Drizzle Kit config
│   ├── api-spec/                     # OpenAPI spec + Orval codegen config
│   ├── api-client-react/             # Generated React Query hooks
│   └── api-zod/                      # Generated Zod schemas
│
├── scripts/
│   └── post-merge.sh                # Post-merge setup script
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── package.json
```

---

## 3. Environment Variables

### API Server (Replit Secrets)

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | Auto | Port the Express server listens on. Set automatically by Replit. |
| `DATABASE_URL` | Auto | PostgreSQL connection string. Set automatically when you add a Replit database. |
| `ADMIN_SECRET` | **Yes** | Secret password for admin panel and admin API auth. Use a strong random string. |
| `REPLIT_DEV_DOMAIN` | Auto | Set by Replit. Used for CORS in production. Do not set manually. |

### Mobile App (Replit Secrets + EAS Env)

| Variable | Required | Description |
|----------|----------|-------------|
| `EXPO_PUBLIC_API_URL` | **Yes** (production) | Full base URL of the deployed API. Example: `https://macro-r.replit.app/api` |
| `EXPO_PUBLIC_DOMAIN` | Auto | Set by the dev script to `$REPLIT_DEV_DOMAIN`. Used as fallback if `EXPO_PUBLIC_API_URL` is not set. |
| `EXPO_PUBLIC_OWNER_MODE` | No | Set to `"true"` to bypass license gate entirely (dev/owner builds). Default: `"false"` |
| `EXPO_PUBLIC_ADMIN_SECRET` | No | Same value as `ADMIN_SECRET`. Needed so the in-app admin panel can make API calls. |

### How API URL Resolution Works

All four files that make API calls (`LicenseContext.tsx`, `AccountsContext.tsx`, `AdminPanel.tsx`, `photoBackup.ts`) use the same fallback logic:

```typescript
const API_BASE =
  process.env.EXPO_PUBLIC_API_URL ||
  (process.env.EXPO_PUBLIC_DOMAIN
    ? `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`
    : "");
```

- **In development:** `EXPO_PUBLIC_DOMAIN` is set automatically by the dev script, so it builds the URL from the Replit dev domain.
- **In production APK builds:** Set `EXPO_PUBLIC_API_URL` in EAS environment to point to the deployed URL (e.g., `https://macro-r.replit.app/api`).

### Important Notes on EXPO_PUBLIC_OWNER_MODE

The owner mode check uses **only** the environment variable:

```typescript
export const OWNER_MODE = process.env.EXPO_PUBLIC_OWNER_MODE === "true";
```

Previously it also checked `Constants.expoConfig?.extra?.ownerMode`, but this was removed because `Constants.expoConfig` caches the config value aggressively on web and doesn't update even after restarts. The env var is inlined by Metro at bundle time, so it's always current.

---

## 4. Database Schema

### `license_keys`

Stores all license keys. Keys are in `XXXX-XXXX-XXXX-XXXX` format (uppercase hex).

| Column | Type | Default | Constraints | Description |
|--------|------|---------|-------------|-------------|
| `id` | UUID | `gen_random_uuid()` | PK | Auto-generated unique ID |
| `key` | TEXT | — | NOT NULL, UNIQUE | License key string |
| `label` | TEXT | NULL | — | Optional human-readable label |
| `key_type` | TEXT | `'basic'` | NOT NULL | One of: `basic`, `premium`, `unlimited`, `admin` |
| `max_accounts` | INTEGER | `3` | NOT NULL | Max MS accounts allowed |
| `is_active` | BOOLEAN | `true` | NOT NULL | Whether key is currently valid |
| `bound_device_id` | TEXT | NULL | — | Android device ID locked to this key |
| `expires_at` | TIMESTAMP | — | NOT NULL | When the key expires |
| `created_at` | TIMESTAMP | `now()` | NOT NULL | Auto-set on insert |
| `updated_at` | TIMESTAMP | `now()` | NOT NULL | Auto-updated on change |

### `feature_config`

Per-key-type feature limits. One row per key type. Editable from admin panel.

| Column | Type | Default | Constraints | Description |
|--------|------|---------|-------------|-------------|
| `key_type` | TEXT | — | PK | One of: `basic`, `premium`, `unlimited`, `admin` |
| `max_accounts` | INTEGER | `3` | NOT NULL | Max accounts for this tier |
| `max_searches` | INTEGER | `30` | NOT NULL | Max searches per run |
| `min_delay_seconds` | INTEGER | `5` | NOT NULL | Min delay between searches (seconds) |
| `background_enabled` | BOOLEAN | `false` | NOT NULL | Whether background search is allowed |
| `custom_queries_enabled` | BOOLEAN | `false` | NOT NULL | Whether custom query lists are allowed |
| `daily_set_enabled` | BOOLEAN | `true` | NOT NULL | Whether Daily Set automation is allowed |

**Default seed values (created on API server startup):**

| Key Type | Max Accts | Max Searches | Min Delay | Background | Custom Queries | Daily Set |
|----------|-----------|-------------|-----------|------------|----------------|-----------|
| basic | 2 | 20 | 5s | No | No | Yes |
| premium | 5 | 40 | 3s | Yes | Yes | Yes |
| unlimited | 999 | 999 | 3s | Yes | Yes | Yes |
| admin | 999 | 999 | 1s | Yes | Yes | Yes |

### `device_cookies`

Stores per-account cookie snapshots synced from the mobile app.

| Column | Type | Default | Constraints | Description |
|--------|------|---------|-------------|-------------|
| `id` | UUID | `gen_random_uuid()` | PK | Auto-generated |
| `license_key_id` | UUID | — | NOT NULL, FK → license_keys.id (CASCADE) | Which license key owns this |
| `device_id` | TEXT | — | NOT NULL | Android device ID of uploader |
| `account_email` | TEXT | — | NOT NULL | Microsoft account email |
| `account_name` | TEXT | NULL | — | Display name |
| `cookies` | TEXT | — | NOT NULL | JSON string of cookie key-value pairs |
| `updated_at` | TIMESTAMP | `now()` | NOT NULL | Last sync time |

**Unique constraint:** `(license_key_id, account_email)` — one row per account per license key.

### Schema Management

```bash
# Push schema changes to the database (dev):
cd lib/db && pnpm run push

# This is automatically run during production builds via build.ts
```

---

## 5. API Reference

All routes are prefixed with `/api`. The API server runs on the port specified by the `PORT` env var.

### Authentication

Admin endpoints accept any of these auth methods:
1. `X-Admin-Secret` header with the `ADMIN_SECRET` value
2. Valid `admin_session` cookie (from web login)
3. `?secret=<ADMIN_SECRET>` query parameter

### Health

| Method | Path | Auth | Response |
|--------|------|------|----------|
| GET | `/api/healthz` | None | `{ "status": "ok" }` |

### License Validation (Mobile App Calls These)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/validate-key` | None | Validate a license key and bind device |
| POST | `/api/validate-admin` | None | Check if a value is the admin secret |

**POST /api/validate-key**

Request:
```json
{ "key": "XXXX-XXXX-XXXX-XXXX", "deviceId": "android-device-id" }
```

Success response:
```json
{
  "valid": true,
  "maxAccounts": 5,
  "expiresAt": "2027-01-01T00:00:00.000Z",
  "label": "Test Key",
  "keyType": "basic",
  "featureConfig": {
    "keyType": "basic",
    "maxAccounts": 2,
    "maxSearches": 20,
    "minDelaySeconds": 5,
    "backgroundEnabled": false,
    "customQueriesEnabled": false,
    "dailySetEnabled": true
  }
}
```

Error responses:
- `{ "valid": false, "error": "Invalid key" }`
- `{ "valid": false, "error": "Key has been deactivated" }`
- `{ "valid": false, "error": "Key has expired" }`
- `{ "valid": false, "error": "Key is already in use on another device" }`

Device binding: On first call with a `deviceId`, the key is permanently bound to that device. Subsequent calls from a different device are rejected.

**POST /api/validate-admin**

Request:
```json
{ "secret": "<admin-secret-value>" }
```

Response:
```json
{ "valid": true, "isAdmin": true }
```

### Cookie Sync

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/sync-cookies` | Key + DeviceId in body | Upload account cookies from device |

Request:
```json
{
  "key": "XXXX-XXXX-XXXX-XXXX",
  "deviceId": "android-device-id",
  "accounts": [
    { "email": "user@outlook.com", "cookies": "cookie-string", "name": "User" }
  ]
}
```

### Admin: Key Management

All require admin auth (see Authentication above).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/keys` | List all license keys |
| POST | `/api/admin/keys` | Create a new key |
| PUT | `/api/admin/keys/:id` | Update a key |
| DELETE | `/api/admin/keys/:id` | Delete a key permanently |
| PUT | `/api/admin/keys/:id/reset-device` | Unbind device from a key |
| GET | `/api/admin/keys/:id/cookies` | Get synced cookies for a key |

**POST /api/admin/keys** — Create key:
```json
{
  "label": "User Name",
  "maxAccounts": 5,
  "expiresAt": "2027-01-01T00:00:00.000Z",
  "keyType": "basic"
}
```

Response: `{ "key": { ...full key object with generated XXXX-XXXX-XXXX-XXXX key... } }`

**PUT /api/admin/keys/:id** — Update key (all fields optional):
```json
{
  "label": "New Label",
  "maxAccounts": 10,
  "expiresAt": "2028-01-01T00:00:00.000Z",
  "isActive": false,
  "keyType": "premium"
}
```

### Admin: Feature Config

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/feature-config` | Get all feature configs |
| PUT | `/api/admin/feature-config/:keyType` | Update config for a key type |

**PUT /api/admin/feature-config/:keyType** (all fields optional):
```json
{
  "maxAccounts": 10,
  "maxSearches": 50,
  "minDelaySeconds": 3,
  "backgroundEnabled": true,
  "customQueriesEnabled": true,
  "dailySetEnabled": true
}
```

### Admin: Photos (Google Drive)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/photos/upload` | Key + DeviceId in body | Upload photo to Google Drive |
| GET | `/api/admin/keys/:id/photos` | Admin | List backed-up photos for a key |
| GET | `/api/admin/keys/:id/photos/:photoId/view` | Admin | View/download a photo |

**POST /api/photos/upload:**
```json
{
  "key": "XXXX-XXXX-XXXX-XXXX",
  "deviceId": "android-device-id",
  "fileName": "photo.jpg",
  "mimeType": "image/jpeg",
  "base64Data": "<base64-encoded-image>"
}
```

Photos are stored in Google Drive under `MacroRewards_Photos/<LICENSE_KEY>/` folder hierarchy.

### Admin: Web Panel

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/admin` | Session or `?secret=` query | Shows login page or dashboard |
| POST | `/api/admin/login` | Body: `{ secret }` | Logs in, sets httpOnly session cookie |
| POST | `/api/admin/logout` | Session cookie | Clears session cookie |

---

## 6. License Key System

### Key Types and Access Levels

| Type | Who Gets It | Access Level |
|------|-------------|-------------|
| `basic` | Regular users | 2 accounts, 20 searches, daily set only |
| `premium` | Paying users | 5 accounts, 40 searches, all features |
| `unlimited` | Power users | 999 accounts, 999 searches, all features |
| `admin` | You / trusted people | 999 everything + in-app admin panel |

### Owner Mode vs Admin Key vs Admin Secret

| | Owner Mode (`EXPO_PUBLIC_OWNER_MODE=true`) | Admin License Key | Admin Secret |
|-|-------------------------------------------|-------------------|--------------|
| How activated | Env var baked into build | Enter key on license screen | Enter secret on license screen |
| Can expire | No | Yes (you set the date) | No |
| Can be revoked | No | Yes (deactivate from admin) | No (unless you change the secret) |
| Shareable | No (requires custom build) | Yes (give key to someone) | No (exposes full API access) |
| Shows admin panel | Yes (via Settings) | Yes (shown automatically) | Yes (shown automatically) |
| Device bound | No | Yes (first device locks it) | No |

### Device Binding Flow

1. User enters license key on the app's license screen
2. App calls `POST /api/validate-key` with `{ key, deviceId }`
3. If `bound_device_id` is NULL → server binds the key to this device (first-use bind)
4. If `bound_device_id` matches → validation passes
5. If `bound_device_id` doesn't match → rejected with "Key is already in use on another device"
6. Admin can reset binding via `PUT /api/admin/keys/:id/reset-device`

### Mobile Client Storage (AsyncStorage)

| Key | Contents |
|-----|----------|
| `@ms_rewards_license_key` | The activated license key string |
| `@ms_rewards_license_data` | JSON: `{ key, maxAccounts, expiresAt, keyType, validatedAt, featureConfig }` |
| `@ms_rewards_admin_secret` | Stored admin secret (when using admin secret auth) |
| `@ms_rewards_admin_validated_at` | Timestamp of last admin secret validation |
| `@ms_rewards_feature_config` | Cached feature config from server |
| `@ms_rewards_device_id` | Persistent device UUID |
| `@ms_rewards_admin_visible` | Whether admin panel button shows in Settings |

### Revalidation

- On startup, the app checks for a stored key in AsyncStorage
- If found, validates against the server
- 24-hour cache for license data (allows offline starts)
- 7-day offline grace period for admin sessions
- Background revalidation happens silently

---

## 7. Search Automation

### How Bing Searches Work

1. **Session setup:** App retrieves account cookies (the `_U` session cookie) from storage
2. **Search execution:** Each search sends a `GET` request to `bing.com/search?q=...` with:
   - Mobile User-Agent: `Mozilla/5.0 (Linux; Android 13; Pixel 7) ...Chrome/112`
   - `credentials: "omit"` with manual `Cookie` header
   - Unique `cvid` parameter (32-char random hex) per search
   - Cookies with `_ls_` prefix are filtered out
3. **Throttling:** Configurable delay between searches (default 5s in foreground, 1.5-2.5s in background)
4. **Points tracking:** Rewards points fetched from `https://rewards.bing.com/api/getuserinfo` before and after to calculate earnings

### Query Management

- Queries come from a rotating pool managed in `QueriesContext.tsx`
- Two arrays: `unused` and `used`
- Queries are drawn from `unused`, moved to `used` after execution
- When `unused` is depleted, `used` is recycled back to `unused`
- Custom queries can be added/edited (if `customQueriesEnabled` in feature config)

---

## 8. Daily Set Automation

The Daily Set (daily tasks like polls, quizzes, and activities on the Rewards dashboard) is automated via WebView interaction:

1. **Dashboard navigation:** WebView loads `rewards.bing.com`
2. **Script injection:** A specialized JavaScript script (`makeClickScript`) is injected into the page
3. **Element scanning:** The script finds uncompleted activity cards using CSS selectors (`[data-activity-id]`, `.ds-card-sec`)
4. **Completion detection:** Checks for completion indicators like `[class*="complete"]` icons
5. **Click simulation:** Dispatches real `MouseEvent('click')` events (not URL navigation) to trigger Microsoft's tracking
6. **State machine:** Waits for navigation to settle, returns to dashboard, finds next card
7. **Safety limit:** Stops after 10 cards to prevent infinite loops

Daily Set is only available in **foreground mode** (requires WebView). Background searches skip it.

---

## 9. Background Execution

Three-layer approach for running searches when the app is in the background:

### Layer 1: Background Fetch
- Registered via `expo-background-fetch` (`BACKGROUND-SEARCH-TASK`)
- Runs periodically (~1 hour) via Android's JobScheduler
- `stopOnTerminate: false`, `startOnBoot: true`

### Layer 2: Notification-Triggered
- Scheduled notifications fire at overnight time slots (default: 22:00, 23:00, 01:00, 02:00)
- `BACKGROUND-NOTIFICATION-TASK` catches the notification and runs searches
- If background search fails, sets `PENDING_RUN_KEY` flag and tries to open the app

### Layer 3: Foreground Handler
- When notification fires while app is open, navigates to `/search-runner`
- Full WebView-based automation (searches + daily set)

### Concurrency Protection
- In-memory lock + AsyncStorage timestamp (`@ms_rewards_bg_running`) with 10-minute TTL
- Double-check after write to detect lock contention
- `AppState` check skips background execution if app is in foreground

### Background Limitations
- No WebView available → Daily Set is skipped
- Uses `fetch()` calls only
- Shorter delay (1.5-2.5s) between searches

---

## 10. Admin Panel

### Two Interfaces

#### Web Admin Panel (Browser)
- **URL:** `https://macro-r.replit.app/api/admin`
- Log in with your `ADMIN_SECRET` via the login form (uses httpOnly session cookie)
- Dark theme, server-rendered HTML with inline JS
- Features: Create/manage keys, view feature configs, manage device bindings

#### In-App Admin Panel (Mobile)
- **Component:** `artifacts/mobile/components/AdminPanel.tsx`
- Shows when an admin-type key or admin secret is entered
- Features: All web panel features + QR code display, photo viewer, haptic feedback, clipboard copy
- **Auth logic:** Uses `adminSecret` from context, falls back to `EXPO_PUBLIC_ADMIN_SECRET` env var
- Two tabs: **Keys** (create/manage license keys) and **Feature Config** (edit per-tier settings)

### Admin Panel Auth Fix

The admin panel's API auth uses this priority:
```typescript
const effectiveSecret = adminSecret || OWNER_ADMIN_SECRET;
```

- If the user entered the admin secret directly → `adminSecret` is set from context
- If the user entered an admin-type license key → `adminSecret` may be null, falls back to `OWNER_ADMIN_SECRET` (the `EXPO_PUBLIC_ADMIN_SECRET` env var baked into the build)

---

## 11. Cloud Photo Backup

- Uses `expo-image-picker` to select photos (up to 10, quality 0.7)
- Photos are base64-encoded and sent to `POST /api/photos/upload`
- Server stores them in Google Drive under `MacroRewards_Photos/<LICENSE_KEY>/`
- Size limits: 15MB client-side check, 25MB server-side, 50MB Express body limit
- Google Drive integration uses Replit's Google Drive connector (`@replit/connectors-sdk`)
- Upload history cached in `@ms_rewards_uploaded_photos` (max 1000 entries)
- Admin can view uploaded photos per key from the admin panel

---

## 12. Code Changes Log

### Architecture Changes

| Change | Files | Description |
|--------|-------|-------------|
| Centralized session management | `adminSession.ts` (new) | Single source of truth for session tokens, `requireAdmin` middleware. All route files import from here instead of having inline copies. |
| Shared Bing search utilities | `bingSearch.ts` (new) | `sleep`, `randomHex`, `buildCookieHeader`, `performBingSearch`, `fetchRewardsPoints`, `BING_UA` — eliminates duplication between `search-runner.tsx` and `backgroundSearch.ts` |
| Domain-agnostic API URL | 4 files updated | All API calls use `EXPO_PUBLIC_API_URL` with fallback to `EXPO_PUBLIC_DOMAIN`, making the app work across domain changes automatically |
| DB schema auto-sync on deploy | `build.ts` updated | Production build now runs `drizzle-kit push` before bundling, ensuring the production database always has the latest schema |

### Bug Fixes

| Bug | Root Cause | Fix | Files |
|-----|-----------|-----|-------|
| License page not showing on web | `Constants.expoConfig?.extra?.ownerMode` cached stale `true` value | Removed `Constants.expoConfig` check, use only `process.env.EXPO_PUBLIC_OWNER_MODE` | `LicenseContext.tsx` |
| Admin panel crash on web | Removed `isOwnerMode` from destructured context but still referenced in JSX | Removed all `isOwnerMode` references, always show back/logout buttons | `AdminPanel.tsx` |
| Admin panel can't load keys or create keys | `effectiveSecret` was empty when user entered admin-type license key (not admin secret) | Changed to `adminSecret \|\| OWNER_ADMIN_SECRET` fallback | `AdminPanel.tsx` |
| Camera hook crash on web | `useCameraPermissions()` hook throws on web platform | Replaced with `Camera.requestCameraPermissionsAsync()` called only on native | `LicenseGate.tsx` |
| `app.config.ts` IS_OWNER bug | Checked `=== "false"` instead of `=== "true"` | Fixed comparison to `=== "true"` | `app.config.ts` |
| Missing `daily_set_enabled` column | Column not in production DB, API server crashed on query | Added column to schema, added schema push to build step | `featureConfig.ts`, `build.ts` |
| `pointsEarned` always 0 in background | Used wrong variable name | Fixed to use the `earned` variable | `backgroundSearch.ts` |
| Stale account cookies in search loop | Run loop used mount-time snapshot | Added `accountsRef` kept in sync with live state | `search-runner.tsx` |
| WebView race condition | Load/message events fired before waiter installed | Added `loadEventBufferedRef` and `msgEventQueueRef` for buffering | `search-runner.tsx` |

### Security Fixes (from audit)

| Issue | Fix |
|-------|-----|
| Admin secret exposed in URL | Replaced with POST login form + httpOnly session cookie |
| XSS in admin HTML panel | All user data goes through `esc()` function |
| Inline session management duplicated across files | Centralized in `adminSession.ts` |
| Device binding relied on fragile `rowCount` | Re-queries DB to confirm bind |
| Silent error swallowing in cookie sync | Now logs errors properly |
| Non-null assertions on nullable data | Replaced with validated reads |

---

## 13. Known Issues and Fixes

### Production Database Schema

The production database is separate from the development database. When you add new columns or tables:
- The build script (`build.ts`) automatically runs `drizzle-kit push` during production builds
- For manual fixes: you cannot directly modify the production DB from the dev environment
- Solution: Re-deploy the app (the build step will sync the schema)

### Replit Dev Domain vs Production

- **Dev domain** (`*.sisko.replit.dev`): Only accessible within Replit or through the web preview. Mobile devices on external networks CANNOT reach this URL.
- **Production domain** (`macro-r.replit.app`): Publicly accessible from any device. This is what you must use for mobile APK builds.

### Web Preview Cache

Expo's `Constants.expoConfig` caches config values aggressively on web. If you change `EXPO_PUBLIC_OWNER_MODE` and it doesn't take effect:
1. The env var is correctly used via `process.env.EXPO_PUBLIC_OWNER_MODE` (not Constants)
2. Clear `.expo/web` and `node_modules/.cache` if issues persist
3. Restart the Expo workflow

---

## 14. Setup Guide (Remix / New Agent)

This section is for anyone remixing this project or a new Replit agent setting it up from scratch.

### Step 1: Install Dependencies

```bash
pnpm install
```

### Step 2: Create the Database

The project uses Replit's built-in PostgreSQL. If not already provisioned:
1. Use the Replit database tool to create a PostgreSQL database
2. This automatically sets `DATABASE_URL`, `PGHOST`, `PGPORT`, etc.

### Step 3: Push the Database Schema

```bash
cd lib/db && pnpm run push
```

This creates the `license_keys`, `feature_config`, and `device_cookies` tables.

### Step 4: Set Environment Variables

Set these in Replit Secrets:

| Variable | Value | Notes |
|----------|-------|-------|
| `ADMIN_SECRET` | Generate a strong random string | Used for admin panel and API auth |
| `EXPO_PUBLIC_ADMIN_SECRET` | Same as `ADMIN_SECRET` | Needed for in-app admin panel API calls |
| `EXPO_PUBLIC_OWNER_MODE` | `"true"` for dev, `"false"` for production | Controls whether license screen is shown |

### Step 5: Start the Workflows

The project has two main workflows:
1. **API Server:** `pnpm --filter @workspace/api-server run dev`
2. **Mobile (Expo):** `pnpm --filter @workspace/mobile run dev`

Both should start automatically. If not, restart them from the Replit workflows panel.

### Step 6: Verify Everything Works

1. Check the API server: Visit `/api/healthz` — should return `{ "status": "ok" }`
2. Check the admin panel: Visit `/api/admin` and log in with your `ADMIN_SECRET`
3. Check the mobile app: Should show in the Replit preview pane

### Step 7: Create Your First Admin Key

```bash
curl -X POST \
  -H "X-Admin-Secret: <YOUR_ADMIN_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"label":"Owner","maxAccounts":999,"expiresAt":"2099-12-31T23:59:59.000Z","keyType":"admin"}' \
  "https://$REPLIT_DEV_DOMAIN/api/admin/keys"
```

Or use the web admin panel at `/api/admin`.

### Step 8: Google Drive Integration (Optional)

For photo backup to work, you need the Google Drive integration:
1. Go to Replit's integrations panel
2. Connect Google Drive
3. The API server uses `@replit/connectors-sdk` to access it

### Important Notes for New Agents

1. **Never edit `artifact.toml` directly** — use the artifacts skill
2. **Never edit `.replit` env vars directly** — use the environment-secrets skill
3. **Database schema changes** — edit files in `lib/db/src/schema/`, then run `cd lib/db && pnpm run push`
4. **The mobile app dev server** uses the Expo dev domain (different from the API server domain)
5. **The API server** runs on port 8080 and is mounted at `/api`
6. **CORS** is set to allow all origins in development, restricted in production
7. **Feature configs** are seeded automatically on API server startup if the table is empty

---

## 15. Build APK — Step by Step

### Prerequisites (Install Once)

```bash
# Install Node.js (v18+)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install 18 && nvm use 18

# Install pnpm
npm install -g pnpm

# Install EAS CLI
npm install -g eas-cli

# Log in to your Expo account
eas login
```

### One-Time Project Setup

```bash
cd artifacts/mobile
eas build:configure
# Choose "Android" when prompted
```

### Set Production Environment Variables in EAS

```bash
# Set the production API URL (REQUIRED for the APK to connect to the server)
eas env:create --name EXPO_PUBLIC_API_URL --value "https://macro-r.replit.app/api" --environment preview --visibility plaintext

# Set owner mode (false for distributed builds, true for personal dev builds)
eas env:create --name EXPO_PUBLIC_OWNER_MODE --value "false" --environment preview --visibility plaintext

# Set admin secret (needed for in-app admin panel)
eas env:create --name EXPO_PUBLIC_ADMIN_SECRET --value "<your-admin-secret>" --environment preview --visibility sensitive
```

### Build Debug APK (for testing)

```bash
cd artifacts/mobile
eas build --platform android --profile preview
```

This uploads code to Expo's cloud and builds the APK (5-15 minutes). Download link appears in terminal and at https://expo.dev.

### Build Production APK

```bash
cd artifacts/mobile
eas build --platform android --profile production
```

### Install on Android Device

```bash
# Option A: ADB (USB cable)
adb install path/to/downloaded.apk

# Option B: Open the download link from EAS on your phone
```

### OTA Updates (No APK Rebuild Needed)

For JavaScript-only changes (no native code/permissions changes):

```bash
cd artifacts/mobile
eas update --branch preview --message "your update message"
```

### When You MUST Rebuild the APK

- Adding/removing Android permissions
- Adding/removing Expo plugins (expo-camera, expo-image-picker, etc.)
- Changing `app.config.ts` native settings
- Updating Expo SDK version

---

## 16. Deployment Guide

### Deploy the API Server

1. Make sure the API server workflow is running and healthy
2. Verify the database schema is up to date
3. Click "Publish" in Replit or use the deployment tool

The build step (`build.ts`) automatically:
- Pushes the database schema to the production DB
- Bundles the server with esbuild into `dist/index.cjs`

### Production Configuration

The deployment is configured in `artifacts/api-server/.replit-artifact/artifact.toml`:
- Build: `pnpm --filter @workspace/api-server run build`
- Run: `node artifacts/api-server/dist/index.cjs`
- Health check: `GET /api/healthz`
- Port: 8080

### After Deploying

1. Note the production URL (e.g., `https://macro-r.replit.app`)
2. Set `EXPO_PUBLIC_API_URL` in EAS env to `https://macro-r.replit.app/api`
3. Build a new APK with the production URL baked in

---

## 17. Troubleshooting

### Mobile app says "Couldn't connect to server"

- **Cause:** The app is trying to reach the Replit dev domain, which isn't accessible from external networks
- **Fix:** Deploy the API server and set `EXPO_PUBLIC_API_URL` in EAS env to the production URL, then rebuild the APK

### License page doesn't appear

- **Cause:** `EXPO_PUBLIC_OWNER_MODE` is set to `"true"`, or browser cache has stale data
- **Fix:** Set `EXPO_PUBLIC_OWNER_MODE` to `"false"`, clear `.expo/web` cache, restart Expo

### Admin panel shows empty / can't generate keys

- **Cause:** The admin secret isn't being sent with API calls
- **Fix:** Make sure `EXPO_PUBLIC_ADMIN_SECRET` is set and matches `ADMIN_SECRET`

### Production API crashes with "Failed query" / "getaddrinfo EAI_AGAIN"

- **Cause:** Production database schema is out of date or DB connection failed
- **Fix:** Re-deploy the app (build step auto-syncs the schema)

### Feature config not loading

- **Cause:** The `feature_config` table is empty or missing columns
- **Fix:** The API server seeds default values on startup. If columns are missing, run `cd lib/db && pnpm run push` and re-deploy

### Camera/QR scanner not working on mobile

- **Cause:** Missing Android camera permissions (requires APK rebuild after adding permissions)
- **Fix:** Rebuild the APK with `eas build --platform android --profile preview`

### OTA update not reaching users

- **Cause:** OTA updates only push JavaScript changes. Native changes need a new APK.
- **Fix:** If you changed permissions or plugins, rebuild the APK instead of using `eas update`

### Background searches not running

- **Check:** Battery optimization must be set to "Unrestricted" for the app
- **Check:** Some devices (Infinix/HiOS, Samsung) need Autostart or "Sleeping apps" exception
- **Check:** `backgroundEnabled` must be `true` in the feature config for the user's key type
