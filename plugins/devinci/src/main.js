// De Vinci plugin frontend: home hub (no chat, no model calls), timetable, settings page,
// first-time setup, and whole-app French interface.
import { STRINGS } from './strings.js';
import { startTranslator } from './translate.js';
import FR_APP from './i18n/fr.json';
import { runOnboarding } from './onboarding.js';

const ICON = '<svg viewBox="60 55 180 192" fill="currentColor"><path d="M235,85.7l-34.4,67c0,0-32.8-51.1-16.2-80.5c14.1-21.9,34.7-11.8,37.6-9.4C230.1,67.6,235,76.3,235,85.7z"/><path d="M159.9,178.9L103,68.6H65l89.4,173.1l0,0C166.7,232.8,172.1,202.5,159.9,178.9z"/></svg>';
const CAL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>';
const DAY_START = 8, DAY_END = 21, HOUR_PX = 52;
// Sessions started by a button carry this invisible prefix; the chat hides that opening brief.
const HIDDEN = '⁣';
const LANG_KEY = 'dv.lang';
const STUDY_TAIL = 'Use the school tools to find the matching Moodle course and files, and teach from the actual course material.';

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'style') node.style.cssText = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== false) node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return node;
}
const daysUntil = (s) => Math.round((Date.parse(`${s.slice(0, 10)}T00:00:00`) - Date.parse(new Date().toDateString())) / 86400e3);
const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const monday = (d) => { const m = new Date(d); m.setHours(12, 0, 0, 0); m.setDate(m.getDate() - ((m.getDay() + 6) % 7)); return m; };
const minutes = (s) => Number(s.slice(11, 13)) * 60 + Number(s.slice(14, 16));
const readLang = () => { try { return localStorage.getItem(LANG_KEY) === 'fr' ? 'fr' : 'en'; } catch { return 'en'; } };

