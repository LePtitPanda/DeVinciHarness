// De Vinci home page: a lightweight hub (no chat, no model calls) that shows
// exams, deadlines and classes, and starts ordinary LearnHarness sessions.
const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/></svg>';

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null) node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return node;
}
const fmtDay = (s) => new Date(`${s.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const daysUntil = (s) => Math.round((Date.parse(`${s.slice(0, 10)}T00:00:00`) - Date.parse(new Date().toDateString())) / 86400e3);

export function activate(ctx) {
  let overview = { exams: [], classes: [], deadlines: [] };

  async function startStudy(goal) {
    goal = goal.trim();
    if (!goal) return;
    const exams = overview.exams.slice(0, 10).map((e) => `- ${e.start.slice(0, 10)} ${e.start.slice(11)} ${e.title}`).join('\n');
    const prompt = `${goal}\n\n(Started from my De Vinci page. My upcoming exams:\n${exams || '- none imported yet'}\nUse the school tools to find the matching Moodle course and files, check the announcements for what the exam covers, and teach me from the actual course material.)`;
    const res = await fetch('/api/chats', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: goal.slice(0, 80) }) });
    if (!res.ok) throw new Error(`Could not create a session (HTTP ${res.status})`);
    const { id } = await res.json();
    // Same handover the native "new session" flow uses: the chat sends it on open.
    sessionStorage.setItem(`lh.openingPrompt.${id}`, JSON.stringify({ text: prompt, attempted: false }));
    ctx.app.openSession(id);
  }

  function connectionSection(signal, rerender) {
    const box = el('section', { class: 'dv-card' }, el('h2', {}, 'Connections'));
    ctx.call('status').then((s) => {
      const moodle = el('div', { class: 'dv-row' }, el('span', {}, s.connected ? 'Moodle: connected' : 'Moodle: not connected'));
      const slot = el('span');
      moodle.append(slot);
      ctx.ui.mountButton(slot, {
        label: s.connected ? 'Disconnect' : 'Connect', size: 'sm', variant: s.connected ? 'secondary' : 'default',
        onClick: async () => { await ctx.call(s.connected ? 'logout' : 'login'); rerender(); },
      }, { signal });

      const link = el('input', { type: 'password', placeholder: s.icsUrl ? 'iCal link saved (paste a new one to replace)' : 'Paste your iCal link (https://ical.devinci.me/…)', class: 'dv-input', autocomplete: 'off' });
      const file = el('input', { type: 'file', accept: '.ics,text/calendar', class: 'dv-file' });
      const note = el('span', { class: 'dv-muted' });
      const save = el('span');
      ctx.ui.mountButton(save, { label: 'Save link', size: 'sm', onClick: async () => { const r = await ctx.call('set-ics-url', { url: link.value }); link.value = ''; note.textContent = `${r.count} events loaded.`; rerender(); } }, { signal });
      file.addEventListener('change', async () => {
        const f = file.files?.[0]; if (!f) return;
        try { const r = await ctx.call('set-ics-text', { text: await f.text() }); note.textContent = `${r.count} events loaded.`; rerender(); }
        catch (e) { note.textContent = e.message; }
      });
      const auto = el('input', { type: 'checkbox' });
      auto.checked = s.autoLibrary;
      auto.addEventListener('change', () => ctx.call('set-auto-library', { enabled: auto.checked }));
      box.append(
        moodle,
        el('div', { class: 'dv-row' }, el('span', {}, s.hasSchedule ? 'Schedule: imported' : 'Schedule: not imported')),
        el('div', { class: 'dv-row' }, link, save),
        el('div', { class: 'dv-row' }, el('span', { class: 'dv-muted' }, 'or import a downloaded .ics file:'), file, note),
        el('label', { class: 'dv-row dv-muted' }, auto, ' Add course files the AI reads to my library (runs the usual import, which uses your model)'),
      );
    }).catch((e) => box.append(el('p', { class: 'dv-muted' }, e.message)));
    return box;
  }

  function listCard(title, items, empty) {
    return el('section', { class: 'dv-card' }, el('h2', {}, title), items.length ? el('ul', { class: 'dv-list' }, items) : el('p', { class: 'dv-muted' }, empty));
  }

  ctx.registerView({
    id: 'home', name: 'De Vinci',
    mount(container, signal) {
      const root = el('div', { class: 'dv-home' });
      container.append(root);
      const render = async () => {
        if (signal.aborted) return;
        root.replaceChildren(el('h1', {}, 'De Vinci'), el('p', { class: 'dv-muted' }, 'Loading…'));
        try { overview = await ctx.call('overview'); } catch (e) { overview = { exams: [], classes: [], deadlines: [], deadlineError: e.message }; }
        if (signal.aborted) return;

        const study = el('div', { class: 'dv-study' });
        let draft = '';
        const composer = ctx.ui.mountComposer(study, {
          value: '', placeholder: 'I want to study… (e.g. matrices for the Algèbre linéaire exam)',
          onChange: (v) => { draft = v; composer.update({ value: v }); },
          onSend: () => startStudy(draft),
        }, { signal });

        const exams = overview.exams.map((e) => {
          const slot = el('span');
          ctx.ui.mountButton(slot, { label: 'Revise', size: 'sm', onClick: () => startStudy(`Help me revise for my ${e.title} exam on ${e.start.slice(0, 10)}`) }, { signal });
          const d = daysUntil(e.start);
          return el('li', {}, el('strong', {}, `${fmtDay(e.start)} ${e.start.slice(11)}`), ` ${e.title}`, el('span', { class: 'dv-muted' }, ` · ${d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`}`), slot);
        });
        const deadlines = overview.deadlines.map((d) => el('li', {}, el('strong', {}, new Date(d.due).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })), ` ${d.name}`, el('span', { class: 'dv-muted' }, ` · ${d.course}`)));
        const classes = overview.classes.map((c) => el('li', {}, el('strong', {}, `${fmtDay(c.start)} ${c.start.slice(11)}–${(c.end || '').slice(11)}`), ` ${c.title}`, el('span', { class: 'dv-muted' }, ` ${c.type ? `[${c.type}] ` : ''}${c.place}`)));

        root.replaceChildren(
          el('h1', {}, 'De Vinci'),
          el('section', { class: 'dv-card' }, el('h2', {}, 'What do you want to study?'), study),
          listCard('Upcoming exams', exams, 'No exams found. Import your schedule below.'),
          listCard('Moodle deadlines (30 days)', deadlines, overview.deadlineError || 'Nothing due, or Moodle is not connected.'),
          listCard('This week', classes, 'No classes found.'),
          connectionSection(signal, render),
        );
      };
      render();
      return () => root.remove();
    },
  });
  ctx.registerAction({ id: 'open-home', name: 'De Vinci', icon: ICON, run: () => ctx.app.openView('home') });
  ctx.placeAction({ id: 'home-sidebar', actionId: 'open-home', location: 'sidebar' });

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
