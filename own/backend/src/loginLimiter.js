export function createLoginLimiter({ max = 10, windowMs = 15 * 60 * 1000, now = Date.now } = {}) {
  const failures = new Map();

  function removeExpired() {
    for (const [key, entry] of failures) {
      if (now() >= entry.resetAt) {
        failures.delete(key);
      }
    }
  }

  return {
    isBlocked(key) {
      removeExpired();
      return (failures.get(key)?.count ?? 0) >= max;
    },
    recordFailure(key) {
      removeExpired();
      const entry = failures.get(key) ?? { count: 0, resetAt: now() + windowMs };
      entry.count += 1;
      failures.set(key, entry);
    },
    clear(key) {
      failures.delete(key);
    },
    size() {
      return failures.size;
    },
  };
}
