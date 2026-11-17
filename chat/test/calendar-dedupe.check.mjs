import assert from 'node:assert/strict';
import { parseCalendar } from '../calendar-ics.js';

const start = new Date(Date.now() + 2 * 86400000);
start.setUTCHours(15, 0, 0, 0);
const end = new Date(start.getTime() + 3600000);
const date = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const event = (uid, title, from = start, to = end) =>
  ['BEGIN:VEVENT', `UID:${uid}`, `SUMMARY:${title}`, `DTSTART:${date(from)}`,
    `DTEND:${date(to)}`, 'END:VEVENT'].join('\r\n');

const file = ['BEGIN:VCALENDAR', 'VERSION:2.0',
  event('teacher-export', 'AP Biology - Quiz'),
  event('student-export', 'ap biology quiz'),
  event('distinct', 'AP Biology Lab'),
  event('next-period', 'AP Biology Quiz', new Date(start.getTime() + 3600000), new Date(end.getTime() + 3600000)),
  'END:VCALENDAR'].join('\r\n');
const parsed = parseCalendar(file);

assert.equal(parsed.sourceCount, 4);
assert.equal(parsed.items.length, 3, 'identical events from different UIDs should merge');
assert.equal(parsed.duplicatesMerged, 1);
assert.ok(parsed.items.some(e => e.title === 'AP Biology Lab'), 'different titles must remain');
assert.ok(parsed.items.some(e => e.starts_at === new Date(start.getTime() + 3600000).toISOString()), 'different times must remain');
console.log('Orbit ICS deduplication tests passed');
