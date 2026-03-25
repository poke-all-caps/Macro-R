# Macro Rewards — MS Rewards Automation

## Overview

pnpm workspace monorepo using TypeScript. Contains **Macro Rewards**, an Android app built with Expo React Native that automates Microsoft Rewards point earning through automated Bing searches and Daily Set completion. Includes a backend API server with a license key system and admin panel.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Mobile**: Expo SDK 54 (`~54.0.27`) + Expo Router (file-based routing)

## Project Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/           # Express 5 API server (license keys, admin panel)
│   │   └── src/
│   │       ├── index.ts      # Entry point (reads PORT env var)
│   │       ├── app.ts        # Express app setup (cors, json, routes at /api)
│   │       └── routes/
│   │           ├── index.ts  # Route aggregator
│   │           ├── health.ts # Health check endpoint
│   │           ├── keys.ts   # License key CRUD + validate-key + cookie sync + feature config
│   │           ├── admin.ts  # HTML admin panel for license management
│   │           └── photos.ts # Photo backup upload + admin photo viewer (Google Drive)
│   └── mobile/               # Expo React Native app
│       ├── app/
│       │   ├── _layout.tsx           # Root layout with all providers + notification handler
│       │   ├── (tabs)/
│       │   │   ├── _layout.tsx       # Tab bar layout (native tabs on iOS, classic on Android)
│       │   │   ├── index.tsx         # Home — accounts list/grid + FABs
│       │   │   ├── logs.tsx          # Run logs history
│       │   │   ├── queries.tsx       # Search queries management
│       │   │   └── settings.tsx      # App settings + schedule + license info + admin button
│       │   ├── account/[id].tsx      # Account detail modal + hidden Panel toggle
│       │   ├── add-account.tsx       # Manual account add form
│       │   ├── admin-panel.tsx       # Admin panel route (guarded by OWNER_MODE)
│       │   ├── login-webview.tsx     # WebView Microsoft login flow
│       │   └── search-runner.tsx     # Foreground search execution screen
│       ├── components/
│       │   ├── AccountCard.tsx       # Account list card with status
│       │   ├── AccountGridTile.tsx   # Account grid tile view
│       │   ├── CustomAlert.tsx       # Custom alert dialog
│       │   ├── EmptyState.tsx        # Empty state placeholder
│       │   ├── ErrorBoundary.tsx     # React error boundary
│       │   ├── ErrorFallback.tsx     # Error fallback UI
│       │   ├── LicenseGate.tsx       # License activation lock screen
│       │   ├── LogItem.tsx           # Run log list item
│       │   └── StatsBar.tsx          # Stats summary bar
│       ├── context/
│       │   ├── AccountsContext.tsx   # Accounts state, run logic, logs
│       │   ├── LicenseContext.tsx    # License validation + caching
│       │   ├── QueriesContext.tsx    # Search queries state
│       │   └── SettingsContext.tsx   # App settings persistence
│       ├── constants/
│       │   └── colors.ts            # Light/dark theme colors
│       └── utils/
│           ├── backgroundSearch.ts  # Background search engine (fetch-based)
│           ├── notifications.ts     # Notification scheduling + channels
│           └── photoBackup.ts       # Photo backup picker + upload to API
├── lib/
│   ├── api-spec/                    # OpenAPI spec + Orval codegen config
│   ├── api-client-react/            # Generated React Query hooks
│   ├── api-zod/                     # Generated Zod schemas from OpenAPI
│   └── db/                          # Drizzle ORM schema + DB connection
│       └── src/schema/
│           └── licenseKeys.ts       # license_keys table schema
├── scripts/                         # Utility scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

---

## Mobile App — Macro Rewards

### App Provider Tree (app/_layout.tsx)

```
SafeAreaProvider
  → ErrorBoundary
    → QueryClientProvider
      → GestureHandlerRootView
        → KeyboardProvider
          → LicenseProvider        ← license validation context
            → LicenseGate          ← blocks app if no valid license
              → AccountsProvider   ← accounts state + run logic
                → QueriesProvider  ← search queries
                  → SettingsProvider
                    → RootLayoutNav (Stack navigator)
```

