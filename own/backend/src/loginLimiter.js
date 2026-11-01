export function createLoginLimiter({
  max = 10,
  windowMs = 15 * 60 * 1000,
  maxKeys = 10000,
  now = Date.now,
} = {}) {
  // A Map keeps insertion order, and every entry has the same window, so the oldest come first.
  const attempts = new Map();

  function removeExpired() {
    for (const [key, entry] of attempts) {
      if (now() < entry.resetAt) {
        return;
      }
      attempts.delete(key);
    }
  }

  return {
    // Counts the attempt before the slow password check, so parallel requests can't all pass.
    tryAcquire(key) {
      removeExpired();

      const entry = attempts.get(key);
      if (entry) {
        if (entry.count >= max) {
          return false;
        }
        entry.count += 1;
        return true;
      }

      if (attempts.size >= maxKeys) {
        attempts.delete(attempts.keys().next().value);
      }
      attempts.set(key, { count: 1, resetAt: now() + windowMs });
      return true;
    },
    clear(key) {
      attempts.delete(key);
    },
    size() {
      return attempts.size;
    },
  };
}
