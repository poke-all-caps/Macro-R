# Macro Rewards — Code Audit Report

**Date:** March 24, 2026
**Auditor:** Agent (peer-reviewed by architect subagent)
**Scope:** Full codebase — mobile app, API server, database schema, background tasks

---

## Executive Summary

A comprehensive audit of the Macro Rewards codebase was performed covering the mobile app (Expo/React Native), the Express API server, database schema, background task architecture, and state management. **11 issues were identified** — 2 medium, 9 low/observations. Several are net-new findings not covered by the March 22 senior audit.

All findings were cross-validated by an independent code review pass that confirmed correctness but refined severity levels — several issues initially rated HIGH were downgraded after confirming limited runtime impact.

---

## Issues Found

### ISSUE 1: Web Admin Panel — Duplicate `loadFeatureConfig` / `updateConfig` Functions (SEVERITY: LOW)

**File:** `artifacts/api-server/src/routes/admin.ts`

**Problem:** The admin HTML panel defines two different versions of both `loadFeatureConfig()` (lines ~214 and ~254) and `updateConfig()` (lines ~244 and ~278). The second definitions silently overwrite the first in JavaScript.

**Reviewer Note:** The first `loadFeatureConfigs()` (plural, with 's') is dead code — the page actually calls `loadFeatureConfig()` (singular) at the bottom, which is the second definition. The `onchange` handlers in the first HTML block reference the 3-argument `updateConfig(keyType, field, value)` signature, but this HTML block is also dead/unreachable. The working HTML block uses the correct 2-argument signature.

**Impact:** Dead code duplication. No functional breakage, but confusing and should be cleaned up.

**Fix:** Remove the first (dead) versions of both functions and the associated dead HTML.

---

### ISSUE 2: Background Search — `lastRun` Stored as Timestamp Instead of ISO String (SEVERITY: LOW)

**File:** `artifacts/mobile/utils/backgroundSearch.ts`, line ~298

**Problem:** The foreground search runner stores `lastRun` as an ISO date string (`new Date().toISOString()`), but the background search stores it as a raw timestamp number (`Date.now()`). The Account interface expects `lastRun: string | null`.

**Reviewer Note:** Runtime code uses `new Date(account.lastRun)` and `!!account.lastRun`, both of which handle numbers correctly. No actual crash or incorrect behavior, but it's a type inconsistency.

**Impact:** Data consistency issue. `typeof account.lastRun` returns `"number"` after background run vs `"string"` after foreground run.

**Fix:** Change line ~298 to `lastRun: new Date().toISOString()`.

---

### ISSUE 3: Background Search — Missing `accountId` in Log Entries (SEVERITY: LOW)

**File:** `artifacts/mobile/utils/backgroundSearch.ts`, lines ~257-265 and ~303-311

**Problem:** The `appendLog()` calls in `runBackgroundSearches()` omit the `accountId` field. The `RunLog` interface includes `accountId: string`, and the foreground runner always includes it.

**Reviewer Note:** The current log UI doesn't filter by accountId, limiting actual impact. But log entries are structurally incomplete.

**Impact:** Background run logs cannot be associated with specific accounts. The log data shape is inconsistent with foreground logs.

**Fix:** Add `accountId: account.id` to both `appendLog` calls.

---

### ISSUE 4: Background Search — `status` Field Missing in Log Entries (SEVERITY: LOW)

**File:** `artifacts/mobile/utils/backgroundSearch.ts`, lines ~257-265 and ~303-311

**Problem:** Background log entries don't include the `status` field (`"success"` or `"failed"`). The `LogItem` component reads `log.status` for success/failure styling.

**Impact:** Background run logs may show incorrect visual styling (defaulting to error appearance).

**Fix:** Add `status: "failed"` to the no-cookies log entry and `status: "success"` to the successful run entry.

---

### ISSUE 5: Admin Panel Secret Exposed in HTML Source (SEVERITY: LOW)

**File:** `artifacts/api-server/src/routes/admin.ts`, line ~114

**Problem:** The admin secret is embedded directly in the rendered HTML: `const SECRET = "${ADMIN_SECRET}";`

**Reviewer Note:** The page is already gated by the secret in the query string — anyone who can load the page already knows the secret (they passed it in the URL). This is a defense-in-depth concern, not an escalation vector.

**Impact:** Minor — the secret is visible in browser dev tools, but the viewer already knows it.

**Recommendation:** Use a session token instead to avoid the secret appearing in page source, browser history, and server logs.

---

### ISSUE 6: Race Condition — Account Data Divergence Between Context and AsyncStorage (SEVERITY: MEDIUM)

**File:** `artifacts/mobile/utils/backgroundSearch.ts` and `artifacts/mobile/context/AccountsContext.tsx`

**Problem:** Background searches directly read/write AsyncStorage while the foreground app uses React state via `AccountsContext`. The `AccountsContext` only loads from AsyncStorage once on mount (line ~65-87) and never re-reads. When the app returns from background:
1. Background has written updated account data to AsyncStorage
2. AccountsContext still holds stale React state from before backgrounding
3. Any foreground `updateAccount` call overwrites AsyncStorage with stale data

**Impact:** Points, lastRun, and status data from background runs can be silently overwritten when the app returns to foreground.

