# src/core — Automation Engine

This directory contains the core automation tasks and business logic for the
Rewards Desk desktop app.

## Purpose

Put your Playwright/Patchright automation tasks here. The Express server in
`scripts/desk/app-window.js` imports from this directory to run automations
when the `/api/run-now` endpoint is called.

## Planned modules

```
src/core/
├── rewards-runner.ts    # Main Bing search automation (Playwright/Patchright)
├── daily-set.ts         # Daily Set task completion logic
├── points-fetcher.ts    # Fetch reward point totals from MS Rewards API
└── browser-utils.ts     # Shared browser setup, stealth config, cookie injection
```

## Usage example (in app-window.js)

```js
const { runRewardsSearch } = require('../../src/core/rewards-runner');

// Inside the /api/run-now handler:
const result = await runRewardsSearch({
  id: account.id,
  email: account.email,
  cookies: account.cookies,
  searchCount: 30,
});
```

## Patchright setup

Patchright is a drop-in replacement for Playwright with better anti-bot
evasion. Install it with:

```
npm install patchright
npx patchright install chromium
```

Then in your runner:

```js
const { chromium } = require('patchright');

async function runRewardsSearch(account) {
  const browser = await chromium.launch({ headless: true });
  // ... inject cookies, run searches, return result
  await browser.close();
}
```
