let _pendingCookies: { cookies: Record<string, string>; accountName: string } | null = null;

export function setCookieBrowserPayload(cookies: Record<string, string>, accountName: string) {
  _pendingCookies = { cookies, accountName };
}

export function consumeCookieBrowserPayload() {
  const data = _pendingCookies;
  _pendingCookies = null;
  return data;
}
