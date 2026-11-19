// De Vinci home page: a lightweight hub (no chat, no model calls) that shows
// exams, deadlines and classes, and starts ordinary LearnHarness sessions.
const ICON = '<svg viewBox="60 55 180 192" fill="currentColor"><path d="M235,85.7l-34.4,67c0,0-32.8-51.1-16.2-80.5c14.1-21.9,34.7-11.8,37.6-9.4C230.1,67.6,235,76.3,235,85.7z"/><path d="M159.9,178.9L103,68.6H65l89.4,173.1l0,0C166.7,232.8,172.1,202.5,159.9,178.9z"/></svg>';
const CAL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>';
const DAY_START = 8, DAY_END = 21, HOUR_PX = 52;
// Sessions started by a button carry this invisible prefix; the chat hides that opening brief.
const HIDDEN = '⁣';

const STRINGS = {
  en: {
    loading: 'Loading…', study: 'What do you want to study?', studyPh: 'I want to study… (e.g. matrices for the Algèbre linéaire exam)',
    exams: 'Upcoming exams', noExams: 'No exams found. Import your schedule below.', revise: 'Revise',
    today: 'today', tomorrow: 'tomorrow', inDays: (d) => `in ${d} days`,
    deadlines: (g) => `Moodle deadlines (30 days${g ? `, group ${g}` : ''})`, noDeadlines: 'Nothing due, or Moodle is not connected.',
    hiddenFor: (n) => `${n} hidden for other groups/campuses (show)`,
    soon: 'Today & tomorrow', noClasses: 'No classes.', openTimetable: 'Open timetable',
    askGroup: 'Which TD group are you in?', askGroupWhy: 'Used to hide Moodle deadlines meant for other groups.',
    settings: 'Settings & connections', group: 'TD group', campus: 'Campus', year: 'Year', uiLang: 'Language', aiLang: 'AI language', sameAsApp: 'Same as language', save: 'Save',
    groupErr: 'Enter your TD group as one letter, e.g. D.',
    moodleOn: 'Moodle: connected', moodleOff: 'Moodle: not connected', connect: 'Connect', disconnect: 'Disconnect',
    leoOn: 'LeoData (past exams): connected', leoOff: 'LeoData (past exams): not connected',
    schedOn: 'Schedule: imported', schedOff: 'Schedule: not imported', icsSaved: 'iCal link saved (paste a new one to replace)', icsPh: 'Paste your iCal link (https://ical.devinci.me/…)',
    saveLink: 'Save link', orFile: 'or import a downloaded .ics file:', loaded: (n) => `${n} events loaded.`,
    autoLib: ' Add Moodle files the AI reads to my library (runs the usual import, which uses your model)',
    timetable: 'Timetable', weekOf: (d) => `Week of ${d}`, prev: '← Previous', thisWeek: 'This week', next: 'Next →',
    mReviseExam: 'Revise for this exam', mPastExams: 'Practise with past exams', mScope: 'What does this exam cover?',
    mRevise: (c) => `Revise ${c}`, mPrepare: 'Prepare for this class', mRecap: 'Recap this class', mQuiz: 'Quiz me on this course',
    tRevision: 'revision', tPast: 'past exams', tScope: 'exam scope', tPrepare: 'preview', tRecap: 'recap', tQuiz: 'quiz',
  },
  fr: {
    loading: 'Chargement…', study: 'Que veux-tu réviser ?', studyPh: 'Je veux étudier… (ex. les matrices pour l’examen d’Algèbre linéaire)',
    exams: 'Examens à venir', noExams: 'Aucun examen trouvé. Importe ton emploi du temps plus bas.', revise: 'Réviser',
    today: 'aujourd’hui', tomorrow: 'demain', inDays: (d) => `dans ${d} jours`,
    deadlines: (g) => `Rendus Moodle (30 jours${g ? `, groupe ${g}` : ''})`, noDeadlines: 'Rien à rendre, ou Moodle n’est pas connecté.',
    hiddenFor: (n) => `${n} masqués (autres groupes/campus) — afficher`,
    soon: 'Aujourd’hui et demain', noClasses: 'Pas de cours.', openTimetable: 'Ouvrir l’emploi du temps',
    askGroup: 'Dans quel groupe de TD es-tu ?', askGroupWhy: 'Sert à masquer les rendus Moodle des autres groupes.',
    settings: 'Réglages et connexions', group: 'Groupe TD', campus: 'Campus', year: 'Année', uiLang: 'Langue', aiLang: 'Langue de l’IA', sameAsApp: 'Comme la langue', save: 'Enregistrer',
    groupErr: 'Indique ton groupe de TD en une lettre, ex. D.',
    moodleOn: 'Moodle : connecté', moodleOff: 'Moodle : non connecté', connect: 'Connecter', disconnect: 'Déconnecter',
    leoOn: 'LeoData (annales) : connecté', leoOff: 'LeoData (annales) : non connecté',
    schedOn: 'Emploi du temps : importé', schedOff: 'Emploi du temps : non importé', icsSaved: 'Lien iCal enregistré (colle un nouveau lien pour le remplacer)', icsPh: 'Colle ton lien iCal (https://ical.devinci.me/…)',
    saveLink: 'Enregistrer le lien', orFile: 'ou importe un fichier .ics téléchargé :', loaded: (n) => `${n} événements chargés.`,
    autoLib: ' Ajouter à ma bibliothèque les fichiers Moodle lus par l’IA (import habituel, qui utilise ton modèle)',
    timetable: 'Emploi du temps', weekOf: (d) => `Semaine du ${d}`, prev: '← Précédente', thisWeek: 'Cette semaine', next: 'Suivante →',
    mReviseExam: 'Réviser pour cet examen', mPastExams: 'S’entraîner sur les annales', mScope: 'Que couvre cet examen ?',
    mRevise: (c) => `Réviser ${c}`, mPrepare: 'Préparer ce cours', mRecap: 'Récapituler ce cours', mQuiz: 'Me tester sur ce cours',
    tRevision: 'révision', tPast: 'annales', tScope: 'programme de l’examen', tPrepare: 'préparation', tRecap: 'récap', tQuiz: 'quiz',
  },
};

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'style') node.style.cssText = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null) node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return node;
}
const daysUntil = (s) => Math.round((Date.parse(`${s.slice(0, 10)}T00:00:00`) - Date.parse(new Date().toDateString())) / 86400e3);
const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const monday = (d) => { const m = new Date(d); m.setHours(12, 0, 0, 0); m.setDate(m.getDate() - ((m.getDay() + 6) % 7)); return m; };
const minutes = (s) => Number(s.slice(11, 13)) * 60 + Number(s.slice(14, 16));
const STUDY_TAIL = 'Use the school tools to find the matching Moodle course and files, and teach from the actual course material.';

