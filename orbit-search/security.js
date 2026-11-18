import { randomBytes } from 'node:crypto';
export function createSessions() {
  const sessions = new Map();
  function prune() { for (const [token, s] of sessions) if (s.expires <= Date.now()) sessions.delete(token); }
  return {
    issue(identity) {
      prune();
      // A repeated refresh replaces this user's old ticket instead of growing memory forever.
      for (const [token, s] of sessions) if (s.user === identity.id) sessions.delete(token);
      if (sessions.size >= 500) throw new Error('Orbit Search is busy. Try again shortly.');
      const token = randomBytes(32).toString('base64url');
      const expires = Math.min(identity.expiresAt, Date.now() + 30 * 60 * 1000);
      sessions.set(token, { user: identity.id, expires, connections: new Set() });
      return { token, expires };
    },
    get(token) { prune(); return sessions.get(token); }
  };
}
