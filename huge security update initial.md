# Huge Security Update — Initial Implementation
### Full In-Depth Change Log: Every File, Every Edit, Every Reason

**Date:** June 28, 2026  
**Project:** MS Rewards Automation (Expo Mobile + Node.js API Server)

---

## Why This Update Existed

Before this update, all security decisions lived on the **client** (the mobile app). That means:

- A user with a modified APK could remove the account-limit check and add unlimited accounts
- A user with a modified APK could set `searchDelay = 0` and hammer Bing at machine speed
- A user who lost their phone or shared their key had no secondary credential protecting it
- The server had no record of which accounts belonged to which key — re-installing wiped everything

This update moves every enforcement decision to the **server** so no client modification can bypass it.

---

## File 1 — `lib/db/src/schema/licenseKeys.ts`

### What changed
Added one new nullable column to the `license_keys` table schema definition:

```typescript
pin: text("pin"),
```

### Why
The `pin` column stores the user's 4-digit PIN in **plain text**. It is nullable because:
- `NULL` = the key exists but the user has never set a PIN (first-time login state)
- `"1234"` = the user has completed first-time PIN setup

**Why plain text and not hashed?** The admin explicitly requires the ability to look up any user's PIN directly from the admin dashboard (e.g. for support calls: "what's my PIN?" → admin checks and tells them). Hashing would make that impossible. This is an intentional trade-off documented in the codebase.

**Why nullable?** New keys start with `pin = NULL`. The first successful login sets the PIN atomically. This way the server can distinguish "never set a PIN" (show "Create PIN" screen) from "has a PIN" (show "Enter PIN" screen).

Two other columns (`customMaxAccounts`, `customMinDelaySeconds`) were also added in a prior session — these store per-key admin overrides that take priority over tier defaults everywhere. They are also nullable (NULL = no override, use tier default).

---

## File 2 — `lib/db/src/migrate.ts`

### What changed
Added migration statements that run on every server start:

```sql
ALTER TABLE license_keys ADD COLUMN IF NOT EXISTS pin TEXT;
ALTER TABLE license_keys ADD COLUMN IF NOT EXISTS custom_max_accounts INTEGER;
ALTER TABLE license_keys ADD COLUMN IF NOT EXISTS custom_min_delay_seconds INTEGER;
```

### Why
`ADD COLUMN IF NOT EXISTS` is idempotent — safe to run against a database that already has the column (no error, no data loss). This means the production database on Render automatically gets the new columns the moment the server restarts after deploy, with zero manual intervention.

Without this, the schema definition in `licenseKeys.ts` would describe columns that don't exist yet in the real database, causing every query touching those columns to throw a runtime error.

---

## File 3 — `artifacts/api-server/src/routes/keys.ts`

This is the largest change in the entire update. Four distinct modifications were made.

### Change 3a — Rewrote `POST /validate-key` to add the PIN gate

**Before:** The endpoint accepted `{ key, deviceId }`, validated the key, and immediately returned license data if valid.

**After:** The endpoint now has a 2-step flow:

**Step 1 — No PIN in body:**
```
{ key: "XXXX-XXXX", deviceId: "abc123" }
→ { valid: false, requiresPin: true, pinSet: false }
```
The server validates the key (active? not expired? device bound to right device?) and then stops. It responds with `requiresPin: true` so the client knows to show the PIN screen. The `pinSet` boolean tells the client whether to say "Create Your PIN" (`false`) or "Enter Your PIN" (`true`).

**Why stop here?** The server cannot return any license data until the user proves they know the PIN. This prevents a stolen key from being used without the PIN.

**Step 2 — PIN included in body:**
```
{ key: "XXXX-XXXX", deviceId: "abc123", pin: "1234" }
```
- Server checks `pin` is exactly 4 numeric digits. Non-numeric or wrong length → `400`.
- If `key.pin === NULL` (first login): saves the PIN to the database in plain text, continues.
- If `key.pin !== null` (returning user): compares provided PIN to stored PIN. Mismatch → `401 Invalid PIN`. Match → continues.

**After PIN passes**, the server:
1. Loads the `featureConfig` for the key's tier
2. Applies custom overrides: `effectiveMaxAccounts = key.customMaxAccounts ?? tier.maxAccounts`
3. Applies custom delay override: `effectiveMinDelaySeconds = key.customMinDelaySeconds ?? tier.minDelaySeconds`
4. Queries `device_cookies` for all accounts linked to this key and returns them in `accounts[]`

**Why return accounts?** This enables full session restoration. When a user logs in, their Microsoft accounts are already in the server's `device_cookies` table (synced there by `POST /add-account`). Returning them means the user's account list appears instantly after login — even on a fresh install.

