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

async function main() {
    writeStatus({ status: 'opening' })

    // Resolve patchright's own Chromium executable. Using the system Chrome
    // causes a CDP connection hang because stealth patching requires the
    // specific patchright build — not the user's installed browser.
    let executablePath: string | undefined
    try {
        const exePath = rebrowser.chromium.executablePath()
        // executablePath() resolves even when the binary hasn't been downloaded;
        // check that the file actually exists before passing it.
        if (fs.existsSync(exePath)) {
            executablePath = exePath
        }
    } catch {
        // ignore — will fall back to auto-detect below
    }

    if (!executablePath) {
        writeStatus({
            status: 'failed',
            error:
                'Patchright Chromium not installed. Run this once:\n' +
                '  node .\\node_modules\\.pnpm\\patchright@1.61.1\\node_modules\\patchright\\cli.js install chromium\n' +
                'Then try again.',
        })
        process.exit(1)
    }

    // Tell the UI which binary we resolved so the user can verify it.
    writeStatus({ status: 'opening', step: 'launching', executablePath })

    // Give the browser 30 s to launch. If it hangs for any reason the process
    // would otherwise spin forever at 'opening'.
    const LAUNCH_TIMEOUT_MS = 30_000
    const browser = await Promise.race([
        rebrowser.chromium.launch({
            headless: false,
            executablePath,
            args: [
                '--no-first-run',
                '--no-default-browser-check',
                '--disable-blink-features=Attestation',
                '--window-size=960,680',
                '--window-position=120,80',
            ],
        }),
        new Promise<never>((_, reject) =>
            setTimeout(
                () => reject(new Error(
                    `Browser failed to open within 30 s.\nBinary used: ${executablePath}\n` +
                    'Try: node .\\node_modules\\.pnpm\\patchright@1.61.1\\node_modules\\patchright\\cli.js install chromium'
                )),
                LAUNCH_TIMEOUT_MS
            )
        ),
    ])

    writeStatus({ status: 'opening', step: 'creating-context', executablePath })
    const context = await browser.newContext()

    writeStatus({ status: 'opening', step: 'new-page', executablePath })
    const page = await context.newPage()

    // Set a title so the user knows which window to use
    await page.addInitScript(() => {
        document.addEventListener('DOMContentLoaded', () => {
            document.title = 'Sign in — Macro Rewards Cookie Capture'
        })
    })

    writeStatus({ status: 'opening', step: 'navigating', executablePath })
    // (page.goto follows immediately below — status advances to 'waiting' after)
    writeStatus({ status: 'waiting' })

    // Go straight to the Rewards login page so the session lands with the
    // right domain cookies after the user signs in.
    await page.goto(
        'https://login.live.com/login.srf?wa=wsignin1.0&rpsnv=11&wp=MBI_SSL' +
        '&wreply=https%3A%2F%2Frewards.microsoft.com%2F&id=264080',
        { waitUntil: 'domcontentloaded' }
    )

    try {
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
    } catch (waitErr) {
        const msg = waitErr instanceof Error ? waitErr.message : String(waitErr)
        const isBrowserClosed =
            msg.includes('Target closed') ||
            msg.includes('target page, context or browser has been closed') ||
            msg.includes('Browser closed') ||
            msg.includes('Context was destroyed')

        // Passkey and Windows Hello close the browser window automatically after
        // successful authentication. Treat a browser-close as a graceful exit:
        // whatever cookies the context accumulated are still readable and should
        // be saved so the bot can use the session without re-logging in.
        if (isBrowserClosed) {
            const saved = await persistCookies(context)
            if (saved && saved.count > 0) {
                writeStatus({ status: 'done', cookieCount: saved.count, sessionFile: saved.sessionFile })
                process.exit(0)
            }
            // Browser closed before login completed — fall through to error
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

    // Distil the long Playwright/Patchright error into one readable line.
    let msg = raw.split('\n')[0].trim()

    // Detect "no display" failures that occur in headless/server environments.
    if (
        raw.includes('libglib') ||
        raw.includes('cannot open shared object') ||
        raw.includes('DISPLAY') ||
        raw.includes('no display') ||
        raw.toLowerCase().includes('error while loading shared')
    ) {
        msg = 'Cookie capture requires a desktop environment. Run the bot locally (node scripts/desk/app-window.js) where a real browser window can open.'
    }

    writeStatus({ status: 'failed', error: msg })
    process.exit(1)
})
