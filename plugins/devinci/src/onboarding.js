// First launch: a scripted chat (no AI) over the whole window, so the rest of the app
// stays out of reach until setup is done. Each answer is saved as soon as it is given.
import { OB } from './strings.js';
import NVIDIA_SHOT from './assets/nvidia-key.webp';

const RSS = '<svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true"><rect width="32" height="32" rx="6" fill="#f26522"/><circle cx="9" cy="23" r="3" fill="#fff"/><path d="M6 14a12 12 0 0 1 12 12h-4a8 8 0 0 0-8-8z" fill="#fff"/><path d="M6 6a20 20 0 0 1 20 20h-4A16 16 0 0 0 6 10z" fill="#fff"/></svg>';
const slot = (provider, id, thinkingLevel) => ({ model: { provider, id }, thinkingLevel });
const NV_ULTRA = 'nvidia/nemotron-3-ultra-550b-a55b', NV_VL = 'nvidia/nemotron-3.5-super-vl-120b-a12b', NV_LIGHT = 'nvidia/nemotron-3.5-lightning-30b-a3b';
const CLAUDE_INSTALL = 'irm https://claude.ai/install.ps1 | iex';
const AGY_INSTALL = 'irm https://antigravity.google/cli/install.ps1 | iex';
// Highest version first, e.g. gemini-4-… before gemini-3.8-….
const byVersion = (a, b) => b.id.localeCompare(a.id, 'en', { numeric: true });

