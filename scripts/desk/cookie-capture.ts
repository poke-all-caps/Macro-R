/**
 * cookie-capture.ts
 * -----------------
 * Standalone Patchright helper spawned by the desk server when the user
 * chooses "Launch Browser" to capture Microsoft cookies via a visible browser.
 *
 * Usage (invoked by desk.ts route):
 *   tsx scripts/desk/cookie-capture.ts <sessionId> <email> <statusFilePath>
 *
 * Flow:
 *   1. Opens a visible Edge/Chromium window on the Microsoft login page.
 *   2. Waits for the user to finish signing in (URL leaves the login domain).
 *   3. Captures all cookies from the browser context.
 *   4. Writes cookies to sessions/<email>/session_desktop.json.
 *   5. Updates the status file so the desk server can report completion.
 */

import path from 'path'
import fs from 'fs'
import { chromium } from 'patchright'

const [, , sessionId, email, statusFilePath] = process.argv

if (!sessionId || !email || !statusFilePath) {
    console.error('[cookie-capture] Usage: tsx cookie-capture.ts <sessionId> <email> <statusFile>')
    process.exit(1)
}

// __dirname is patched by tsx — points to scripts/desk/
const ROOT = path.resolve(__dirname, '../../')

function writeStatus(obj: Record<string, unknown>) {
    try {
        fs.writeFileSync(statusFilePath, JSON.stringify({ sessionId, email, ...obj }, null, 2), 'utf8')
    } catch {
        // best-effort — the desk server may be reading at the same time
    }
}

/** Save cookies from context to disk. Returns { count, sessionFile } or null on failure. */
async function persistCookies(context: { cookies(): Promise<unknown[]> }): Promise<{ count: number; sessionFile: string } | null> {
    try {
        const cookies = await context.cookies()
        if (cookies.length === 0) return null
        const sessionDir = path.join(ROOT, 'sessions', email)
        fs.mkdirSync(sessionDir, { recursive: true })
        const sessionFile = path.join(sessionDir, 'session_desktop.json')
        fs.writeFileSync(sessionFile, JSON.stringify(cookies, null, 2), 'utf8')
        return { count: cookies.length, sessionFile }
    } catch {
        return null
    }
}

/**
 * Returns true once the user has left the Microsoft login pages and landed
 * on a real rewards / account / Bing page with valid session cookies.
 *
 * Deliberately broad: any Microsoft-family domain that is NOT the sign-in
 * flow itself counts as "done". This handles the many intermediate redirect
 * URLs that Microsoft uses during and after authentication.
 */
function isPostLoginUrl(raw: string): boolean {
    try {
        const url = new URL(raw)
        const host = url.hostname.toLowerCase()

        const isLoginPage =
            host === 'login.live.com' ||
            host === 'login.microsoftonline.com' ||
            host === 'account.live.com' ||
            host.endsWith('.login.live.com') ||
            host.endsWith('.login.microsoftonline.com')

        const isMicrosoftFamily =
            host.endsWith('.microsoft.com') ||
            host.endsWith('.bing.com') ||
            host.endsWith('.live.com') ||
            host.endsWith('.msn.com')

        return isMicrosoftFamily && !isLoginPage
    } catch {
        return false
    }
}

