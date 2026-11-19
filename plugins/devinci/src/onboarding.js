// First launch: a scripted chat (no AI) over the whole window, so the rest of the app
// stays out of reach until setup is done. Each answer is saved as soon as it is given.
import { OB } from './strings.js';
import NVIDIA_SHOT from './assets/nvidia-key.webp';

const RSS = '<svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true"><rect width="32" height="32" rx="6" fill="#f26522"/><circle cx="9" cy="23" r="3" fill="#fff"/><path d="M6 14a12 12 0 0 1 12 12h-4a8 8 0 0 0-8-8z" fill="#fff"/><path d="M6 6a20 20 0 0 1 20 20h-4A16 16 0 0 0 6 10z" fill="#fff"/></svg>';
const NVIDIA_MODELS = {
  strong: { model: { provider: 'nvidia', id: 'nvidia/nemotron-3-ultra-550b-a55b' }, thinkingLevel: 'medium' },
  cheap: { model: { provider: 'nvidia', id: 'nvidia/nemotron-3-ultra-550b-a55b' }, thinkingLevel: 'medium' },
  vision: { model: { provider: 'nvidia', id: 'nvidia/nemotron-3.5-super-vl-120b-a12b' }, thinkingLevel: 'low' },
};

export function runOnboarding(ctx, el, status) {
  let lang = status.language === 'fr' ? 'fr' : 'en';
  const t = (key, ...args) => { const v = OB[lang][key] ?? OB.en[key]; return typeof v === 'function' ? v(...args) : v; };
  const log = el('div', { class: 'dv-ob-log', role: 'log', 'aria-live': 'polite' });
  const dock = el('div', { class: 'dv-ob-dock' });
  const overlay = el('div', { class: 'dv-ob', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'DeVinciHarness setup' },
    el('div', { class: 'dv-ob-col' }, log, dock));
  document.body.append(overlay);

  const scroll = () => requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });
  const say = (...nodes) => { log.append(el('div', { class: 'dv-ob-bot' }, ...nodes.map((n) => (typeof n === 'string' ? el('p', {}, n) : n)))); scroll(); };
  const me = (text) => { log.append(el('div', { class: 'dv-ob-me' }, text)); scroll(); };
  const html = (markup) => { const span = el('span'); span.innerHTML = markup; return span; };

  // One question at a time: choice buttons, optionally a text field and/or a file picker.
  function ask({ choices = [], input, file } = {}) {
    return new Promise((resolve) => {
      const done = (value, echo) => { dock.replaceChildren(); if (echo) me(echo); resolve(value); };
      const row = el('div', { class: 'dv-ob-choices' }, choices.map(([value, label]) =>
        el('button', { type: 'button', class: 'dv-ob-choice', onclick: () => done({ choice: value }, label) }, label)));
      const parts = [];
      if (input) {
        const field = el('input', { class: 'dv-ob-input', type: input.secret ? 'password' : 'text', autocomplete: 'off', placeholder: input.placeholder || '', maxlength: input.maxlength });
        const send = () => { const v = field.value.trim(); if (v) done({ text: v }, input.secret ? '••••••••' : v); };
        field.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
        parts.push(el('div', { class: 'dv-ob-field' }, field, el('button', { type: 'button', class: 'dv-ob-send', 'aria-label': t('send'), onclick: send }, '↵')));
        setTimeout(() => field.focus(), 0);
      }
      if (file) {
        const picker = el('input', { type: 'file', accept: file.accept, hidden: true });
        picker.addEventListener('change', () => { const f = picker.files?.[0]; if (f) done({ file: f }, f.name); });
        row.append(el('button', { type: 'button', class: 'dv-ob-choice', onclick: () => picker.click() }, file.label), picker);
      }
      dock.replaceChildren(...parts, row);
      scroll();
    });
  }
  const yesNo = (yes, no) => ask({ choices: [['yes', yes], ['no', no]] }).then((a) => a.choice === 'yes');
  const api = async (url, init) => {
    const res = await fetch(url, init);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
    return body;
  };
  const put = (url, body) => api(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const summary = { moodle: false, leo: false, timetable: false, profile: '', ai: '' };

  async function connect(op, name) {
    for (;;) {
      try {
        const r = await ctx.call(op);
        if (r?.connected === false) throw new Error(t('notFinished'));
        say(t('connectedTo', name));
        return true;
      } catch (e) {
        say(t('connectFailed', name, e.message));
        if (!(await yesNo(t('retry'), t('skip')))) return false;
      }
    }
  }

  async function timetable() {
    say(t('ttIntro'), el('ol', { class: 'dv-ob-steps' },
      el('li', {}, t('tt1')), el('li', {}, t('tt2a'), html(RSS), t('tt2b')), el('li', {}, t('tt3'))), t('ttWhy'));
    for (;;) {
      const a = await ask({ input: { placeholder: 'https://ical.devinci.me/…', secret: false }, file: { accept: '.ics,text/calendar', label: t('useFile') }, choices: [['skip', t('skip')]] });
      if (a.choice === 'skip') return;
      try {
        const r = a.file ? await ctx.call('set-ics-text', { text: await a.file.text() }) : await ctx.call('set-ics-url', { url: a.text });
        say(t('ttLoaded', r.count)); summary.timetable = true;
        return;
      } catch (e) {
        say(a.file ? t('badFile') : t('badLink'));
      }
    }
  }

  async function profile() {
    say(t('groupQ'));
    let group;
    for (;;) {
      const a = await ask({ input: { placeholder: t('groupPh'), maxlength: '1' }, choices: [['skip', t('noGroup')]] });
      if (a.choice) { group = ''; break; }
      if (/^[a-z]$/i.test(a.text)) { group = a.text.toUpperCase(); break; }
      say(t('groupBad'));
    }
    say(t('campusQ'));
    const campus = (await ask({ choices: [['Paris', 'Paris'], ['Nantes', 'Nantes']] })).choice;
    say(t('yearQ'));
    const year = Number((await ask({ choices: [1, 2, 3, 4, 5].map((n) => [String(n), t('yearN', n)]) })).choice);
    await ctx.call('set-profile', { group, campus, year });
    summary.profile = [group && t('groupN', group), campus, t('yearN', year)].filter(Boolean).join(' · ');
  }

  async function nvidia() {
    say(t('nvWarn'));
    if (!(await yesNo(t('nvContinue'), t('useOther')))) return false;
    say(t('nvSteps'), el('ol', { class: 'dv-ob-steps' },
      el('li', {}, t('nv1a'), el('a', { href: 'https://build.nvidia.com/nvidia/nemotron-3-ultra-550b-a55b', target: '_blank', rel: 'noreferrer' }, 'build.nvidia.com'), t('nv1b')),
      el('li', {}, t('nv2')), el('li', {}, t('nv3'))),
    el('img', { class: 'dv-ob-shot', src: NVIDIA_SHOT, alt: t('nvAlt') }));
    for (;;) {
      const a = await ask({ input: { placeholder: 'nvapi-…', secret: true }, choices: [['other', t('useOther')]] });
      if (a.choice) return false;
      if (!a.text.startsWith('nvapi-')) { say(t('nvBadKey')); continue; }
      try { await put('/api/keys/NVIDIA_API_KEY', { value: a.text }); break; } catch (e) { say(t('nvSaveFailed', e.message)); }
    }
    say(t('nvSaved'), t('nvModelsQ'), el('ul', { class: 'dv-ob-steps' }, el('li', {}, t('nvRec1')), el('li', {}, t('nvRec2'))));
    if (!(await yesNo(t('nvRecommended'), t('nvCustom')))) { say(t('laterAgent')); summary.ai = 'NVIDIA'; return true; }
    try {
      await api('/api/models'); // refreshes the live NVIDIA list now that the key exists
      await put('/api/settings/models', NVIDIA_MODELS);
      say(t('nvDone')); summary.ai = 'Nemotron 3 Ultra · 3.5 Super VL';
    } catch (e) { say(t('nvModelsFailed', e.message), t('laterAgent')); summary.ai = 'NVIDIA'; }
    return true;
  }

  function graph() {
    const nodes = [['moodle', 'Moodle'], ['leo', 'LeoData'], ['timetable', t('timetable')], ['profile', summary.profile || t('profile')], ['ai', summary.ai || t('aiLater')]]
      .filter(([key]) => key in summary).map(([key, label]) => [label, !!summary[key]]);
    const W = 460, H = 230, cx = W / 2, cy = H / 2;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'dv-ob-graph'); svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', nodes.map(([n, on]) => `${n}: ${on ? 'on' : 'off'}`).join(', '));
    const add = (tag, attrs, text) => { const n = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (text) n.textContent = text; svg.append(n); return n; };
    nodes.forEach(([label, on], i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / nodes.length, x = cx + Math.cos(a) * 140, y = cy + Math.sin(a) * 82;
      add('line', { x1: cx, y1: cy, x2: x, y2: y, class: on ? 'on' : 'off', style: `animation-delay:${i * 120}ms` });
      add('circle', { cx: x, cy: y, r: 6, class: on ? 'on' : 'off' });
      add('text', { x, y: y + (y > cy ? 20 : -12), 'text-anchor': 'middle' }, label.length > 30 ? `${label.slice(0, 29)}…` : label);
    });
    add('circle', { cx, cy, r: 16, class: 'hub' });
    add('text', { x: cx, y: cy + 4, 'text-anchor': 'middle', class: 'hub-label' }, 'V');
    return svg;
  }

  async function flow() {
    say(OB.en.hello, OB.fr.hello);
    lang = (await ask({ choices: [['en', 'English'], ['fr', 'Français']] })).choice;
    await ctx.call('set-profile', { language: lang });
    try { localStorage.setItem('dv.lang', lang); } catch { /* per-window convenience only */ }

    say(t('aiLangQ'));
    await ctx.call('set-profile', { aiLanguage: (await ask({ choices: [['auto', t('sameLang')], ['en', 'English'], ['fr', 'Français']] })).choice });

    say(t('schoolQ'));
    const school = await yesNo(t('schoolYes'), t('schoolNo'));
    await ctx.call('set-profile', { school });
    if (school) {
      say(t('moodleQ'));
      if (await yesNo(t('connect'), t('notNow'))) summary.moodle = await connect('login', 'Moodle');
      say(t('leoQ'));
      if (await yesNo(t('connect'), t('notNow'))) summary.leo = await connect('leo-login', 'LeoData');
      say(t('ttQ'));
      if (await yesNo(t('yes'), t('notNow'))) await timetable();
      await profile();
    } else {
      Object.assign(summary, { moodle: null, leo: null, timetable: null, profile: null });
    }

    say(t('aiQ'));
    const current = await ctx.call('models').catch(() => ({}));
    const choices = [['nvidia', t('aiNvidia')], ['custom', t('aiCustom')]];
    if (current.strong) choices.push(['keep', t('aiKeep', current.strong.split(' · ').pop())]);
    const pick = (await ask({ choices })).choice;
    if (pick === 'keep') summary.ai = current.strong.split(' · ').pop();
    else if (pick === 'custom' || !(await nvidia())) say(t('laterAgent'));
  }

  // Missing parts show as gray; parts that don't apply (not a De Vinci student) are left out.
  const finish = async () => {
    for (const k of Object.keys(summary)) if (summary[k] === null) delete summary[k];
    say(t('thanks'), graph());
    await ask({ choices: [['go', t('start')]] });
    await ctx.call('set-setup', { done: true, step: 0 });
    location.href = '/'; // full reload: applies the language and the sidebar entries everywhere
  };
  flow().then(finish).catch((e) => {
    say(t('crashed', e.message));
    ask({ choices: [['go', t('start')]] }).then(async () => { await ctx.call('set-setup', { done: true, step: 0 }).catch(() => {}); location.href = '/'; });
  });
}
