/**
 * Formats the time remaining until a given ISO timestamp.
 *
 * @param expiresAt - ISO date string of the expiry time
 * @param compact   - true → short badge form ("2h 15m"), false → full sentence form ("2 hours, 15 minutes")
 * @returns human-readable remaining time, or "Expired" if the time has passed
 */
export function formatTimeRemaining(expiresAt: string, compact = false): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "Expired";

  const totalSeconds = Math.floor(ms / 1000);
  const totalMinutes = Math.floor(totalSeconds / 60);
  const totalHours = Math.floor(totalMinutes / 60);
  const totalDays = Math.floor(totalHours / 24);

  if (totalDays >= 365) {
    const years = Math.floor(totalDays / 365);
    const remMonths = Math.floor((totalDays % 365) / 30);
    if (compact) return remMonths > 0 ? `${years}y ${remMonths}mo` : `${years}y`;
    return remMonths > 0
      ? `${years} year${years > 1 ? "s" : ""}, ${remMonths} month${remMonths > 1 ? "s" : ""}`
      : `${years} year${years > 1 ? "s" : ""}`;
  }

  if (totalDays >= 30) {
    const months = Math.floor(totalDays / 30);
    const remDays = totalDays % 30;
    if (compact) return remDays > 0 ? `${months}mo ${remDays}d` : `${months}mo`;
    return remDays > 0
      ? `${months} month${months > 1 ? "s" : ""}, ${remDays} day${remDays > 1 ? "s" : ""}`
      : `${months} month${months > 1 ? "s" : ""}`;
  }

  if (totalDays >= 1) {
    const remHours = totalHours % 24;
    if (compact) return remHours > 0 ? `${totalDays}d ${remHours}h` : `${totalDays}d`;
    return remHours > 0
      ? `${totalDays} day${totalDays > 1 ? "s" : ""}, ${remHours} hour${remHours > 1 ? "s" : ""}`
      : `${totalDays} day${totalDays > 1 ? "s" : ""}`;
  }

  if (totalHours >= 1) {
    const remMins = totalMinutes % 60;
    if (compact) return remMins > 0 ? `${totalHours}h ${remMins}m` : `${totalHours}h`;
    return remMins > 0
      ? `${totalHours} hour${totalHours > 1 ? "s" : ""}, ${remMins} minute${remMins > 1 ? "s" : ""}`
      : `${totalHours} hour${totalHours > 1 ? "s" : ""}`;
  }

  if (totalMinutes >= 1) {
    if (compact) return `${totalMinutes}m`;
    return `${totalMinutes} minute${totalMinutes > 1 ? "s" : ""}`;
  }

  if (compact) return `${totalSeconds}s`;
  return `${totalSeconds} second${totalSeconds !== 1 ? "s" : ""}`;
}
