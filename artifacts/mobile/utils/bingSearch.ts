export const BING_UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36";

export const BING_PC_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0";

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
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&form=QBLH&cvid=${cvid}`;
  try {
    const resp = await fetch(url, {
      method: "GET",
      credentials: "omit",
      headers: {
        Cookie: cookieStr,
        "User-Agent": userAgent || BING_UA,
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: "https://www.bing.com/",
        "Cache-Control": "no-cache",
      },
    });
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