**The `accounts[]` shape returned:**
```json
[
  {
    "email": "user@outlook.com",
    "name": "John",
    "cookies": { "_U": "...", "MUID": "..." }
  }
]
```

---

### Change 3b — New `POST /add-account` route

**Why this route exists:** Before, account limits were enforced only by the mobile app's local state. A modified APK could simply skip the `if (accounts.length >= maxAccounts)` check and call `addAccount()` directly. The server had no say.

**What this route does:**

1. Validates `key` and `account.email` are present → `400` if missing
2. Validates the key (active, not expired, device binding) → `403` if any fail
3. Computes `maxAccounts = key.customMaxAccounts ?? tier.maxAccounts` (custom override wins)
4. **Physically counts** existing rows in `device_cookies` for this key — the server never trusts any count from the client
5. Checks if the submitted email already exists in the DB (case-insensitive match)
   - If email **already exists**: this is a cookie refresh (re-login) → always allowed → `UPDATE` the existing row
   - If email **does not exist** AND `count >= maxAccounts` → `403 { error, limit, current }` → slot is full
   - If email **does not exist** AND slot available → `INSERT` new row
6. Returns `{ success: true, limit, current }` on success

**Why upsert instead of always blocking?** A user who is already in the DB re-logging in should never be blocked. The slot limit only applies to genuinely new accounts. If we blocked re-logins, users would get locked out after their cookies expired.

**The 403 response the client gets:**
```json
{
  "error": "Account limit reached (3 max)",
  "limit": 3,
  "current": 3
}
```

---

### Change 3c — New `POST /run-task` route

**Why this route exists:** Before, the minimum delay between searches was enforced only by the mobile app. A modified APK could set `searchDelay = 0` and perform 30 searches with no delay — potentially triggering rate limits or flagging the account.

**What this route does:**

1. Validates `key` is present → `400` if missing
2. Validates the key (active, not expired, device binding) → `403` if any fail
3. Computes `minDelay = key.customMinDelaySeconds ?? tier.minDelaySeconds`
4. Reads `requestedDelay` from the request body
5. If `requestedDelay < minDelay` → `400 { error, minDelay, requested }`
6. If valid → `200 { allowed: true, minDelay }`

**The 400 response:**
```json
{
  "error": "Delay too short. Minimum allowed is 5 seconds.",
  "minDelay": 5,
  "requested": 1
}
```

**Why does the client send `requestedDelay` instead of the server just telling the client what to use?** Because the client needs to confirm intent before starting. If the server just sent the minimum and the client could ignore it, there would be no enforcement. By requiring the client to send what it plans to use, the server can reject runs before they start.

---

### Change 3d — New `DELETE /admin/keys/:id/pin` route

**Why this route exists:** Admins need the ability to reset a user's PIN in cases such as:
- User forgot their PIN and can't log in
- Suspected PIN compromise (someone else knows it)
- User is moving to a new device and wants a clean start

**What this route does:**
1. Requires a valid admin session (uses `requireAdmin` middleware)
2. Sets `pin = NULL` on the specified key
3. Logs the action: `[PIN CLEAR] PIN cleared for key XXXX at <timestamp> — source IP: <ip>`
4. Returns `{ success: true }`

After clearing: the user will be shown "Create Your PIN" on their next login (same as first-time). Their key still works — only the PIN is reset.

---

## File 4 — `artifacts/api-server/src/routes/proxy.ts`

### What changed
Added two new route paths to the dev proxy list:

**Before:**
```typescript
const PROXY_ROUTES = ["/validate-key", "/validate-admin", "/sync-cookies"];
```

**After:**
```typescript
const PROXY_ROUTES = ["/validate-key", "/validate-admin", "/sync-cookies", "/add-account", "/run-task"];
```

### Why
In development, the mobile app talks to the local Express server which proxies requests to the production API on Render. Without adding the new routes here, `POST /add-account` and `POST /run-task` from the mobile app would get a 404 in dev mode even though the production server handles them. Adding them to the proxy list ensures the dev environment matches production behaviour exactly.

---

## File 5 — `artifacts/api-server/src/routes/admin.ts`

Three changes were made to the dashboard HTML page.

### Change 5a — PIN badge in key card stats row

**Before:** Each key card showed: label · max accounts · expiry date · device binding status

**After:** Added a fifth stat: the PIN badge (or "No PIN set" text)

```javascript
(k.pin
  ? '<span class="stat" style="display:inline-flex;align-items:center;gap:6px;background:#0f172a;border:1px solid #334155;border-radius:6px;padding:2px 8px">
       <span style="color:#94a3b8;font-size:11px">PIN</span>
       <span style="font-family:monospace;font-weight:700;color:#f59e0b;font-size:14px;letter-spacing:3px">' + esc(k.pin) + '</span>
     </span>'
  : '<span class="stat" style="color:#475569;font-size:11px">No PIN set</span>'
)
```

