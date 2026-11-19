'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { createMoodle } = require('./moodle.cjs');
const { otherGroup } = require('./groups.cjs');
const ics = require('./ics.cjs');

const ICAL_PREFIX = 'https://ical.devinci.me/';
const ICS_TTL_MS = 6 * 3600e3;
const PART_CHARS = 40000;
const AGENTS = ['prober', 'teacher', 'practice'];

const LANGUAGE = { en: 'Teach and write in English.', fr: 'Enseigne et écris en français (the learner chose French), including questions, options and explanations.' };
const INSTRUCTIONS = `The learner is an ESILV (De Vinci, Paris) engineering student. School tools are available:
- school_schedule: their real timetable and exam dates (from the school calendar).
- school_courses, school_course_contents, school_read_file: their Moodle (De Vinci Learning) courses and the actual course files. Teach from the real course material when it is relevant; say which file and page you used.
- school_deadlines: upcoming Moodle assignments and quizzes.
- school_past_exams_browse, school_past_exams_read: LeoData, the students' archive of previous years' exams and documents. Use past exams for realistic practice; say which year/file a question comes from.
- school_announcements: course announcements. When the learner asks what an exam covers, read the announcements and quote the exact announcement (course, date, words) you rely on. Present the exam scope as your reading of that text, not as fact; if announcements are vague, missing or contradictory, say so instead of guessing.
If a topic builds on earlier courses (for example a previous semester's prerequisite), you may also look in those Moodle courses (school_courses lists past ones too) and in LeoData.
When planning study time, consider upcoming exams and deadlines. These tools are read-only; never claim to have submitted or changed anything at school.`;

function text(t, details = {}) { return { content: [{ type: 'text', text: t }], details }; }
function schema(properties = {}, required = []) { return { type: 'object', properties, required, additionalProperties: false }; }

function desktop(op, args) {
  if (process.env.LH_DESKTOP_SERVER !== '1' || typeof process.send !== 'function' || !process.connected) return Promise.reject(new Error('Moodle sign-in needs the DeVinciHarness desktop app.'));
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const listener = (m) => { if (m && m.channel === 'lh:devinci' && m.id === id) done(m.ok ? null : new Error(m.error || 'Sign-in failed.'), m.value); };
    const timer = setTimeout(() => done(new Error('Sign-in timed out.')), /login/.test(op) ? 15 * 60e3 : 60e3);
    function done(error, value) { clearTimeout(timer); process.removeListener('message', listener); if (error) reject(error); else resolve(value); }
    process.on('message', listener);
    process.send({ channel: 'lh:devinci', id, op, args });
  });
}

async function extractText(bytes, name) {
  if (bytes.subarray(0, 5).toString('latin1') === '%PDF-') {
    // The host app already ships pdfjs-dist (legacy build) for its own PDF features.
    const pdfjs = await import(pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href);
    const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
    try {
      const pages = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const content = await (await doc.getPage(i)).getTextContent();
        pages.push(`--- page ${i} ---\n${content.items.map((it) => it.str + (it.hasEOL ? '\n' : ' ')).join('').trim()}`);
      }
      return pages.join('\n\n');
    } finally { await doc.loadingTask?.destroy?.(); }
  }
  if (/\.(txt|md|csv|tex|py|c|h|cpp|java|cs|js|ts|sql|html?)$/i.test(name) && !bytes.subarray(0, 8192).includes(0)) return bytes.toString('utf8');
  return null;
}

