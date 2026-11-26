'use strict';
// Minimal iCalendar reader for the De Vinci timetable feed (ALV SIM). Times are
// floating Europe/Paris wall-clock values, kept as "YYYY-MM-DDTHH:MM" strings.

function unfold(text) { return String(text).replace(/\r\n/g, '\n').replace(/\n[ \t]/g, ''); }
function unescape(value) { return value.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1'); }
function stamp(value) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/.exec(value || '');
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4] ?? '00'}:${m[5] ?? '00'}` : null;
}

/** Parse VEVENTs only (VTIMEZONE blocks also carry DTSTART lines). */
function parseIcs(text) {
  const events = [];
  let current = null;
  for (const line of unfold(text).split('\n')) {
    if (line === 'BEGIN:VEVENT') { current = {}; continue; }
    if (line === 'END:VEVENT') {
      if (current?.start) events.push(current);
      current = null;
      continue;
    }
    if (!current) continue;
    const colon = line.indexOf(':');
    if (colon < 1) continue;
    const key = line.slice(0, colon).split(';')[0].toUpperCase();
    const value = unescape(line.slice(colon + 1));
    if (key === 'DTSTART') current.start = stamp(value);
    else if (key === 'DTEND') current.end = stamp(value);
    else if (key === 'SUMMARY') current.summary = value;
    else if (key === 'LOCATION') current.location = value;
    else if (key === 'TITLE') current.title = value;
    else if (key === 'TYPECOURS') current.type = value;
    else if (key === 'PROF') current.teacher = value;
    else if (key === 'UID') current.uid = value;
  }
  for (const e of events) {
    e.title ??= (e.summary || '').replace(/^\[[^\]]*\]\s*/, '').replace(/\s*\[[^\]]*\].*$/, '') || e.summary || 'Untitled';
    e.type ??= /\[([^\]]+)\]/.exec((e.summary || '').replace(/^\[[^\]]*\]/, ''))?.[1] ?? '';
    e.exam = /exam/i.test(e.type) || /\[Examen\]/i.test(e.summary || '');
    // ESILV computer-science courses carry an IN code (e.g. [MESIIN230226]); the tutor can't teach code yet.
    e.coding = /^\[[A-Z]{4}IN\d/.test(e.summary || '');
  }
  return events.sort((a, b) => a.start.localeCompare(b.start));
}

/** Local wall-clock "now" in the same string form, so comparisons stay lexical. */
function localStamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`;
}

function between(events, from, to) { return events.filter((e) => (e.end ?? e.start) >= from && e.start < to); }

function place(location) {
  const rooms = location.split(',');
  return rooms.length > 3 ? `${rooms.length} rooms (whole year group)` : location;
}

function formatEvent(e) {
  const day = e.start.slice(0, 10), time = `${e.start.slice(11)}–${(e.end ?? e.start).slice(11)}`;
  return `${day} ${time} ${e.title}${e.type ? ` [${e.type}]` : ''}${e.location ? ` @ ${place(e.location)}` : ''}${e.teacher ? ` (${e.teacher})` : ''}`;
}

module.exports = { parseIcs, localStamp, between, formatEvent, place };