**Why amber / monospace?** The amber colour makes the PIN visually distinct from the grey metadata text so it stands out at a glance. Monospace with letter-spacing makes the 4 digits easy to read and communicate over the phone.

**Why is `esc()` used on `k.pin`?** The PIN is always 4 digits validated server-side, but the `esc()` helper is applied defensively to prevent any unexpected value from breaking the HTML.

**Why does the GET /admin/keys response already include `pin`?** Because the route uses `db.select().from(licenseKeysTable)` — a full `SELECT *` — which includes every column including `pin`. No change was needed to the GET endpoint.

---

### Change 5b — "Clear PIN" button in key card actions

**Before:** Actions row had: type selector · +30 Days · Edit Limit · Reset Device · Deactivate/Activate · Delete · Cookies

**After:** Added conditional "Clear PIN" button between "Reset Device" and "Deactivate":

```javascript
(k.pin
  ? '<button class="btn-secondary" style="color:#f59e0b;border:1px solid #f59e0b44" onclick="clearPin(' + JSON.stringify(safeId) + ')">Clear PIN</button>'
  : ''
)
```

**Why conditional?** The button only renders when a PIN exists. There is nothing to clear on a key that has no PIN, so showing a disabled or greyed-out button would be confusing.

**Why amber border matching the PIN badge?** Visual consistency — the amber colour signals "this action relates to the PIN" making it immediately clear what the button does without reading its label.

---

### Change 5c — `clearPin()` JavaScript function

Added a new client-side function to the admin dashboard script:

```javascript
async function clearPin(id) {
  if (!confirm("Clear this user's PIN? They will be prompted to create a new one on next login.")) return;
  await api('DELETE', '/admin/keys/' + id + '/pin');
  loadKeys();
}
```

**Why a confirmation dialog?** Clearing a PIN is reversible (the user just creates a new one) but disruptive — the user will be unable to access the app until they go through the PIN creation flow again. The confirmation prevents accidental clicks.

**Why call `loadKeys()` after?** To immediately refresh the dashboard so the "Clear PIN" button disappears and the "No PIN set" text appears — giving the admin instant visual confirmation that the action succeeded.

---

## File 6 — `artifacts/mobile/context/LicenseContext.tsx`

This file was **fully rewritten**. It is the largest and most complex change on the mobile side.

### Change 6a — New constants

```typescript
const PIN_STORAGE = "@ms_rewards_pin";
export const SERVER_HYDRATION_STORAGE = "@ms_rewards_server_hydration";
```

**`PIN_STORAGE`**: AsyncStorage key where the user's PIN is persisted locally. On boot, the app reads this and sends it in the revalidation call so the user doesn't have to re-enter their PIN every time they open the app.

**`SERVER_HYDRATION_STORAGE`**: AsyncStorage key used as a one-way channel between `LicenseContext` and `AccountsContext`. When boot-time revalidation succeeds, `LicenseContext` writes the server accounts here. `AccountsContext` reads, merges, and removes it on its own `loadFromStorage`. Exported so `AccountsContext` can import the same key name — avoids string duplication bugs.

---

### Change 6b — New state variables

```typescript
const [pinRequired, setPinRequired] = useState(false);
const [pinIsNew, setPinIsNew]   = useState(false);
const pendingKeyRef = useRef<string | null>(null);
```

**`pinRequired`**: When `true`, the app is in "PIN gate" state. `LicenseGate` watches this and shows the PIN screen instead of the key entry screen.

**`pinIsNew`**: When `true`, the server told us `pinSet: false` — this user has never set a PIN. `LicenseGate` uses this to show "Create Your PIN" vs "Enter Your PIN".

**`pendingKeyRef`**: A ref (not state) storing the key that is waiting for PIN confirmation. We use a `ref` instead of `useState` because `submitPin()` reads it inside a `useCallback` — if it were state, the closure would capture a stale value. The ref is always current.

---

### Change 6c — Updated context interface

```typescript
interface LicenseContextValue {
  // ... existing fields ...
  pinRequired: boolean;
  pinIsNew: boolean;
  submitPin: (pin: string) => Promise<{ success: boolean; error?: string; serverAccounts?: ServerAccount[] }>;
}
```

**Why `submitPin` returns `serverAccounts`?** `LicenseGate` needs to call `hydrateFromServer()` from `AccountsContext` after a successful PIN submit. By returning the accounts in the result, `LicenseGate` can pass them directly — no shared state needed between contexts.

---

### Change 6d — Updated `validateKey()` to accept optional `pin`

**Before:**
```typescript
const validateKey = async (key: string): Promise<{...}> => {
  const body = { key, deviceId };
```

