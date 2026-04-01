export const BING_UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36";

export const BING_PC_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0";

export const DESKTOP_MODE_JS = `(function() {
  try {
    Object.defineProperty(navigator, 'userAgent', {
      get: function() { return '${BING_PC_UA}'; },
      configurable: true
    });
    Object.defineProperty(navigator, 'appVersion', {
      get: function() { return '5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0'; },
      configurable: true
    });
    Object.defineProperty(navigator, 'platform', {
      get: function() { return 'Win32'; },
      configurable: true
    });
    Object.defineProperty(navigator, 'vendor', {
      get: function() { return 'Google Inc.'; },
      configurable: true
    });
    Object.defineProperty(navigator, 'maxTouchPoints', {
      get: function() { return 0; },
      configurable: true
    });
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      get: function() { return 8; },
      configurable: true
    });
    Object.defineProperty(screen, 'width', {
      get: function() { return 1920; },
      configurable: true
    });
    Object.defineProperty(screen, 'height', {
      get: function() { return 1080; },
      configurable: true
    });
    Object.defineProperty(screen, 'availWidth', {
      get: function() { return 1920; },
      configurable: true
    });
    Object.defineProperty(screen, 'availHeight', {
      get: function() { return 1040; },
      configurable: true
    });
    Object.defineProperty(screen, 'colorDepth', {
      get: function() { return 24; },
      configurable: true
    });
    Object.defineProperty(window, 'innerWidth', {
      get: function() { return 1920; },
      configurable: true
    });
    Object.defineProperty(window, 'innerHeight', {
      get: function() { return 969; },
      configurable: true
    });
    Object.defineProperty(window, 'outerWidth', {
      get: function() { return 1920; },
      configurable: true
    });
    Object.defineProperty(window, 'outerHeight', {
      get: function() { return 1040; },
      configurable: true
    });
    Object.defineProperty(window, 'devicePixelRatio', {
      get: function() { return 1; },
      configurable: true
    });
    var meta = document.querySelector('meta[name="viewport"]');
    if (meta) { meta.setAttribute('content', 'width=1920'); }
    else {
      meta = document.createElement('meta');
      meta.name = 'viewport';
      meta.content = 'width=1920';
      if (document.head) document.head.appendChild(meta);
    }
  } catch(e) {}
})(); true;`;

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function randomHex(len: number): string {
  return Array.from({ length: len }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");
}

export function buildCookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .filter(([k]) => !k.startsWith("_ls_"))
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

export async function performBingSearch(
  query: string,
  cookies: Record<string, string>,
  userAgent?: string
): Promise<{ ok: boolean; status?: number; networkError?: boolean }> {
  const cookieStr = buildCookieHeader(cookies);
  const cvid = randomHex(32).toUpperCase();
  const isPC = userAgent === BING_PC_UA;
  const form = isPC ? "QBRE" : "QBLH";
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&form=${form}&cvid=${cvid}${isPC ? "&ensearch=1&PC=EDGEDHTML" : ""}`;
  const headers: Record<string, string> = {
    Cookie: cookieStr,
    "User-Agent": userAgent || BING_UA,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    Referer: "https://www.bing.com/",
    "Cache-Control": "max-age=0",
    "Upgrade-Insecure-Requests": "1",
  };
  if (isPC) {
    headers["Sec-Ch-Ua"] = '"Microsoft Edge";v="131", "Chromium";v="131", "Not_A Brand";v="24"';
    headers["Sec-Ch-Ua-Mobile"] = "?0";
    headers["Sec-Ch-Ua-Platform"] = '"Windows"';
    headers["Sec-Fetch-Dest"] = "document";
    headers["Sec-Fetch-Mode"] = "navigate";
    headers["Sec-Fetch-Site"] = "same-origin";
    headers["Sec-Fetch-User"] = "?1";
  }
  try {
    const resp = await fetch(url, {
      method: "GET",
      credentials: "omit",
      redirect: "follow",
      headers,
    });
    try { await resp.text(); } catch {}
    return { ok: resp.ok || resp.status === 302, status: resp.status };
  } catch (e: any) {
    if (e?.message?.includes("Network request failed")) {
      return { ok: false, status: 0, networkError: true };
    }
    return { ok: false, status: 0 };
  }
}

function dailyProgress(counter: any): number {
  if (!counter) return 0;
  const entry = Array.isArray(counter) ? counter[0] : counter;
  if (!entry) return 0;
  const progress = Math.max(0, Math.floor(Number(entry.pointProgress) || 0));
  const max = Math.max(0, Math.floor(Number(entry.pointProgressMax) || 0));
  if (max > 0 && progress > max) return max;
  return progress;
}

export async function fetchRewardsPoints(
  cookies: Record<string, string>
): Promise<{ available: number; today: number }> {
  const cookieStr = buildCookieHeader(cookies);
  try {
    const resp = await fetch(
      "https://rewards.bing.com/api/getuserinfo?type=1&X-Requested-With=XMLHttpRequest",
      {
        credentials: "omit",
        headers: {
          Cookie: cookieStr,
          "User-Agent": BING_UA,
          Accept: "application/json, text/javascript, */*",
          Referer: "https://rewards.bing.com/",
          "X-Requested-With": "XMLHttpRequest",
        },
      }
    );
    if (!resp.ok) return { available: 0, today: 0 };
    const json = await resp.json();
    const status = json?.dashboard?.userStatus ?? json?.userStatus;
    const available = status?.availablePoints ?? 0;
    const counters = status?.counters;
    const pcToday = dailyProgress(counters?.pcSearch);
    const mobileToday = dailyProgress(counters?.mobileSearch);
    const edgeToday = dailyProgress(counters?.edgeSearch);
    const dailyPt = dailyProgress(counters?.dailyPoint);
    const totalToday = pcToday + mobileToday + edgeToday + dailyPt;
    console.log(
      `[Points] available=${available} pcToday=${pcToday} mobile=${mobileToday} edge=${edgeToday} daily=${dailyPt} => today=${totalToday}`
    );
    return { available, today: totalToday };
  } catch {
    return { available: 0, today: 0 };
  }
}
