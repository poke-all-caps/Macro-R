import { AppState, type AppStateStatus, type NativeEventSubscription } from "react-native";
import { API_BASE } from "@/context/LicenseContext";

// Ping interval — 4 minutes is comfortably under Render's 15-min sleep
// threshold and Neon's 5-min auto-suspend.
const PING_INTERVAL_MS = 4 * 60 * 1000;

async function ping() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    await fetch(`${API_BASE}/healthz`, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timer);
  } catch {
    // Silently ignore — this is best-effort; real requests handle their own errors.
  }
}

/**
 * Start a periodic server keep-alive ping.
 * Returns a disposer — call it (e.g. in useEffect cleanup) to stop everything.
 * Pauses automatically while the app is backgrounded; resumes on foreground.
 */
export function startKeepAlive(): () => void {
  let intervalId: ReturnType<typeof setInterval> | null = null;

  function startInterval() {
    if (intervalId !== null) return;
    ping();
    intervalId = setInterval(ping, PING_INTERVAL_MS);
  }

  function stopInterval() {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  const subscription: NativeEventSubscription = AppState.addEventListener(
    "change",
    (state: AppStateStatus) => {
      if (state === "active") {
        startInterval();
      } else {
        stopInterval();
      }
    }
  );

  // Fire immediately on call (app is already in the foreground at this point).
  startInterval();

  // Return disposer so the caller can clean up on unmount.
  return () => {
    stopInterval();
    subscription.remove();
  };
}