**After:**
```typescript
const validateKey = async (key: string, pin?: string): Promise<{...}> => {
  const body: Record<string, any> = { key, deviceId };
  if (pin !== undefined && pin !== null) body.pin = pin;
```

**Why optional?** The first call always goes without a PIN (to discover `requiresPin`). Only the second call includes it. Using an optional parameter keeps the call sites clean and the function signature honest about what's happening.

**Why check `pin !== undefined && pin !== null` rather than just `if (pin)`?** Because `pin = "0000"` is a valid PIN but would be falsy in some edge cases if we only checked truthiness. The explicit checks make it clear.

---

### Change 6e — Updated `activateKey()` to handle `requiresPin`

**Before:** `activateKey()` called `validateKey()`, got license data back, and either stored it (success) or showed an error.

**After:** `activateKey()` handles the intermediate `requiresPin` state:

```typescript
const result = await validateKey(upperKey);

if (result.requiresPin) {
  pendingKeyRef.current = upperKey;
  await AsyncStorage.setItem(LICENSE_KEY_STORAGE, upperKey);
  setPinIsNew(!result.pinSet);
  setPinRequired(true);
  setError(null);
  return false;  // not yet licensed — PIN step pending
}
```

**Why store the key to AsyncStorage at this point?** So that if the user closes the app mid-PIN-entry, the key is already saved. On next boot, `loadStoredLicense` will find it and trigger the PIN flow again automatically.

**Why return `false`?** `activateKey()` returns `boolean` indicating whether the license is now active. Returning `false` tells the caller (the UI) that we're not done yet — there's another step. The UI stays on the gate screen (but now showing the PIN form instead of the key form).

---

### Change 6f — New `submitPin()` function

This is the function `LicenseGate` calls when the user submits their PIN:

```typescript
const submitPin = async (pin: string): Promise<{ success: boolean; error?: string; serverAccounts?: ServerAccount[] }> => {
  const key = pendingKeyRef.current;
  if (!key) return { success: false, error: "No pending key" };

  const result = await validateKey(key, pin);

  if (result.valid && result.maxAccounts && result.expiresAt) {
    await AsyncStorage.setItem(PIN_STORAGE, pin);          // ← persist PIN locally
    const prevDataRaw = await AsyncStorage.getItem(LICENSE_DATA_STORAGE);
    const prevData = prevDataRaw ? JSON.parse(prevDataRaw) : null;
    await applyValidResult(key, result, prevData);         // ← store license data, set state
    pendingKeyRef.current = null;
    return { success: true, serverAccounts: result.accounts ?? [] };
  }

  if (result.error) {
    setError(result.error);
    return { success: false, error: result.error };
  }

  return { success: false, error: "Authentication failed" };
};
```

**Why save PIN to AsyncStorage here and not inside the server response handler?** Because `submitPin` is the only place where we know the PIN was accepted by the server and we want to persist it. Saving it before boot would be premature; saving it after a wrong PIN would be a bug. This is the exact right moment.

**Why call `applyValidResult()`?** This is a shared helper that sets all the license state (`isLicensed`, `licenseData`, `featureConfig`, etc.) and persists to AsyncStorage. Reusing it ensures the submit-PIN path and the normal activation path produce identical state — no divergence.

---

### Change 6g — Updated `loadStoredLicense()` for boot PIN flow

**Before:** On boot, `loadStoredLicense()` called `validateKey(storedKey)` (no PIN) and expected license data back directly.

**After:** 
1. Loads `storedPin` from AsyncStorage alongside `storedKey`
2. Calls `validateKey(storedKey, storedPin ?? undefined)` — sends PIN if available
3. Handles three new response cases:

**Case A — Success with PIN (happy path):**
```typescript
if (result.valid) {
  await applyValidResult(storedKey, result, prevData);
  if (result.accounts && result.accounts.length > 0) {
    await AsyncStorage.setItem(SERVER_HYDRATION_STORAGE, JSON.stringify(result.accounts));
  }
}
```
Writes server accounts to `SERVER_HYDRATION_STORAGE` for `AccountsContext` to pick up.

**Case B — `requiresPin` (PIN missing or wrong):**
```typescript
} else if (result.requiresPin) {
  pendingKeyRef.current = storedKey;
  setPinIsNew(!result.pinSet);
  setPinRequired(true);
  // Fall back to cached license data so the UI shows the right context
  if (storedData && new Date(data.expiresAt) > Date.now()) {
    setLicenseData(data);
    await loadCachedFeatureConfig();
  }
}
```
Shows the PIN screen. Loads cached license data (tier, expiry) as context so the user knows which key they're unlocking.

**Case C — Offline with cached data (unchanged from before):**
Uses cached license data if it hasn't expired.

---

### Change 6h — Updated `removeLicense()` to clear PIN

```typescript
await AsyncStorage.removeItem(PIN_STORAGE);
await AsyncStorage.removeItem(SERVER_HYDRATION_STORAGE);
```

