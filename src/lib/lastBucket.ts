/**
 * Remember the bucket someone last spent from. Most people log the same few
 * kinds of spend over and over, so the second time should already be right.
 * Browser-local on purpose: it's a convenience, not data worth syncing.
 */

const KEY = "tp-last-bucket";

export function rememberBucket(bucketId: string): void {
  try {
    localStorage.setItem(KEY, bucketId);
  } catch {
    // Private mode or storage disabled — the default just stays the default.
  }
}

/**
 * The bucket to preselect: last used if it still exists, else the caller's
 * fallback (usually the fun bucket).
 */
export function lastBucket(validIds: string[], fallback: string): string {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved !== null && (saved === "" || validIds.includes(saved))) return saved;
  } catch {
    /* ignore */
  }
  return fallback;
}
