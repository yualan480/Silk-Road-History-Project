// Public class/club events are visible to everyone. Only their presentation
// changes based on the viewer's selected class/club role IDs.
export function classifyCalendarEvent(event, selectedRoleIds) {
  if (!event?.class_role_id) return 'general';
  return selectedRoleIds?.has(String(event.class_role_id)) ? 'matching' : 'unmatched';
}

export function prioritizeCalendarEvents(events, selectedRoleIds) {
  const priority = { matching: 0, general: 1, unmatched: 2 };
  return [...events].sort((a, b) =>
    priority[classifyCalendarEvent(a, selectedRoleIds)] -
    priority[classifyCalendarEvent(b, selectedRoleIds)]);
}
