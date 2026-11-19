'use strict';
// Material finder: a cheap model only SEARCHES (picks courses/folders, then files from
// listings). It never summarizes; the teacher reads the exact files it returns.

function parseJson(text) {
  const m = /\{[\s\S]*\}/.exec(String(text));
  if (!m) throw new Error('The search model returned no JSON.');
  return JSON.parse(m[0]);
}

/**
 * deps: courses() → [{id,name,short,past}], contents(id) → Moodle sections,
 *       leo(folderId) → {children:{directories,files}}, ask(prompt) → text (cheap model),
 *       year → ESILV year number for the LeoData folder.
 */
async function findMaterial({ topic, hint = '' }, deps) {
  const courses = await deps.courses();
  let leoFolders = [], leoBase = null;
  try {
    const root = await deps.leo('root');
    const esilv = root.children.directories.find((d) => /esilv/i.test(d.name));
    const yearDir = esilv && (await deps.leo(esilv._id)).children.directories.find((d) => new RegExp(`ann[ée]e\\s*${deps.year}`, 'i').test(d.name));
    if (yearDir) { leoBase = yearDir; leoFolders = (await deps.leo(yearDir._id)).children.directories; }
  } catch { /* LeoData not connected: Moodle only */ }

  const step1 = parseJson(await deps.ask(
    `A student wants to study: "${topic}"${hint ? ` (course hint: ${hint})` : ''}.\n` +
    `Pick the Moodle courses (at most 3; include an earlier prerequisite course only if clearly relevant) and the LeoData past-exam folders (at most 2) that match.\n` +
    `Moodle courses:\n${courses.map((c) => `${c.id}: ${c.name}${c.past ? ' [past]' : ''}`).join('\n')}\n` +
    `LeoData folders:\n${leoFolders.map((f) => `${f._id}: ${f.name}`).join('\n') || '(none)'}\n` +
    `Answer with JSON only: {"courseIds":[...],"leoFolderIds":[...]}`,
  ));
  const courseIds = (step1.courseIds || []).map(Number).filter((id) => courses.some((c) => c.id === id)).slice(0, 3);
  const folderIds = (step1.leoFolderIds || []).map(String).filter((id) => leoFolders.some((f) => f._id === id)).slice(0, 2);

  const candidates = [];
  for (const id of courseIds) {
    const course = courses.find((c) => c.id === id);
    for (const section of await deps.contents(id)) {
      for (const m of section.modules || []) {
        for (const f of (m.contents || []).filter((x) => x.type === 'file')) {
          candidates.push({ key: `m${candidates.length}`, source: 'moodle', course: course.short || course.name, label: `${course.name} › ${section.name} › ${m.name} › ${f.filename}`, url: f.fileurl });
        }
      }
    }
  }
  for (const id of folderIds) {
    const walk = async (folderId, prefix, depth) => {
      const d = await deps.leo(folderId);
      for (const f of d.children.files || []) candidates.push({ key: `l${candidates.length}`, source: 'leodata', label: `LeoData › ${prefix} › ${f.name}`, fileId: f._id });
      if (depth > 0) for (const sub of d.children.directories || []) await walk(sub._id, `${prefix} › ${sub.name}`, depth - 1);
    };
    await walk(id, leoFolders.find((f) => f._id === id).name, 1);
  }
  if (!candidates.length) return { picks: [], note: 'No files found in the matching courses.' };

  const listed = candidates.slice(0, 400);
  const step2 = parseJson(await deps.ask(
    `A student wants to study: "${topic}". From this file list, pick the files (at most 8) that best match: course notes/slides for the topic, related exercises, and past exams for it. Prefer fewer, clearly relevant files.\n` +
    `${listed.map((c) => `${c.key}: ${c.label}`).join('\n')}\n` +
    `Answer with JSON only: {"picks":[{"key":"m0","why":"short reason"}]}`,
  ));
  const picks = [];
  for (const p of step2.picks || []) {
    const c = listed.find((x) => x.key === p.key);
    if (c && !picks.includes(c)) picks.push(Object.assign(c, { why: String(p.why || '').slice(0, 160) }));
    if (picks.length >= 8) break;
  }
  return { picks, leoBase: leoBase?.name ?? null };
}

function formatPicks({ picks, note }) {
  if (!picks.length) return note || 'Nothing relevant found. Browse with school_course_contents / school_past_exams_browse instead.';
  return [
    'Files picked by the search step (read them yourself; nothing below is a summary):',
    ...picks.map((p) => p.source === 'moodle'
      ? `- ${p.label}\n  read: school_read_file url=${p.url} course=${p.course}\n  why: ${p.why}`
      : `- ${p.label}\n  read: school_past_exams_read fileId=${p.fileId}\n  why: ${p.why}`),
  ].join('\n');
}

module.exports = { findMaterial, formatPicks, parseJson };