function activate(ctx) {
  const dir = ctx.dataDirectory;
  fs.mkdirSync(path.join(dir, 'files'), { recursive: true });
  const stateFile = path.join(dir, 'state.json'), icsFile = path.join(dir, 'schedule.ics');
  const readState = () => { try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { return {}; } };
  const writeState = (patch) => {
    const next = { ...readState(), ...patch }, tmp = `${stateFile}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(next)); fs.renameSync(tmp, stateFile);
    return next;
  };

  let token, tokenLoaded = false;
  const getToken = async () => {
    if (!tokenLoaded) { try { token = (await desktop('token')).token; } catch { token = null; } tokenLoaded = true; }
    return token;
  };
  const moodle = createMoodle({ getToken });

  // ── schedule ──
  let events = null, icsFetchedAt = 0;
  async function schedule() {
    const { icsUrl } = readState();
    if (icsUrl && Date.now() - icsFetchedAt > ICS_TTL_MS) {
      try {
        const res = await fetch(icsUrl);
        const body = await res.text();
        if (res.ok && body.includes('BEGIN:VCALENDAR')) { fs.writeFileSync(icsFile, body); events = null; }
      } catch { /* offline: keep the last copy */ }
      icsFetchedAt = Date.now();
    }
    if (!events) { try { events = ics.parseIcs(fs.readFileSync(icsFile, 'utf8')); } catch { events = []; } }
    return events;
  }

  // ── course files ──
  const fileKey = (url) => crypto.createHash('sha1').update(url).digest('hex').slice(0, 16);
  async function courseFile(url, signal) {
    const key = fileKey(url), cached = fs.readdirSync(path.join(dir, 'files')).find((f) => f.startsWith(`${key}-`) && !f.endsWith('.txt'));
    if (cached) return { bytes: fs.readFileSync(path.join(dir, 'files', cached)), name: cached.slice(key.length + 1), file: path.join(dir, 'files', cached) };
    const bytes = await moodle.download(url, signal);
    const name = (decodeURIComponent(new URL(url).pathname.split('/').pop() || 'file') || 'file').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_');
    const file = path.join(dir, 'files', `${key}-${name}`);
    fs.writeFileSync(file, bytes);
    return { bytes, name, file };
  }
  async function courseText(url, signal) {
    const { bytes, name, file } = await courseFile(url, signal);
    const txt = `${file}.txt`;
    if (fs.existsSync(txt)) return { name, content: fs.readFileSync(txt, 'utf8') };
    const content = await extractText(bytes, name);
    if (content !== null) fs.writeFileSync(txt, content);
    return { name, content };
  }

  // ── agent tools ──
  const tools = () => [
    {
      name: 'school_schedule', label: 'School schedule',
      description: 'The learner\'s real ESILV timetable and exams. Dates are YYYY-MM-DD, Paris time. Defaults to the next 14 days.',
      parameters: schema({ from: { type: 'string', description: 'Start date YYYY-MM-DD (default today)' }, to: { type: 'string', description: 'End date YYYY-MM-DD, exclusive (default from + 14 days)' }, examsOnly: { type: 'boolean' } }),
      async execute(_id, p = {}) {
        const all = await schedule();
        if (!all.length) return text('No timetable imported yet. Ask the learner to add their iCal link or .ics file on the De Vinci page.');
        const from = p.from ? `${p.from}T00:00` : ics.localStamp();
        const to = p.to ? `${p.to}T00:00` : ics.localStamp(new Date(Date.parse(from.slice(0, 10)) + 14 * 86400e3));
        const list = ics.between(all, from, to).filter((e) => (p.examsOnly ? e.exam : e.type !== 'NR'));
        return text(list.length ? list.map(ics.formatEvent).join('\n') : 'Nothing scheduled in that range.');
      },
    },
    {
      name: 'school_courses', label: 'Moodle courses', description: 'List the learner\'s De Vinci Learning (Moodle) courses with their ids.', parameters: schema(),
      async execute(_id, _p, signal) { return text((await moodle.courses(signal)).map((c) => `${c.id}: ${c.name} (${c.short})${c.start ? ` ${c.start}→${c.end || '?'}` : ''}${c.past ? ' [past]' : ''}`).join('\n') || 'No courses.'); },
    },
    {
      name: 'school_course_contents', label: 'Course contents',
      description: 'Sections, activities and files of one Moodle course. File lines include the url to pass to school_read_file.',
      parameters: schema({ courseId: { type: 'integer' } }, ['courseId']),
      async execute(_id, p, signal) {
        const lines = [];
        for (const section of await moodle.contents(p.courseId, signal)) {
          const modules = (section.modules || []).filter((m) => m.uservisible !== false);
          if (!modules.length) continue;
          lines.push(`## ${section.name}`);
          for (const m of modules) {
            lines.push(`- [${m.modname}] ${m.name}`);
            for (const c of (m.contents || []).filter((c) => c.type === 'file')) lines.push(`  - file: ${c.filename} (${Math.round((c.filesize || 0) / 1024)} KB) url: ${c.fileurl}`);
          }
        }
        return text(lines.join('\n') || 'This course has no visible content.');
      },
    },
    {
      name: 'school_read_file', label: 'Read course file',
      description: `Read the text of a Moodle course file (PDF or text) by its url from school_course_contents. Long files come in parts of ${PART_CHARS} characters; ask for the next part to continue. Reading a file adds it to the learner's library.`,
      parameters: schema({ url: { type: 'string' }, course: { type: 'string', description: 'Course short name, used to file it in the library' }, part: { type: 'integer', minimum: 1 } }, ['url']),
      async execute(_id, p, signal) {
        const { name, content } = await courseText(p.url, signal);
        if (content === null) return text(`${name} is not a PDF or text file, so it cannot be read as text. Tell the learner to open it on Moodle.`);
        ctx.events.emit('file-used', { url: p.url, name, course: p.course || '' });
        const parts = Math.max(1, Math.ceil(content.length / PART_CHARS)), part = Math.min(p.part || 1, parts);
        return text(`${name} — part ${part} of ${parts}\n\n${content.slice((part - 1) * PART_CHARS, part * PART_CHARS)}`);
      },
    },
    {
      name: 'school_deadlines', label: 'Moodle deadlines', description: 'Upcoming Moodle assignments, quizzes and other due items.',
      parameters: schema({ days: { type: 'integer', minimum: 1, maximum: 120 } }),
      async execute(_id, p = {}, signal) {
        const { group, campus } = readState();
        const all = await moodle.deadlines(p.days || 30, signal), list = all.filter((d) => !otherGroup(d.name, group, campus));
        const hidden = all.length - list.length;
        return text((hidden ? `(${hidden} items for other TD groups/campuses hidden; learner is in group ${group}.)\n` : '') + list.map((d) => `${d.due.slice(0, 16).replace('T', ' ')} UTC  ${d.name} — ${d.course}`).join('\n') || 'No upcoming Moodle deadlines.');
      },
    },
    {
      name: 'school_announcements', label: 'Course announcements',
      description: 'Recent announcements from the news forums of the given Moodle courses (or all courses). Use to find exam scope, changes and instructions.',
      parameters: schema({ courseIds: { type: 'array', items: { type: 'integer' } }, perCourse: { type: 'integer', minimum: 1, maximum: 20 } }),
      async execute(_id, p = {}, signal) {
        const ids = p.courseIds?.length ? p.courseIds : (await moodle.courses(signal)).map((c) => c.id);
        const names = new Map((await moodle.courses(signal)).map((c) => [c.id, c.name]));
        const list = await moodle.announcements(ids, p.perCourse || 5, signal);
        return text(list.map((a) => `### ${a.date} — ${names.get(a.course) ?? a.course}: ${a.subject}\n${a.text.slice(0, 3000)}`).join('\n\n') || 'No announcements found.');
      },
    },
    {
      name: 'school_past_exams_browse', label: 'LeoData folder',
      description: "List a LeoData folder (previous years' exams and documents). Omit folderId for the top level; for 2nd-year ESILV go ESILV, then Année 2. Returns folder and file ids.",
      parameters: schema({ folderId: { type: 'string' } }),
      async execute(_id, p = {}) {
        const d = await desktop('leo-get', { kind: 'dir', id: p.folderId || 'root' });
        const dirs = (d.children?.directories || []).map((x) => `[folder] ${x.name}  id: ${x._id}`);
        const files = (d.children?.files || []).map((x) => `[${x.type || 'file'}] ${x.name}  id: ${x._id}`);
        return text([...dirs, ...files].join('\n') || 'Empty folder.');
      },
    },
    {
      name: 'school_past_exams_read', label: 'Read LeoData file',
      description: `Read the text of a LeoData PDF by file id. Long files come in parts of ${PART_CHARS} characters.`,
      parameters: schema({ fileId: { type: 'string' }, part: { type: 'integer', minimum: 1 } }, ['fileId']),
      async execute(_id, p) {
        if (!/^[A-Za-z0-9]{1,64}$/.test(p.fileId)) throw new Error('Invalid file id.');
        const cache = path.join(dir, 'files', `leo-${p.fileId}.txt`);
        let content = fs.existsSync(cache) ? fs.readFileSync(cache, 'utf8') : null;
        if (content === null) {
          content = await extractText(Buffer.from((await desktop('leo-get', { kind: 'file', id: p.fileId })).base64, 'base64'), 'file.pdf');
          if (content === null) return text('This LeoData file is not a PDF.');
          fs.writeFileSync(cache, content);
        }
        const parts = Math.max(1, Math.ceil(content.length / PART_CHARS)), part = Math.min(p.part || 1, parts);
        return text(`part ${part} of ${parts}\n\n${content.slice((part - 1) * PART_CHARS, part * PART_CHARS)}`);
      },
    },
  ];
  let offInstructions = () => {};
  const applyInstructions = () => {
    offInstructions();
    offInstructions = ctx.registerInstructions({ agents: AGENTS, text: `${INSTRUCTIONS}\n${LANGUAGE[readState().language] ?? LANGUAGE.en}` });
  };
  applyInstructions();
  ctx.registerTools({ agents: AGENTS, create: tools });

  // ── frontend operations ──
  ctx.handle('status', async () => {
    const st = readState();
    let leo = false;
    try { leo = (await desktop('leo-status')).connected; } catch { /* offline or not desktop */ }
    return { connected: !!(await getToken()), leo, icsUrl: !!st.icsUrl, hasSchedule: fs.existsSync(icsFile), autoLibrary: st.autoLibrary !== false, group: st.group || '', campus: st.campus || 'Paris', language: st.language || 'en' };
  });
  ctx.handle('leo-login', async () => desktop('leo-login'));
  ctx.handle('set-profile', async (input) => {
    const group = String(input?.group ?? '').trim().toUpperCase();
    if (group && !/^[A-Z]$/.test(group)) throw new Error('Enter your TD group as one letter, e.g. D.');
    const campus = ['Paris', 'Nantes'].includes(input?.campus) ? input.campus : 'Paris';
    const language = ['en', 'fr'].includes(input?.language) ? input.language : 'en';
    writeState({ group: group || undefined, campus, language });
    applyInstructions();
    return readState();
  });
  ctx.handle('week', async (input) => {
    const start = /^\d{4}-\d{2}-\d{2}$/.test(input?.start ?? '') ? input.start : ics.localStamp().slice(0, 10);
    const end = ics.localStamp(new Date(Date.parse(`${start}T12:00:00`) + 7 * 86400e3)).slice(0, 10);
    return (await schedule()).filter((e) => e.type !== 'NR' && e.start >= `${start}T00:00` && e.start < `${end}T00:00`)
      .map((e) => ({ start: e.start, end: e.end, title: e.title, type: e.type, exam: e.exam, place: e.location ? ics.place(e.location) : '', teacher: e.teacher || '' }));
  });
  ctx.handle('login', async () => { token = (await desktop('login')).token; tokenLoaded = true; return { connected: !!token }; });
  ctx.handle('logout', async () => { await desktop('logout'); token = null; return { connected: false }; });
  ctx.handle('set-ics-url', async (input) => {
    const url = typeof input?.url === 'string' ? input.url.trim() : '';
    if (url && !url.startsWith(ICAL_PREFIX)) throw new Error(`The link must start with ${ICAL_PREFIX}`);
    writeState({ icsUrl: url || undefined }); icsFetchedAt = 0; events = null;
    return { count: (await schedule()).length };
  });
  ctx.handle('set-ics-text', async (input) => {
    if (typeof input?.text !== 'string' || !input.text.includes('BEGIN:VCALENDAR')) throw new Error('That is not an iCalendar (.ics) file.');
    fs.writeFileSync(icsFile, input.text); events = null;
    return { count: (await schedule()).length };
  });
  ctx.handle('set-auto-library', async (input) => writeState({ autoLibrary: input?.enabled !== false }));
  ctx.handle('overview', async () => {
    const all = await schedule(), now = ics.localStamp();
    const later = ics.localStamp(new Date(Date.now() + 60 * 86400e3));
    let deadlines = [], deadlineError = null;
    let hiddenDeadlines = [];
    const { group, campus } = readState();
    if (await getToken()) {
      try {
        const list = await moodle.deadlines(30);
        deadlines = list.filter((d) => !otherGroup(d.name, group, campus));
        hiddenDeadlines = list.filter((d) => otherGroup(d.name, group, campus));
      } catch (e) { deadlineError = e.message; }
    }
    const pick = (e) => ({ start: e.start, end: e.end, title: e.title, type: e.type, place: e.location ? ics.place(e.location) : '' });
    return {
      exams: ics.between(all, now, later).filter((e) => e.exam).map(pick),
      classes: ics.between(all, now, `${ics.localStamp(new Date(Date.now() + 86400e3)).slice(0, 10)}T23:59`).filter((e) => !e.exam && e.type !== 'NR').map(pick),
      deadlines, hiddenDeadlines, deadlineError, group: group || '',
    };
  });
  // Bytes for the library import, only for files the agent actually read.
  ctx.handle('file-bytes', async (input) => {
    const { bytes, name } = await courseFile(String(input?.url ?? ''));
    return { name, base64: bytes.toString('base64') };
  });
  ctx.handle('claim-import', async (input) => {
    const url = String(input?.url ?? ''), state = readState(), imported = state.imported || [];
    if (state.autoLibrary === false || imported.includes(url)) return { import: false };
    writeState({ imported: [...imported, url] });
    return { import: true };
  });
}

module.exports = { activate, extractText };
