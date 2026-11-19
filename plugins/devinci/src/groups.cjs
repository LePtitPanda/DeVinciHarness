'use strict';
// Moodle deadline names are typed by hand ("TD11-12 GR-D", "TD7_8_ Gp J", "TD_9-19_FTI",
// "TD 1-2 Nantes B"). A deadline is hidden only when it clearly names ANOTHER group or
// campus; anything without a recognizable group stays visible.
const GROUP_PATTERNS = [
  /(?:^|[^a-z])gr(?:oupe?)?[\s._-]*([a-z])(?![a-z])/i, // GR-D, Gr-F, Groupe A
  /(?:^|[^a-z])gp[\s._-]*([a-z])(?![a-z])/i,            // Gp J
  /(?:^|[^a-z])ft([a-z])(?![a-z])/i,                     // _FTG, _FTI
];

function groupOf(name) {
  for (const pattern of GROUP_PATTERNS) {
    const m = pattern.exec(name);
    if (m) return m[1].toUpperCase();
  }
  return null;
}

function otherGroup(name, group, campus = 'Paris') {
  const text = String(name);
  if (campus === 'Paris' && /nantes/i.test(text)) return true;
  if (campus === 'Nantes' && /paris/i.test(text)) return true;
  if (!group) return false;
  const found = groupOf(text);
  return found !== null && found !== group;
}

module.exports = { otherGroup, groupOf };