export function activate(ctx) {
  let lang = 'en';
  const t = (key, ...args) => { const v = STRINGS[lang][key] ?? STRINGS.en[key]; return typeof v === 'function' ? v(...args) : v; };
  const locale = () => (lang === 'fr' ? 'fr-FR' : 'en-GB');
  const fmtDay = (s) => new Date(`${s.slice(0, 10)}T12:00:00`).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' });
  const loadLang = async () => { try { lang = (await ctx.call('status')).language || 'en'; } catch { /* keep */ } };

  /** visible=false: the request is a hidden brief (button-started sessions). */
  async function startStudy({ title, request, context = '', visible = false, kind }) {
    request = request.trim();
    if (!request) return;
    const res = await fetch('/api/chats', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: (title || request).slice(0, 80), ...(kind ? { kind } : {}) }) });
    if (!res.ok) throw new Error(`Could not create a session (HTTP ${res.status})`);
    const { id } = await res.json();
    const text = `${visible ? '' : HIDDEN}${request}\n\n(${context}${STUDY_TAIL})`;
    // Same handover the native "new session" flow uses: the chat sends it on open.
    sessionStorage.setItem(`lh.openingPrompt.${id}`, JSON.stringify({ text, attempted: false }));
    ctx.app.openSession(id);
  }
  const reviseExam = (e) => startStudy({ title: `${e.title} · ${t('tRevision')}`, request: `Help me revise for my ${e.title} exam.`, context: `The exam is on ${e.start.slice(0, 10)} at ${e.start.slice(11)}; check the course announcements for what it covers. ` });

  function button(slot, props, signal) { ctx.ui.mountButton(slot, { size: 'sm', ...props }, { signal }); return slot; }

  function profileRows(s, signal, rerender) {
    const group = el('input', { class: 'dv-input dv-short', maxlength: '1', placeholder: 'D', value: s.group });
    const select = (value, options) => { const node = el('select', { class: 'dv-input dv-short' }, options.map(([v, label]) => el('option', { value: v }, label))); node.value = value; return node; };
    const campus = select(s.campus, [['Paris', 'Paris'], ['Nantes', 'Nantes']]);
    const year = select(String(s.year || 2), [1, 2, 3, 4, 5].map((n) => [String(n), String(n)]));
    const ui = select(s.language, [['en', 'English'], ['fr', 'Français']]);
    const ai = select(s.aiLanguage, [['auto', t('sameAsApp')], ['en', 'English'], ['fr', 'Français']]);
    const note = el('span', { class: 'dv-muted' });
    const save = button(el('span'), {
      label: t('save'), onClick: async () => {
        try { await ctx.call('set-profile', { group: group.value, campus: campus.value, year: Number(year.value), language: ui.value, aiLanguage: ai.value }); lang = ui.value; rerender(); }
        catch (e) { note.textContent = /one letter/.test(e.message) ? t('groupErr') : e.message; }
      },
    }, signal);
    return el('div', { class: 'dv-row' }, el('span', {}, t('group')), group, el('span', {}, t('campus')), campus, el('span', {}, t('year')), year, el('span', {}, t('uiLang')), ui, el('span', {}, t('aiLang')), ai, save, note);
  }

  function connectionSection(s, signal, rerender) {
    const box = el('section', { class: 'dv-card' }, el('h2', {}, t('settings')));
    const moodle = el('div', { class: 'dv-row' }, el('span', {}, s.connected ? t('moodleOn') : t('moodleOff')));
    moodle.append(button(el('span'), { label: s.connected ? t('disconnect') : t('connect'), variant: s.connected ? 'secondary' : 'default', onClick: async () => { await ctx.call(s.connected ? 'logout' : 'login'); rerender(); } }, signal));
    const leo = el('div', { class: 'dv-row' }, el('span', {}, s.leo ? t('leoOn') : t('leoOff')));
    if (!s.leo) leo.append(button(el('span'), { label: t('connect'), onClick: async () => { await ctx.call('leo-login'); rerender(); } }, signal));

    const link = el('input', { type: 'password', placeholder: s.icsUrl ? t('icsSaved') : t('icsPh'), class: 'dv-input', autocomplete: 'off' });
    const file = el('input', { type: 'file', accept: '.ics,text/calendar', class: 'dv-file' });
    const note = el('span', { class: 'dv-muted' });
    const save = button(el('span'), { label: t('saveLink'), onClick: async () => { try { const r = await ctx.call('set-ics-url', { url: link.value }); link.value = ''; note.textContent = t('loaded', r.count); rerender(); } catch (e) { note.textContent = e.message; } } }, signal);
    file.addEventListener('change', async () => {
      const f = file.files?.[0]; if (!f) return;
      try { const r = await ctx.call('set-ics-text', { text: await f.text() }); note.textContent = t('loaded', r.count); rerender(); }
      catch (e) { note.textContent = e.message; }
    });
    const auto = el('input', { type: 'checkbox' });
    auto.checked = s.autoLibrary;
    auto.addEventListener('change', () => ctx.call('set-auto-library', { enabled: auto.checked }));
    box.append(
      profileRows(s, signal, rerender),
      moodle, leo,
      el('div', { class: 'dv-row' }, el('span', {}, s.hasSchedule ? t('schedOn') : t('schedOff'))),
      el('div', { class: 'dv-row' }, link, save),
      el('div', { class: 'dv-row' }, el('span', { class: 'dv-muted' }, t('orFile')), file, note),
      el('label', { class: 'dv-row dv-muted' }, auto, t('autoLib')),
    );
    return box;
  }

  function listCard(title, items, empty, ...extra) {
    return el('section', { class: 'dv-card' }, el('h2', {}, title), items.length ? el('ul', { class: 'dv-list' }, items) : el('p', { class: 'dv-muted' }, empty), ...extra);
  }
  const deadlineItem = (d) => el('li', {}, el('strong', {}, new Date(d.due).toLocaleString(locale(), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })), ` ${d.name}`, el('span', { class: 'dv-muted' }, ` · ${d.course}`));
  const when = (s) => { const d = daysUntil(s); return d === 0 ? t('today') : d === 1 ? t('tomorrow') : t('inDays', d); };

  ctx.registerView({
    id: 'home', name: 'De Vinci',
    mount(container, signal) {
      const root = el('div', { class: 'dv-home' });
      container.append(root);
      const render = async () => {
        if (signal.aborted) return;
        root.replaceChildren(el('h1', {}, 'De Vinci'), el('p', { class: 'dv-muted' }, t('loading')));
        let overview, status;
        try { [overview, status] = await Promise.all([ctx.call('overview'), ctx.call('status')]); }
        catch (e) { root.replaceChildren(el('h1', {}, 'De Vinci'), el('p', { class: 'dv-muted' }, e.message)); return; }
        if (signal.aborted) return;
        lang = status.language || 'en';

        const study = el('div', { class: 'dv-study' });
        let draft = '';
        const composer = ctx.ui.mountComposer(study, {
          value: '', placeholder: t('studyPh'),
          onChange: (v) => { draft = v; composer.update({ value: v }); },
          onSend: () => startStudy({ request: draft, visible: true }),
        }, { signal });

        const exams = overview.exams.map((e) => el('li', {}, el('strong', {}, `${fmtDay(e.start)} ${e.start.slice(11)}`), ` ${e.title}`, el('span', { class: 'dv-muted' }, ` · ${when(e.start)}`),
          button(el('span'), { label: t('revise'), onClick: () => reviseExam(e) }, signal)));

        const hidden = overview.hiddenDeadlines || [];
        const hiddenList = el('ul', { class: 'dv-list dv-hidden-list', hidden: '' }, hidden.map(deadlineItem));
        const hiddenToggle = hidden.length ? el('button', { class: 'dv-link', onclick: () => { hiddenList.hidden = !hiddenList.hidden; } }, t('hiddenFor', hidden.length)) : null;

        const classes = overview.classes.map((c) => el('li', {}, el('strong', {}, `${fmtDay(c.start)} ${c.start.slice(11)}–${(c.end || '').slice(11)}`), ` ${c.title}`, el('span', { class: 'dv-muted' }, ` ${c.type ? `[${c.type}] ` : ''}${c.place}`)));
        const openTimetable = button(el('span'), { label: t('openTimetable'), variant: 'outline', onClick: () => ctx.app.openView('timetable') }, signal);

        const ask = status.group ? null : el('section', { class: 'dv-card dv-ask' }, el('h2', {}, t('askGroup')), el('p', { class: 'dv-muted' }, t('askGroupWhy')), profileRows(status, signal, render));

        root.replaceChildren(...[
          el('h1', {}, 'De Vinci'),
          ask,
          el('section', { class: 'dv-card' }, el('h2', {}, t('study')), study),
          listCard(t('exams'), exams, t('noExams')),
          listCard(t('deadlines', overview.group), overview.deadlines.map(deadlineItem), overview.deadlineError || t('noDeadlines'), hiddenToggle, hiddenList),
          listCard(t('soon'), classes, t('noClasses'), el('div', { class: 'dv-row' }, openTimetable)),
          connectionSection(status, signal, render),
        ].filter(Boolean));
      };
      render();
      return () => root.remove();
    },
  });

  function eventMenu(anchor, e) {
    const c = e.title;
    const items = e.exam ? [
      { key: 'revise', label: t('mReviseExam'), onSelect: () => reviseExam(e) },
      { key: 'past', label: t('mPastExams'), onSelect: () => startStudy({ title: `${c} · ${t('tPast')}`, kind: 'practice', request: `Give me practice problems from previous years' ${c} exams.`, context: 'Find them in LeoData (school_past_exams_browse / school_past_exams_read) and say which year each problem comes from. ' }) },
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
    id: 'timetable', name: 'Timetable',
    mount(container, signal) {
      const root = el('div', { class: 'dv-tt' });
      container.append(root);
      let start = monday(new Date());
      const render = async () => {
        await loadLang();
        const events = await ctx.call('week', { start: isoDay(start) });
        if (signal.aborted) return;
        const days = [...Array(7)].map((_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return isoDay(d); })
          .filter((d, i) => i < 5 || events.some((e) => e.start.startsWith(d)));
        const nav = el('div', { class: 'dv-row' });
        for (const [label, delta] of [[t('prev'), -7], [t('thisWeek'), 0], [t('next'), 7]]) {
          button(nav.appendChild(el('span')), { label, variant: 'outline', onClick: () => { if (delta) start.setDate(start.getDate() + delta); else start = monday(new Date()); render(); } }, signal);
        }
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
  ctx.registerAction({ id: 'open-timetable', name: 'Timetable', icon: CAL_ICON, run: () => ctx.app.openView('timetable') });
  ctx.placeAction({ id: 'home-sidebar', actionId: 'open-home', location: 'sidebar' });
  ctx.placeAction({ id: 'timetable-sidebar', actionId: 'open-timetable', location: 'sidebar' });

  // Files the AI actually read go into the library through the native import.
  ctx.onNotification(async (event) => {
    if (event.topic !== 'file-used') return;
    const { url, name, course } = event.data || {};
    try {
      if (!(await ctx.call('claim-import', { url })).import) return;
      const { base64 } = await ctx.call('file-bytes', { url });
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const safe = (s) => String(s).replace(/[\\/:\x00-\x1f\x7f]/g, '_').trim() || 'Course';
      const form = new FormData();
      form.append('files', new File([bytes], safe(name)));
      form.append('paths', `De Vinci/${safe(course || 'Course')}/${safe(name)}`);
      await fetch('/api/graph/import', { method: 'POST', body: form });
    } catch (e) { console.warn('[devinci] library import failed', e); }
  });
}
