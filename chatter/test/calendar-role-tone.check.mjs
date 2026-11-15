import assert from 'node:assert/strict';
import { classifyCalendarEvent, prioritizeCalendarEvents } from '../calendar-role-tone.js';

const mine = new Set(['algebra-ii', 'spanish-iii']);
const events = [
  { id: 'a', class_role_id: 'french-ii' },
  { id: 'b', class_role_id: 'algebra-ii' },
  { id: 'c', class_role_id: null },
  { id: 'd', class_role_id: 'spanish-iii' },
];
assert.equal(classifyCalendarEvent(events[0], mine), 'unmatched');
assert.equal(classifyCalendarEvent(events[1], mine), 'matching');
assert.equal(classifyCalendarEvent(events[2], mine), 'general');
assert.equal(classifyCalendarEvent(events[3], mine), 'matching');
assert.equal(classifyCalendarEvent(events[1], new Set()), 'unmatched');
assert.deepEqual(prioritizeCalendarEvents(events, mine).map(e => e.id), ['b', 'd', 'c', 'a']);
assert.deepEqual(events.map(e => e.id), ['a', 'b', 'c', 'd'], 'do not reorder the source list');
console.log('Orbit calendar role visibility tests passed');
