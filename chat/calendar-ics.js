/* Orbit calendar importer. Only SUMMARY, UID and dates are read from an ICS.
   Private calendar descriptions, attendees, locations and organizers stay out
   of Orbit's public calendar. Never send the uploaded file to the server. */

const DAY = 86400000;
const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const pad = n => String(n).padStart(2, '0');
const normalize = s => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/\biii\b/g, '3').replace(/\bii\b/g, '2').replace(/\bi\b/g, '1').replace(/[^a-z0-9]+/g, ' ').trim();
const unescapeText = s => String(s || '').replace(/\\[nN]/g, ' ').replace(/\\([,;\\])/g, '$1').trim();
const dateParts = str => {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(str || '');
  if (!m) return null;
  return { y: +m[1], m: +m[2], d: +m[3], h: +(m[4] || 0), min: +(m[5] || 0),
    s: +(m[6] || 0), utc: !!m[7], allDay: !m[4] };
};
function asUtc(p, timezone) {
  if (!p || p.m < 1 || p.m > 12 || p.d < 1 || p.d > 31 || p.h > 23 || p.min > 59) return null;
  let ms = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
  if (!Number.isFinite(ms) || new Date(ms).getUTCDate() !== p.d) return null;
  if (!p.utc && timezone) {
    let formatter;
    try { formatter = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit',
      day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }); }
    catch { return null; }
    for (let n = 0; n < 3; n++) {
      const obj = Object.fromEntries(formatter.formatToParts(new Date(ms)).map(x => [x.type, +x.value]));
      const actual = Date.UTC(obj.year, obj.month - 1, obj.day, obj.hour, obj.minute, obj.second);
      ms += Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - actual;
    }
  } else if (!p.utc) {
    ms = new Date(p.y, p.m - 1, p.d, p.h, p.min, p.s).getTime();
  }
  return Number.isFinite(ms) ? new Date(ms) : null;
}
function icsDate(entry, dayShift = 0) {
  if (!entry) return null;
  const p = dateParts(entry.value);
  if (!p) return null;
  if (dayShift) {
    const d = new Date(Date.UTC(p.y, p.m - 1, p.d + dayShift));
    p.y = d.getUTCFullYear(); p.m = d.getUTCMonth() + 1; p.d = d.getUTCDate();
  }
  return asUtc(p, entry.params.TZID || '');
}
function parseProp(line) {
  const cut = line.indexOf(':');
  if (cut < 0) return null;
  const head = line.slice(0, cut).split(';'), name = head.shift().toUpperCase(), params = {};
  head.forEach(bit => { const i = bit.indexOf('='); if (i > 0) params[bit.slice(0, i).toUpperCase()] = bit.slice(i + 1).replace(/^"|"$/g, ''); });
  return { name, params, value: line.slice(cut + 1) };
}
const ruleParts = str => Object.fromEntries(String(str || '').split(';').map(x => x.split('=')).filter(x => x.length === 2));
const monday = ms => { const d = new Date(ms), wd = (d.getUTCDay() + 6) % 7; return ms - wd * DAY; };

export function guessClassRole(title, roles) {
  const name = ' ' + normalize(title) + ' ';
  const candidates = roles.map(r => {
    const sub = normalize(r.subject), level = normalize(r.level);
    const subjectHit = sub && name.includes(' ' + sub + ' ');
    const shortSub = sub?.split(' ')[0];
    const partial = !subjectHit && shortSub?.length > 4 && name.includes(' ' + shortSub + ' ');
    const levelHit = level && name.includes(' ' + level + ' ');
    return { id: r.id, score: subjectHit ? 10 + (levelHit ? 3 : 0) : partial ? 4 + (levelHit ? 1 : 0) : 0 };
  }).sort((a, b) => b.score - a.score);
  return candidates.length && candidates[0].score > 0 && (candidates.length === 1 || candidates[0].score > candidates[1].score) ? candidates[0].id : '';
}

