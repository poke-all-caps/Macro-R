/**
 * cookie-capture.ts
 * -----------------
 * Standalone Patchright helper spawned by the desk server when the user
 * chooses "Capture Cookies" instead of entering credentials manually.
 *
 * Usage (invoked by app-window.js):
 *   tsx scripts/desk/cookie-capture.ts <sessionId> <email> <statusFilePath>
 *
 * Flow:
 *   1. Opens a visible Chromium window on the Microsoft login page.
 *   2. Waits for the user to finish signing in (URL lands on rewards / account).
 *   3. Captures all cookies from the browser context.
 *   4. Writes cookies to sessions/<email>/session_desktop.json.
 *   5. Updates the status file so the desk server can report completion.
 */

import path from 'path'
import fs from 'fs'
import rebrowser from 'patchright'

const [, , sessionId, email, statusFilePath] = process.argv

if (!sessionId || !email || !statusFilePath) {
    console.error('[cookie-capture] Usage: tsx cookie-capture.ts <sessionId> <email> <statusFile>')
    process.exit(1)
}

const ROOT = path.resolve(__dirname, '../../')

function writeStatus(obj: Record<string, unknown>) {
    try {
        fs.writeFileSync(statusFilePath, JSON.stringify({ sessionId, email, ...obj }, null, 2), 'utf8')
    } catch {
        // best-effort — the desk server may be reading at the same time
    }
}

async function main() {
    writeStatus({ status: 'opening' })

    const browser = await rebrowser.chromium.launch({
        headless: false,
        args: [
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-blink-features=Attestation',
            '--window-size=960,680',
            '--window-position=120,80',
        ],
    })

    const context = await browser.newContext()
    const page = await context.newPage()

    // Set a title so the user knows which window to use
    await page.addInitScript(() => {
        document.addEventListener('DOMContentLoaded', () => {
            document.title = 'Sign in — Macro Rewards Cookie Capture'
        })
    })

    writeStatus({ status: 'waiting' })

    // Go straight to the Rewards login page so the session lands with the
    // right domain cookies after the user signs in.
    await page.goto(
        'https://login.live.com/login.srf?wa=wsignin1.0&rpsnv=11&wp=MBI_SSL' +
        '&wreply=https%3A%2F%2Frewards.microsoft.com%2F&id=264080',
        { waitUntil: 'domcontentloaded' }
    )

    // Wait until the user finishes signing in and lands somewhere useful.
    // We accept the rewards page OR the account overview page.
    await page.waitForURL(
        url => {
            const h = url.toString()
            return (
                (h.includes('rewards.microsoft.com') && !h.includes('/auth') && !h.includes('login')) ||
                (h.includes('account.microsoft.com') && !h.includes('login'))
            )
        },
        { timeout: 600_000 } // 10 minutes — plenty of time for manual login
    )

    writeStatus({ status: 'capturing' })

    // Grab every cookie the context has accumulated across all domains.
    const cookies = await context.cookies()

    // Persist to the same path the bot's ConfigLoader expects:
    // sessions/<email>/session_desktop.json
    const sessionDir = path.join(ROOT, 'sessions', email)
    fs.mkdirSync(sessionDir, { recursive: true })
    const sessionFile = path.join(sessionDir, 'session_desktop.json')
    fs.writeFileSync(sessionFile, JSON.stringify(cookies, null, 2), 'utf8')

    writeStatus({ status: 'done', cookieCount: cookies.length, sessionFile })

    await browser.close()
    process.exit(0)
}

main().catch(err => {
    const msg = err instanceof Error ? err.message : String(err)
    writeStatus({ status: 'failed', error: msg })
    process.exit(1)
})