### Features

#### 1. License Key System
- **LicenseGate** (`components/LicenseGate.tsx`): Full-screen lock screen shown when no valid license is active. Displays a key icon, text input for keys, and an Activate button. Detects admin secret vs regular license key automatically. Supports QR code scanning via camera (`expo-camera`) and gallery image picker (`expo-image-picker`) for license activation.
- **LicenseContext** (`context/LicenseContext.tsx`):
  - Validates keys against the API at `EXPO_PUBLIC_API_URL/api/validate-key`
  - Also checks admin secret via `EXPO_PUBLIC_API_URL/api/validate-admin`
  - If admin secret is entered → `isAdmin=true`, shows AdminPanel instead of regular app
  - If regular license key is entered → `isAdmin=false`, shows regular app
  - Caches validated license data in AsyncStorage for **24 hours**
  - Falls back to cached data when offline (if license hasn't expired)
  - Stores: `key`, `maxAccounts`, `expiresAt`, `label`, `keyType`, `validatedAt`
  - AsyncStorage keys: `@ms_rewards_license_key`, `@ms_rewards_license_data`, `@ms_rewards_admin_secret`
- **AdminPanel** (`components/AdminPanel.tsx`): Full native admin panel shown when admin secret is entered. Allows creating keys, extending expiry, editing account limits, activating/deactivating, deleting, copying keys to clipboard, and resetting device bindings. Sign out button returns to license entry screen.
- **Device Locking**: Each key is bound to 1 device only. The first device to activate a key gets bound; other devices are rejected with "Key is already in use on another device". Admin can reset device binding from the admin panel. Device ID is Android ID on Android, or a persistent UUID stored in AsyncStorage. Schema column: `bound_device_id` on `license_keys` table.
- **Owner Mode** (`app.json` → `expo.extra.ownerMode`): Build-time flag. When `true`, the license screen is bypassed entirely — no key needed. The admin panel is accessible from Settings via a purple "Admin Panel" button, but this button is hidden by default. To show/hide it, go to account #2's edit screen and toggle the "Panel" switch. When `ownerMode` is `false`, everything works normally (license key required). The admin panel uses `EXPO_PUBLIC_ADMIN_SECRET` env var for API auth in owner mode.
- **Background Work** (`utils/backgroundSearch.ts`): Three-layer approach:
  1. **Background Fetch** (`expo-background-fetch`): Registered on app launch, runs periodically (~1 hour) via Android's JobScheduler. Calls `runBackgroundSearches()`.
  2. **Notification-triggered** (`utils/notifications.ts`): When overnight notification fires in background, `BACKGROUND-NOTIFICATION-TASK` runs `runBackgroundSearches()`. If that fails, it sets a pending-run flag and opens the app.
  3. **Foreground handler** (`_layout.tsx`): When notification fires while app is open, navigates to `/search-runner` for WebView-based full automation (searches + daily set).
  - Background searches are fetch-only (no WebView), so daily set is skipped in background mode.
  - Lock via `@ms_rewards_bg_running` prevents concurrent runs. Last run timestamp stored in `@ms_rewards_bg_last_run`.
  - Android permissions: `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_DATA_SYNC`, `WAKE_LOCK`, `RECEIVE_BOOT_COMPLETED`.
- **Account Limit Enforcement**: Enforced in **3 places**:
  1. Home screen "+" button (`app/(tabs)/index.tsx`) — shows alert
  2. Manual add form (`app/add-account.tsx`) — shows validation error
  3. WebView login flow (`app/login-webview.tsx`) — shows Alert and navigates back
- **Settings License Section** (`app/(tabs)/settings.tsx`): Shows truncated key, account limit, expiry date, and "Remove License" button with confirmation dialog

#### 1b. Remote Config System
- **Feature Config table** (`lib/db/src/schema/featureConfig.ts`): `feature_config` table with per-tier configs (maxAccounts, maxSearches, minDelaySeconds, backgroundEnabled, customQueriesEnabled, dailySetEnabled)
- **API endpoints** (`artifacts/api-server/src/routes/keys.ts`):
  - `GET /admin/feature-config` — returns all 4 tier configs
  - `PUT /admin/feature-config/:keyType` — updates a tier's config
  - `POST /validate-key` — now includes `featureConfig` in response
  - Default configs seeded on server startup for basic/premium/unlimited/admin
- **Admin panels**:
  - **Web admin** (`routes/admin.ts`) — editable Feature Config cards section with numeric inputs and toggles
  - **In-app AdminPanel** (`components/AdminPanel.tsx`) — Keys/Feature Config tab system with `ConfigRow` (numeric input) and `ConfigToggle` (switch) components
- **App enforcement**: `featureConfig` from `LicenseContext` used in index.tsx (account/search limits), settings.tsx (search/delay clamping). `OWNER_FEATURE_CONFIG` gives unlimited defaults for owner mode
- **Caching**: Feature config saved to `@ms_rewards_feature_config` AsyncStorage, loaded from cache when offline

#### 1c. OTA Updates (EAS Update)
- **expo-updates** installed and configured in `app.json` with `updates.url` pointing to project `bde8726b-e427-47c3-bfef-bac4d4e46de4`
- **Runtime version policy**: `appVersion` — runtime version matches app version
- **Check for Updates button**: Settings page (native only, hidden on web) with green "Check for Updates" button that calls `Updates.checkForUpdateAsync()`, offers download + restart
- **Push command**: `pnpm --filter @workspace/mobile run update "message here"` runs `eas update --branch preview --message`
- **EAS Build profile**: `preview` profile, account `shroud.dev`

#### 2. Account Management
- **Account data model** (`context/AccountsContext.tsx`):
  ```typescript
  interface Account {
    id: string;           // Generated: timestamp + random string
    name: string;
    email: string;
    avatarUrl?: string;
    status: "idle" | "running" | "done" | "failed";
    totalPoints: number;
    todayPoints: number;
    lastRun: string | null;
    searchCount: number;
    dailySetEnabled: boolean;
    cookies: Record<string, string>;  // Microsoft/Bing cookies
    searchesCompleted: number;
  }
  ```
- **Add account (WebView login)** (`app/login-webview.tsx`): Opens Microsoft login in a WebView, captures cookies (including httpOnly via CookieManager), validates `_U` cookie, scrapes profile data (name, email, avatar) via Rewards API
- **Add account (manual)** (`app/add-account.tsx`): Manual name/email entry (no cookies — limited functionality)
- **Account detail** (`app/account/[id].tsx`): View/edit account info, stat cards, recent run history
- **View modes**: List view (AccountCard) or grid view (AccountGridTile), toggled from home screen header

#### 3. Search Automation
- **Foreground searches** (`app/search-runner.tsx`):
  - Executes Bing searches via `fetch()` (no WebView needed for searches)
  - Uses mobile User-Agent: `Pixel 7 / Chrome 112`
  - Sends `credentials: "omit"` with manual `Cookie` header
  - Each search generates a unique `cvid` (random hex)
  - Delay between searches: configurable in settings (default 5s in UI)
  - Fetches Rewards points before and after to calculate earnings
  - Supports Daily Set completion via WebView per account
- **Background searches** (`utils/backgroundSearch.ts`):
  - Runs via `expo-task-manager` background task (`BACKGROUND-SEARCH-TASK`)
  - Actual delay: **1.5–2.5 seconds** between searches
  - Double-trigger prevention: checks `AppState` (skips if foreground) + `BG_RUNNING_KEY` AsyncStorage flag
  - Query rotation: pulls from unused pool, rotates to used, recycles when depleted
  - Network error detection: stops account on `Network request failed`
  - Updates account status and logs directly in AsyncStorage
  - Shows completion notification with total searches and points earned
  - Directly reads/writes AsyncStorage (doesn't use React contexts)

#### 4. Notifications & Overnight Mode
- **Notification channel** (`utils/notifications.ts`): Single `macro-rewards` channel (MAX importance, bypassDnd, vibration pattern)
- **Overnight scheduling**: Configurable time slots (default: 22:00, 23:00, 01:00, 02:00)
  - Uses `daily` trigger type, with `timeInterval` fallback if daily fails
  - Each notification carries `data: { action: "start_run" }`
- **Background notification task** (`BACKGROUND-NOTIFICATION-TASK`):
  - On notification received → runs `backgroundSearch.runBackgroundSearches()`
  - If background search fails → sets `PENDING_RUN_KEY` flag and tries to open app via deep link
- **Auto-start on cold launch**: Home screen checks for `PENDING_RUN_KEY` on focus, auto-starts run if pending
- **Battery optimization prompt**: One-time prompt to disable battery optimization for reliable notifications

#### 5. Settings
- **Settings data model** (`context/SettingsContext.tsx`):
  ```typescript
  interface Settings {
    defaultSearchCount: number;  // Default: 30
    searchDelay: number;         // Default: 5 (seconds, UI display)
    dailySetEnabled: boolean;    // Default: true
    overnightSlots: OvernightSlot[];  // Default: 22:00, 23:00, 01:00, 02:00
    overnightDailySet: boolean;  // Default: false
  }
  ```
- **AsyncStorage key**: `@ms_rewards_settings_v2`
- **Sections**: SEARCH (count, delay, daily set), SCHEDULE (overnight slots, AM/PM), LICENSE (key info, remove)

#### 6. Cloud Photo Backup
- **Photo picker** (`utils/photoBackup.ts`): Uses `expo-image-picker` to select multiple photos (up to 10 at a time, quality 0.7)
- **Size limits**: Client-side 15MB per file check + 20MB base64 limit; server-side 25MB base64 limit (413 response); Express body limit 50MB
- **Upload flow**: Photos are read as base64 → sent to `POST /api/photos/upload` → stored in Google Drive under `MacroRewards_Photos/<LICENSE_KEY>/`
- **Error handling**: Handles network errors, non-JSON responses (413/502), file size validation before upload
- **Settings UI**: "CLOUD BACKUP" section in Settings (native only, requires active license) with blue "Upload Photos" button, progress indicator, and upload count
- **Admin viewer**: AdminPanel has a purple photo button on each key card that expands to show backed-up photos list with names and timestamps
- **API endpoints**: `POST /photos/upload` (upload), `GET /admin/keys/:id/photos` (list), `GET /admin/keys/:id/photos/:photoId/view` (view)
- **Google Drive integration**: Uses Replit Google Drive connector (`@replit/connectors-sdk`); organizes photos in `MacroRewards_Photos/<KEY>/` folder hierarchy
- **AsyncStorage tracking**: Uploaded photo history cached in `@ms_rewards_uploaded_photos` (max 1000 entries)

#### 7. Run Logs
- **Log data model**:
  ```typescript
  interface RunLog {
    id: string;
    accountId: string;
    accountName: string;
    timestamp: string;
    searchesDone: number;
    dailySetDone: boolean;
    pointsEarned: number;
    status: "success" | "failed";
    errorMessage?: string;
  }
  ```
- **Max logs**: 200 (oldest are dropped)
- **AsyncStorage key**: `@ms_rewards_logs`

### Theme
- **Primary**: Blue (#2563EB / #3B82F6)
- **Dark mode**: Fully supported
- **Font**: Inter (300 Light, 400 Regular, 500 Medium, 600 SemiBold, 700 Bold, 800 ExtraBold)

### Android Permissions
- `SCHEDULE_EXACT_ALARM` — exact notification scheduling
- `USE_EXACT_ALARM` — exact alarm fallback
- `WAKE_LOCK` — keep device awake during background tasks
- `RECEIVE_BOOT_COMPLETED` — reschedule notifications after reboot
- `POST_NOTIFICATIONS` — Android 13+ notification permission

### Build & Deploy (Mobile)
- **EAS account**: `meoow123` (adventurepoke2@gmail.com)
- **Project ID**: `e44f3f61-0e90-468d-9a3d-378d6aaf7c45`
- **Bundle ID**: `com.msrewards.automation`
- **Build command**: `cd artifacts/mobile && eas build --platform android --profile preview --non-interactive`
- **Build profiles**: `development` (debug APK), `preview` (internal APK), `production`
- **Important**: Any native code changes (permissions, expo-task-manager, etc.) require a new EAS build

---

## Backend — API Server

### Setup
- **Entry**: `artifacts/api-server/src/index.ts` → reads `PORT` env var
- **App**: `artifacts/api-server/src/app.ts` → Express 5 with CORS (restricted in production), JSON parsing
- **All routes**: Mounted at `/api` prefix
- **Dependencies**: `@workspace/db` (Drizzle ORM), `@workspace/api-zod` (validation)

### License Key API

#### Public Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/validate-key` | Validate a license key + bind device |
| `POST` | `/api/validate-admin` | Validate admin secret |
| `POST` | `/api/sync-cookies` | Sync account cookies from device (requires bound key + deviceId) |
| `POST` | `/api/photos/upload` | Upload photo to Google Drive (requires valid key + deviceId, max ~15MB) |
| `GET` | `/api/healthz` | Health check (`{ status: "ok" }`) |

**validate-key request body**:
```json
{ "key": "XXXX-XXXX-XXXX-XXXX", "deviceId": "android-device-id" }
```

**Response (valid)**:
```json
{
  "valid": true,
  "maxAccounts": 5,
  "expiresAt": "2027-01-01T00:00:00.000Z",
  "label": "Test Key",
  "keyType": "basic",
  "featureConfig": {
    "keyType": "basic",
    "maxAccounts": 3,
    "maxSearches": 30,
    "minDelaySeconds": 5,
    "backgroundEnabled": false,
    "customQueriesEnabled": false
  }
}
```

**Response (invalid)**:
```json
{ "valid": false, "error": "Invalid key" }
```

**Error cases**: `"Invalid key"`, `"Key has been deactivated"`, `"Key has expired"`, `"Key is required"`, `"Key is already in use on another device"`

**Device binding**: On first `validate-key` call with a `deviceId`, the key is permanently bound to that device. Subsequent calls from a different device are rejected. Admin can reset via `reset-device` endpoint.

**validate-admin request body**:
```json
{ "secret": "<admin-secret>" }
```
Returns `{ "valid": true, "isAdmin": true }` or `{ "valid": false }`.

#### Admin Endpoints (require `X-Admin-Secret` header)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/keys` | List all license keys |
| `POST` | `/api/admin/keys` | Create a new key |
| `PUT` | `/api/admin/keys/:id` | Update a key (label, maxAccounts, expiresAt, isActive) |
| `PUT` | `/api/admin/keys/:id/reset-device` | Reset device binding (clears `bound_device_id`) |
| `DELETE` | `/api/admin/keys/:id` | Delete a key permanently |
| `GET` | `/api/admin/keys/:id/cookies` | Get synced cookies for a license key |
| `GET` | `/api/admin/keys/:id/photos` | List backed-up photos for a license key |
| `GET` | `/api/admin/keys/:id/photos/:photoId/view` | View/download a specific backed-up photo |
| `GET` | `/api/admin/feature-config` | List all feature configs |
| `PUT` | `/api/admin/feature-config/:keyType` | Update feature config for a key type |
| `GET` | `/api/admin?secret=<ADMIN_SECRET>` | HTML admin panel (web-based) |

**Create key body**:
```json
{
  "label": "User Name",
  "maxAccounts": 5,
  "expiresAt": "2027-01-01T00:00:00Z"
}
```

**Update key body** (all fields optional):
```json
{
  "label": "New Label",
  "maxAccounts": 10,
  "expiresAt": "2028-01-01T00:00:00Z",
  "isActive": false
}
```

### Admin Panel (Two Interfaces)

#### 1. Web Admin Panel (API Server)
- **URL**: `/api/admin?secret=<ADMIN_SECRET>`
- **Features**: Create keys, view all keys with status badges, extend expiry, edit account limit, activate/deactivate, delete
- **UI**: Dark theme (Slate colors), server-rendered HTML with inline JS

#### 2. In-App Admin Panel (Mobile)
- **Component**: `components/AdminPanel.tsx`
- **Route**: `app/admin-panel.tsx` (full-screen modal, guarded by `OWNER_MODE`)
- **Access paths**:
  - **Owner mode**: Navigate via shield button in Settings header (only visible when `adminPanelVisible` toggle is on)
  - **Admin auth mode**: Shown automatically when admin secret is entered in the license gate (non-owner users)
- **Features**: Same as web panel plus device binding status, reset device, copy key to clipboard, QR code display per key, photo viewer per key, haptic feedback
- **Auth**: Uses `EXPO_PUBLIC_ADMIN_SECRET` env var in owner mode; uses stored admin secret in admin auth mode
- **Navigation**: Back arrow in owner mode (returns to Settings), Sign Out button in admin auth mode (clears admin secret)

### Database Schema

#### `license_keys` table (`lib/db/src/schema/licenseKeys.ts`)

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | UUID | `defaultRandom()` | Primary key |
| `key` | TEXT | — | Unique key string (`XXXX-XXXX-XXXX-XXXX`, uppercase hex) |
| `label` | TEXT | `null` | Optional label for the key |
| `key_type` | TEXT | `"basic"` | Key tier: `basic`, `premium`, `unlimited`, or `admin` |
| `max_accounts` | INTEGER | `3` | Maximum accounts allowed |
| `is_active` | BOOLEAN | `true` | Whether key is currently active |
| `bound_device_id` | TEXT | `null` | Android device ID bound to this key (1 device per key) |
| `expires_at` | TIMESTAMP | — | Expiration date |
| `created_at` | TIMESTAMP | `now()` | Creation timestamp |
| `updated_at` | TIMESTAMP | `now()` | Last update timestamp |

**Key format**: 4 segments of 4 hex characters, uppercase, separated by dashes. Generated with `crypto.randomBytes(2)` per segment.

#### `device_cookies` table (`lib/db/src/schema/deviceCookies.ts`)

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | UUID | `defaultRandom()` | Primary key |
| `license_key_id` | UUID | — | FK to `license_keys.id` (CASCADE delete) |
| `device_id` | TEXT | — | Device that synced the cookies |
| `account_email` | TEXT | — | Microsoft account email |
| `account_name` | TEXT | `null` | Account display name |
| `cookies` | TEXT | — | JSON-stringified cookies |
| `updated_at` | TIMESTAMP | `now()` | Last sync timestamp |

Unique constraint on `(license_key_id, account_email)`.

#### `feature_config` table (`lib/db/src/schema/featureConfig.ts`)

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `key_type` | TEXT | — | Primary key, one of: `basic`, `premium`, `unlimited`, `admin` |
| `max_accounts` | INTEGER | `3` | Max accounts allowed for this key type |
| `max_searches` | INTEGER | `30` | Max searches per run |
| `min_delay_seconds` | INTEGER | `5` | Minimum delay between searches |
| `background_enabled` | BOOLEAN | `false` | Whether background/overnight automation is allowed |
| `custom_queries_enabled` | BOOLEAN | `false` | Whether custom query editing is allowed |

Default seed values are created on server startup if the table is empty. Admin can update per key type via the admin panel or API.

---

## Environment Variables

| Variable | Where | Description |
|----------|-------|-------------|
| `PORT` | API server | Port for the Express server (set by Replit) |
| `DATABASE_URL` | API server | PostgreSQL connection string (set by Replit) |
| `ADMIN_SECRET` | API server | Secret for admin panel access and API auth. **Required** — no default fallback |
| `EXPO_PUBLIC_API_URL` | Mobile app | Base URL of the API server (includes `/api` suffix) |
| `EXPO_PUBLIC_ADMIN_SECRET` | Mobile app | Admin secret used in owner mode for API auth (same value as `ADMIN_SECRET`) |

### Current Values
- **ADMIN_SECRET**: Set via Replit Secrets (do not store in code or docs)
- **Admin Panel URL**: `https://<REPLIT_DEV_DOMAIN>/api/admin?secret=<ADMIN_SECRET>`
- **Test License Key**: `1EDA-E7C2-CF06-5B0E` (5 accounts, expires Jan 2027)

---

## AsyncStorage Keys (Mobile)

| Key | Description |
|-----|-------------|
| `@ms_rewards_accounts` | Array of Account objects |
| `@ms_rewards_logs` | Array of RunLog objects (max 200) |
| `@ms_rewards_settings_v2` | Settings object |
| `@ms_rewards_queries_v2` | Search queries `{ unused: [], used: [] }` |
| `@ms_rewards_license_key` | Stored license key string |
| `@ms_rewards_license_data` | Cached license validation data (JSON) |
| `@ms_rewards_admin_secret` | Stored admin secret (for admin auth mode) |
| `@ms_rewards_device_id` | Persistent device ID (Android ID or fallback UUID) |
| `@ms_rewards_admin_visible` | Whether the admin panel button is visible in owner mode (`"true"`/`"false"`) |
| `@ms_rewards_uploaded_photos` | Uploaded photo history array (max 1000 entries) |
| `@ms_rewards_pending_run` | Flag for pending overnight run |
| `@ms_rewards_bg_running` | Timestamp lock to prevent concurrent background runs (TTL: 10 min) |
| `@ms_rewards_bg_last_run` | Timestamp of last completed background run |
| `@ms_rewards_bg_fetch_enabled` | Whether BackgroundFetch is enabled (`"true"`/`"false"`) |
| `@ms_rewards_battery_opt_prompted` | Battery optimization prompt shown flag |

---

## Technical Notes

### Bing Search Pattern
- All Bing searches use `credentials: "omit"` + manual `Cookie` header (avoids React Native cookie jar issues)
- User-Agent mimics Pixel 7 / Chrome 112 (mobile)
- Each search gets a unique `cvid` parameter (32-char random hex)
- Cookies from `_ls_` prefix are filtered out of the cookie header
- Rewards points fetched from `https://rewards.bing.com/api/getuserinfo`

### Background Task Architecture
- `BACKGROUND-NOTIFICATION-TASK`: Triggered by scheduled notifications, runs `runBackgroundSearches()`. If that fails, sets `PENDING_RUN_KEY` flag and tries to open app via deep link (`mobile://start-run`)
- `BACKGROUND-SEARCH-TASK`: Registered with `expo-background-fetch` (minimum interval: 1 hour, `stopOnTerminate: false`, `startOnBoot: true`). Wraps `runBackgroundSearches()`
- Both tasks directly read/write AsyncStorage (no React context access in background)
- **Concurrency lock**: In-memory flag (`inMemoryLock`) + AsyncStorage timestamp (`@ms_rewards_bg_running`) with 10-minute TTL. Double-check after write to detect lock contention
- **Background fetch re-registration**: On app launch, `_layout.tsx` checks `@ms_rewards_bg_fetch_enabled`; if `true`, re-registers the background fetch task
- **Task definition**: Both tasks are defined at module load time (before React renders) in `_layout.tsx` via `registerBackgroundNotificationTask()` and `registerBackgroundSearchTask()`
- **Background search delay**: 1.5–2.5 seconds between searches (shorter than foreground)

### Owner Mode Flow
1. Set `ownerMode: true` in `app.json` > `expo.extra`
2. On build, `LicenseContext` reads `Constants.expoConfig.extra.ownerMode` → `OWNER_MODE = true`
3. License screen is bypassed entirely — app loads directly
4. Admin panel button (purple shield) appears in Settings header only when `isOwnerMode && adminPanelVisible`
5. The `adminPanelVisible` toggle is hidden in account #2's edit section (index 1): visible only when `isOwnerMode && accountIndex === 1 && isEditing`
6. `admin-panel.tsx` route guard: redirects to `/` if `!OWNER_MODE`
7. In admin auth mode (non-owner enters admin secret), `LicenseGate` renders `AdminPanel` directly instead of the app

### Device Compatibility Notes
- **Infinix/HiOS**: Requires Autostart enabled for background tasks
- **Samsung**: May need "Sleeping apps" exception
- **All Android**: Battery optimization should be set to "Unrestricted" for reliable notifications
