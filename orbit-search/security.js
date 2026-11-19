import { randomBytes } from 'node:crypto';
export function createSessions() {
  const sessions = new Map();
  function prune() { for (const [token, s] of sessions) if (s.expires <= Date.now()) sessions.delete(token); }
  return {
    issue(identity) {
      prune();
      // Renew this account's ticket without breaking other tabs or active relay sockets.
      const expires = Math.min(identity.expiresAt, Date.now() + 30 * 60 * 1000);
      for (const [token, session] of sessions) if (session.user === identity.id) {
        session.expires = expires;
        return {token, expires};
      }
      if (sessions.size >= 500) throw new Error('Orbit Search is busy. Try again shortly.');
      const token = randomBytes(32).toString('base64url');
      sessions.set(token, { user: identity.id, expires, connections: new Set() });
      return { token, expires };
    },
    get(token) { prune(); return sessions.get(token); }
  };
}
