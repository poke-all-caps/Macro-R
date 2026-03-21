# MS Rewards Automation — Complete Project Report

**Date:** March 21, 2026
**Project:** MS Rewards Automation — React Native (Expo SDK 54), pnpm monorepo
**Location:** `artifacts/mobile/`

---

## 1. What This App Does

This Android app automates Microsoft Rewards point earning. You add your Microsoft accounts, and the app:

1. **Runs Bing searches** — sends fake search queries to Bing using your account's session cookies, earning you ~5 points per search
2. **Completes Daily Set activities** — opens the Rewards dashboard in a WebView and clicks on daily activity cards (quizzes, polls, etc.)
3. **Runs on a schedule** — you set a daily time and the app fires a notification; tapping it auto-starts the run

It supports **multiple accounts** — you can add 2, 5, or 10 Microsoft accounts and the app runs through each one sequentially.

---

## 2. How Account Switching Works (The Core Mechanism)

This is the most important part of the architecture. The app manages multiple Microsoft accounts on a single device, and each account needs to be authenticated as a different Microsoft user. Here's exactly how it works, step by step.

### 2.1 — Two Completely Separate Systems Handle Authentication

The app uses **two different methods** to talk to Microsoft, and they authenticate in completely different ways:

| System | Used For | How It Authenticates |
|--------|----------|---------------------|
| **`fetch()` requests** | Bing searches, points checking | Manual `Cookie:` header — the app builds a cookie string from stored data and sends it directly in the HTTP request |
| **WebView** (embedded browser) | Daily Set card clicking | OS cookie jar — Android's built-in cookie store that all WebViews share |

This distinction is critical. Understanding why these are separate is the key to understanding the whole app.

### 2.2 — How Accounts Are Stored

