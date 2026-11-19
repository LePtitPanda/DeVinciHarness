// De Vinci home page: a lightweight hub (no chat, no model calls) that shows
// exams, deadlines and classes, and starts ordinary LearnHarness sessions.
const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/></svg>';
const CAL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>';
const DAY_START = 8, DAY_END = 21, HOUR_PX = 52;

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
const fmtDay = (s) => new Date(`${s.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const daysUntil = (s) => Math.round((Date.parse(`${s.slice(0, 10)}T00:00:00`) - Date.parse(new Date().toDateString())) / 86400e3);
const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const monday = (d) => { const m = new Date(d); m.setHours(12, 0, 0, 0); m.setDate(m.getDate() - ((m.getDay() + 6) % 7)); return m; };
const minutes = (s) => Number(s.slice(11, 13)) * 60 + Number(s.slice(14, 16));
const STUDY_TAIL = 'Started from my De Vinci page: use the school tools to find the matching Moodle course and files, and teach me from the actual course material.';

export function activate(ctx) {
  async function startStudy(goal, extra = '') {
    goal = goal.trim();
    if (!goal) return;
    const res = await fetch('/api/chats', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: goal.slice(0, 80) }) });
    if (!res.ok) throw new Error(`Could not create a session (HTTP ${res.status})`);
    const { id } = await res.json();
    // Same handover the native "new session" flow uses: the chat sends it on open.
    sessionStorage.setItem(`lh.openingPrompt.${id}`, JSON.stringify({ text: `${goal}\n\n(${extra}${STUDY_TAIL})`, attempted: false }));
    ctx.app.openSession(id);
  }

  function button(slot, props, signal) { ctx.ui.mountButton(slot, { size: 'sm', ...props }, { signal }); return slot; }

  function profileRows(s, signal, rerender) {
    const group = el('input', { class: 'dv-input dv-short', maxlength: '1', placeholder: 'D', value: s.group });
    const campus = el('select', { class: 'dv-input dv-short' }, ['Paris', 'Nantes'].map((c) => el('option', { value: c }, c)));
    campus.value = s.campus;
    const language = el('select', { class: 'dv-input dv-short' }, el('option', { value: 'en' }, 'English'), el('option', { value: 'fr' }, 'Français'));
    language.value = s.language;
    const note = el('span', { class: 'dv-muted' });
    const save = button(el('span'), {
      label: 'Save', onClick: async () => {
        try { await ctx.call('set-profile', { group: group.value, campus: campus.value, language: language.value }); rerender(); }
        catch (e) { note.textContent = e.message; }
      },
    }, signal);
    return el('div', { class: 'dv-row' }, el('span', {}, 'TD group'), group, el('span', {}, 'Campus'), campus, el('span', {}, 'AI language'), language, save, note);
  }

  function connectionSection(s, signal, rerender) {
    const box = el('section', { class: 'dv-card' }, el('h2', {}, 'Settings & connections'));
    const moodle = el('div', { class: 'dv-row' }, el('span', {}, s.connected ? 'Moodle: connected' : 'Moodle: not connected'));
    moodle.append(button(el('span'), { label: s.connected ? 'Disconnect' : 'Connect', variant: s.connected ? 'secondary' : 'default', onClick: async () => { await ctx.call(s.connected ? 'logout' : 'login'); rerender(); } }, signal));
    const leo = el('div', { class: 'dv-row' }, el('span', {}, s.leo ? 'LeoData (past exams): connected' : 'LeoData (past exams): not connected'));
    if (!s.leo) leo.append(button(el('span'), { label: 'Connect', onClick: async () => { await ctx.call('leo-login'); rerender(); } }, signal));

    const link = el('input', { type: 'password', placeholder: s.icsUrl ? 'iCal link saved (paste a new one to replace)' : 'Paste your iCal link (https://ical.devinci.me/…)', class: 'dv-input', autocomplete: 'off' });
    const file = el('input', { type: 'file', accept: '.ics,text/calendar', class: 'dv-file' });
    const note = el('span', { class: 'dv-muted' });
    const save = button(el('span'), { label: 'Save link', onClick: async () => { try { const r = await ctx.call('set-ics-url', { url: link.value }); link.value = ''; note.textContent = `${r.count} events loaded.`; rerender(); } catch (e) { note.textContent = e.message; } } }, signal);
    file.addEventListener('change', async () => {
      const f = file.files?.[0]; if (!f) return;
      try { const r = await ctx.call('set-ics-text', { text: await f.text() }); note.textContent = `${r.count} events loaded.`; rerender(); }
      catch (e) { note.textContent = e.message; }
    });
    const auto = el('input', { type: 'checkbox' });
    auto.checked = s.autoLibrary;
    auto.addEventListener('change', () => ctx.call('set-auto-library', { enabled: auto.checked }));
    box.append(
      profileRows(s, signal, rerender),
      moodle, leo,
      el('div', { class: 'dv-row' }, el('span', {}, s.hasSchedule ? 'Schedule: imported' : 'Schedule: not imported')),
      el('div', { class: 'dv-row' }, link, save),
      el('div', { class: 'dv-row' }, el('span', { class: 'dv-muted' }, 'or import a downloaded .ics file:'), file, note),
      el('label', { class: 'dv-row dv-muted' }, auto, ' Add Moodle files the AI reads to my library (runs the usual import, which uses your model)'),
    );
    return box;
  }

  function listCard(title, items, empty, ...extra) {
    return el('section', { class: 'dv-card' }, el('h2', {}, title), items.length ? el('ul', { class: 'dv-list' }, items) : el('p', { class: 'dv-muted' }, empty), ...extra);
  }
  const deadlineItem = (d) => el('li', {}, el('strong', {}, new Date(d.due).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })), ` ${d.name}`, el('span', { class: 'dv-muted' }, ` · ${d.course}`));

  ctx.registerView({
    id: 'home', name: 'De Vinci',
    mount(container, signal) {
      const root = el('div', { class: 'dv-home' });
      container.append(root);
      const render = async () => {
        if (signal.aborted) return;
        root.replaceChildren(el('h1', {}, 'De Vinci'), el('p', { class: 'dv-muted' }, 'Loading…'));
        let overview, status;
        try { [overview, status] = await Promise.all([ctx.call('overview'), ctx.call('status')]); }
        catch (e) { root.replaceChildren(el('h1', {}, 'De Vinci'), el('p', { class: 'dv-muted' }, e.message)); return; }
        if (signal.aborted) return;

        const study = el('div', { class: 'dv-study' });
        let draft = '';
        const composer = ctx.ui.mountComposer(study, {
          value: '', placeholder: 'I want to study… (e.g. matrices for the Algèbre linéaire exam)',
          onChange: (v) => { draft = v; composer.update({ value: v }); },
          onSend: () => startStudy(draft),
        }, { signal });

        const exams = overview.exams.map((e) => {
          const d = daysUntil(e.start);
          const slot = button(el('span'), { label: 'Revise', onClick: () => startStudy(`Help me revise for my ${e.title} exam`, `The exam is on ${e.start.slice(0, 10)} at ${e.start.slice(11)}; check the course announcements for what it covers. `) }, signal);
          return el('li', {}, el('strong', {}, `${fmtDay(e.start)} ${e.start.slice(11)}`), ` ${e.title}`, el('span', { class: 'dv-muted' }, ` · ${d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`}`), slot);
        });

        const hidden = overview.hiddenDeadlines || [];
        const hiddenList = el('ul', { class: 'dv-list dv-hidden-list', hidden: '' }, hidden.map(deadlineItem));
        const hiddenToggle = hidden.length ? el('button', { class: 'dv-link', onclick: () => { hiddenList.hidden = !hiddenList.hidden; } }, `${hidden.length} hidden for other groups/campuses (show)`) : null;

        const classes = overview.classes.map((c) => el('li', {}, el('strong', {}, `${fmtDay(c.start)} ${c.start.slice(11)}–${(c.end || '').slice(11)}`), ` ${c.title}`, el('span', { class: 'dv-muted' }, ` ${c.type ? `[${c.type}] ` : ''}${c.place}`)));
        const openTimetable = button(el('span'), { label: 'Open timetable', variant: 'outline', onClick: () => ctx.app.openView('timetable') }, signal);

        const ask = status.group ? null : el('section', { class: 'dv-card dv-ask' }, el('h2', {}, 'Which TD group are you in?'),
          el('p', { class: 'dv-muted' }, 'Used to hide Moodle deadlines meant for other groups.'), profileRows(status, signal, render));

        root.replaceChildren(
          el('h1', {}, 'De Vinci'),
          ask,
          el('section', { class: 'dv-card' }, el('h2', {}, 'What do you want to study?'), study),
          listCard('Upcoming exams', exams, 'No exams found. Import your schedule below.'),
          listCard(`Moodle deadlines (30 days${overview.group ? `, group ${overview.group}` : ''})`, overview.deadlines.map(deadlineItem), overview.deadlineError || 'Nothing due, or Moodle is not connected.', hiddenToggle, hiddenList),
          listCard('Today & tomorrow', classes, 'No classes.', el('div', { class: 'dv-row' }, openTimetable)),
          connectionSection(status, signal, render),
        );
      };
      render();
      return () => root.remove();
    },
  });

  ctx.registerView({
    id: 'timetable', name: 'Timetable',
    mount(container, signal) {
      const root = el('div', { class: 'dv-tt' });
      container.append(root);
      let start = monday(new Date());
      const render = async () => {
        const events = await ctx.call('week', { start: isoDay(start) });
        if (signal.aborted) return;
        const days = [...Array(7)].map((_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return isoDay(d); })
          .filter((d, i) => i < 5 || events.some((e) => e.start.startsWith(d)));
        const nav = el('div', { class: 'dv-row' });
        for (const [label, delta] of [['← Previous', -7], ['This week', 0], ['Next →', 7]]) {
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
              return el('div', { class: `dv-tt-event${e.exam ? ' dv-tt-exam' : ''}`, style: `top:${top}px;height:${height}px;${lane}`, title: `${e.title} [${e.type}]\n${e.start.slice(11)}–${(e.end || '').slice(11)}\n${e.place}\n${e.teacher}` },
                el('strong', {}, e.title), el('span', {}, `${e.start.slice(11)}–${(e.end || '').slice(11)} ${e.type ? `[${e.type}]` : ''}`), el('span', { class: 'dv-muted' }, e.place));
            }))));
        root.replaceChildren(el('h1', {}, `Week of ${fmtDay(isoDay(start))}`), nav, el('div', { class: 'dv-tt-grid' }, el('div', { class: 'dv-tt-hourcol' }, el('div', { class: 'dv-tt-head' }), hours), columns));
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