export function runOnboarding(ctx, el, status) {
  let lang = status.language === 'fr' ? 'fr' : 'en';
  const t = (key, ...args) => { const v = OB[lang][key] ?? OB.en[key]; return typeof v === 'function' ? v(...args) : v; };
  const log = el('div', { class: 'dv-ob-log', role: 'log', 'aria-live': 'polite' });
  const dock = el('div', { class: 'dv-ob-dock' });
  const col = el('div', { class: 'dv-ob-col' }, log, dock);
  const overlay = el('div', { class: 'dv-ob', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'DeVinciHarness setup' }, col);
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
  const summary = { moodle: false, leo: false, timetable: false, campus: 'Paris', year: 2 };

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
    Object.assign(summary, { group, campus, year });
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
    say(t('nvSaved'), t('nvStrongQ'));
    const strong = (await ask({ choices: [[NV_ULTRA, t('nvUltra')], [NV_VL, t('nvVl')]] })).choice;
    say(t('nvSubQ'));
    const sub = (await ask({ choices: [[NV_LIGHT, t('nvLight')], [NV_VL, t('nvVlSmart')]] })).choice;
    say(t('nvVision'));
    await setModels({ strong: slot('nvidia', strong, 'medium'), cheap: slot('nvidia', sub, 'medium'), vision: slot('nvidia', NV_VL, 'low') });
    return true;
  }

  // Saves slot picks, keeping only models the catalog really has (and thinking
  // levels they support); a missing pick falls back to the provider's first model.
  async function setModels(picks) {
    try {
      // A fresh sign-in can take a few seconds to show its models.
      const wanted = Object.values(picks)[0].model.provider;
      let catalog = [];
      for (let i = 0; i < 5; i++) {
        catalog = (await api('/api/models')).models || [];
        if (catalog.some((m) => m.provider === wanted)) break;
        await new Promise((r) => setTimeout(r, 2000));
      }
      const out = {};
      for (const [name, pick] of Object.entries(picks)) {
        const ofProvider = catalog.filter((m) => m.provider === pick.model.provider);
        const m = ofProvider.find((x) => x.id === pick.model.id) ?? ofProvider[0];
        if (!m) throw new Error(pick.model.provider);
        out[name] = { model: { provider: m.provider, id: m.id }, ...(pick.thinkingLevel && m.supportedLevels?.includes(pick.thinkingLevel) ? { thinkingLevel: pick.thinkingLevel } : {}) };
      }
      await put('/api/settings/models', out);
      say(t('modelsSet'));
    } catch (e) { say(t('modelsFailed', e.message), t('laterAgent')); }
  }

  // Polls check() until it returns a value (not undefined), with a Cancel button.
  function waitUntil(check, ms = 180000) {
    return new Promise((resolve) => {
      let over = false;
      const end = (v) => { if (over) return; over = true; dock.replaceChildren(); resolve(v); };
      ask({ choices: [['cancel', t('cancel')]] }).then(() => end('cancel'));
      const started = Date.now();
      (async () => {
        while (!over) {
          try { const v = await check(); if (v !== undefined) return end(v); } catch { /* keep polling */ }
          if (Date.now() - started > ms) return end(false);
          await new Promise((r) => setTimeout(r, 1500));
        }
      })();
    });
  }

  const command = (cmd) => {
    const btn = el('button', { type: 'button', class: 'dv-ob-copy' }, t('copy'));
    btn.onclick = () => navigator.clipboard?.writeText(cmd).then(() => { btn.textContent = t('copied'); }, () => {});
    return el('div', { class: 'dv-ob-cmd' }, el('code', {}, cmd), btn);
  };

  // ChatGPT / Codex goes through the fork's native "OpenAI Codex" subscription
  // connection (not the legacy ChatGPT bridge, which later runs fail on).
  async function chatgpt() {
    const bridge = window.lh?.subscriptions, ID = 'openai-codex';
    if (!bridge) { say(t('desktopOnly')); return false; }
    const status = async () => (await bridge.status()).find((s) => s.providerId === ID);
    say(t('gptNotice'));
    if (!(await yesNo(t('gptSignIn'), t('useOther')))) return false;
    for (;;) {
      if ((await status())?.connected) break;
      let failed = false;
      // login() resolves only when sign-in completes; true = sub-agents may use the plan.
      Promise.resolve(bridge.login(ID, true)).catch(() => { failed = true; });
      say(t('waitBrowser'));
      const opened = new Set(), handled = new Set();
      let result;
      for (;;) {
        result = await waitUntil(async () => {
          const st = await status();
          if (st?.connected && !st.pending) return true;
          const it = st?.interaction;
          if (it?.browser && !opened.has(it.browser.id)) { opened.add(it.browser.id); await bridge.open(ID, it.attemptId, it.browser.id); }
          if (it?.userCode && !opened.has(it.userCode)) { opened.add(it.userCode); say(t('codexCode', it.userCode)); }
          if (it?.prompt && !handled.has(it.prompt.id)) { handled.add(it.prompt.id); return { attemptId: it.attemptId, prompt: it.prompt }; }
          if (failed || (st && !st.pending && st.error)) return false;
          return undefined;
        }, 300000);
        if (!result || typeof result !== 'object') break;
        // The provider asked something (e.g. paste a code): answer it here in the chat.
        const { prompt } = result;
        say(prompt.message);
        const a = await ask(prompt.type === 'select'
          ? { choices: (prompt.options || []).map((o) => [o.id, o.label]) }
          : { input: { placeholder: prompt.placeholder || '', secret: prompt.type === 'secret' } });
        await Promise.resolve(bridge.respond(ID, result.attemptId, prompt.id, a.text ?? a.choice)).catch(() => {});
      }
      if (result === 'cancel') { await Promise.resolve(bridge.cancel(ID)).catch(() => {}); return false; }
      if (result) break;
      say(t('notSignedIn'));
      if (!(await yesNo(t('retry'), t('useOther')))) return false;
    }
    say(t('gptDone'), t('gptModels'));
    const P = 'openai-codex-subscription';
    await setModels({ strong: slot(P, 'gpt-6.1-sol', 'high'), cheap: slot(P, 'gpt-6-luna', 'medium'), vision: slot(P, 'gpt-6.1-sol', 'medium') });
    return true;
  }

  async function claude() {
    say(t('clIntro'), el('ol', { class: 'dv-ob-steps' }, el('li', {}, t('cl1'), command(CLAUDE_INSTALL)), el('li', {}, t('cl2')), el('li', {}, t('cl3'))));
    for (;;) {
      if ((await ask({ choices: [['check', t('checkNow')], ['other', t('useOther')]] })).choice === 'other') return false;
      try {
        await put('/api/settings/claudeCode', { enabled: true });
        const st = await api('/api/claude-code', { cache: 'no-store', headers: { 'x-learnharness-claude-code': '1' } });
        if (st.state === 'not-found') { say(t('clNotFound')); continue; }
        if (st.state === 'update-required') { say(t('clUpdate', st.version, st.minimumVersion)); continue; }
        break;
      } catch (e) { say(t('connectFailed', 'Claude Code', e.message)); }
    }
    say(t('clFound'), t('clStrongQ'));
    const strong = (await ask({ choices: [['opus', t('clOpus')], ['sonnet', t('clSonnet')]] })).choice;
    say(t('clModels'));
    await setModels({ strong: slot('claude-code', strong, 'high'), cheap: slot('claude-code', 'haiku', 'medium'), vision: slot('claude-code', 'sonnet', 'medium') });
    return true;
  }

  async function gemini() {
    say(t('gmLimits'));
    if (!(await yesNo(t('gmAnyway'), t('useOther')))) return false;
    say(t('gmIntro'), el('ol', { class: 'dv-ob-steps' }, el('li', {}, t('gm1'), command(AGY_INSTALL)), el('li', {}, t('gm2')), el('li', {}, t('gm3'))));
    let models = [];
    for (;;) {
      if ((await ask({ choices: [['check', t('checkNow')], ['other', t('useOther')]] })).choice === 'other') return false;
      try { models = ((await api('/api/models')).models || []).filter((m) => m.provider === 'antigravity'); } catch { models = []; }
      if (models.length) break;
      say(t('gmNotFound'));
    }
    // Newest Gemini at medium effort for teaching and sub-agents, low for vision.
    const gem = models.filter((m) => /^gemini/.test(m.id)).sort(byVersion);
    const strong = gem.find((m) => /-medium$/.test(m.id)) ?? gem[0] ?? models[0];
    const sub = strong;
    const vision = gem.find((m) => m.id === strong.id.replace(/-medium$/, '-low')) ?? strong;
    say(t('gmSafe'), t('gmModels', strong.name, sub.name, vision.name));
    await setModels({ strong: slot('antigravity', strong.id), cheap: slot('antigravity', sub.id), vision: slot('antigravity', vision.id) });
    return true;
  }

  // The closing screen: what's set up, drawn like the app's knowledge graph
  // (primary-colored nodes, thin muted edges, tinted cluster areas with a label).
  async function finalScreen() {
    const models = summary.ai === undefined ? {} : await ctx.call('models').catch(() => ({}));
    const short = (name) => { const id = String(name || '').split(' · ').pop().split('/').pop(); return id.length > 24 ? `${id.slice(0, 23)}…` : id; };
    const langName = { en: 'English', fr: 'Français', auto: t('sameLang') };
    const clusters = [
      summary.school && { label: t('cSchool'), hue: 210, nodes: [['Moodle', summary.moodle], ['LeoData', summary.leo], [t('timetable'), summary.timetable]] },
      { label: t('cYou'), hue: 145, nodes: [
        [`${t('cApp')} · ${langName[lang]}`, true], [`${t('cAi')} · ${langName[summary.aiLang] || ''}`, true],
        ...(summary.school ? [[summary.group ? t('groupN', summary.group) : t('cNoGroup'), !!summary.group], [summary.campus, true], [t('yearN', summary.year), true]] : []),
      ] },
      { label: t('cModels'), hue: 280, nodes: models.strong
        ? [[`${t('cStrong')} · ${short(models.strong)}`, true], [`${t('cCheap')} · ${short(models.cheap || models.strong)}`, true], [`${t('cVision')} · ${short(models.vision || models.strong)}`, !!models.vision]]
        : [[t('aiLater'), false]] },
    ].filter(Boolean);

    const W = 960, H = 680, cx = W / 2, cy = H / 2, ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'dv-ob-graph'); svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', clusters.map((c) => `${c.label}: ${c.nodes.map(([n, on]) => `${n}${on ? '' : ' (off)'}`).join(', ')}`).join('; '));
    const add = (parent, tag, attrs, text) => { const n = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (text) n.textContent = text; parent.append(n); return n; };
    // Same recipe as the knowledge graph: each cluster's links and dots, thickened and blurred
    // into a faint tint of its hue (ring lightness 60 dark / 42 light, alpha 0.2), no outline.
    const bg = getComputedStyle(document.body).backgroundColor.match(/\d+/g)?.map(Number) ?? [0, 0, 0];
    const dark = bg[0] * 0.299 + bg[1] * 0.587 + bg[2] * 0.114 < 128;
    const ring = dark ? 60 : 42, labelL = dark ? 78 : 30;
    const defs = add(svg, 'defs', {});
    add(add(defs, 'filter', { id: 'dv-ob-haze', x: '-50%', y: '-50%', width: '200%', height: '200%' }), 'feGaussianBlur', { stdDeviation: 22 });
    const areas = add(svg, 'g', { filter: 'url(#dv-ob-haze)', opacity: 0.2 }), edges = add(svg, 'g', { class: 'edges' }), labels = add(svg, 'g', {}), dots = add(svg, 'g', {});
    const rand = (a, b) => a + Math.random() * (b - a);
    const turn = rand(-0.35, 0.35);
    let delay = 0;
    clusters.forEach((c, ci) => {
      const angle = turn - Math.PI / 2 + Math.PI / clusters.length + (ci * 2 * Math.PI) / clusters.length;
      const ccx = cx + Math.cos(angle) * rand(255, 300), ccy = cy + Math.sin(angle) * rand(180, 215), r = 50 + c.nodes.length * 7;
      const color = `hsl(${c.hue} 65% ${ring}%)`;
      // Loose, uneven placement: an irregular ring with jitter, so it reads as a laid-out graph.
      const start = rand(0, Math.PI * 2);
      const pts = [];
      c.nodes.forEach((_, i) => {
        if (c.nodes.length === 1) return pts.push([ccx, ccy]);
        // Random spot near its slot; retry while it would crowd a neighbour's label.
        let p;
        for (let tries = 0; tries < 40; tries++) {
          const a = start + (i * 2 * Math.PI) / c.nodes.length + rand(-0.35, 0.35), d = r * rand(0.6, 1.1);
          p = [ccx + Math.cos(a) * d, ccy + Math.sin(a) * d * 0.85];
          if (pts.every((q) => Math.abs(q[0] - p[0]) > 110 || Math.abs(q[1] - p[1]) > 30)) break;
        }
        pts.push(p);
      });
      const links = [];
      pts.forEach((_, i) => { if (i > 0) links.push([Math.floor(rand(0, i)), i]); });
      if (pts.length > 3) links.push([0, pts.length - 1]);
      const near = pts.reduce((best, p) => (Math.hypot(p[0] - cx, p[1] - cy) < Math.hypot(best[0] - cx, best[1] - cy) ? p : best));
      for (const [a, b] of links) {
        add(areas, 'line', { x1: pts[a][0], y1: pts[a][1], x2: pts[b][0], y2: pts[b][1], stroke: color, 'stroke-width': 40, 'stroke-linecap': 'round' });
        add(edges, 'line', { x1: pts[a][0], y1: pts[a][1], x2: pts[b][0], y2: pts[b][1], class: c.nodes[a][1] && c.nodes[b][1] ? '' : 'off' });
      }
      for (const p of pts) add(areas, 'circle', { cx: p[0], cy: p[1], r: 34, fill: color });
      add(edges, 'line', { x1: cx, y1: cy, x2: near[0], y2: near[1] });
      const top = Math.min(...pts.map((p) => p[1]));
      add(labels, 'text', { x: ccx, y: top - 34, 'text-anchor': 'middle', class: 'cluster', fill: `hsl(${c.hue} 55% ${labelL}% / 0.85)` }, c.label);
      c.nodes.forEach(([label, on], i) => {
        const g = add(dots, 'g', { class: `node${on ? '' : ' off'}`, style: `animation-delay:${(delay += 70)}ms` });
        add(g, 'circle', { cx: pts[i][0], cy: pts[i][1], r: 4.5 });
        add(g, 'text', { x: pts[i][0], y: pts[i][1] + 19, 'text-anchor': 'middle' }, label);
      });
    });
    const hub = add(dots, 'g', { class: 'node hub' });
    add(hub, 'circle', { cx, cy, r: 7 });
    add(hub, 'text', { x: cx, y: cy - 16, 'text-anchor': 'middle' }, 'DeVinciHarness');

    const start = el('div', { class: 'dv-ob-start' });
    overlay.replaceChildren(el('div', { class: 'dv-ob-final' }, el('h1', {}, t('thanks')), el('p', { class: 'dv-ob-muted' }, t('thanksSub')), svg, start));
    return new Promise((resolve) => ctx.ui.mountButton(start, { label: t('start'), onClick: resolve }, { signal: ctx.signal }));
  }

  // First screen of a fresh setup: drifting math glyphs behind the name and one button.
  function welcome() {
    const glyphs = '∫∑∂∇λπθΔ√∞≤∈ℝ∀∃→⊂αβμσφΩ';
    const field = el('div', { class: 'dv-ob-glyphs', 'aria-hidden': 'true' });
    for (let i = 0; i < 48; i++) {
      const r = (a, b) => (a + Math.random() * (b - a)).toFixed(2);
      field.append(el('span', { style: `left:${r(0, 98)}%;top:${r(0, 96)}%;font-size:${r(0.9, 2.2)}rem;animation-duration:${r(9, 20)}s;animation-delay:-${r(0, 20)}s` }, glyphs[i % glyphs.length]));
    }
    const title = el('h1', { class: 'dv-ob-title' }, [...'DeVinciHarness'].map((ch, i) => el('span', { style: `animation-delay:${120 + i * 45}ms` }, ch)));
    const start = el('div', { class: 'dv-ob-go' });
    overlay.replaceChildren(el('div', { class: 'dv-ob-welcome' }, field, el('div', { class: 'dv-ob-hero' }, title, start)));
    return new Promise((resolve) => ctx.ui.mountButton(start, { label: 'Start setup · Commencer', onClick: () => { overlay.replaceChildren(col); resolve(); } }, { signal: ctx.signal }));
  }

  async function flow() {
    if (!status.setupStep) await welcome();
    say(OB.en.hello, OB.fr.hello);
    lang = (await ask({ choices: [['en', 'English'], ['fr', 'Français']] })).choice;
    await ctx.call('set-profile', { language: lang });
    try { localStorage.setItem('dv.lang', lang); } catch { /* per-window convenience only */ }

    say(t('aiLangQ'));
    summary.aiLang = (await ask({ choices: [['auto', t('sameLang')], ['en', 'English'], ['fr', 'Français']] })).choice;
    await ctx.call('set-profile', { aiLanguage: summary.aiLang });

    say(t('schoolQ'));
    const school = await yesNo(t('schoolYes'), t('schoolNo'));
    await ctx.call('set-profile', { school });
    summary.school = school;
    if (school) {
      say(t('moodleQ'));
      if (await yesNo(t('connect'), t('notNow'))) summary.moodle = await connect('login', 'Moodle');
      say(t('leoQ'));
      if (await yesNo(t('connect'), t('notNow'))) summary.leo = await connect('leo-login', 'LeoData');
      say(t('ttQ'));
      if (await yesNo(t('yes'), t('notNow'))) await timetable();
      await profile();
    }

    say(t('aiTerms'));
    say(t('aiQ'));
    const current = await ctx.call('models').catch(() => ({}));
    const choices = [['nvidia', t('aiNvidia')], ['chatgpt', t('aiChatgpt')], ['claude', t('aiClaude')], ['gemini', t('aiGemini')], ['custom', t('aiCustom')]];
    if (current.strong) choices.push(['keep', t('aiKeep', current.strong.split(' · ').pop())]);
    const flows = { nvidia, chatgpt, claude, gemini };
    // "Use something else" from a provider comes back to this choice.
    for (;;) {
      const pick = (await ask({ choices })).choice;
      if (pick === 'keep') break;
      if (pick === 'custom') { say(t('laterAgent')); break; }
      if (await flows[pick]()) break;
      say(t('aiQ'));
    }
    summary.ai = true;

    say(t('guideHead'), t('guide1'), t('guide2'), t('guide3'), ...(summary.school ? [t('guide4')] : []));
    await ask({ choices: [['ok', t('guideGo')]] });
  }

  const finish = async () => {
    await finalScreen();
    await ctx.call('set-setup', { done: true, step: 0 });
    location.href = '/'; // full reload: applies the language and the sidebar entries everywhere
  };
  flow().then(finish).catch((e) => {
    say(t('crashed', e.message));
    ask({ choices: [['go', t('start')]] }).then(async () => { await ctx.call('set-setup', { done: true, step: 0 }).catch(() => {}); location.href = '/'; });
  });
}
