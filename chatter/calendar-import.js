/* Orbit public ICS importer. Source files never leave the browser; only
   user-approved event titles, times and selected role IDs reach Supabase. */
import { parseCalendar, guessClassRole } from './calendar-ics.js?v=1';

export function openCalendarImport({ modal, toast, sb, esc, classRoles, navTo, refresh }) {
  const roles = classRoles();
  const pickRoles = () => modal('Choose roles first',
    '<p>Select at least one class or club in <b>Roles</b> before adding a public calendar.</p>',
    [{ label: 'Cancel', cls: 'ghost' }, { label: 'Go to Roles', fn: () => navTo('roles') }]);
  if (!roles.length) return pickRoles();

  const groups = new Map();
  for (const r of roles) {
    if (!r.exclusive_group) continue;
    const key = r.exclusive_group.toLowerCase();
    if (groups.has(key)) return modal('Resolve class choices',
      `<p>You currently have more than one class in the <b>${esc(key)}</b> group. Choose one before publishing a schedule. Existing roles have been preserved.</p>`,
      [{ label: 'Cancel', cls: 'ghost' }, { label: 'Review Roles', fn: () => navTo('roles') }]);
    groups.set(key, r);
  }

  const label = r => r.subject + (r.level ? ' (' + r.level + ')' : '');
  const roleOptions = roles.map(r => `<option value="${esc(r.id)}">${esc(label(r))}</option>`).join('');
  let parsed = null, series = [];

  const markup = `<p class="muted">Import an <b>.ics</b> file and publish the selected events to Orbit's shared calendar.
    Only the event title and times are published. The original file, attendee list, notes, and location stay private.</p>
    <label class="lbl2" for="ci-file">Calendar file (.ics, up to 1 MB)</label>
    <input id="ci-file" type="file" accept=".ics,text/calendar">
    <div id="ci-preview" aria-live="polite" style="margin:12px 0"><p class="muted">Choose a file to preview its events.</p></div>
    <label style="display:flex;align-items:flex-start;gap:8px;margin-top:14px">
      <input id="ci-consent" type="checkbox" style="width:auto;margin-top:3px">
      <span>I understand these event titles, times and class/club labels will be visible to Orbit members.</span>
    </label>`;

  modal('Add my calendar', markup, [
    { label: 'Cancel', cls: 'ghost' },
    { label: 'Publish events', fn: async bg => {
      if (!parsed?.items?.length) { toast('Choose a valid calendar with upcoming timed events.', true); return false; }
      const roleMap = new Map();
      for (const [index, g] of series.entries()) {
        const value = bg.querySelector(`[data-ci-role="${index}"]`)?.value;
        if (!value) { toast('Match each event to a role, or choose Skip.', true); return false; }
        roleMap.set(g.key, value);
      }
      if (!bg.querySelector('#ci-consent')?.checked) { toast('Confirm that you want to publish these events.', true); return false; }
      const rows = parsed.items.map(e => ({
        role_id: roleMap.get(e.title.toLocaleLowerCase()), title: e.title,
        starts_at: e.starts_at, ends_at: e.ends_at
      })).filter(e => e.role_id && e.role_id !== 'skip');
      if (!rows.length) { toast('Choose at least one event to publish.', true); return false; }
      const result = await sb.rpc('import_class_calendar', { p_items: rows });
      if (result.error) { toast(result.error.message || 'Could not publish calendar.', true); return false; }
      const added = Number(result.data || 0);
      toast(added ? `${added} public calendar events added.` : 'Those events are already on the public calendar.');
      await refresh();
    }}
  ], bg => {
    const input = bg.querySelector('#ci-file'), preview = bg.querySelector('#ci-preview');
    input.addEventListener('change', async () => {
      parsed = null; series = [];
      const file = input.files?.[0];
      if (!file) { preview.textContent = 'Choose a calendar file.'; return; }
      if (file.size > 1048576 || !/\.ics$/i.test(file.name)) {
        preview.textContent = 'Please choose a .ics file under 1 MB.'; return;
      }
      preview.textContent = 'Reading calendar…';
      try {
        parsed = parseCalendar(await file.text());
        if (!parsed.items.length) {
          preview.innerHTML = '<p class="muted">No upcoming timed events were found. All-day events are not imported.</p>'; return;
        }
        const groups = new Map();
        for (const item of parsed.items) {
          const key = item.title.toLocaleLowerCase();
          if (!groups.has(key)) groups.set(key, { key, title: item.title, count: 0 });
          groups.get(key).count++;
        }
        series = [...groups.values()];
        preview.innerHTML = `<p><b>${parsed.items.length}</b> event occurrences found across ${series.length} event titles.
          Match each title to one of your selected roles, or skip it.</p>
          <div style="max-height:300px;overflow:auto;padding:4px 6px">
          ${series.map((g, i) => {
            const guessed = guessClassRole(g.title, roles);
            return `<div style="display:flex;align-items:center;gap:10px;margin:8px 0;flex-wrap:wrap">
              <div style="flex:1;min-width:135px"><b>${esc(g.title)}</b><small class="muted" style="display:block">${g.count} events</small></div>
              <select data-ci-role="${i}" aria-label="Role for ${esc(g.title)}" style="flex:1;min-width:180px">
                <option value="">Choose matching role…</option>${roleOptions}<option value="skip">Skip these events</option>
              </select></div>`;
          }).join('')}</div>
          ${parsed.warnings.map(w => `<p class="muted">${esc(w)}</p>`).join('')}`;
        series.forEach((g, i) => {
          const guessed = guessClassRole(g.title, roles);
          if (guessed) preview.querySelector(`[data-ci-role="${i}"]`).value = guessed;
        });
      } catch (error) {
        parsed = null; series = [];
        preview.textContent = error.message || 'Could not read calendar.';
      }
    });
  });
}
