# Add-Account Flow — File Map

This folder contains every file that is touched when a user adds a new Microsoft account to the bot. The structure mirrors the original project layout so you can trace imports easily.

---

## How the flow works (end-to-end)

```
User fills "+ Add account" form in Rewards Desk
        │
        ▼
scripts/desk/app-window.js          ← receives the POST /api/accounts-save request
        │
        ▼
scripts/account-storage.js          ← validates, encrypts, and persists the account
scripts/session-crypto.js           ← encrypts any saved session tokens
        │
        ▼
src/helpers/SchemaValidator.ts      ← enforces required fields & formats
src/helpers/AccountSafetyWarning.ts ← warns if household/safety limits are exceeded
        │
        ▼
src/helpers/DataManager.ts          ← high-level API the bot core uses to read accounts
        │
        ▼
src/automation/auth/AuthManager.ts  ← drives the real Microsoft login on first run
        ├── strategies/EmailStrategy.ts        (email + password)
        ├── strategies/TotpStrategy.ts         (2FA / TOTP)
        ├── strategies/CodeStrategy.ts         (one-time code)
        ├── strategies/RecoveryStrategy.ts     (recovery e-mail)
        ├── strategies/PasswordlessStrategy.ts (passwordless)
        ├── strategies/MobileStrategy.ts       (mobile approval)
        └── strategies/AuthUtils.ts            (shared helpers)
```

---

## File-by-file reference

### Types
| File | Role |
|------|------|
| `src/types/Account.ts` | `Account` interface — `email`, `password`, `totpSecret`, `recoveryEmail`, proxy fields |
| `src/types/Config.ts`  | Global config types, including storage paths for accounts and sessions |

### Storage & Encryption
| File | Role |
|------|------|
| `scripts/account-storage.js` | Core read/write for `accounts.json` / `accounts.enc.json`; OS-vault encryption (DPAPI · Keychain · Secret Service) |
| `scripts/account-storage-worker.js` | Off-main-thread worker that the Rewards Desk calls for storage ops |
| `scripts/session-crypto.js` | Encrypts/decrypts browser session cookies tied to an account |

### Rewards Desk UI
| File | Role |
|------|------|
| `scripts/desk/app-window.js` | Hosts the `view-accounts` panel and the `POST /api/accounts-save` endpoint |
| `scripts/desk/config.js`     | UI-side config state, including account-related settings |

### Validation & Safety
| File | Role |
|------|------|
| `src/helpers/SchemaValidator.ts`      | JSON-schema validation before an account is saved |
| `src/helpers/AccountSafetyWarning.ts` | Household / per-IP account-count safety checks |
| `src/helpers/DataManager.ts`          | High-level data-access layer used by the bot core |

### Authentication strategies
| File | Role |
|------|------|
| `src/automation/auth/AuthManager.ts`              | State-machine orchestrator — detects login step and delegates |
| `src/automation/auth/AuthErrors.ts`               | Typed error classes for auth failures |
| `src/automation/auth/strategies/AuthUtils.ts`     | Shared browser helpers (wait, click, type) |
| `src/automation/auth/strategies/EmailStrategy.ts` | Fills email + password fields |
| `src/automation/auth/strategies/TotpStrategy.ts`  | Generates and enters TOTP codes |
| `src/automation/auth/strategies/CodeStrategy.ts`  | Handles one-time verification codes |
| `src/automation/auth/strategies/RecoveryStrategy.ts` | Uses recovery e-mail when prompted |
| `src/automation/auth/strategies/PasswordlessStrategy.ts` | Passwordless / passkey flow |
| `src/automation/auth/strategies/MobileStrategy.ts` | Mobile-app approval flow |

### Tests
| File | Role |
|------|------|
| `scripts/tests/account-schema.test.js`         | Validates schema rules for account objects |
| `scripts/tests/account-storage.test.js`        | Tests read/write/encrypt/decrypt in account-storage.js |
| `scripts/tests/account-safety-warning.test.js` | Tests the household-limit warning logic |