async function main() {
    writeStatus({ status: 'opening', step: 'launching' })

    const LAUNCH_TIMEOUT_MS = 30_000
    let browser

    // Try Edge first (ships with every Windows 10/11 machine), then fall back
    // to the Patchright-bundled Chromium.
    try {
        browser = await Promise.race([
            chromium.launch({
                headless: false,
                channel: 'msedge',
                args: [
                    '--no-first-run',
                    '--no-default-browser-check',
                    '--window-size=960,680',
                    '--window-position=120,80',
                ],
            }),
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('__TIMEOUT__')), LAUNCH_TIMEOUT_MS)
            ),
        ])
    } catch (edgeErr) {
        const msg = edgeErr instanceof Error ? edgeErr.message : String(edgeErr)
        if (msg === '__TIMEOUT__') {
            writeStatus({
                status: 'failed',
                error: 'Microsoft Edge failed to open within 30 s. Make sure Edge is installed (it ships with Windows 10/11).',
            })
            process.exit(1)
        }
        // Edge not found — fall back to Patchright's bundled Chromium
        writeStatus({ status: 'opening', step: 'launching-chromium' })
        try {
            browser = await Promise.race([
                chromium.launch({
                    headless: false,
                    args: [
                        '--no-first-run',
                        '--no-default-browser-check',
                        '--window-size=960,680',
                        '--window-position=120,80',
                    ],
                }),
                new Promise<never>((_, reject) =>
                    setTimeout(
                        () => reject(new Error('Browser failed to open within 30 s. Run: pnpm exec patchright install chromium')),
                        LAUNCH_TIMEOUT_MS
                    )
                ),
            ])
        } catch (chromiumErr) {
            const chromiumMsg = chromiumErr instanceof Error ? chromiumErr.message : String(chromiumErr)
            writeStatus({ status: 'failed', error: chromiumMsg })
            process.exit(1)
        }
    }

    writeStatus({ status: 'opening', step: 'creating-context' })
    const context = await browser.newContext()

    writeStatus({ status: 'opening', step: 'new-page' })
    const page = await context.newPage()

    writeStatus({ status: 'opening', step: 'navigating' })

    // Go straight to the Rewards login page so the session lands with the
    // right domain cookies after the user signs in.
    await page.goto(
        'https://login.live.com/login.srf?wa=wsignin1.0&rpsnv=11&wp=MBI_SSL' +
        '&wreply=https%3A%2F%2Frewards.microsoft.com%2F&id=264080',
        { waitUntil: 'domcontentloaded' }
    )

    writeStatus({ status: 'waiting' })

    try {
        // Wait until the user finishes signing in and the browser lands on any
        // Microsoft-family page that is NOT the login flow itself.
        await page.waitForURL(
            url => isPostLoginUrl(url.toString()),
            { timeout: 600_000 } // 10 minutes — plenty of time for manual sign-in
        )
    } catch (waitErr) {
        const msg = waitErr instanceof Error ? waitErr.message : String(waitErr)
        const isBrowserClosed =
            msg.includes('Target closed') ||
            msg.includes('target page, context or browser has been closed') ||
            msg.includes('Browser closed') ||
            msg.includes('Context was destroyed')

        // Passkey / Windows Hello closes the browser window automatically after
        // successful auth. Treat a browser-close as a graceful success: whatever
        // cookies accumulated are still readable.
        if (isBrowserClosed) {
            const saved = await persistCookies(context)
            if (saved && saved.count > 0) {
                writeStatus({ status: 'done', cookieCount: saved.count, sessionFile: saved.sessionFile })
                process.exit(0)
            }
            writeStatus({ status: 'failed', error: 'Browser was closed before sign-in completed.' })
            process.exit(1)
        }
        throw waitErr
    }

    writeStatus({ status: 'capturing' })

    // Grab every cookie the context has accumulated across all domains.
    const saved = await persistCookies(context)
    if (!saved) {
        writeStatus({ status: 'failed', error: 'No cookies captured — try signing in again.' })
        await browser.close()
        process.exit(1)
    }

    writeStatus({ status: 'done', cookieCount: saved.count, sessionFile: saved.sessionFile })

    await browser.close()
    process.exit(0)
}

main().catch(err => {
    const raw = err instanceof Error ? err.message : String(err)

    // Distil the long Patchright error into one readable line.
    let msg = raw.split('\n')[0].trim()

    // Detect "no display" failures in headless/server environments.
    if (
        raw.includes('libglib') ||
        raw.includes('cannot open shared object') ||
        raw.includes('DISPLAY') ||
        raw.includes('no display') ||
        raw.toLowerCase().includes('error while loading shared')
    ) {
        msg = 'Cookie capture requires a desktop environment with a display. Run the bot locally on your Windows/Linux desktop machine.'
    }

    writeStatus({ status: 'failed', error: msg })
    process.exit(1)
})