export function activate(ctx) {
  let lang = readLang();
  // Whole-app French: the host's own UI strings, translated in place.
  if (lang === 'fr') ctx.cleanup(startTranslator(FR_APP));
  const t = (key, ...args) => { const v = STRINGS[lang][key] ?? STRINGS.en[key]; return typeof v === 'function' ? v(...args) : v; };
  const locale = () => (lang === 'fr' ? 'fr-FR' : 'en-GB');
  const fmtDay = (s) => new Date(`${s.slice(0, 10)}T12:00:00`).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' });
  const button = (props, signal) => { const slot = el('span'); ctx.ui.mountButton(slot, { size: 'sm', ...props }, { signal }); return slot; };


  // ── sessions ──
  async function startStudy({ title, request, context = '', visible = false, kind }) {
    request = request.trim();
    if (!request) return;
    const res = await fetch('/api/chats', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: (title || request).slice(0, 80), ...(kind ? { kind } : {}) }) });
    if (!res.ok) throw new Error(`Could not create a session (HTTP ${res.status})`);
    const { id } = await res.json();
    // Same handover the native "new session" flow uses: the chat sends it on open.
    sessionStorage.setItem(`lh.openingPrompt.${id}`, JSON.stringify({ text: `${visible ? '' : HIDDEN}${request}\n\n(${context}${STUDY_TAIL})`, attempted: false }));
    ctx.app.openSession(id);
  }
  const reviseExam = (e) => startStudy({ title: `${e.title} · ${t('tRevision')}`, request: `Help me revise for my ${e.title} exam.`, context: `The exam is on ${e.start.slice(0, 10)} at ${e.start.slice(11)}; check the course announcements for what it covers. ` });

  // ── shared form pieces (settings page and setup) ──
  const select = (value, options, onChange) => {
    const node = el('select', { class: 'dv-input' }, options.map(([v, label]) => el('option', { value: v }, label)));
    node.value = String(value);
    node.addEventListener('change', () => onChange(node.value));
    return node;
  };
  const field = (label, control, help) => el('div', { class: 'dv-field' }, el('label', { class: 'dv-label' }, label), el('div', { class: 'dv-control' }, control, help && el('p', { class: 'dv-help' }, help)));
  const saved = (note) => { note.textContent = t('saved'); setTimeout(() => { note.textContent = ''; }, 1500); };

  function profileFields(s, note) {
    const save = async (patch) => { try { await ctx.call('set-profile', patch); saved(note); } catch (e) { note.textContent = /one letter/.test(e.message) ? t('groupErr') : e.message; } };
    const group = el('input', { class: 'dv-input dv-letter', maxlength: '1', placeholder: 'D', value: s.group });
    group.addEventListener('change', () => save({ group: group.value }));
    return [
      field(t('group'), group, t('groupHelp')),
      field(t('campus'), select(s.campus, [['Paris', 'Paris'], ['Nantes', 'Nantes']], (v) => save({ campus: v }))),
      field(t('year'), select(s.year || 2, [1, 2, 3, 4, 5].map((n) => [String(n), t('yearN', n)]), (v) => save({ year: Number(v) })), t('yearHelp')),
    ];
  }
  function moodleField(s, signal, refresh) {
    return field('Moodle', el('div', { class: 'dv-inline' },
      el('span', { class: s.connected ? 'dv-ok' : 'dv-muted' }, s.connected ? t('connected') : t('notConnected')),
      button({ label: s.connected ? t('disconnect') : t('connect'), variant: s.connected ? 'outline' : 'default', onClick: async () => { await ctx.call(s.connected ? 'logout' : 'login'); refresh(); } }, signal)), t('moodleHelp'));
  }
  function leoField(s, signal, refresh) {
    return field('LeoData', el('div', { class: 'dv-inline' },
      el('span', { class: s.leo ? 'dv-ok' : 'dv-muted' }, s.leo ? t('connected') : t('notConnected')),
      !s.leo && button({ label: t('connect'), onClick: async () => { await ctx.call('leo-login'); refresh(); } }, signal)), t('leoHelp'));
  }
  function scheduleField(s, signal, refresh) {
    const note = el('span', { class: 'dv-muted' });
    const link = el('input', { type: 'password', class: 'dv-input dv-grow', autocomplete: 'off', placeholder: s.icsUrl ? t('icsSaved') : t('icsPh') });
    const file = el('input', { type: 'file', accept: '.ics,text/calendar', hidden: true });
    const done = (r) => { note.textContent = t('loaded', r.count); refresh(); };
    file.addEventListener('change', async () => {
      const f = file.files?.[0]; if (!f) return;
      try { done(await ctx.call('set-ics-text', { text: await f.text() })); } catch (e) { note.textContent = e.message; }
    });
    return field(t('schedule'), el('div', { class: 'dv-stack' },
      el('span', { class: s.hasSchedule ? 'dv-ok' : 'dv-muted' }, s.hasSchedule ? t('imported') : t('notImported')),
      el('div', { class: 'dv-inline' }, link, button({ label: t('saveLink'), onClick: async () => { try { done(await ctx.call('set-ics-url', { url: link.value })); link.value = ''; } catch (e) { note.textContent = e.message; } } }, signal)),
      el('div', { class: 'dv-inline' }, el('span', { class: 'dv-muted' }, t('orFile')), button({ label: t('chooseFile'), variant: 'outline', onClick: () => file.click() }, signal), file, note),
    ), t('icsHelp'));
  }
  function libraryField(s) {
    const auto = el('input', { type: 'checkbox', id: 'dv-autolib' });
    auto.checked = s.autoLibrary;
    auto.addEventListener('change', () => ctx.call('set-auto-library', { enabled: auto.checked }));
    return field(t('autoImport'), el('label', { class: 'dv-check', for: 'dv-autolib' }, auto, t('autoLib')), t('autoLibHelp'));
  }
  const section = (title, ...rows) => el('section', { class: 'dv-set' }, el('h3', {}, title), ...rows);

  // ── settings page (Settings → De Vinci) ──
  ctx.registerSettings((container, signal) => {
      const root = el('div', { class: 'dv-settings' });
      container.append(root);
      const render = async () => {
        const s = await ctx.call('status');
        if (signal.aborted) return;
        const note = el('span', { class: 'dv-saved' });
        const enabled = el('input', { type: 'checkbox', id: 'dv-enabled' });
        enabled.checked = s.school;
        enabled.addEventListener('change', async () => { await ctx.call('set-profile', { school: enabled.checked }); location.reload(); });
        const feature = section('De Vinci', field(t('features'), el('label', { class: 'dv-check', for: 'dv-enabled' }, enabled, t('featuresOn')), t('featuresHelp')));
        const setup = section(t('setup'), field(t('setupAgain'), button({ label: t('runSetup'), variant: 'outline', onClick: async () => {
          if (!window.confirm(t('resetConfirm'))) return;
          await ctx.call('reset');
          await fetch('/api/settings/models', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{}' });
          await fetch('/api/keys/NVIDIA_API_KEY', { method: 'DELETE' });
          location.href = '/'; // fresh window: the setup chat starts on load (opening it over this dialog blocked typing)
        } }, signal)));
        if (!s.school) return root.replaceChildren(feature, setup);
        root.replaceChildren(
          feature,
          section(t('profile'), ...profileFields(s, note)),
          section(t('connections'), moodleField(s, signal, render), leoField(s, signal, render), scheduleField(s, signal, render)),
          section(t('library'), libraryField(s)),
          setup,
          note,
        );
      };
      render().catch((e) => root.replaceChildren(el('p', { class: 'dv-muted' }, e.message)));
      return () => root.remove();
  });

  // ── home ──
  const listCard = (title, items, empty, ...extra) => el('section', { class: 'dv-card' }, el('h2', {}, title), items.length ? el('ul', { class: 'dv-list' }, items) : el('p', { class: 'dv-muted' }, empty), ...extra);
  const deadlineItem = (d) => el('li', {}, el('strong', {}, new Date(d.due).toLocaleString(locale(), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })), ` ${d.name}`, el('span', { class: 'dv-muted' }, ` · ${d.course}`));
  const when = (s) => { const d = daysUntil(s); return d === 0 ? t('today') : d === 1 ? t('tomorrow') : t('inDays', d); };

  ctx.registerView({
    id: 'home', name: 'De Vinci',
    mount(container, signal) {
      const root = el('div', { class: 'dv-home' });
      container.append(root);
      const render = async () => {
        if (signal.aborted) return;
        root.replaceChildren(el('p', { class: 'dv-muted' }, t('loading')));
        const status = await ctx.call('status');
        if (signal.aborted) return;
        if (status.language !== lang) { try { localStorage.setItem(LANG_KEY, status.language); } catch { /* ignore */ } }
        if (!status.school) return root.replaceChildren(el('h1', {}, 'De Vinci'), el('section', { class: 'dv-card dv-ask' }, el('p', {}, t('featuresOff')), button({ label: t('openSettings'), variant: 'outline', onClick: () => ctx.app.openSettings() }, signal)));
        const overview = await ctx.call('overview');
        if (signal.aborted) return;

        const study = el('div');
        let draft = '';
        const composer = ctx.ui.mountComposer(study, {
          value: '', placeholder: t('studyPh'),
          onChange: (v) => { draft = v; composer.update({ value: v }); },
          onSend: () => startStudy({ request: draft, visible: true }),
        }, { signal });
        const examItem = (e) => el('li', {}, el('strong', {}, `${fmtDay(e.start)} ${e.start.slice(11)}`), ` ${e.title}`, el('span', { class: 'dv-muted' }, ` · ${when(e.start)}`), button({ label: t('revise'), variant: 'ghost', onClick: () => reviseExam(e) }, signal));
        const soon = overview.exams.filter((e) => daysUntil(e.start) <= 30), later = overview.exams.filter((e) => daysUntil(e.start) > 30);
        const laterList = el('ul', { class: 'dv-list dv-later-list', hidden: true }, later.map(examItem));
        const laterToggle = later.length > 0 && el('button', { class: 'dv-link', 'aria-expanded': 'false', onclick: (ev) => { laterList.hidden = !laterList.hidden; ev.currentTarget.setAttribute('aria-expanded', String(!laterList.hidden)); ev.currentTarget.textContent = laterList.hidden ? t('laterExams', later.length) : t('hideLater'); } }, t('laterExams', later.length));
        const hidden = overview.hiddenDeadlines || [];
        const hiddenList = el('ul', { class: 'dv-list dv-hidden-list', hidden: true }, hidden.map(deadlineItem));
        const hiddenToggle = hidden.length > 0 && el('button', { class: 'dv-link', onclick: () => { hiddenList.hidden = !hiddenList.hidden; } }, t('hiddenFor', hidden.length));
        const missing = [!status.connected && 'Moodle', !status.hasSchedule && t('schedule')].filter(Boolean);

        // replaceChildren would print a `false` child as text, so drop them first.
        root.replaceChildren(...[
          el('h1', {}, 'De Vinci'),
          missing.length > 0 && el('section', { class: 'dv-card dv-ask' }, el('p', {}, t('missing', missing.join(', '))), button({ label: t('openSettings'), variant: 'outline', onClick: () => ctx.app.openSettings() }, signal)),
          el('section', { class: 'dv-card' }, el('h2', {}, t('study')), study),
          listCard(t('exams'), soon.map(examItem), overview.exams.length ? t('noExamsSoon') : t('noExams'), laterList, laterToggle),
          listCard(t('deadlines', overview.group), overview.deadlines.map(deadlineItem), overview.deadlineError || t('noDeadlines'), hiddenToggle, hiddenList),
        ].filter(Boolean));
      };
      render().catch((e) => root.replaceChildren(el('p', { class: 'dv-muted' }, e.message)));
      return () => root.remove();
    },
  });

  // ── timetable ──
  function eventMenu(anchor, e) {
    const c = e.title;
    const items = e.exam ? [
      { key: 'revise', label: t('mReviseExam'), onSelect: () => reviseExam(e) },
      { key: 'past', label: t('mPastExams'), onSelect: () => startStudy({ title: `${c} · ${t('tPast')}`, kind: 'practice', request: `Give me practice problems from previous years' ${c} exams.`, context: 'Find them in LeoData and say which year each problem comes from. ' }) },
      { key: 'scope', label: t('mScope'), onSelect: () => startStudy({ title: `${c} · ${t('tScope')}`, request: `What does my ${c} exam on ${e.start.slice(0, 10)} cover?`, context: 'Read the course announcements and quote the ones you rely on. ' }) },
    ] : [
      { key: 'revise', label: t('mRevise', c), onSelect: () => startStudy({ title: `${c} · ${t('tRevision')}`, request: `Help me revise ${c}.` }) },
      { key: 'prepare', label: t('mPrepare'), onSelect: () => startStudy({ title: `${c} · ${t('tPrepare')}`, request: `Prepare me for my next ${c} class (${e.type || 'class'} on ${e.start.slice(0, 10)}).`, context: 'Look at where the course is on Moodle and preview what this class will likely cover. ' }) },
      { key: 'recap', label: t('mRecap'), onSelect: () => startStudy({ title: `${c} · ${t('tRecap')}`, request: `Recap my ${c} class (${e.type || 'class'} on ${e.start.slice(0, 10)}) and check I understood it.`, context: 'Use the most recent material in that Moodle course. ' }) },
      { key: 'quiz', label: t('mQuiz'), onSelect: () => startStudy({ title: `${c} · ${t('tQuiz')}`, kind: 'practice', request: `Quiz me on ${c}.` }) },
    ];
    ctx.ui.openMenu(anchor, { label: c, items }, { signal: ctx.signal });
  }

  ctx.registerView({
    id: 'timetable', name: lang === 'fr' ? 'Emploi du temps' : 'Timetable',
    mount(container, signal) {
      const root = el('div', { class: 'dv-tt' });
      container.append(root);
      let start = monday(new Date());
      const render = async () => {
        const events = await ctx.call('week', { start: isoDay(start) });
        if (signal.aborted) return;
        const days = [...Array(7)].map((_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return isoDay(d); })
          .filter((d, i) => i < 5 || events.some((e) => e.start.startsWith(d)));
        const nav = el('div', { class: 'dv-inline' }, [[t('prev'), -7], [t('thisWeek'), 0], [t('next'), 7]].map(([label, delta]) =>
          button({ label, variant: 'outline', onClick: () => { if (delta) start.setDate(start.getDate() + delta); else start = monday(new Date()); render(); } }, signal)));
        const today = isoDay(new Date());
        const hours = el('div', { class: 'dv-tt-hours' }, [...Array(DAY_END - DAY_START)].map((_, i) => el('div', { style: `height:${HOUR_PX}px` }, `${DAY_START + i}:00`)));
        const columns = days.map((day) => el('div', { class: `dv-tt-day${day === today ? ' dv-tt-today' : ''}` },
          el('div', { class: 'dv-tt-head' }, fmtDay(day)),
          el('div', { class: 'dv-tt-body', style: `height:${(DAY_END - DAY_START) * HOUR_PX}px` },
            events.filter((e) => e.start.startsWith(day)).map((e, _, list) => {
              const top = Math.max(0, (minutes(e.start) - DAY_START * 60) / 60 * HOUR_PX);
              const height = Math.max(22, ((e.end ? minutes(e.end) : minutes(e.start) + 60) - minutes(e.start)) / 60 * HOUR_PX - 2);
              // Overlapping events share the column side by side.
              const overlap = list.filter((o) => o.start < (e.end || e.start) && e.start < (o.end || o.start));
              const lane = `left:calc(${(overlap.indexOf(e) / overlap.length) * 100}% + 3px);width:calc(${100 / overlap.length}% - 6px)`;
              const node = el('button', { type: 'button', class: `dv-tt-event${e.exam ? ' dv-tt-exam' : ''}`, style: `top:${top}px;height:${height}px;${lane}`, title: `${e.title} [${e.type}]\n${e.start.slice(11)}–${(e.end || '').slice(11)}\n${e.place}\n${e.teacher}` },
                el('strong', {}, e.title), el('span', {}, `${e.start.slice(11)}–${(e.end || '').slice(11)} ${e.type ? `[${e.type}]` : ''}`), el('span', { class: 'dv-muted' }, e.place));
              node.addEventListener('click', () => eventMenu(node, e));
              return node;
            }))));
        root.replaceChildren(el('h1', {}, t('weekOf', fmtDay(isoDay(start)))), nav, el('div', { class: 'dv-tt-grid' }, el('div', { class: 'dv-tt-hourcol' }, el('div', { class: 'dv-tt-head' }), hours), columns));
      };
      render().catch((e) => root.replaceChildren(el('p', { class: 'dv-muted' }, e.message)));
      return () => root.remove();
    },
  });

  ctx.registerAction({ id: 'open-home', name: 'De Vinci', icon: ICON, run: () => ctx.app.openView('home') });
  ctx.registerAction({ id: 'open-timetable', name: lang === 'fr' ? 'Emploi du temps' : 'Timetable', icon: CAL_ICON, run: () => ctx.app.openView('timetable') });

  // First launch: land on the setup instead of an empty app.
  ctx.call('status').then((s) => {
    // Reload only once the new language is stored, so this can never loop.
    if (s.language !== lang) { try { localStorage.setItem(LANG_KEY, s.language); location.reload(); } catch { /* storage blocked: stay as is */ } }
    if (s.school) {
      ctx.placeAction({ id: 'home-sidebar', actionId: 'open-home', location: 'sidebar' });
      ctx.placeAction({ id: 'timetable-sidebar', actionId: 'open-timetable', location: 'sidebar' });
    }
    if (!s.setupDone) runOnboarding(ctx, el, s);
  }).catch(() => {});

  // Files the AI actually read go into the library through the native import.
  ctx.onNotification(async (event) => {
    if (event.topic !== 'file-used') return;
    const { url, name, course } = event.data || {};
    try {
      if (!(await ctx.call('claim-import', { url })).import) return;
      const safe = (s) => String(s).replace(/[\\/:\x00-\x1f\x7f]/g, '_').trim() || 'Course';
      // Already in the library (manual import, older install): don't pay for extraction twice.
      const { sources = [] } = await fetch('/api/graph/sources').then((r) => r.json());
      if (sources.some((x) => x.kind === 'notes' && String(x.filePath || '').split(/[\\/]/).pop() === safe(name))) return;
      const { base64 } = await ctx.call('file-bytes', { url });
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const form = new FormData();
      form.append('files', new File([bytes], safe(name)));
      form.append('paths', `De Vinci/${safe(course || 'Course')}/${safe(name)}`);
      await fetch('/api/graph/import', { method: 'POST', body: form });
    } catch (e) { console.warn('[devinci] library import failed', e); }
  });
}