Each account is a JavaScript object stored in AsyncStorage (phone's local storage):

```
{
  id: "172...",
  name: "User 1",
  email: "user@outlook.com",
  cookies: {
    "MUID": "abc123...",
    "_U": "eyJ0eX...",        <-- THE critical auth token
    "ANON": "A=s:abc...",
    "SRCHHPGUSR": "...",
    ... (30-40 cookies total)
  },
  status: "idle",
  searchCount: 30,
  ...
}
```

The `cookies` field is a flat key-value map of ALL cookies captured during login — including httpOnly cookies that normal JavaScript can't see. These cookies ARE the session. Whoever holds these cookies IS that user, as far as Microsoft is concerned.

### 2.3 — How Login Captures Cookies (`login-webview.tsx`)

When you tap "Add Account" → "Sign in with Microsoft":

```
Step 1:  Clear the entire OS cookie jar
         └── CookieManager.clearAll(true)
         └── This ensures no previous account's session leaks in

Step 2:  Open a WebView pointing to Microsoft sign-out page
         └── Forces a clean start — any cached session is destroyed

Step 3:  User types their email + password + 2FA
         └── Microsoft redirects through several domains:
             login.live.com → login.microsoftonline.com → bing.com → rewards.bing.com

Step 4:  On every page load, inject JavaScript to read document.cookie
         └── Captures: MUID, NAP, ANON, etc. (non-httpOnly cookies)
         └── Also reads localStorage tokens and the account name/email

Step 5:  Before saving, navigate WebView to www.bing.com
         └── Forces the auth redirect chain that sets _U cookie

Step 6:  Read the OS cookie jar using CookieManager.get()
         └── Reads from: bing.com, rewards.bing.com, login.live.com,
             login.microsoftonline.com, account.microsoft.com, etc.
         └── This captures httpOnly cookies like _U that JavaScript can't see

Step 7:  Merge JS cookies + native cookies → store in account object
         └── The complete set (35-40 cookies) is saved to AsyncStorage
```

**Why this matters:** The `_U` cookie is the main authentication token. It's httpOnly (invisible to `document.cookie`). Without Step 6 (native cookie capture), the stored cookies would be incomplete and searches would silently fail — they'd return HTTP 200 but earn zero points.

### 2.4 — How Searches Switch Between Accounts (`search-runner.tsx`)

When the user taps "Search All", the app loops through accounts one at a time:

```
FOR each account in the list:
│
├── 1. Read this account's stored cookies from memory
│       └── acctCookies = account.cookies
│       └── These were captured during login (Section 2.3)
│
├── 2. Inject cookies into OS cookie jar (for Daily Set later)
│       └── CookieManager.clearAll(true)     ← wipe previous account
│       └── CookieManager.set(cookie, ...)   ← write THIS account's cookies
│       └── CookieManager.flush()            ← force write to disk
│       └── Verify: CookieManager.get("bing.com") → check count > 0
│
├── 3. Run Bing searches via fetch()
│       └── For each of the 30 search queries:
│           │
│           │   fetch("https://www.bing.com/search?q=...", {
│           │     credentials: "omit",          ← CRITICAL: don't touch OS jar
│           │     headers: {
│           │       Cookie: "MUID=abc; _U=eyJ...; ANON=...",  ← manual header
│           │       "User-Agent": "Mozilla/5.0 (Pixel 7)..."
│           │     }
│           │   })
│           │
│           └── credentials: "omit" means:
│               • fetch() does NOT read from OS cookie jar
│               • fetch() does NOT write Set-Cookie responses to OS jar
│               • The Cookie header is 100% from THIS account's stored data
│               • This is what makes multi-account searches work
│
├── 4. Run Daily Set via WebView (if enabled)
│       └── WebView loads rewards.bing.com
│       └── WebView uses the OS cookie jar (written in step 2)
│       └── So it's authenticated as THIS account
│       └── JavaScript is injected to find and click activity cards
│
├── 5. Fetch points earned
│       └── Same fetch() + credentials:"omit" pattern as searches
│       └── Calls rewards.bing.com/api/getuserinfo
│
├── 6. Log results, update account status
│
├── 7. Pause 3 seconds before next account
│
└── NEXT account
```

### 2.5 — Why `credentials: "omit"` Is the Whole Trick

This one line is what makes multi-account work:

```javascript
fetch(url, { credentials: "omit", headers: { Cookie: cookieString } })
```

Without `credentials: "omit"`, here's what would happen:
- Android's OkHttp (the HTTP engine) would READ cookies from the OS jar and ADD them to the request
- The response's `Set-Cookie` headers would WRITE back to the OS jar
- After Account 1's searches, the OS jar would contain Account 1's response cookies
- Account 2's searches would then send a MIX of Account 1 (from jar) and Account 2 (from header) cookies
- Microsoft would get confused and credit points to the wrong account (or none)

With `credentials: "omit"`:
- OkHttp ignores the OS jar completely for fetch requests
- The only cookies sent are the ones in the manual `Cookie:` header
- The OS jar stays clean for the WebView (Daily Set) to use
- Each account is completely isolated

### 2.6 — How Daily Set Card Clicking Works

The Daily Set automation is entirely different from searches. It uses a real WebView (embedded Chrome browser) because Microsoft's Daily Set activities require JavaScript execution, redirects, and DOM interaction that `fetch()` can't do.

```
Step 1:  WebView navigates to rewards.bing.com
         └── Authenticated via OS cookie jar (injected in step 2 above)

Step 2:  Wait for page to fully load

Step 3:  Inject JavaScript that:
         a) Finds all activity card links using CSS selectors:
            - [data-activity-id] a[href]
            - [data-bi-id*="dailyset"] a[href]
            - .ds-card-sec a[href]
            - a[href*="rewards.bing.com/go/"]
            - ... (12 different selectors to cover Microsoft's changing HTML)

         b) Skips cards that are already completed:
            - Checks for CSS classes like "complete", "done", "checked", "earned"
            - Checks for aria-checked="true"

         c) Skips cards that were already clicked in this run:
            - Keeps a list of clicked card IDs to avoid loops

         d) Fires a real MouseEvent('click') on the first uncompleted card:
            - Uses dispatchEvent(), not window.location navigation
            - This is the same event path as a real user tap
            - Microsoft's own click handlers run and register the activity

Step 4:  After the click, wait for the page to navigate (card opens a new page)

Step 5:  Navigate back to rewards.bing.com

Step 6:  Repeat steps 3-5 until no more uncompleted cards are found

Step 7:  Report results: { completed: 3, total: 4, alreadyDone: false }
```

---

## 3. The Three Run Modes

The app now has three distinct ways to run, triggered by different buttons:

| Button | Color | Mode | What It Does |
|--------|-------|------|-------------|
| **Search All** | Blue | `searchonly` | Runs Bing searches only. No Daily Set. |
| **Daily Set** | Purple | `dailyset` | Runs Daily Set card clicking only. No searches. |
| **Run All** | Green | `both` | Runs searches first, then Daily Set. |
| **Stop** | Red | — | Stops any running operation. |

The same three modes apply to per-account buttons on each account card:
- Blue play button → searches only for that account
- Purple checkbox button → Daily Set only for that account

**The Daily Set toggle** in Settings controls visibility of all daily-set-related buttons:
- **Toggle ON:** All three FAB buttons visible, purple checkbox on each card visible
- **Toggle OFF:** Only the blue "Search All" button visible, only blue play on cards

**Scheduled auto-runs** (from notifications) always use `both` mode — they run searches AND Daily Set regardless of the toggle.

---

## 4. All Bugs Fixed

### Critical Bugs (App Was Broken Without These)

| # | Bug | Root Cause | Fix |
|---|-----|-----------|-----|
| 1 | **CookieManager never loaded** — native cookie capture returned 0 cookies every time | `@react-native-cookies/cookies` uses CommonJS `module.exports = {...}`. Code accessed `.default` which returned `undefined`. | Changed `require(...).default` to `const mod = require(...); mod.default \|\| mod` in both `login-webview.tsx` and `search-runner.tsx` |
| 2 | **Cookie save alert invisible on Android** — user could never see the diagnostic popup showing cookie counts | `Alert.alert()` is non-blocking on Android. `router.back()` executed immediately, navigating away before the alert rendered. | Moved account save + `router.back()` into the Alert's `onPress` callback. Later removed the alert entirely (diagnostics now go to console only). |
| 3 | **EAS build failed — missing project ID** | `eas init` was run but the project ID was never saved to `app.json` | Added `extra.eas.projectId` and `owner` to `app.json` |
| 4 | **EAS build failed — Kotlin version mismatch** | `expo-dev-client` brings `expo-dev-launcher@5.0.35` compiled with Kotlin 1.9.0, but RN 0.81.5 uses Kotlin 2.1.0. Binary incompatible. | Removed `expo-dev-client`, switched to `preview` EAS profile |
| 5 | **EAS build failed — CLI version constraint** | `eas.json` had `"cli": { "version": ">= 16.0.0" }` which silently rejected builds | Removed the constraint |

### Medium Bugs (App Worked But With Wrong Behavior)

| # | Bug | Root Cause | Fix |
|---|-----|-----------|-----|
| 6 | **Cookie variable inconsistency** | `performBingSearch()` and `fetchRewardsPoints()` used `account.cookies` directly instead of the prepared, null-safe `acctCookies` variable | Changed both to use `acctCookies` |
| 7 | **Silent cookie injection failures** | All `catch` blocks in `injectAccountCookies` were empty. In release builds, `console.log` is suppressed, making debugging impossible. | Function now returns `{ ok, injected, verified, error }` and the caller displays injection results in the status line |
| 8 | **Search count setting ignored** | Home screen stepper changed `settings.defaultSearchCount`, but runner used `account.searchCount` (hardcoded to 30 on creation). User changed it to 40 in settings but the app always ran 30. | Runner now always uses `settings.defaultSearchCount` |
| 9 | **`_U` cookie not captured** — searches ran but earned zero points | The WebView only visited `rewards.bing.com` during login. The `_U` cookie is set by Microsoft during a redirect chain that only fires when `www.bing.com` is loaded directly. | Added a navigation step: before capturing cookies, the WebView navigates to `www.bing.com` and waits 3 seconds for the redirect chain to set `_U`. Also expanded capture domains. |

---

## 5. File Map

| File | Purpose |
|------|---------|
| `app/(tabs)/index.tsx` | Home screen — account list, settings stepper, three FAB buttons |
| `app/(tabs)/settings.tsx` | Settings — search count, delay, Daily Set toggle, schedule picker |
| `app/(tabs)/queries.tsx` | Query pool editor — view/edit/restore the 3000+ search queries |
| `app/(tabs)/logs.tsx` | Run history log viewer |
| `app/login-webview.tsx` | Microsoft login WebView + cookie capture |
| `app/search-runner.tsx` | The main automation engine — searches, Daily Set, account switching |
| `app/add-account.tsx` | Add account form + "Sign in with Microsoft" button |
| `app/account/[id].tsx` | Account detail screen — edit, delete, session refresh |
| `app/_layout.tsx` | Root layout with context providers |
| `context/AccountsContext.tsx` | Account state, persistence, run tracking |
| `context/SettingsContext.tsx` | Settings state and persistence |
| `context/QueriesContext.tsx` | Search query pool management |
| `components/AccountCard.tsx` | Account card with status badge, play/daily-set buttons |
| `components/StatsBar.tsx` | Total points summary bar |
| `utils/notifications.ts` | Scheduled notification management |
| `constants/defaultQueries.ts` | 3000+ default Bing search queries |
| `constants/colors.ts` | Light/dark theme color definitions |

---

## 6. Build & Deploy

| Setting | Value |
|---------|-------|
| EAS Profile | `preview` (release APK, not dev client) |
| Build Command | `cd artifacts/mobile && eas build --platform android --profile preview --non-interactive` |
| EAS Account | shroud.dev |
| Project ID | bde8726b-e427-47c3-bfef-bac4d4e46de4 |
| Bundle ID | com.msrewards.automation |
| Build Time | ~2.5 minutes on EAS free tier |

---

## 7. Known Limitations

| Issue | Impact | Notes |
|-------|--------|-------|
| Cookies in AsyncStorage (plaintext) | Low | Acceptable for personal use. SecureStore would be better for shared devices. |
| No session expiry check before runs | Low | `isSessionExpired` in AccountCard is time-based (>24h). No real auth check. Expired sessions fail silently. |
| No per-search retry | Low | If a single search fails (non-network), it's skipped. The run continues to the next search/account. |
| Shared User-Agent across accounts | Low | All accounts use the same Pixel 7 UA string. Microsoft could potentially detect the pattern. |
| `login-webview.tsx` hardcodes `searchCount: 30` | Cosmetic | New accounts get 30 as default. The runner correctly uses `settings.defaultSearchCount` for actual execution. |