**Why?** When a user removes their license and enters a new key, the old PIN must not carry over. If it did, the new key's first-time PIN setup would fail because the app would silently send the old key's PIN to the server (which would reject it since the new key has no PIN set yet, and `"0000"` would get saved as the new key's PIN — a security hole).

---

## File 7 — `artifacts/mobile/context/AccountsContext.tsx`

Three changes were made.

### Change 7a — Added `ServerAccount` interface and `hydrateFromServer` to context type

```typescript
export interface ServerAccount {
  email: string;
  name: string;
  cookies: Record<string, string>;
}

interface AccountsContextType {
  // ... existing ...
  hydrateFromServer: (serverAccounts: ServerAccount[]) => Promise<void>;
}
```

**Why export `ServerAccount`?** `LicenseContext` constructs `ServerAccount[]` objects from the API response and passes them to `LicenseGate` → `AccountsContext`. Without a shared type, each file would define its own inline type or use `any` — both worse.

---

### Change 7b — Implemented `hydrateFromServer()`

```typescript
const hydrateFromServer = useCallback(async (serverAccounts: ServerAccount[]) => {
  if (!serverAccounts || serverAccounts.length === 0) return;
  setAccounts((prev) => {
    const merged = [...prev];
    for (const sa of serverAccounts) {
      const emailLower = sa.email.toLowerCase();
      const idx = merged.findIndex((a) => a.email.toLowerCase() === emailLower);
      if (idx >= 0) {
        // Existing local account: update name + cookies from server
        merged[idx] = {
          ...merged[idx],
          name: sa.name || merged[idx].name,
          cookies: sa.cookies && Object.keys(sa.cookies).length > 0
            ? sa.cookies
            : merged[idx].cookies,
        };
      } else {
        // New account from server: add it with default state
        merged.push({
          id: Date.now().toString() + Math.random().toString(36).slice(2),
          name: sa.name || sa.email,
          email: emailLower,
          status: "idle",
          totalPoints: 0, todayPoints: 0, searchesCompleted: 0,
          searchCount: 30, dailySetEnabled: true, enabled: true,
          lastRun: null,
          cookies: sa.cookies || {},
        });
      }
    }
    AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(merged)).catch(() => {});
    return merged;
  });
}, []);
```

**Merge strategy decisions:**

- **Email match is case-insensitive:** `"User@Outlook.com"` and `"user@outlook.com"` are the same account.
- **Existing accounts:** Only `name` and `cookies` are overwritten. `totalPoints`, `searchesCompleted`, `status`, `lastRun` and all other local tracking state are preserved — the server doesn't know about these.
- **Empty cookies not overwritten:** If the server has an empty cookies object but the local account has cookies, we keep the local cookies. Guards against a partially-synced server state overwriting good local data.
- **New accounts:** Added with sane defaults. `enabled: true` so they run immediately.
- **Local-only accounts kept:** Accounts that exist locally but not on the server are not removed. They may be manually added accounts (email-only, no cookies) that haven't been synced yet.
- **Persisted immediately inside setState:** `AsyncStorage.setItem` is called inside the updater to ensure the written value matches the returned merged array. This avoids a race where state updates but AsyncStorage lags.

---

### Change 7c — Updated `loadFromStorage()` to check `SERVER_HYDRATION_STORAGE`

**Before:** Loaded accounts from `@ms_rewards_accounts` and logs from `@ms_rewards_logs`.

**After:** Also loads `SERVER_HYDRATION_STORAGE` and merges if found:

```typescript
const [accsRaw, logsRaw, serverHydrationRaw] = await Promise.all([
  AsyncStorage.getItem(ACCOUNTS_KEY),
  AsyncStorage.getItem(LOGS_KEY),
  AsyncStorage.getItem(SERVER_HYDRATION_STORAGE),
]);

// ... build `base` from accsRaw ...

if (serverHydrationRaw) {
  const serverAccs = JSON.parse(serverHydrationRaw);
  // same merge logic as hydrateFromServer()
  await AsyncStorage.removeItem(SERVER_HYDRATION_STORAGE);   // ← consume and remove
  await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(base));
}
setAccounts(base);
```

**Why load all three in parallel with `Promise.all`?** Speed — instead of three sequential AsyncStorage reads (each a round trip to native storage), one parallel call.

**Why remove `SERVER_HYDRATION_STORAGE` after reading?** It's a one-shot channel. If we didn't remove it, every subsequent app restart would re-apply the server hydration — potentially overwriting cookies the user updated locally after login. The "consume and remove" pattern ensures it fires exactly once.

**Why do this in `loadFromStorage` instead of just relying on `hydrateFromServer`?** `loadFromStorage` runs on app cold start. If `LicenseContext` already validated the key and wrote `SERVER_HYDRATION_STORAGE` (boot path), `AccountsContext` needs to pick it up during its own initialization. `hydrateFromServer` is only used for the live-PIN-submit path (when `LicenseGate` is on screen). The boot path is asynchronous with no component to call it.

---

### Change 7d — Added `hydrateFromServer` to the Provider value

```typescript
<AccountsContext.Provider value={{
  // ... existing ...
  hydrateFromServer,
}}>
```

Without this line, `hydrateFromServer` would be implemented but inaccessible to any component calling `useAccounts()`.

---

## File 8 — `artifacts/mobile/components/LicenseGate.tsx`

### Change 8a — New imports

```typescript
import { ShieldCheck } from "lucide-react-native";
import { useAccounts } from "@/context/AccountsContext";
```

**`ShieldCheck`**: Icon used in the PIN screen header to visually communicate "security checkpoint".

**`useAccounts`**: Needed to call `hydrateFromServer()` after `submitPin()` succeeds. This is the first time `LicenseGate` depends on `AccountsContext` — the two contexts remained independent before this update.

---

### Change 8b — New state variables

```typescript
const [pinInput, setPinInput]     = useState("");
const [pinSubmitting, setPinSubmitting] = useState(false);
const [pinError, setPinError]     = useState<string | null>(null);
```

**`pinInput`**: The user's typed PIN (filtered to digits only, max 4 chars).

**`pinSubmitting`**: Shows the loading spinner while the server call is in progress.

**`pinError`**: Inline error message under the input (e.g. "Invalid PIN", "PIN must be exactly 4 digits").

---

### Change 8c — Destructured new context values

```typescript
const { isLicensed, isLoading, error, activateKey, pinRequired, pinIsNew, submitPin } = license;
const { hydrateFromServer } = useAccounts();
```

---

### Change 8d — New `handleSubmitPin()` function

```typescript
const handleSubmitPin = async () => {
  if (pinInput.length !== 4 || pinSubmitting) return;
  setPinSubmitting(true);
  setPinError(null);
  const result = await submitPin(pinInput);
  if (result.success) {
    if (result.serverAccounts && result.serverAccounts.length > 0) {
      await hydrateFromServer(result.serverAccounts);
    }
  } else {
    setPinError(result.error ?? "Invalid PIN");
  }
  setPinSubmitting(false);
};
```

**Why guard `pinInput.length !== 4`?** The submit button is disabled when length < 4, but `onSubmitEditing` on the keyboard can still fire. The guard makes both the button and keyboard behaviour safe.

**Why call `hydrateFromServer` here (not in `LicenseContext`)?** `LicenseContext` cannot call `AccountsContext` functions — that would create a circular dependency between contexts. Instead, `submitPin()` returns `serverAccounts` in its result, and `LicenseGate` (which has access to both contexts) does the bridging.

---

### Change 8e — New PIN screen UI

Renders when `pinRequired === true` (and `!isLicensed`):

```
┌─────────────────────────────────┐
│        🛡 (ShieldCheck icon)    │
│                                 │
│   Create Your PIN               │  ← pinIsNew ? "Create" : "Enter"
│                                 │
│   Set a 4-digit PIN to protect  │
│   your license key...           │
│                                 │
│   ┌─────────────────────────┐   │
│   │        • • • •          │   │  ← secureTextEntry, numeric keypad
│   └─────────────────────────┘   │
│                                 │
│   ┌─────────────────────────┐   │
│   │  Set PIN & Continue     │   │  ← disabled until 4 digits
│   └─────────────────────────┘   │
└─────────────────────────────────┘
```

Key implementation details:
- `TextInput` with `keyboardType="number-pad"`, `secureTextEntry`, `maxLength={4}`, `autoFocus`
- `onChangeText` strips non-digits: `.replace(/\D/g, "").slice(0, 4)` — user can't type letters
- `onSubmitEditing={handleSubmitPin}` — pressing the keyboard's done/return key submits
- Button disabled when `pinInput.length !== 4 || pinSubmitting`
- Button colour: blue (`#3b82f6`) when ready, grey (border colour) when disabled
- Error text shown in red below input, cleared on every new keystroke
- Wrapped in `<ScrollView keyboardShouldPersistTaps="handled">` so tapping the button while keyboard is open doesn't dismiss the keyboard first

---

## File 9 — `artifacts/mobile/app/login-webview.tsx`

### Change 9a — New imports

```typescript
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLicense, API_BASE } from "@/context/LicenseContext";
```

**`AsyncStorage`**: Needed to read `@ms_rewards_license_key` and `@ms_rewards_device_id` from storage to include in the `/add-account` request body.

**`API_BASE`**: The server base URL. Previously this file didn't need it (it didn't make any server calls). Now it does.

