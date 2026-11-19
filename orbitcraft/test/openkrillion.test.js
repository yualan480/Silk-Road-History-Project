import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOpenKrillion, KRILLION_PREFIX } from '../server/openkrillion.js';
import { DEMO } from '../server/openkrillion/src/demo.mjs';

test('community trivia validates all seven rounds, isolates players and persists a finished dive', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'orbit-krillion-'));
  const databasePath = join(dir, 'game.sqlite');
  let game = createOpenKrillion({ databasePath }), cookie = '';
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  async function call(path, data, ownCookie = cookie, origin = 'https://orbit.test') {
    const response = await game.fetch(new Request('https://orbit.test' + KRILLION_PREFIX + 'api/' + path, {
      method: data === undefined ? 'GET' : 'POST',
      headers: { Origin: origin, Cookie: ownCookie, 'Content-Type': 'application/json' },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    }));
    return { status: response.status, headers: response.headers, data: await response.json() };
  }
  try {
    const today = await call('today');
    assert.equal(today.data.sample, true);
    assert.equal(today.data.prompts.length, 7);
    assert.equal(today.data.prompts[0].answers, undefined);
    const start = await call('start', {});
    assert.equal(start.status, 200);
    assert.match(start.headers.get('Set-Cookie'), /Path=\/games\/openkrillion\/; HttpOnly; SameSite=Lax;.*Secure/);
    cookie = start.headers.get('Set-Cookie').split(';')[0];
    const runId = start.data.runId;
    assert.equal((await call('state?run=' + runId, undefined, '')).status, 404);
    assert.equal((await call('review?run=' + runId)).status, 403);
    assert.equal((await call('start', {}, cookie, 'https://other.test')).status, 403);
    assert.equal((await call('answer', { runId, round: 0, answer: 'Mashed potatoes' })).status, 409);
    now += 4000;
    assert.equal((await call('answer', { runId, round: 0, answer: 'unrecognized food xyz' })).data.rejected, true);
    for (let round = 0; round < 7; round++) {
      if (round) { await call('next', { runId }); now += 4000; }
      const result = await call('answer', { runId, round, answer: DEMO.prompts[round].answers[0].answer });
      assert.equal(result.status, 200);
      assert.equal(result.data.state.round, round + 1);
      assert.ok(result.data.result.score > 0);
      const replay = await call('answer', { runId, round, answer: DEMO.prompts[round].answers[0].answer });
      assert.equal(replay.data.alreadyScored, true);
      assert.equal(replay.data.state.results.length, round + 1);
    }
    assert.equal((await call('review?run=' + runId)).data.prompts.length, 7);
    game.close(); game = createOpenKrillion({ databasePath });
    const resumed = await call('state?run=' + runId);
    assert.equal(resumed.data.completed, true);
    assert.equal(resumed.data.results.length, 7);
    assert.equal((await call('start', {})).data.runId, runId);
    const practice = await call('start', { practice: true });
    assert.notEqual(practice.data.runId, runId);
    assert.equal(practice.data.mode, 'practice');
    const page = await game.fetch(new Request('https://orbit.test' + KRILLION_PREFIX + 'index.html'));
    const html = await page.text();
    assert.match(html, /Community Edition · Sample questions/);
    assert.match(html, /src="\/games\/openkrillion\/app.mjs"/);
    assert.match(page.headers.get('Content-Security-Policy'), /connect-src 'self'/);
  } finally { game.close(); rmSync(dir, { recursive: true, force: true }); }
});
