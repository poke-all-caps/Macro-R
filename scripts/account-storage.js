/**
 * scripts/account-storage.js
 * ---------------------------
 * Provides the createAccountStorage factory used by src/helpers/ConfigLoader.ts.
 * Supports plain JSON accounts (src/accounts.json) and an optional encrypted
 * path (src/accounts.enc.json) — encryption is deferred to a future step.
 *
 * Exported as CJS so it works with both require() and dynamic import() from
 * the TypeScript source.
 */

'use strict'

const fs   = require('fs')
const path = require('path')

/**
 * @param {{ root: string }} options  - root is the project root directory
 * @returns {{ encryptedPath: string, readAccounts(): unknown[] }}
 */
function createAccountStorage(options) {
    const root          = options.root
    const encryptedPath = path.join(root, 'src', 'accounts.enc.json')
    const plainPath     = path.join(root, 'src', 'accounts.json')
    const examplePath   = path.join(root, 'src', 'accounts.example.json')

    function readAccounts() {
        // Encrypted accounts are not yet supported — fall back to plain JSON.
        for (const p of [plainPath, examplePath]) {
            if (fs.existsSync(p)) {
                try {
                    return JSON.parse(fs.readFileSync(p, 'utf8'))
                } catch (err) {
                    throw new Error(`[account-storage] Failed to parse ${p}: ${err.message}`)
                }
            }
        }
        return []
    }

    return { encryptedPath, readAccounts }
}

module.exports = { createAccountStorage }
