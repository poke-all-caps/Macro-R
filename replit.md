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
│   │           ├── keys.ts   # License key CRUD + validate-key endpoint
│   │           └── admin.ts  # HTML admin panel for license management
│   └── mobile/               # Expo React Native app
│       ├── app/
│       │   ├── _layout.tsx           # Root layout with all providers
│       │   ├── (tabs)/
│       │   │   ├── _layout.tsx       # Tab bar layout
│       │   │   ├── index.tsx         # Home — accounts list/grid
│       │   │   ├── logs.tsx          # Run logs history
│       │   │   ├── queries.tsx       # Search queries management
│       │   │   └── settings.tsx      # App settings + license info
│       │   ├── account/[id].tsx      # Account detail modal
│       │   ├── add-account.tsx       # Manual account add form
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
│           └── notifications.ts     # Notification scheduling + channels
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
- **LicenseGate** (`components/LicenseGate.tsx`): Full-screen lock screen shown when no valid license is active. Displays a key icon, text input for keys, and an Activate button. Detects admin secret vs regular license key automatically.
- **LicenseContext** (`context/LicenseContext.tsx`):
  - Validates keys against the API at `EXPO_PUBLIC_API_URL/api/validate-key`
  - Also checks admin secret via `EXPO_PUBLIC_API_URL/api/validate-admin`
  - If admin secret is entered → `isAdmin=true`, shows AdminPanel instead of regular app
  - If regular license key is entered → `isAdmin=false`, shows regular app
  - Caches validated license data in AsyncStorage for **24 hours**
  - Falls back to cached data when offline (if license hasn't expired)
  - Stores: `key`, `maxAccounts`, `expiresAt`, `label`, `validatedAt`
  - AsyncStorage keys: `@ms_rewards_license_key`, `@ms_rewards_license_data`, `@ms_rewards_admin_secret`
- **AdminPanel** (`components/AdminPanel.tsx`): Full native admin panel shown when admin secret is entered. Allows creating keys, extending expiry, editing account limits, activating/deactivating, deleting, copying keys to clipboard, and resetting device bindings. Sign out button returns to license entry screen.
- **Device Locking**: Each key is bound to 1 device only. The first device to activate a key gets bound; other devices are rejected with "Key is already in use on another device". Admin can reset device binding from the admin panel. Device ID is Android ID on Android, or a persistent UUID stored in AsyncStorage. Schema column: `bound_device_id` on `license_keys` table.
- **Account Limit Enforcement**: Enforced in **3 places**:
  1. Home screen "+" button (`app/(tabs)/index.tsx`) — shows alert
  2. Manual add form (`app/add-account.tsx`) — shows validation error
  3. WebView login flow (`app/login-webview.tsx`) — shows Alert and navigates back
- **Settings License Section** (`app/(tabs)/settings.tsx`): Shows truncated key, account limit, expiry date, and "Remove License" button with confirmation dialog

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

#### 6. Run Logs
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
- **EAS account**: `shroud.dev`
- **Project ID**: `bde8726b-e427-47c3-bfef-bac4d4e46de4`
- **Bundle ID**: `com.msrewards.automation`
- **Build command**: `cd artifacts/mobile && eas build --platform android --profile preview --non-interactive`
- **Build profiles**: `development` (debug APK), `preview` (internal APK), `production`
- **Important**: Any native code changes (permissions, expo-task-manager, etc.) require a new EAS build

---

## Backend — API Server

### Setup
- **Entry**: `artifacts/api-server/src/index.ts` → reads `PORT` env var
- **App**: `artifacts/api-server/src/app.ts` → Express 5 with cors, JSON parsing
- **All routes**: Mounted at `/api` prefix
- **Dependencies**: `@workspace/db` (Drizzle ORM), `@workspace/api-zod` (validation)

### License Key API

#### Public Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/validate-key` | Validate a license key |

**Request body**:
```json
{ "key": "XXXX-XXXX-XXXX-XXXX" }
```

**Response (valid)**:
```json
{
  "valid": true,
  "maxAccounts": 5,
  "expiresAt": "2027-01-01T00:00:00.000Z",
  "label": "Test Key"
}
```

**Response (invalid)**:
```json
{ "valid": false, "error": "Invalid key" }
```

**Error cases**: `"Invalid key"`, `"Key has been deactivated"`, `"Key has expired"`, `"Key is required"`

#### Admin Endpoints (require `X-Admin-Secret` header)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/keys` | List all license keys |
| `POST` | `/api/admin/keys` | Create a new key |
| `PUT` | `/api/admin/keys/:id` | Update a key |
| `DELETE` | `/api/admin/keys/:id` | Delete a key permanently |
| `GET` | `/api/admin?secret=<ADMIN_SECRET>` | HTML admin panel |

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

### Admin Panel
- **URL**: `/api/admin?secret=<ADMIN_SECRET>`
- **Features**:
  - Create new keys with label, max accounts, expiry days
  - View all keys with status badges (active/expired/inactive)
  - Extend key expiry by 30 days
  - Edit account limit per key
  - Activate/deactivate keys
  - Delete keys permanently
- **UI**: Dark theme (Slate color palette), responsive grid layout

### Database Schema

#### `license_keys` table (`lib/db/src/schema/licenseKeys.ts`)

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | UUID | `defaultRandom()` | Primary key |
| `key` | TEXT | — | Unique key string (`XXXX-XXXX-XXXX-XXXX`, uppercase hex) |
| `label` | TEXT | `null` | Optional label for the key |
| `max_accounts` | INTEGER | `3` | Maximum accounts allowed |
| `is_active` | BOOLEAN | `true` | Whether key is currently active |
| `expires_at` | TIMESTAMP | — | Expiration date |
| `created_at` | TIMESTAMP | `now()` | Creation timestamp |
| `updated_at` | TIMESTAMP | `now()` | Last update timestamp |

**Key format**: 4 segments of 4 hex characters, uppercase, separated by dashes. Generated with `crypto.randomBytes(2)` per segment.

---

## Environment Variables

| Variable | Where | Description |
|----------|-------|-------------|
| `PORT` | API server | Port for the Express server (set by Replit) |
| `DATABASE_URL` | API server | PostgreSQL connection string (set by Replit) |
| `ADMIN_SECRET` | API server | Secret for admin panel access and API auth. **Required** — no default fallback |
| `EXPO_PUBLIC_API_URL` | Mobile app | Base URL of the API server for license validation |

### Current Values
- **ADMIN_SECRET**: `5a3c08fc5bb635040ec2db32d5634203f50fc8c2ed599551`
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
| `@ms_rewards_pending_run` | Flag for pending overnight run |
| `@ms_rewards_bg_running` | Flag to prevent double background runs |
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
- `BACKGROUND-NOTIFICATION-TASK`: Triggered by scheduled notifications, runs `runBackgroundSearches()`
- `BACKGROUND-SEARCH-TASK`: Defined for expo-task-manager, wraps `runBackgroundSearches()`
- Both tasks directly read/write AsyncStorage (no React context access in background)
- Foreground detection: `AppState.currentState === "active"` — skips background run if app is visible

### Device Compatibility Notes
- **Infinix/HiOS**: Requires Autostart enabled for background tasks
- **Samsung**: May need "Sleeping apps" exception
- **All Android**: Battery optimization should be set to "Unrestricted" for reliable notifications