export function parseCalendar(text, options = {}) {
  const now = Date.now(), from = options.from || now - 7 * DAY, until = options.until || now + 300 * DAY;
  const max = options.max || 400;
  if (typeof text !== 'string' || text.length > 1048576 || !/BEGIN:VCALENDAR/i.test(text)) throw new Error('Choose a valid .ics file under 1 MB.');
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const blocks = []; let cur = null;
  for (const line of lines) {
    const val = line.trim();
    if (val === 'BEGIN:VEVENT') cur = {};
    else if (val === 'END:VEVENT' && cur) { blocks.push(cur); cur = null; }
    else if (cur) { const p = parseProp(line); if (p) (cur[p.name] ||= []).push(p); }
  }
  const items = [], warnings = []; let excluded = 0, duplicatesMerged = 0;
  const seen = new Set();
  for (const [index, b] of blocks.entries()) {
    if (b.STATUS?.[0]?.value === 'CANCELLED') continue;
    const begin = b.DTSTART?.[0], finish = b.DTEND?.[0], first = icsDate(begin);
    const title = unescapeText(b.SUMMARY?.[0]?.value).replace(/\s+/g, ' ').slice(0, 100);
    if (!first || !title || dateParts(begin?.value)?.allDay) { excluded++; continue; }
    let duration = finish ? (icsDate(finish)?.getTime() || NaN) - first.getTime() : 3600000;
    if (!Number.isFinite(duration) || duration <= 0 || duration > DAY) { excluded++; continue; }
    const rule = ruleParts(b.RRULE?.[0]?.value), freq = rule.FREQ, interval = Math.max(1, Math.min(52, Number(rule.INTERVAL) || 1));
    const uid = String(b.UID?.[0]?.value || 'ics-' + index).slice(0, 150);
    const ex = new Set((b.EXDATE || []).flatMap(e => e.value.split(',').map(x => icsDate({ ...e, value: x })?.getTime())).filter(Number.isFinite));
    const dayStart = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate());
    const base = dateParts(begin.value), by = (rule.BYDAY || WEEKDAYS[new Date(dayStart).getUTCDay()]).split(',');
    const untilDate = rule.UNTIL ? asUtc(dateParts(rule.UNTIL), begin.params.TZID || '')?.getTime() : null;
    const count = rule.COUNT ? Math.max(1, Math.min(10000, Number(rule.COUNT) || 1)) : Infinity;
    let produced = 0;
    const endDay = Math.min(until, now + 366 * DAY);
    const days = freq ? Math.ceil((endDay - dayStart) / DAY) + 2 : 1;
    for (let offset = 0; offset < Math.max(0, days); offset++) {
      const cd = new Date(dayStart + offset * DAY);
      const wd = WEEKDAYS[cd.getUTCDay()];
      let matches = !freq;
      if (freq === 'DAILY') matches = offset % interval === 0 && (!rule.BYDAY || by.includes(wd));
      else if (freq === 'WEEKLY') matches = Math.floor((monday(+cd) - monday(dayStart)) / (7 * DAY)) % interval === 0 && by.includes(wd);
      else if (freq === 'MONTHLY') matches = ((cd.getUTCFullYear() - first.getUTCFullYear()) * 12 + cd.getUTCMonth() - first.getUTCMonth()) % interval === 0 && cd.getUTCDate() === first.getUTCDate();
      if (!matches) continue;
      const when = freq ? icsDate(begin, offset) : first;
      if (!when || when < first || (untilDate && +when > untilDate)) continue;
      produced++;
      if (produced > count) break;
      if (+when < from || +when > until || ex.has(+when)) continue;
      // Different calendar apps assign different UIDs to the same class period.
      // Merge identical occurrences by their visible content and actual time.
      // The role is selected later; this also avoids counting duplicate previews.
      const end = new Date(+when + duration).toISOString();
      const key = normalize(title) + '|' + when.toISOString() + '|' + end;
      if (seen.has(key)) { duplicatesMerged++; continue; }
      seen.add(key);
      items.push({ uid: (uid + '|' + when.toISOString()).slice(0, 220), title,
        starts_at: when.toISOString(), ends_at: end, group: uid, role_id: '' });
      if (items.length >= max) { warnings.push('Only the first ' + max + ' upcoming class periods were included.'); break; }
    }
    if (items.length >= max) break;
    if (freq && !['DAILY', 'WEEKLY', 'MONTHLY'].includes(freq)) warnings.push('Some unsupported repeating events were skipped.');
  }
  items.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  if (excluded) warnings.push(excluded + ' all-day or incomplete entries were skipped.');
  return { items, warnings, sourceCount: blocks.length, duplicatesMerged };
}
