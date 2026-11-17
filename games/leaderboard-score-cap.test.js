'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'leaderboard.js'), 'utf8');
const sendStart = source.indexOf('  function sendScore(game, score) {');
const sendEnd = source.indexOf('  // best score per name', sendStart);
const formatStart = source.indexOf('  function formatScore(game,score)');
const formatEnd = source.indexOf('\n', formatStart);
assert.ok(sendStart >= 0 && sendEnd > sendStart && formatStart >= 0);

function harness() {
  const values = new Map([['lb-sent-blockblast-player', '9827109|same-avatar']]);
  const requests = [];
  const context = {
    Math, Number, Promise, MAX_SCORE: 10000000, GAMES: ['blockblast'],
    BASE: 'https://example.invalid/scores', cache: {},
    getName: () => 'player', isCleanName: () => true,
    getAvatar: () => 'avatar', hash: () => 'same-avatar',
    markPlayed: () => {}, queueScore: () => {}, clearPending: () => {},
    headers: h => h,
    localStorage: {
      getItem: key => values.get(key) || null,
      setItem: (key, value) => values.set(key, value),
      removeItem: key => values.delete(key)
    },
    fetch: async (_, opts) => { requests.push(JSON.parse(opts.body)); return { ok: true }; }
  };
  vm.createContext(context);
  vm.runInContext(source.slice(sendStart, sendEnd) + source.slice(formatStart, formatEnd), context);
  return { context, requests, values };
}

test('a new score above ten million replaces an older nine-million best at the cap', async () => {
  const { context, requests, values } = harness();
  assert.equal(await context.sendScore('blockblast', 12876543), true);
  assert.equal(requests[0].score, 10000000);
  assert.equal(values.get('lb-sent-blockblast-player'), '10000000|same-avatar');
  assert.equal(context.formatScore('blockblast', 12876543), '10,000,000');
  assert.equal(context.formatScore('blockblast', 10000000), '10,000,000');
});

test('normal scores stay accurate and invalid scores cannot be submitted', async () => {
  const { context, requests } = harness();
  assert.equal(await context.sendScore('blockblast', 9876543), true);
  assert.equal(requests[0].score, 9876543);
  assert.equal(context.formatScore('blockblast', 9876543), '9,876,543');
  assert.equal(await context.sendScore('blockblast', Infinity), false);
  assert.equal(await context.sendScore('blockblast', -1), false);
  assert.equal(requests.length, 1);
});