**Fix:** Add an `AppState` listener in `AccountsContext` to re-sync from AsyncStorage when the app transitions from background to active.

---

### ISSUE 7: `handleRunNow` Not Calling `startRun()` Before Navigation (SEVERITY: MEDIUM)

**File:** `artifacts/mobile/app/account/[id].tsx`, line ~113

**Problem:** The `handleRunNow` function in the account detail screen navigates to the search runner without calling `startRun()` first. Compare with `handleRunAccount` in `index.tsx` (line ~93-103) which correctly calls `startRun()` before navigation.

```typescript
const handleRunNow = () => {
  router.push({ pathname: "/search-runner", params: { accountIds: JSON.stringify([id]) } });
};
```

**Impact:** The `isRunning` global flag stays `false`, allowing accidental parallel runs from the home screen. The search runner itself still works, but the home screen UI won't reflect the running state.

**Fix:** Import and call `startRun()` before `router.push()`.

---

### ISSUE 8: Notification Fallback — `timeInterval` Doesn't Repeat (SEVERITY: LOW)

**File:** `artifacts/mobile/utils/notifications.ts`, line ~222

**Problem:** When the `daily` trigger type fails, the fallback uses `timeInterval` with `repeats: false`. The overnight notification will only fire once.

**Impact:** Users relying on the fallback trigger will only get one night of scheduled runs unless they manually re-schedule.

**Recommendation:** Set `repeats: true` with a 24-hour interval, or re-schedule after each run.

---

### ISSUE 9: `targetAccounts` Captured by `useRef` — Never Updates (SEVERITY: LOW / OBSERVATION)

**File:** `artifacts/mobile/app/search-runner.tsx`, line ~317-319

**Problem:** `targetAccounts` is captured once via `useRef().current` and never updated. This is by design (snapshot for the run), but means cookie refreshes between queuing and starting a run won't be picked up.

**Impact:** Very low — mostly a design choice. Edge case only.

---

### ISSUE 10: Queries Pool Exhaustion Not Handled (SEVERITY: LOW)

**File:** `artifacts/mobile/context/QueriesContext.tsx`

**Problem:** When `pickQueries(count)` is called and `unusedRef.current` has fewer items than `count`, it picks what's available but doesn't recycle used queries. The background search version correctly recycles used queries into the available pool when needed.

**Impact:** After enough foreground runs, the query pool depletes and the search runner falls back to generic queries.

**Fix:** Mirror the background search logic — when unused queries are insufficient, recycle used ones.

---

### ISSUE 11: CORS Configured Without Restrictions (SEVERITY: LOW / OBSERVATION)

**File:** `artifacts/api-server/src/app.ts`, line ~7

**Problem:** `app.use(cors())` allows requests from any origin. While admin endpoints require `X-Admin-Secret`, this is a defense-in-depth concern.

**Recommendation:** Restrict CORS to known origins in production.

---

## Summary Table

| # | Issue | Severity | File(s) |
|---|-------|----------|---------|
| 1 | Duplicate function definitions in web admin (dead code) | LOW | `routes/admin.ts` |
| 2 | Background lastRun stored as number vs string | LOW | `backgroundSearch.ts` |
| 3 | Missing accountId in background log entries | LOW | `backgroundSearch.ts` |
| 4 | Missing status field in background logs | LOW | `backgroundSearch.ts` |
| 5 | Admin secret in HTML source (defense-in-depth) | LOW | `routes/admin.ts` |
| 6 | AsyncStorage/React state divergence on resume | **MEDIUM** | `backgroundSearch.ts`, `AccountsContext.tsx` |
| 7 | Missing startRun() in account detail Run Now | **MEDIUM** | `account/[id].tsx` |
| 8 | Notification fallback doesn't repeat | LOW | `notifications.ts` |
| 9 | targetAccounts ref never updates (by design) | LOW | `search-runner.tsx` |
| 10 | Query pool exhaustion not handled | LOW | `QueriesContext.tsx` |
| 11 | Unrestricted CORS | LOW | `app.ts` |

---

## Code Quality Observations

### Strengths
- Clean separation: contexts, components, utilities are well-organized
- Comprehensive cookie handling with both JS and native capture
- Good error boundaries and crash recovery in search runner
- Thorough feature config system with per-tier enforcement
- Dual admin panels (web + native) with feature parity
- Proper concurrency lock with TTL for background tasks
- Well-designed Daily Set automation with deduplication

### Areas for Improvement
- **Code duplication**: `buildCookieHeader`, `performBingSearch`, `fetchRewardsPoints`, `sleep`, `randomHex` are duplicated between `search-runner.tsx` and `backgroundSearch.ts` — extract to a shared utility module
- **Large files**: `search-runner.tsx` (916 lines), `settings.tsx` (1108 lines), `AdminPanel.tsx` (700+ lines) should be broken into smaller modules
- **`formatRelativeTime`** duplicated in `AccountCard.tsx` and `AccountGridTile.tsx`
- **No input validation** on admin API endpoints beyond basic type checks — no rate limiting, no request size limits
- **Missing error handling** on several `await apiCall()` calls in `AdminPanel.tsx` (e.g., `extendKey`, `resetDevice`, `toggleKey` — these will silently fail on network errors)

---

*Report generated March 24, 2026 — peer-reviewed by architect subagent*