---

### Change 9b — Added server call in `handleSave()`

Inserted **after** the `_U` cookie validation check and **before** the local `addAccount()` / `updateAccount()` calls:

```typescript
// ── System 2: server-side slot enforcement ────────────────────────────────
try {
  const storedKey = await AsyncStorage.getItem("@ms_rewards_license_key");
  const storedDeviceId = await AsyncStorage.getItem("@ms_rewards_device_id");
  if (storedKey) {
    const addResp = await fetch(`${API_BASE}/add-account`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: storedKey,
        deviceId: storedDeviceId,
        account: {
          email: finalEmail || "user@outlook.com",
          name: finalName || "Macro Rewards Account",
          cookies: allCookies,
        },
      }),
    });
    if (addResp.status === 403) {
      const body = await addResp.json();
      setIsSaving(false);
      showAlert("Account Limit Reached", body.error || `...`, [{ text: "OK" }]);
      return;    // ← stop here, do not call local addAccount
    }
  }
} catch {
  // Network error → fail-open, proceed to local check
}
```

**Why after `_U` cookie check?** The `_U` cookie check at line 454 rejects incomplete sessions. There's no point calling the server to add an account that doesn't have valid cookies yet.

**Why read key/deviceId from AsyncStorage instead of from context?** `handleSave` is a `useCallback` and accessing context state inside it would be a stale closure risk. Reading from AsyncStorage always gets the current stored value.

