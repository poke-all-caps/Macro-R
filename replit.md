# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Contains MS Rewards Automation v2, a mobile app built with Expo React Native.

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
- **Mobile**: Expo SDK 54 + Expo Router (file-based routing)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server
│   └── mobile/             # Expo React Native app (MS Rewards Automation)
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, scripts)
├── tsconfig.base.json      # Shared TS options
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## Mobile App — MS Rewards Automation

An Expo React Native app for managing and automating Microsoft Rewards accounts.

### Features
- **Accounts screen**: View all accounts as cards with status indicators (idle/running/done/failed), points, search count, and run buttons
- **Stats bar**: Shows total points today, done/total count, running count, failed count
- **Run automation**: Simulate Bing searches (30 shuffled queries) and Daily Set completion per account
- **Account detail**: View/edit account info, per-account search count & daily set toggle, recent run history
- **Add account**: Form with name, email, search count (5–50), daily set toggle
- **Logs screen**: Run history (last 200) with search count, daily set status, points earned, success/failure
- **Settings screen**: Default search count, daily set toggle, retry schedule display, apply schedule button

### File Structure (artifacts/mobile/)
```
app/
  _layout.tsx              — Root layout with providers (Accounts, Settings, QueryClient)
  (tabs)/
    _layout.tsx            — Tab bar (NativeTabs for iOS 26+, classic Tabs fallback)
    index.tsx              — Home/Accounts screen
    logs.tsx               — Run logs screen
    settings.tsx           — Settings screen
  account/[id].tsx         — Account detail modal
  add-account.tsx          — Add account form sheet
components/
  AccountCard.tsx          — Account list card with status badges and progress
  StatsBar.tsx             — Stats summary bar at top of accounts screen
  LogItem.tsx              — Run log list item
  EmptyState.tsx           — Reusable empty state component
  ErrorBoundary.tsx        — React error boundary
  ErrorFallback.tsx        — Error fallback UI
context/
  AccountsContext.tsx      — Accounts state, run logic, logs management
  SettingsContext.tsx      — App settings with AsyncStorage persistence
constants/
  colors.ts                — Light/dark theme colors
```

### Theme
- Primary: Blue (#2563EB / #3B82F6)
- Dark mode supported
- Inter font family (400, 500, 600, 700 weights)

## Backend (api-server)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for validation and `@workspace/db` for persistence.

- Entry: `src/index.ts`
- App setup: `src/app.ts`
- Routes: `src/routes/index.ts` → `src/routes/health.ts`
- Depends on: `@workspace/db`, `@workspace/api-zod`
