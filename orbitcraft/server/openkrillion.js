import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import worker from './openkrillion/src/worker.mjs';

export const KRILLION_PREFIX = '/games/openkrillion/';
// The licensed community game's Worker API runs locally on Node's SQLite.
// No Cloudflare account, original-game API, or third-party analytics is used.
export function createOpenKrillion({ databasePath }) {
  let database;
  function environment() {
    if (!database) {
      if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true });
      database = new DatabaseSync(databasePath);
      database.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
      if (database.prepare('PRAGMA user_version').get().user_version === 0) {
        database.exec('BEGIN');
        try {
          for (const file of ['0001_initial.sql', '0002_pause.sql']) {
            database.exec(readFileSync(new URL('./openkrillion/migrations/' + file, import.meta.url), 'utf8'));
          }
          database.exec('PRAGMA user_version=1; COMMIT');
        } catch (error) { database.exec('ROLLBACK'); throw error; }
      }
    }
    function prepare(sql) {
      const statement = database.prepare(sql);
      const wrap = values => ({
        bind: (...next) => wrap(next),
        first: async () => statement.get(...values) ?? null,
        all: async () => ({ results: statement.all(...values) }),
        run: async () => statement.run(...values),
      });
      return wrap([]);
    }
    return {
      REFERENCE_SYNC: 'false', LOCAL_DEVELOPMENT: 'false',
      DB: { prepare, async batch(statements) {
        database.exec('BEGIN');
        try {
          const results = [];
          for (const statement of statements) results.push(await statement.run());
          database.exec('COMMIT');
          return results;
        } catch (error) { database.exec('ROLLBACK'); throw error; }
      } },
      ASSETS: { fetch: async () => new Response('Not found', { status: 404 }) },
    };
  }
  return {
    async fetch(request) {
      const url = new URL(request.url);
      if (!url.pathname.startsWith(KRILLION_PREFIX)) return new Response('Not found', { status: 404 });
      url.pathname = '/' + url.pathname.slice(KRILLION_PREFIX.length);
      if (url.pathname === '/index.html') url.pathname = '/';
      const forwarded = new Request(url, request);
      const response = await worker.fetch(forwarded, environment(), {});
      const headers = new Headers(response.headers);
      const cookie = headers.get('Set-Cookie');
      if (cookie) headers.set('Set-Cookie', cookie.replace('Path=/;', 'Path=' + KRILLION_PREFIX + ';'));
      headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'self'; base-uri 'self'");
      if (headers.get('Content-Type')?.includes('text/html')) {
        let html = await response.text();
        html = html.replace(/(["'])\/(?!\/)/g, '$1' + KRILLION_PREFIX);
        // Always identify the edition and the limited independent question bank.
        html = html.replace(/<title>[^<]*<\/title>/, '<title>OpenKrillion — Community Edition · Sample questions</title>');
        html = html.replace('KRILLION · OPEN SOURCE', 'COMMUNITY EDITION').replace('THE DAILY DIVE', 'THE SAMPLE DIVE');
        html = html.replace('Sample practice bank · reference sync unavailable', 'Independent sample questions · same bank in daily and practice modes');
        html = html.replace('<main id="game"', '<p class="orbit-edition" style="position:fixed;bottom:2px;left:0;right:0;z-index:40;margin:0;text-align:center;font:12px/1.4 monospace;color:#a5b8d1;pointer-events:none">OpenKrillion · Community Edition · Sample questions</p><main id="game"');
        if (url.pathname === '/privacy' || url.pathname === '/about') {
          html = '<!doctype html><html lang="en"><meta charset="utf-8"><title>OpenKrillion in Orbit</title><body><main><h1>OpenKrillion — Community Edition</h1><p>This independent MIT-licensed game is not official Krillion. Orbit hosts its code and small sample question bank locally. Daily and practice modes currently use the same sample questions.</p><p>No upstream analytics or puzzle synchronization is enabled. An anonymous HttpOnly cookie resumes your game; your browser stores settings and a logbook. The Orbit server stores anonymous runs, submitted answers and optional feedback in local SQLite. On ephemeral hosting, a redeploy can reset server progress. This game does not sync with your Orbit account.</p><p><a href="' + KRILLION_PREFIX + '">Back to the game</a> · <a href="https://github.com/VulcanEon/openkrillion.com-service">Source and MIT license</a> · <a href="https://krillion.io/">Official Krillion</a></p></main></body></html>';
        }
        return new Response(request.method === 'HEAD' ? null : html, { status: response.status, headers });
      }
      return new Response(response.body, { status: response.status, headers });
    },
    close() { database?.close(); database = undefined; },
  };
}

export const defaultOpenKrillionDatabase = worldPath => resolve(dirname(worldPath), 'openkrillion.sqlite');