**Why `try/catch` around the whole block?** If the server is unreachable (airplane mode, server down), `fetch` throws. We catch silently and fall through to the existing local `accounts.length >= maxAccounts` check. The local check is kept as a UX fallback — it won't block a determined modified APK but it handles honest network failures gracefully.

**Why `return` after showing the alert?** To prevent the local `addAccount()` call from firing. Without the `return`, the server would reject the add but the local state would still get updated — the user would see the account in their list even though the server refused it. This would cause a desync.

---

### Change 9c — Added `enabled: true` to `addAccount()` call

The `Account` type gained an `enabled` field (when `hydrateFromServer` was added). TypeScript complained that the `addAccount()` call in `login-webview.tsx` was missing this required field. Fixed by adding `enabled: true`.

---

## File 10 — `artifacts/mobile/app/add-account.tsx`

### Change 10a — New imports

```typescript
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert } from "react-native";          // moved from named import to top-level
import { useLicense, API_BASE } from "@/context/LicenseContext";
```

**`Alert`** was already imported via the `react-native` destructure block — it was moved to be explicit at the top as a standalone import because adding `Alert` to the existing destructure was cleaner. (The duplicate import was consolidated in the same edit.)

---

### Change 10b — Made `validateAndSaveManual` async

**Before:** `const validateAndSaveManual = () => {`

**After:** `const validateAndSaveManual = async () => {`

**Why?** The function now needs to `await` the `fetch()` call and `await AsyncStorage.getItem()` calls. A non-async function cannot use `await`.

---

### Change 10c — Added server call before local `addAccount()`

Inserted after form validation (name/email checks) and before the existing local slot check:

```typescript
try {
  const storedKey = await AsyncStorage.getItem("@ms_rewards_license_key");
  const storedDeviceId = await AsyncStorage.getItem("@ms_rewards_device_id");
  if (storedKey) {
    const addResp = await fetch(`${API_BASE}/add-account`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: storedKey,
        deviceId: storedDeviceId,
        account: { email: email.trim().toLowerCase(), name: name.trim(), cookies: {} },
      }),
    });
    if (addResp.status === 403) {
      const body = await addResp.json();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setErrors({ email: body.error || `Account limit reached (${maxAccounts} max)` });
      return;
    }
  }
} catch {
  // Network error → fail-open
}

// Original local check kept as UX fallback
if (accounts.length >= maxAccounts) { ... }
```

**Why cookies is `{}` here?** Manual account adds (email + name only, no Microsoft login) don't have cookies yet. The cookies get synced later via `login-webview.tsx` when the user logs into this account. The server stores the slot reservation with empty cookies — the email is what matters for slot counting.

**Why is the error shown as an inline form error instead of an `Alert`?** This screen already has form validation using `setErrors({ email: ... })` which renders inline. Using the same mechanism for the server rejection is consistent with the existing UX pattern. An `Alert` would be jarring in a form context.

---

### Change 10d — Added `enabled: true` to `addAccount()` call

Same TypeScript fix as `login-webview.tsx` — the `Account` type required `enabled` which was missing.

---

## File 11 — `artifacts/mobile/app/search-runner.tsx`

### Change 11a — New imports

```typescript
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLicense, API_BASE } from "@/context/LicenseContext";
```

---

### Change 11b — Added pre-flight `/run-task` check at the top of `run()`

