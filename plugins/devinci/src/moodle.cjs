'use strict';
// Read-only Moodle web-service client for De Vinci Learning.
const SITE = 'https://learning.devinci.fr';
const FILE_PREFIX = `${SITE}/webservice/pluginfile.php/`;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

// Only these functions can ever be called: all are reads. Nothing that submits,
// posts, messages or changes anything is reachable from the plugin.
const READ_ONLY = new Set([
  'core_webservice_get_site_info',
  'core_enrol_get_users_courses',
  'core_course_get_contents',
  'core_calendar_get_action_events_by_timesort',
  'mod_forum_get_forums_by_courses',
  'mod_forum_get_forum_discussions',
]);

/** Moodle REST wants PHP-style form keys: courseids[0]=1, options[0][name]=x. */
function flatten(params, prefix = '', out = new URLSearchParams()) {
  for (const [key, value] of Object.entries(params)) {
    const name = prefix ? `${prefix}[${key}]` : key;
    if (value && typeof value === 'object') flatten(value, name, out);
    else if (value !== undefined) out.append(name, String(value));
  }
  return out;
}

function createMoodle({ getToken, fetchImpl = fetch }) {
  async function call(wsfunction, params = {}, signal) {
    if (!READ_ONLY.has(wsfunction)) throw new Error(`Blocked Moodle function: ${wsfunction}`);
    const token = await getToken();
    if (!token) throw new Error('Not connected to De Vinci Learning. Open the De Vinci page and press Connect.');
    const body = flatten({ wstoken: token, wsfunction, moodlewsrestformat: 'json', ...params });
    const res = await fetchImpl(`${SITE}/webservice/rest/server.php`, { method: 'POST', body, signal });
    if (!res.ok) throw new Error(`Moodle answered HTTP ${res.status}`);
    const data = await res.json();
    if (data && data.exception) {
      const expired = /invalidtoken|accessexception/i.test(data.errorcode || '');
      throw new Error(expired ? 'Moodle sign-in expired. Press Connect on the De Vinci page again.' : `Moodle: ${data.message || data.errorcode}`);
    }
    return data;
  }

  let userId = null;
  const me = async (signal) => (userId ??= (await call('core_webservice_get_site_info', {}, signal)).userid);

  return {
    call,
    async courses(signal) {
      const list = await call('core_enrol_get_users_courses', { userid: await me(signal) }, signal);
      const day = (t) => (t ? new Date(t * 1000).toISOString().slice(0, 10) : '');
      return list.map((c) => ({ id: c.id, name: decodeEntities(c.fullname), short: decodeEntities(c.shortname), start: day(c.startdate), end: day(c.enddate), past: !!c.enddate && c.enddate * 1000 < Date.now() }));
    },
    async contents(courseId, signal) {
      return call('core_course_get_contents', { courseid: courseId }, signal);
    },
    async deadlines(days, signal) {
      const from = Math.floor(Date.now() / 1000);
      const data = await call('core_calendar_get_action_events_by_timesort', { timesortfrom: from, timesortto: from + days * 86400, limitnum: 50 }, signal);
      return (data.events || []).map((e) => ({ name: decodeEntities(e.name), course: decodeEntities(e.course?.fullname ?? ''), due: new Date(e.timesort * 1000).toISOString(), url: e.url }));
    },
    async announcements(courseIds, perForum, signal) {
      const forums = await call('mod_forum_get_forums_by_courses', { courseids: courseIds }, signal);
      const out = [];
      for (const forum of forums.filter((f) => f.type === 'news')) {
        const page = await call('mod_forum_get_forum_discussions', { forumid: forum.id, sortorder: 1, page: 0, perpage: perForum }, signal);
        for (const d of page.discussions || []) out.push({ course: forum.course, subject: d.subject || d.name, date: new Date((d.modified || d.created) * 1000).toISOString().slice(0, 10), text: stripHtml(d.message || '') });
      }
      return out.sort((a, b) => b.date.localeCompare(a.date));
    },
    /** Download a course file. Only Moodle's own web-service file URLs are allowed. */
    async download(url, signal) {
      if (typeof url !== 'string' || !url.startsWith(FILE_PREFIX)) throw new Error('Only De Vinci Learning course file URLs can be read.');
      const token = await getToken();
      if (!token) throw new Error('Not connected to De Vinci Learning.');
      const target = new URL(url);
      if (target.origin !== SITE || !target.pathname.startsWith('/webservice/pluginfile.php/')) throw new Error('Only De Vinci Learning course file URLs can be read.');
      target.searchParams.set('token', token);
      const res = await fetchImpl(target, { signal });
      if (!res.ok) throw new Error(`Moodle file download failed (HTTP ${res.status})`);
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.length > MAX_FILE_BYTES) throw new Error('File is larger than 25 MB.');
      return bytes;
    },
  };
}

function decodeEntities(text) {
  return String(text).replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
}

function stripHtml(html) {
  return decodeEntities(String(html).replace(/<br\s*\/?>|<\/p>|<\/li>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/\n{3,}/g, '\n\n').trim();
}

module.exports = { createMoodle, flatten, stripHtml, decodeEntities, SITE, FILE_PREFIX, READ_ONLY };