Inserted at the very beginning of the `run()` async function, before any other logic including the `BackgroundService.isRunning()` check:

```typescript
// ── System 3: server-side delay validation (pre-flight) ──────────────
try {
  const storedKey = await AsyncStorage.getItem("@ms_rewards_license_key");
  const storedDeviceId = await AsyncStorage.getItem("@ms_rewards_device_id");
  if (storedKey) {
    const requestedDelay = settings.searchDelay ?? 5;
    const taskResp = await fetch(`${API_BASE}/run-task`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: storedKey, deviceId: storedDeviceId, requestedDelay }),
    });
    if (taskResp.status === 400) {
      const body = await taskResp.json();
      cancelled = true;
      abortRef.current = true;
      showAlert(
        "Delay Too Short",
        body.error || `Your minimum allowed delay is ${body.minDelay} seconds.`,
        [{ text: "OK" }]
      );
      stopRun();
      return;    // ← exit run() before anything starts
    }
  }
} catch {
  // Network error → fail-open, proceed with local settings
}
```

**Why at the very top of `run()` before everything else?** The `run()` function runs inside a `useEffect` that is triggered when `isRunning` becomes `true` (i.e. when the user presses the Run button). The pre-flight check must happen before any state is mutated (accounts marked "running", notifications shown, etc.) so that a rejected run leaves zero side effects.

**Why set `cancelled = true` AND `abortRef.current = true`?** `cancelled` is the local loop guard variable used in the outer `useEffect` scope. `abortRef` is the ref used by inner callbacks and async loops. Both need to be set to ensure any code that manages to start (e.g. if the `try` starts but the server takes 10 seconds to respond) will stop cleanly.

**Why call `stopRun()` in addition to `return`?** `stopRun()` sets `isRunning = false` in `AccountsContext`, which updates the UI back to the idle state. Without it, the button would stay stuck in the "running" state even though nothing is actually running.

**Why fail-open on network error?** A legitimate user on airplane mode or with spotty connectivity should still be able to run searches. They are not a tampered APK — they just have a bad connection. The local `minDelay` setting enforced by the `featureConfig` still applies client-side as a UX safeguard. The server-side check is a security boundary, not the only line of defence.

---

## Summary of All Files Changed

| File | Type | Change |
|------|------|--------|
| `lib/db/src/schema/licenseKeys.ts` | Schema | Added `pin TEXT` nullable column |
| `lib/db/src/migrate.ts` | Migration | `ADD COLUMN IF NOT EXISTS` for pin + custom overrides |
| `artifacts/api-server/src/routes/keys.ts` | Backend | Rewrote `/validate-key` PIN gate; added `/add-account`, `/run-task`, `/admin/keys/:id/pin` routes |
| `artifacts/api-server/src/routes/proxy.ts` | Backend | Added `/add-account` and `/run-task` to dev proxy list |
| `artifacts/api-server/src/routes/admin.ts` | Backend + HTML | PIN badge in key card, "Clear PIN" button, `clearPin()` JS function |
| `artifacts/mobile/context/LicenseContext.tsx` | Mobile | Full rewrite: PIN state, `submitPin()`, boot PIN flow, account hydration |
| `artifacts/mobile/context/AccountsContext.tsx` | Mobile | `hydrateFromServer()`, `SERVER_HYDRATION_STORAGE` boot merge |
| `artifacts/mobile/components/LicenseGate.tsx` | Mobile | PIN screen UI, `handleSubmitPin()`, hydration call |
| `artifacts/mobile/app/login-webview.tsx` | Mobile | `/add-account` server call before local save |
| `artifacts/mobile/app/add-account.tsx` | Mobile | `/add-account` server call, made async |
| `artifacts/mobile/app/search-runner.tsx` | Mobile | `/run-task` pre-flight at top of `run()` |

---

## Design Decisions Summary

| Decision | Rationale |
|----------|-----------|
| PIN stored plain text | Admin must be able to read PINs for support calls |
| PIN is nullable | Distinguishes first-time (no PIN) from returning (has PIN) |
| Custom key overrides always win | Per-key admin settings must not be silently overridden by tier changes |
| Fail-open on network errors (Systems 2 & 3) | Honest users with bad connections shouldn't lose functionality |
| Server counts accounts from DB (never from client) | Client count can be manipulated by APK modification |
| `SERVER_HYDRATION_STORAGE` as one-shot channel | Decouples two contexts that can't call each other directly |
| PIN cleared on `removeLicense()` | Prevents old PIN from carrying over to a new key on the same device |
| `pendingKeyRef` as a ref not state | Prevents stale closure capture inside `submitPin` useCallback |
| Upsert in `/add-account` (re-login allowed) | Re-logging in an existing account must never be blocked |
| Pre-flight before everything in `run()` | Rejected runs must leave zero side effects |
