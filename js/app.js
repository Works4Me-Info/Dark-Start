'use strict';
(() => {
  /* ---------- helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // Builds DOM safely: user text always goes in via textContent, never innerHTML.
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  // crypto.randomUUID needs HTTPS; intranet sites are often plain HTTP.
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const idOk = x => typeof x === 'string' && /^[a-z0-9]{4,40}$/i.test(x);
  const engIdOk = x => typeof x === 'string' && /^[a-z0-9_-]{1,40}$/i.test(x);
  const clamp = (n, lo, hi, d) => { n = Number(n); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

  const ICON_PATHS = {
    plus: '<path d="M8 3v10M3 8h10"/>',
    dots: '<circle cx="3.5" cy="8" r="1.2" fill="currentColor" stroke="none"/><circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none"/><circle cx="12.5" cy="8" r="1.2" fill="currentColor" stroke="none"/>',
    edit: '<path d="M10.5 2.8l2.7 2.7L6 12.7H3.3V10z"/>',
    chevron: '<path d="M4.5 6.5L8 10l3.5-3.5"/>',
    lock: '<rect x="3.5" y="7" width="9" height="6.5" rx="1.3"/><path d="M5.5 7V5.2a2.5 2.5 0 015 0V7"/>',
    unlock: '<rect x="3.5" y="7" width="9" height="6.5" rx="1.3"/><path d="M5.5 7V5.2a2.5 2.5 0 014.8-1"/>',
    settings: '<path d="M2.5 4.5h6M11.5 4.5h2M2.5 11.5h2M7.5 11.5h6"/><circle cx="10" cy="4.5" r="1.6"/><circle cx="6" cy="11.5" r="1.6"/>',
    close: '<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/>'
  };
  function icon(name) {
    const s = document.createElement('span');
    s.className = 'ic';
    s.innerHTML = `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name]}</svg>`;
    return s;
  }
  function iconBtn(name, title, onclick, extraClass) {
    return h('button', { type: 'button', class: 'icon-btn' + (extraClass ? ' ' + extraClass : ''), title, 'aria-label': title, onclick }, icon(name));
  }

  const COLORS = ['#5b8def', '#3fb68b', '#e0a03a', '#e5534b', '#a371f7', '#2fb7c4', '#d16ba5', '#8b949e'];

  /* ---------- URLs ---------- */
  const ALLOWED_PROTOCOLS = ['http:', 'https:', 'mailto:', 'ftp:'];
  function cleanUrl(raw) {
    let u = String(raw || '').trim();
    if (!u) return null;
    // Pages on this same server: "/path", "./page.html", "../x" or a bare "guide.html".
    if (/^(\/(?!\/)|\.\.?\/)/.test(u) || /^[\w-]+\.html?([?#].*)?$/i.test(u)) {
      try { return new URL(u, location.href).href; } catch { return null; }
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(u) && !/^[a-z0-9.-]+:\d+(\/|$)/i.test(u)) {
      try {
        const x = new URL(u);
        return ALLOWED_PROTOCOLS.includes(x.protocol) ? x.href : null; // blocks javascript:, data:, file: etc.
      } catch { return null; }
    }
    if (u.startsWith('//')) u = u.slice(2);
    try { return new URL((config.defaultScheme || 'https') + '://' + u).href; } catch { return null; }
  }
  function hostLabel(url) {
    try { const x = new URL(url); return (x.hostname || x.pathname).replace(/^www\./, ''); } catch { return url; }
  }
  function hueFor(str) { let n = 0; for (const c of str) n = (n * 31 + c.charCodeAt(0)) >>> 0; return n % 360; }

  /* ---------- state ---------- */
  let config = {};
  let state = null;
  let storageOk = true;
  let bgObjectUrl = null;

  const DEFAULT_SETTINGS = { bg: null, dim: 25, blur: 0, theme: 'dark', newTab: true, locked: false };

  const newTab = (name, ncols = 4) => ({ id: uid(), name, ncols, cols: Array.from({ length: ncols }, () => []) });
  const WIDGET_TYPES = ['links', 'search', 'notes'];
  const newWidget = (title, color, type = 'links') => ({
    id: uid(), type, title: title || 'New widget', color: color || COLORS[0], collapsed: false,
    links: [], text: '', engine: null, view: 'list'
  });

  /* ---------- search engines ---------- */
  // Built-in fallback if config.json lists none. %s is replaced by the search terms.
  const FALLBACK_ENGINES = [{ id: 'ddg', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' }];
  function cleanEngineUrl(raw) {
    const u = String(raw || '').trim();
    if (!u.includes('%s')) return null;
    try {
      const x = new URL(u.replace(/%s/g, 'QUERYPLACEHOLDER'));
      if (x.protocol !== 'http:' && x.protocol !== 'https:') return null;
      return x.href.replace(/QUERYPLACEHOLDER/g, '%s');
    } catch { return null; }
  }
  function normEngine(e) {
    if (!e || typeof e !== 'object') return null;
    const url = cleanEngineUrl(e.url);
    if (!url) return null;
    return { id: engIdOk(e.id) ? e.id : uid(), name: String(e.name || 'Search').trim().slice(0, 40) || 'Search', url };
  }
  function serverEngines() {
    const list = (Array.isArray(config.searchEngines) ? config.searchEngines : []).map(normEngine).filter(Boolean);
    return list.length ? list : FALLBACK_ENGINES;
  }
  const allEngines = () => [...serverEngines(), ...state.settings.customEngines];
  function engineFor(w) {
    const all = allEngines();
    return all.find(e => e.id === w.engine) || all.find(e => e.id === state.settings.defaultEngine)
      || all.find(e => e.id === config.defaultEngine) || all[0];
  }

  const isSection = l => !!l && l.kind === 'section';
  const realLinks = w => w.links.filter(l => !isSection(l));
  // A title made only of dashes/lines means "just a line".
  const sectionTitle = t => { const s = String(t || '').trim().slice(0, 100); return /^[-\u2014\u2013_=~.\s]*$/.test(s) ? '' : s; };
  function normLink(l, fresh) {
    if (isSection(l)) return { id: !fresh && idOk(l.id) ? l.id : uid(), kind: 'section', title: sectionTitle(l.title) };
    const url = cleanUrl(l && l.url);
    if (!url) return null;
    const title = String((l && l.title) || '').trim().slice(0, 200) || hostLabel(url);
    return { id: !fresh && idOk(l.id) ? l.id : uid(), title, url };
  }
  function normWidget(w, fresh) {
    w = w && typeof w === 'object' ? w : {};
    const type = WIDGET_TYPES.includes(w.type) ? w.type : 'links';
    return {
      id: !fresh && idOk(w.id) ? w.id : uid(),
      type,
      title: String(w.title || (type === 'search' ? 'Search' : type === 'notes' ? 'Notes' : 'Untitled')).slice(0, 100),
      color: /^#[0-9a-f]{6}$/i.test(w.color) ? w.color : COLORS[0],
      collapsed: !!w.collapsed,
      links: type === 'links' ? (Array.isArray(w.links) ? w.links : []).map(l => normLink(l, fresh)).filter(Boolean) : [],
      text: type === 'notes' ? String(w.text || '').slice(0, 20000) : '',
      engine: type === 'search' && engIdOk(w.engine) ? w.engine : null,
      view: type === 'links' && (w.view === 'grid' || w.view === 'icons') ? 'grid' : 'list'
    };
  }
  function normTab(t, fresh) {
    t = t && typeof t === 'object' ? t : {};
    const ncols = clamp(parseInt(t.ncols, 10), 1, 6, 4);
    let cols = (Array.isArray(t.cols) ? t.cols : []).map(c => (Array.isArray(c) ? c : []).map(w => normWidget(w, fresh)));
    while (cols.length < ncols) cols.push([]);
    if (cols.length > ncols) { const extra = cols.splice(ncols).flat(); cols[ncols - 1].push(...extra); }
    return { id: !fresh && idOk(t.id) ? t.id : uid(), name: String(t.name || 'Page').slice(0, 60), ncols, cols };
  }
  function normSettings(s) {
    s = s && typeof s === 'object' ? s : {};
    return {
      bg: typeof s.bg === 'string' && /^(none|(base|custom):[\w-]{1,60})$/.test(s.bg) ? s.bg : null,
      dim: clamp(s.dim, 0, 80, DEFAULT_SETTINGS.dim),
      blur: clamp(s.blur, 0, 20, DEFAULT_SETTINGS.blur),
      theme: s.theme === 'light' ? 'light' : 'dark',
      newTab: s.newTab !== false,
      locked: !!s.locked,
      customEngines: (Array.isArray(s.customEngines) ? s.customEngines : []).map(normEngine).filter(Boolean).slice(0, 30),
      defaultEngine: engIdOk(s.defaultEngine) ? s.defaultEngine : null
    };
  }
  function normState(s, fresh) {
    s = s && typeof s === 'object' ? s : {};
    const tabs = (Array.isArray(s.tabs) ? s.tabs : []).map(t => normTab(t, fresh));
    if (!tabs.length) tabs.push(newTab('Home'));
    return {
      version: 1,
      settings: normSettings(s.settings),
      activeTab: tabs.some(t => t.id === s.activeTab) ? s.activeTab : tabs[0].id,
      tabs
    };
  }

  const cur = () => state.tabs.find(t => t.id === state.activeTab) || state.tabs[0];

  function findWidget(id) {
    for (const tab of state.tabs)
      for (const col of tab.cols) {
        const i = col.findIndex(w => w.id === id);
        if (i > -1) return { tab, col, i, w: col[i] };
      }
    return null;
  }
  function findLink(id) {
    for (const tab of state.tabs)
      for (const col of tab.cols)
        for (const w of col) {
          const i = w.links.findIndex(l => l.id === id);
          if (i > -1) return { w, i, l: w.links[i] };
        }
    return null;
  }
  function removeWidget(id) { const f = findWidget(id); if (f) f.col.splice(f.i, 1); return f && f.w; }
  function addWidgetToTab(tab, w) {
    // Put it in the column with the least content.
    const size = x => x.collapsed ? 0 : x.type === 'notes' ? Math.min(12, x.text.split('\n').length + 2) : x.type === 'search' ? 1 : x.links.length;
    const weight = col => col.reduce((n, x) => n + 3 + size(x), 0);
    let best = tab.cols[0];
    for (const c of tab.cols) if (weight(c) < weight(best)) best = c;
    best.push(w);
  }

  let saveTimer = null;
  // Write immediately if the tab is hidden or closed before the short save delay runs.
  function flushSave() {
    if (!saveTimer) return;
    clearTimeout(saveTimer); saveTimer = null;
    if (storageOk) Store.set('state', state).catch(() => {});
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSave(); });
  window.addEventListener('pagehide', flushSave);
  function save() {
    trackChange();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      saveTimer = null;
      if (!storageOk) return;
      try { await Store.set('state', state); }
      catch { storageOk = false; toast('This browser is blocking local storage, so changes won’t be kept. Download a backup to keep them.', true, 8000); }
    }, 250);
  }

  /* ---------- backup status ----------
     meta (stored separately from the layout, never exported):
       lastBackup   when "Back up" was last used (ms), or null
       backupHash   fingerprint of the content at that moment
       firstUnsaved when content first differed from the last backup (ms), or null
       snoozeUntil  the "due" pill stays hidden until then (ms) */
  let meta = { lastBackup: null, backupHash: null, firstUnsaved: null, snoozeUntil: 0 };
  const DAY = 86400000;

  // What counts as a change: pages, widgets, links, notes and appearance. Not which tab is open or the lock.
  function contentHash() {
    const { activeTab, settings, ...rest } = state;
    const { locked, ...look } = settings;
    const str = JSON.stringify([rest, look]);
    let h = 0x811c9dc5; // FNV-1a
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(36) + ':' + str.length;
  }
  function saveMeta() { if (storageOk) Store.set('meta', meta).catch(() => {}); }
  function trackChange() {
    if (!state) return;
    const same = contentHash() === meta.backupHash;
    if (same && meta.firstUnsaved) { meta.firstUnsaved = null; saveMeta(); }
    else if (!same && !meta.firstUnsaved) { meta.firstUnsaved = Date.now(); saveMeta(); }
    renderBackupStatus();
  }
  function markBackedUp(when) {
    meta.lastBackup = when || Date.now();
    meta.backupHash = contentHash();
    meta.firstUnsaved = null;
    meta.snoozeUntil = 0;
    saveMeta();
    renderBackupStatus();
  }
  function ago(ms) {
    const d = Math.floor((Date.now() - ms) / DAY);
    if (d <= 0) return 'today';
    if (d === 1) return 'yesterday';
    return `${d} days ago`;
  }

  // 0 = quiet, 1 = noticeable, 2 = amber, 3 = due (amber pill + dot on Settings)
  function backupLevel() {
    if (!meta.firstUnsaved) return 0;
    const days = Math.max(1, Number(config.backupReminderDays) || 7);
    const r = (Date.now() - meta.firstUnsaved) / (days * DAY);
    let level = r >= 1 ? 3 : r >= 0.5 ? 2 : r >= 0.25 ? 1 : 0;
    if (level === 3 && meta.snoozeUntil > Date.now()) level = 2;
    return level;
  }

  function renderBackupStatus() {
    const el = document.getElementById('backupStatus');
    if (!el || !state) return;
    const level = backupLevel();
    const dirty = !!meta.firstUnsaved;
    const label = meta.lastBackup ? `Backed up ${ago(meta.lastBackup)}` : dirty ? 'Never backed up' : 'Not backed up yet';
    const waitDays = dirty ? Math.floor((Date.now() - meta.firstUnsaved) / DAY) : 0;
    const changes = waitDays < 1 ? 'You have changes from today that aren\u2019t backed up'
      : `You have changes from ${waitDays} day${waitDays > 1 ? 's' : ''} ago that aren\u2019t backed up`;

    el.className = `backup-status level-${level}` + (dirty ? ' dirty' : '');
    const btn = h('button', {
      type: 'button', class: 'bs-main',
      title: (dirty ? `${changes}. ` : 'Nothing has changed since your last backup. ')
        + 'Your pages are kept only in this browser. Click to download a backup.',
      onclick: () => exportBackup(true)
    }, h('span', { class: 'bs-dot', 'aria-hidden': 'true' }), h('span', { class: 'bs-text', text: label }),
      level === 3 ? h('span', { class: 'bs-cta', text: 'Back up now' }) : null);
    const kids = [btn];
    if (level === 3) {
      kids.push(h('button', {
        type: 'button', class: 'bs-snooze', title: 'Remind me in 3 days', 'aria-label': 'Remind me in 3 days',
        onclick: () => { meta.snoozeUntil = Date.now() + 3 * DAY; saveMeta(); renderBackupStatus(); toast('I\u2019ll remind you again in 3 days.'); }
      }, icon('close')));
    }
    el.replaceChildren(...kids);
    const sb = document.getElementById('settingsBtn');
    if (sb) sb.classList.toggle('has-dot', level === 3);
  }

  /* ---------- UI primitives ---------- */
  let toastTimer = null;
  function toast(msg, isError, ms = 3500) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.toggle('error', !!isError);
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, ms);
  }

  function modal({ title, content, actions = [], wide = false, onClose }) {
    const back = h('div', { class: 'modal-backdrop' });
    const box = h('div', { class: 'modal' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
    let closed = false;
    const close = () => {
      if (closed) return; closed = true;
      back.remove();
      document.removeEventListener('keydown', onKey, true);
      if (onClose) onClose();
    };
    const onKey = e => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
      else if (e.key === 'Enter' && e.target.matches('.modal input[type=text], .modal input[type=url]')) {
        e.preventDefault();
        const p = box.querySelector('.modal-foot .btn.primary');
        if (p) p.click();
      }
    };
    box.append(h('div', { class: 'modal-head' }, h('h3', { text: title }), iconBtn('close', 'Close', close)), content);
    if (actions.length) {
      const foot = h('div', { class: 'modal-foot' });
      for (const a of actions) {
        if (a.spacer) foot.append(h('div', { class: 'spacer' }));
        else foot.append(h('button', { type: 'button', class: 'btn ' + (a.kind || ''), text: a.label, onclick: () => a.onClick(close) }));
      }
      box.append(foot);
    }
    back.append(box);
    back.addEventListener('mousedown', e => { if (e.target === back) close(); });
    document.addEventListener('keydown', onKey, true);
    $('#modal-root').append(back);
    const first = box.querySelector('.modal-body input[type=text], .modal-body textarea');
    if (first && !wide) setTimeout(() => { first.focus(); first.select && first.select(); }, 0);
    return { close, box };
  }
  const cancelAction = { label: 'Cancel', onClick: c => c() };

  function confirmDialog(message, okLabel = 'Delete') {
    return new Promise(resolve => {
      let answered = false;
      modal({
        title: 'Are you sure?',
        content: h('div', { class: 'modal-body' }, h('p', { text: message })),
        actions: [
          { label: 'Cancel', onClick: c => c() },
          { label: okLabel, kind: 'danger-solid', onClick: c => { answered = true; c(); } }
        ],
        onClose: () => resolve(answered)
      });
    });
  }

  function promptDialog(title, label, value) {
    return new Promise(resolve => {
      const input = h('input', { type: 'text', value: value || '', maxlength: '100', autocomplete: 'off', 'aria-label': label });
      let result = null;
      modal({
        title,
        content: h('div', { class: 'modal-body' }, field(label, input)),
        actions: [cancelAction, { label: 'Save', kind: 'primary', onClick: c => { result = input.value.trim() || null; c(); } }],
        onClose: () => resolve(result)
      });
    });
  }

  function field(label, control, hint) {
    return h('div', { class: 'field' }, h('div', { class: 'field-label', text: label }), control, hint ? h('small', { class: 'hint', text: hint }) : null);
  }

  function segmented(labels, selected, onChange) {
    const wrap = h('div', { class: 'seg', role: 'radiogroup' });
    labels.forEach((label, i) => {
      wrap.append(h('button', {
        type: 'button', class: i === selected ? 'sel' : '', text: label, role: 'radio', 'aria-checked': String(i === selected),
        onclick: () => {
          $$('button', wrap).forEach((b, j) => { b.classList.toggle('sel', i === j); b.setAttribute('aria-checked', String(i === j)); });
          onChange(i);
        }
      }));
    });
    return wrap;
  }

  function swatchPicker(initial, onPick) {
    const wrap = h('div', { class: 'swatches' });
    for (const c of COLORS) {
      const b = h('button', {
        type: 'button', class: 'swatch' + (c === initial ? ' sel' : ''), title: 'Colour', 'aria-label': 'Colour ' + c,
        onclick: () => { $$('.swatch', wrap).forEach(x => x.classList.remove('sel')); b.classList.add('sel'); onPick(c); }
      });
      b.style.background = c;
      wrap.append(b);
    }
    return wrap;
  }

  let openMenu = null;
  function showMenu(anchor, items) {
    closeMenu();
    const m = h('div', { class: 'menu', role: 'menu' });
    for (const it of items) {
      if (!it) continue;
      if (it === '-') m.append(h('hr'));
      else if (it.el) m.append(it.el);
      else m.append(h('button', { type: 'button', role: 'menuitem', class: it.danger ? 'danger' : '', text: it.label, onclick: () => { closeMenu(); it.onClick(); } }));
    }
    document.body.append(m);
    const r = anchor.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.right - m.offsetWidth, window.innerWidth - m.offsetWidth - 8));
    let top = r.bottom + 4;
    if (top + m.offsetHeight > window.innerHeight - 8) top = Math.max(8, r.top - m.offsetHeight - 4);
    m.style.left = left + 'px';
    m.style.top = top + 'px';
    openMenu = m;
    setTimeout(() => document.addEventListener('mousedown', menuOutside, true), 0);
  }
  function menuOutside(e) { if (openMenu && !openMenu.contains(e.target)) closeMenu(); }
  function closeMenu() {
    if (openMenu) { openMenu.remove(); openMenu = null; }
    document.removeEventListener('mousedown', menuOutside, true);
  }

  function download(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: filename });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'item';
  function exportWidget(w) {
    const out = { type: w.type, title: w.title, color: w.color };
    if (w.type === 'links') { if (w.view === 'grid') out.view = 'grid'; out.links = w.links.map(l => isSection(l) ? { kind: 'section', title: l.title } : { title: l.title, url: l.url }); }
    if (w.type === 'notes') out.text = w.text;
    if (w.type === 'search' && w.engine) out.engine = w.engine;
    return out;
  }
  const exportTab = t => ({ name: t.name, ncols: t.ncols, cols: t.cols.map(c => c.map(exportWidget)) });

  /* ---------- rendering ---------- */
  function render() {
    renderTabs();
    renderBoard();
    applyLock();
  }

  function renderTabs() {
    const nav = $('#tabs');
    nav.replaceChildren();
    for (const t of state.tabs) {
      const active = t.id === state.activeTab;
      const el = h('div', {
        class: 'tab' + (active ? ' active' : ''), dataset: { id: t.id }, role: 'tab', tabindex: '0', 'aria-selected': String(active)
      }, h('span', { class: 'tab-name', text: t.name }));
      if (active) {
        const b = iconBtn('dots', 'Page options', e => { e.stopPropagation(); tabMenu(b, t); }, 'tab-menu edit-only');
        el.append(b);
      }
      el.addEventListener('click', () => { if (state.activeTab !== t.id) { state.activeTab = t.id; save(); render(); } });
      el.addEventListener('dblclick', () => { if (!state.settings.locked) renameTab(t); });
      el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } });
      nav.append(el);
    }
  }

  function renderBoard() {
    const tab = cur();
    const board = $('#board');
    board.replaceChildren();
    board.style.setProperty('--cols', tab.ncols);
    tab.cols.forEach((col, i) => {
      const c = h('div', { class: 'column', dataset: { col: String(i) } });
      col.forEach(w => c.append(widgetEl(w)));
      board.append(c);
    });
    if (!tab.cols.some(c => c.length)) {
      board.append(h('div', { class: 'empty-hint' },
        h('p', { text: 'This page is empty.' }),
        h('button', { type: 'button', class: 'btn primary edit-only', text: 'Add a widget', onclick: addWidgetDialog })));
    }
    applyFilter();
  }

  function widgetEl(w) {
    const el = h('section', { class: `widget type-${w.type}` + (w.type === 'links' && w.view === 'grid' ? ' view-grid' : '') + (w.collapsed ? ' collapsed' : ''), dataset: { id: w.id } });
    el.style.setProperty('--accent', w.color);
    const toggle = iconBtn('chevron', w.collapsed ? 'Expand' : 'Collapse', () => {
      w.collapsed = !w.collapsed;
      el.classList.toggle('collapsed', w.collapsed);
      toggle.title = w.collapsed ? 'Expand' : 'Collapse';
      save();
    }, 'w-toggle');
    const title = h('h2', { class: 'w-title', text: w.title, title: w.title });
    title.addEventListener('dblclick', () => { if (!state.settings.locked) renameWidget(w); });
    const menuBtn = iconBtn('dots', 'Widget options', () => widgetMenu(menuBtn, w), 'w-menu edit-only');
    const isLinks = w.type === 'links';
    const head = h('header', { class: 'widget-head' },
      toggle, title,
      isLinks ? h('span', { class: 'w-count', text: String(realLinks(w).length) }) : null,
      isLinks ? iconBtn('plus', 'Add link', () => addLinkDialog(w), 'w-add edit-only') : null,
      menuBtn);
    let body;
    if (w.type === 'search') body = searchBody(w);
    else if (w.type === 'notes') body = notesBody(w);
    else {
      body = h('ul', { class: 'links' });
      w.links.forEach(l => body.append(linkEl(l, w.view === 'grid')));
    }
    el.append(head, body);
    return el;
  }

  function searchBody(w) {
    const input = h('input', {
      type: 'search', class: 'search-input', placeholder: 'Search…',
      autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Search terms'
    });
    const engines = allEngines();
    const active = engineFor(w);
    const select = h('select', { class: 'engine-select', 'aria-label': 'Search engine', title: 'Search engine' },
      engines.map(e => h('option', { value: e.id, text: e.name, selected: e.id === active.id })));
    select.addEventListener('change', () => { w.engine = select.value; save(); });
    const go = () => {
      const q = input.value.trim();
      if (!q) { input.focus(); return; }
      const e = engineFor(w);
      // Always a new tab, with no opener and no referrer.
      window.open(e.url.split('%s').join(encodeURIComponent(q)), '_blank', 'noopener,noreferrer');
      input.select();
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    const btn = h('button', { type: 'button', class: 'btn primary search-go', text: 'Search', onclick: go });
    return h('div', { class: 'w-body search-box' }, engines.length > 1 ? select : null, h('div', { class: 'search-row' }, input, btn));
  }

  function notesBody(w) {
    // spellcheck off: Chrome's "enhanced" spell check and Edge's Editor send typed text to Google/Microsoft.
    const ta = h('textarea', {
      class: 'note', placeholder: 'Write a note…', spellcheck: 'false', autocomplete: 'off', 'aria-label': w.title, maxlength: '20000'
    });
    ta.value = w.text;
    const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(520, Math.max(90, ta.scrollHeight + 2)) + 'px'; };
    ta.addEventListener('input', () => { w.text = ta.value; grow(); save(); });
    requestAnimationFrame(grow);
    return h('div', { class: 'w-body note-wrap' }, ta);
  }

  function linkEl(l, grid) {
    if (isSection(l)) {
      return h('li', { class: 'link section' + (l.title ? '' : ' plain'), dataset: { id: l.id } },
        l.title ? h('span', { class: 'sec-title', text: l.title }) : null,
        h('span', { class: 'sec-line', 'aria-hidden': 'true' }),
        iconBtn('edit', 'Edit section', () => editLinkDialog(l.id), 'l-edit edit-only'));
    }
    const host = hostLabel(l.url);
    // A coloured letter instead of a favicon: fetching favicons would reveal every domain to a third party.
    const badge = h('span', { class: 'badge', 'aria-hidden': 'true', text: (l.title || host).trim().charAt(0).toUpperCase() || '?' });
    badge.style.background = `hsl(${hueFor(host)} 42% 46%)`;
    const a = h('a', {
      href: l.url, rel: 'noreferrer noopener', referrerpolicy: 'no-referrer',
      target: state.settings.newTab ? '_blank' : '_self', draggable: 'false', title: grid ? `${l.title}\n${l.url}` : l.url
    }, badge, h('span', { class: 'l-title', text: l.title }));
    return h('li', { class: 'link', dataset: { id: l.id } }, a, iconBtn('edit', 'Edit link', () => editLinkDialog(l.id), 'l-edit edit-only'));
  }

  function updateCounts() {
    for (const wel of $$('#board .widget.type-links')) wel.querySelector('.w-count').textContent = String($$('.links > .link:not(.section)', wel).length);
  }

  function applyLock() {
    const locked = state.settings.locked;
    document.body.classList.toggle('locked', locked);
    const b = $('#lockBtn');
    b.replaceChildren(icon(locked ? 'lock' : 'unlock'));
    b.title = locked ? 'Layout locked: click to edit' : 'Lock layout';
    b.setAttribute('aria-label', b.title);
    b.classList.toggle('on', locked);
  }

  function applyFilter() {
    const q = $('#filter').value.trim().toLowerCase();
    document.body.classList.toggle('filtering', !!q);
    for (const wel of $$('#board .widget')) {
      const titleHit = !!q && wel.querySelector('.w-title').textContent.toLowerCase().includes(q);
      if (wel.classList.contains('type-search')) continue; // search boxes stay visible
      if (wel.classList.contains('type-notes')) {
        wel.hidden = !!q && !titleHit && !wel.querySelector('.note').value.toLowerCase().includes(q);
        continue;
      }
      let any = false;
      let section = null, sectionHit = false, sectionHasMatch = false;
      const closeSection = () => { if (section) section.hidden = !!q && !sectionHit && !sectionHasMatch; };
      for (const li of $$('.link', wel)) {
        if (li.classList.contains('section')) {
          closeSection();
          section = li; sectionHasMatch = false;
          sectionHit = !!q && li.textContent.toLowerCase().includes(q);
          if (sectionHit) any = true;
          continue;
        }
        const a = li.querySelector('a');
        const hit = !q || titleHit || sectionHit || (a.textContent + ' ' + a.getAttribute('href')).toLowerCase().includes(q);
        li.hidden = !hit;
        if (hit) { any = true; sectionHasMatch = true; }
      }
      closeSection();
      wel.hidden = !!q && !any && !titleHit;
    }
  }

  /* ---------- drag & drop ---------- */
  function syncBoard() {
    const tab = cur();
    const widgets = new Map(), links = new Map();
    for (const w of tab.cols.flat()) { widgets.set(w.id, w); w.links.forEach(l => links.set(l.id, l)); }
    tab.cols = $$('#board > .column').map(col =>
      $$(':scope > .widget', col).map(wel => {
        const w = widgets.get(wel.dataset.id);
        if (w && w.type === 'links') w.links =$$('.links > .link', wel).map(li => links.get(li.dataset.id)).filter(Boolean);
        return w;
      }).filter(Boolean));
    save();
    updateCounts();
  }
  function syncTabs() {
    const order = $$('#tabs > .tab').map(el => el.dataset.id);
    state.tabs.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    save();
  }
  function moveWidgetToTab(wid, tid) {
    const target = state.tabs.find(t => t.id === tid);
    if (!target || tid === state.activeTab) return;
    const w = removeWidget(wid);
    if (!w) return;
    target.cols[0].unshift(w);
    save();
    renderBoard();
    toast(`Moved “${w.title}” to “${target.name}”`);
  }

  const notLocked = () => state.settings.locked;
  Drag.register({
    name: 'links', handle: '.link', item: '.link', axis: 'y', disabled: notLocked,
    axisFor: cont => (cont.closest('.view-grid') ? 'grid' : 'y'),
    resolve: el => el.closest('.links') || (el.closest('.widget:not(.collapsed)') || { querySelector: () => null }).querySelector('.links'),
    onEnd: syncBoard
  });
  Drag.register({
    name: 'widgets', handle: '.widget-head', item: '.widget', axis: 'y', disabled: notLocked,
    resolve: el => el.closest('#board > .column'),
    onEnd: syncBoard,
    dropOn: '#tabs > .tab:not(.active)',
    onDropOn: (item, tabEl) => moveWidgetToTab(item.dataset.id, tabEl.dataset.id)
  });
  Drag.register({
    name: 'tabs', handle: '.tab', item: '.tab', axis: 'x', disabled: notLocked,
    resolve: el => el.closest('#tabs'),
    onEnd: syncTabs
  });

  /* ---------- pages ---------- */
  async function addTab() {
    const name = await promptDialog('New page', 'Page name', 'New page');
    if (!name) return;
    const t = newTab(name.slice(0, 60), cur().ncols);
    state.tabs.push(t);
    state.activeTab = t.id;
    save(); render();
  }
  async function renameTab(t) {
    const name = await promptDialog('Rename page', 'Page name', t.name);
    if (!name) return;
    t.name = name.slice(0, 60);
    save(); renderTabs();
  }
  function setColumns(t, n) {
    if (n < t.cols.length) { const extra = t.cols.splice(n).flat(); t.cols[n - 1].push(...extra); }
    while (t.cols.length < n) t.cols.push([]);
    t.ncols = n;
    save(); renderBoard();
  }
  function tabMenu(anchor, t) {
    const cols = h('div', { class: 'seg small' });
    for (let n = 1; n <= 6; n++) {
      cols.append(h('button', { type: 'button', class: n === t.ncols ? 'sel' : '', text: String(n), onclick: () => { closeMenu(); setColumns(t, n); } }));
    }
    showMenu(anchor, [
      { label: 'Rename…', onClick: () => renameTab(t) },
      { el: h('div', { class: 'menu-label', text: 'Columns' }) },
      { el: cols },
      '-',
      { label: 'Export this page', onClick: () => download(`start-page-${slug(t.name)}.json`, { type: 'startpage-page', version: 1, page: exportTab(t) }) },
      state.tabs.length > 1 ? { label: 'Delete page…', danger: true, onClick: () => deleteTab(t) } : null
    ]);
  }
  async function deleteTab(t) {
    const n = t.cols.flat().length;
    if (!await confirmDialog(`Delete the page “${t.name}”${n ? ` and its ${n} widget${n > 1 ? 's' : ''}` : ''}?`)) return;
    const i = state.tabs.indexOf(t);
    state.tabs.splice(i, 1);
    state.activeTab = state.tabs[Math.max(0, i - 1)].id;
    save(); render();
  }

  /* ---------- widgets ---------- */
  // Sorts links A–Z, keeping each section's links under that section.
  function sortLinks(w) {
    const cmp = (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
    const out = []; let run = [];
    for (const l of w.links) {
      if (isSection(l)) { out.push(...run.sort(cmp), l); run = []; }
      else run.push(l);
    }
    w.links = [...out, ...run.sort(cmp)];
  }

  async function renameWidget(w) {
    const name = await promptDialog('Rename widget', 'Widget name', w.title);
    if (!name) return;
    w.title = name.slice(0, 100);
    save(); renderBoard();
  }

  function widgetMenu(anchor, w) {
    const others = state.tabs.filter(t => t.id !== state.activeTab);
    showMenu(anchor, [
      { label: 'Rename…', onClick: () => renameWidget(w) },
      w.type === 'links' ? { label: 'Add link…', onClick: () => addLinkDialog(w) } : null,
      w.type === 'links' ? { label: w.view === 'grid' ? 'Show as list' : 'Show as icons', onClick: () => { w.view = w.view === 'grid' ? 'list' : 'grid'; save(); renderBoard(); } } : null,
      w.type === 'links' ? { label: 'Sort links A–Z', onClick: () => { sortLinks(w); save(); renderBoard(); } } : null,
      { el: h('div', { class: 'menu-label', text: 'Colour' }) },
      { el: swatchPicker(w.color, c => { w.color = c; save(); closeMenu(); renderBoard(); }) },
      others.length ? '-' : null,
      ...others.map(t => ({ label: `Move to “${t.name}”`, onClick: () => moveWidgetToTab(w.id, t.id) })),
      '-',
      { label: 'Export widget', onClick: () => download(`start-widget-${slug(w.title)}.json`, { type: 'startpage-widget', version: 1, widget: exportWidget(w) }) },
      {
        label: 'Delete widget…', danger: true, onClick: async () => {
          const n = realLinks(w).length;
          const what = w.type === 'notes' && w.text.trim() ? ' and its note' : n ? ` and its ${n} link${n > 1 ? 's' : ''}` : '';
          if (await confirmDialog(`Delete “${w.title}”${what}?`)) { removeWidget(w.id); save(); renderBoard(); }
        }
      }
    ]);
  }

  function addWidgetDialog() {
    let color = COLORS[cur().cols.flat().length % COLORS.length];
    let type = 'links';
    const TYPES = [['links', 'Links', 'e.g. Daily'], ['search', 'Search', 'Search'], ['notes', 'Notes', 'Notes']];
    const name = h('input', { type: 'text', placeholder: TYPES[0][2], maxlength: '100', autocomplete: 'off', 'aria-label': 'Widget name' });
    const engineSel = h('select', { class: 'engine-select', 'aria-label': 'Search engine' },
      h('option', { value: '', text: `Default (${engineFor({}).name})` }),
      allEngines().map(e => h('option', { value: e.id, text: e.name })));
    const engineField = field('Search engine', engineSel, 'Change the default or add engines in Settings.');
    let view = 'list';
    const viewField = field('Show links as', segmented(['List', 'Icons'], 0, i => { view = i ? 'grid' : 'list'; }));
    engineField.hidden = true;
    const typeSeg = segmented(TYPES.map(t => t[1]), 0, i => {
      type = TYPES[i][0];
      name.placeholder = TYPES[i][2];
      engineField.hidden = type !== 'search';
      viewField.hidden = type !== 'links';
      name.focus();
    });
    const body = h('div', { class: 'modal-body' },
      field('Type', typeSeg), field('Name', name), viewField, engineField, field('Colour', swatchPicker(color, c => { color = c; })));
    let m = null;
    const lib = Array.isArray(config.library) ? config.library : [];
    if (lib.length) {
      const list = h('div', { class: 'lib-list' });
      for (const item of lib) {
        list.append(h('div', { class: 'lib-item' },
          h('div', {}, h('div', { class: 'lib-name', text: item.name }), item.description ? h('small', { class: 'hint', text: item.description }) : null),
          h('button', {
            type: 'button', class: 'btn small', text: 'Add', onclick: async () => {
              try {
                const data = await fetchJSON(item.file);
                const ws = (Array.isArray(data.widgets) ? data.widgets : [data.widget || data]).map(x => normWidget(x, true));
                ws.forEach(w => addWidgetToTab(cur(), w));
                save(); renderBoard(); m.close();
                toast(`Added “${item.name}”`);
              } catch { toast('Could not load that library item.', true); }
            }
          })));
      }
      body.append(h('div', { class: 'section-label', text: 'Or add a ready-made widget from the library' }), list);
    }
    m = modal({
      title: 'Add widget', content: body,
      actions: [cancelAction, {
        label: 'Add widget', kind: 'primary', onClick: c => {
          const fallback = { links: 'New widget', search: 'Search', notes: 'Notes' }[type];
          const w = newWidget(name.value.trim().slice(0, 100) || fallback, color, type);
          if (type === 'search' && engineSel.value) w.engine = engineSel.value;
          if (type === 'links') w.view = view;
          addWidgetToTab(cur(), w);
          save(); renderBoard(); c();
        }
      }]
    });
  }

  /* ---------- links ---------- */
  function addLinkDialog(w) {
    const url = h('input', { type: 'text', placeholder: 'https://…', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Address' });
    const title = h('input', { type: 'text', placeholder: 'Optional: defaults to the site name', maxlength: '200', autocomplete: 'off', 'aria-label': 'Title' });
    const bulk = h('textarea', { rows: '8', spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Links', placeholder: 'https://example.org\nTitle | https://example.org/page\n--- Section title\n---' });
    const secTitle = h('input', { type: 'text', placeholder: 'e.g. Archives (leave blank for just a line)', maxlength: '100', autocomplete: 'off', 'aria-label': 'Section title' });
    const single = h('div', {}, field('Address', url), field('Title', title));
    const several = h('div', { hidden: true }, field('Links', bulk, 'One link per line. Put “Title | ” in front to set a title. A line starting with --- adds a section: “--- Title” for a heading, or just --- for a line.'));
    const section = h('div', { hidden: true }, field('Section title', secTitle, 'Adds a heading with a line under it, at the end of this widget. Drag it into place.'));
    let mode = 0;
    const panes = [single, several, section], focusers = [url, bulk, secTitle];
    const seg = segmented(['One link', 'Several', 'Section'], 0, i => { mode = i; panes.forEach((p, j) => { p.hidden = i !== j; }); focusers[i].focus(); });
    modal({
      title: `Add to “${w.title}”`,
      content: h('div', { class: 'modal-body' }, seg, single, several, section),
      actions: [cancelAction, {
        label: 'Add', kind: 'primary', onClick: c => {
          const added = [];
          if (mode === 2) {
            added.push({ id: uid(), kind: 'section', title: sectionTitle(secTitle.value) });
          } else if (mode === 1) {
            for (const line of bulk.value.split(/\r?\n/)) {
              const s = line.trim(); if (!s) continue;
              if (/^-{3,}/.test(s)) { added.push({ id: uid(), kind: 'section', title: sectionTitle(s.replace(/^-+/, '')) }); continue; }
              const p = s.indexOf('|');
              const t = p > -1 ? s.slice(0, p).trim() : '';
              const cu = cleanUrl(p > -1 ? s.slice(p + 1) : s);
              if (cu) added.push({ id: uid(), title: (t || hostLabel(cu)).slice(0, 200), url: cu });
            }
            if (!added.length) { toast('No usable links found.', true); return; }
          } else {
            const cu = cleanUrl(url.value);
            if (!cu) { url.classList.add('invalid'); url.focus(); toast('That address doesn’t look right.', true); return; }
            added.push({ id: uid(), title: title.value.trim().slice(0, 200) || hostLabel(cu), url: cu });
          }
          w.links.push(...added);
          save(); renderBoard(); c();
          if (added.length > 1) toast(`Added ${added.length} items`);
        }
      }]
    });
  }

  function editLinkDialog(id) {
    const f = findLink(id);
    if (!f) return;
    const { w, l } = f;
    const remove = c => { w.links = w.links.filter(x => x.id !== id); save(); renderBoard(); c(); };
    if (isSection(l)) {
      const t = h('input', { type: 'text', value: l.title, maxlength: '100', autocomplete: 'off', 'aria-label': 'Section title', placeholder: 'Leave blank for just a line' });
      modal({
        title: 'Edit section',
        content: h('div', { class: 'modal-body' }, field('Section title', t, 'Leave blank for just a line.')),
        actions: [
          { label: 'Delete', kind: 'danger', onClick: remove },
          { spacer: true }, cancelAction,
          { label: 'Save', kind: 'primary', onClick: c => { l.title = sectionTitle(t.value); save(); renderBoard(); c(); } }
        ]
      });
      return;
    }
    const url = h('input', { type: 'text', value: l.url, autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Address' });
    const title = h('input', { type: 'text', value: l.title, maxlength: '200', autocomplete: 'off', 'aria-label': 'Title' });
    modal({
      title: 'Edit link',
      content: h('div', { class: 'modal-body' }, field('Title', title), field('Address', url)),
      actions: [
        { label: 'Delete', kind: 'danger', onClick: remove },
        {
          label: 'Make section', onClick: c => {
            // Turns a stand-in divider link into a real section.
            Object.keys(l).forEach(k => { if (k !== 'id') delete l[k]; });
            Object.assign(l, { kind: 'section', title: sectionTitle(title.value) });
            save(); renderBoard(); c();
            toast('Turned into a section');
          }
        },
        { spacer: true },
        cancelAction,
        {
          label: 'Save', kind: 'primary', onClick: c => {
            const cu = cleanUrl(url.value);
            if (!cu) { url.classList.add('invalid'); url.focus(); toast('That address doesn’t look right.', true); return; }
            l.url = cu;
            l.title = title.value.trim().slice(0, 200) || hostLabel(cu);
            save(); renderBoard(); c();
          }
        }
      ]
    });
  }

  /* ---------- backgrounds ---------- */
  function effectiveBg() {
    const s = state.settings;
    if (s.bg) return s.bg;
    const bgs = config.backgrounds || [];
    if (config.defaultBackground && bgs.some(b => b.id === config.defaultBackground)) return 'base:' + config.defaultBackground;
    return bgs.length ? 'base:' + bgs[0].id : 'none';
  }

  async function applyBackground() {
    const s = state.settings;
    const root = document.documentElement;
    root.style.setProperty('--dim', String(s.dim / 100));
    root.style.setProperty('--blur', s.blur + 'px');
    document.body.dataset.theme = s.theme;

    const key = effectiveBg();
    let url = null, nextObjectUrl = null;
    if (key.startsWith('base:')) {
      const b = (config.backgrounds || []).find(x => x.id === key.slice(5));
      if (b) url = b.file;
    } else if (key.startsWith('custom:')) {
      try {
        const rec = await Store.getImage(key.slice(7));
        if (rec && rec.blob) url = nextObjectUrl = URL.createObjectURL(rec.blob);
      } catch { /* fall through to plain */ }
    }
    $('#bg').style.backgroundImage = url ? `url("${url}")` : 'none';
    document.body.classList.toggle('plain-bg', !url);
    if (bgObjectUrl) URL.revokeObjectURL(bgObjectUrl);
    bgObjectUrl = nextObjectUrl;
  }

  // Re-encoding through a canvas shrinks big photos and strips EXIF/GPS metadata,
  // which matters because backgrounds travel inside backups.
  async function reencodeImage(file, max = 2560) {
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) throw new Error('Unsupported type');
    if (file.size > 40e6) throw new Error('Too large');
    const src = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * scale));
      c.height = Math.max(1, Math.round(img.naturalHeight * scale));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return await new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('Encode failed'))), 'image/jpeg', 0.86));
    } finally { URL.revokeObjectURL(src); }
  }

  function blobToDataURL(blob) {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
  }
  function dataURLToBlob(d) {
    const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/.exec(String(d || ''));
    if (!m) return null;
    const bin = atob(m[2].replace(/\s/g, ''));
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: m[1] });
  }

  /* ---------- import / export ---------- */
  async function exportBackup(includeImages) {
    const images = [];
    if (includeImages && storageOk) {
      try {
        for (const { id, rec } of await Store.listImages()) images.push({ id, name: rec.name, data: await blobToDataURL(rec.blob) });
      } catch { toast('Backgrounds could not be included.', true); }
    }
    download(`start-backup-${today()}.json`, { type: 'startpage-backup', version: 1, exported: new Date().toISOString(), state, images });
    markBackedUp();
    toast('Backup downloaded. Keep it somewhere safe on the network.');
  }

  async function importFile(file) {
    if (file.size > 100e6) return toast('That file is too large.', true);
    const text = await file.text();
    if (/^\s*</.test(text)) return importBookmarksHtml(text);
    let data;
    try { data = JSON.parse(text); } catch { return toast('That isn’t a backup, page, widget or bookmarks file.', true); }
    if (!data || typeof data !== 'object') return toast('That file is empty.', true);

    if (data.type === 'startpage-backup') {
      if (!await confirmDialog('Restoring this backup replaces all your pages, widgets and uploaded backgrounds in this browser.', 'Replace everything')) return;
      const next = normState(data.state, false);
      if (storageOk) {
        try {
          await Store.clearImages();
          for (const img of Array.isArray(data.images) ? data.images : []) {
            const blob = dataURLToBlob(img.data);
            if (blob && idOk(img.id)) await Store.putImage(img.id, { name: String(img.name || 'Custom').slice(0, 40), blob });
          }
        } catch { toast('Some backgrounds could not be restored.', true); }
      }
      state = next;
      const exported = Date.parse(data.exported);
      markBackedUp(Number.isFinite(exported) && exported <= Date.now() ? exported : Date.now());
      save(); render(); await applyBackground();
      toast('Backup restored');
    } else if (data.type === 'startpage-page' || (Array.isArray(data.cols) && !data.type)) {
      const t = normTab(data.page || data, true);
      state.tabs.push(t); state.activeTab = t.id;
      save(); render();
      toast(`Added page “${t.name}”`);
    } else if (data.type === 'startpage-widget' || Array.isArray(data.links) || Array.isArray(data.widgets)) {
      const ws = (Array.isArray(data.widgets) ? data.widgets : [data.widget || data]).map(x => normWidget(x, true));
      ws.forEach(w => addWidgetToTab(cur(), w));
      save(); renderBoard();
      toast(ws.length > 1 ? `Added ${ws.length} widgets to this page` : `Added “${ws[0].title}” to this page`);
    } else {
      toast('That file wasn’t recognised.', true);
    }
  }

  // Netscape bookmark HTML: what browsers (and most start pages) export.
  function importBookmarksHtml(text) {
    const doc = new DOMParser().parseFromString(text, 'text/html'); // inert: no scripts run, no images load
    const folderPath = a => {
      const names = [];
      let dl = a.closest('dl');
      while (dl) {
        const prev = dl.previousElementSibling;
        if (prev && prev.tagName === 'H3') names.unshift(prev.textContent.trim());
        dl = dl.parentElement ? dl.parentElement.closest('dl') : null;
      }
      return names.filter(Boolean);
    };
    const groups = new Map();
    let count = 0;
    for (const a of doc.querySelectorAll('a[href]')) {
      const url = cleanUrl(a.getAttribute('href'));
      if (!url) continue;
      const key = folderPath(a).join(' / ') || 'Imported';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ id: uid(), title: a.textContent.trim().slice(0, 200) || hostLabel(url), url });
      count++;
    }
    if (!count) return toast('No links found in that file.', true);
    const tab = newTab('Imported', 4);
    let i = 0;
    for (const [name, links] of groups) {
      const w = newWidget(name.slice(0, 100), COLORS[i++ % COLORS.length]);
      w.links = links;
      addWidgetToTab(tab, w);
    }
    state.tabs.push(tab); state.activeTab = tab.id;
    save(); render();
    toast(`Imported ${count} links into ${groups.size} widgets on a new page`);
  }

  /* ---------- settings ---------- */
  function settingsDialog() {
    const s = state.settings;
    const thumbUrls = [];
    const revokeThumbs = () => { thumbUrls.forEach(u => URL.revokeObjectURL(u)); thumbUrls.length = 0; };
    const grid = h('div', { class: 'bg-grid' });
    const upload = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/gif', multiple: true, hidden: true });
    upload.addEventListener('change', async () => {
      if (!storageOk) { toast('This browser can’t store backgrounds.', true); return; }
      for (const f of upload.files) {
        try {
          const blob = await reencodeImage(f);
          const id = uid();
          await Store.putImage(id, { name: f.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'Custom', blob });
          s.bg = 'custom:' + id;
        } catch { toast(`Couldn’t use ${f.name}`, true); }
      }
      upload.value = '';
      save(); await applyBackground(); fillGrid();
    });

    async function fillGrid() {
      revokeThumbs();
      grid.replaceChildren();
      const selected = effectiveBg();
      const opt = (key, name, thumb, removable) => {
        const b = h('button', {
          type: 'button', class: 'bg-opt' + (key === selected ? ' sel' : '') + (thumb ? '' : ' plain'), title: name, 'aria-pressed': String(key === selected),
          onclick: async () => { s.bg = key; save(); await applyBackground(); fillGrid(); }
        }, h('span', { class: 'bg-name', text: name }));
        if (thumb) b.style.backgroundImage = `url("${thumb}")`;
        const wrap = h('div', { class: 'bg-wrap' }, b);
        if (removable) {
          wrap.append(iconBtn('close', 'Remove this background', async () => {
            try { await Store.deleteImage(key.slice(7)); } catch { /* ignore */ }
            if (s.bg === key) { s.bg = null; save(); await applyBackground(); }
            fillGrid();
          }, 'bg-del'));
        }
        grid.append(wrap);
      };
      for (const b of config.backgrounds || []) opt('base:' + b.id, b.name, b.thumb || b.file, false);
      if (storageOk) {
        try {
          for (const { id, rec } of await Store.listImages()) {
            const u = URL.createObjectURL(rec.blob); thumbUrls.push(u);
            opt('custom:' + id, rec.name || 'Custom', u, true);
          }
        } catch { /* ignore */ }
      }
      opt('none', 'Plain', null, false);
      grid.append(h('div', { class: 'bg-wrap' }, h('button', { type: 'button', class: 'bg-opt upload', onclick: () => upload.click() }, h('span', { text: '+ Upload' }))));
    }
    fillGrid();

    const range = (min, max, value, oninput, label) => {
      const r = h('input', { type: 'range', min: String(min), max: String(max), value: String(value), 'aria-label': label });
      r.addEventListener('input', () => { oninput(Number(r.value)); });
      r.addEventListener('change', save);
      return r;
    };
    const dim = range(0, 80, s.dim, v => { s.dim = v; applyBackground(); }, 'Darken background');
    const blur = range(0, 20, s.blur, v => { s.blur = v; applyBackground(); }, 'Blur background');
    const theme = segmented(['Dark widgets', 'Light widgets'], s.theme === 'light' ? 1 : 0, i => { s.theme = i ? 'light' : 'dark'; save(); applyBackground(); });
    const newTabBox = h('input', { type: 'checkbox', id: 'opt-newtab' });
    newTabBox.checked = s.newTab;
    newTabBox.addEventListener('change', () => { s.newTab = newTabBox.checked; save(); renderBoard(); });

    /* search engines */
    const engineList = h('div', { class: 'engine-list' });
    const defaultSel = h('select', { class: 'engine-select', 'aria-label': 'Default search engine' });
    defaultSel.addEventListener('change', () => { s.defaultEngine = defaultSel.value; save(); renderBoard(); });
    function fillEngines() {
      const current = engineFor({});
      defaultSel.replaceChildren(...allEngines().map(e => h('option', { value: e.id, text: e.name, selected: e.id === current.id })));
      engineList.replaceChildren();
      const serverIds = new Set(serverEngines().map(e => e.id));
      for (const e of allEngines()) {
        const custom = !serverIds.has(e.id);
        engineList.append(h('div', { class: 'engine-row' },
          h('div', { class: 'engine-info' }, h('div', { class: 'engine-name', text: e.name + (custom ? '' : '  · built-in') }), h('div', { class: 'engine-url', text: e.url })),
          custom ? iconBtn('close', `Remove ${e.name}`, () => {
            s.customEngines = s.customEngines.filter(x => x.id !== e.id);
            if (s.defaultEngine === e.id) s.defaultEngine = null;
            save(); fillEngines(); renderBoard();
          }) : null));
      }
    }
    fillEngines();
    const engName = h('input', { type: 'text', placeholder: 'Name, e.g. Intranet search', maxlength: '40', autocomplete: 'off', 'aria-label': 'Search engine name' });
    const engUrl = h('input', { type: 'text', placeholder: 'https://example.org/search?q=%s', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Search URL' });
    const addEngine = () => {
      const url = cleanEngineUrl(engUrl.value);
      if (!url) { engUrl.classList.add('invalid'); engUrl.focus(); toast('The address must start with http(s):// and contain %s where the search terms go.', true, 6000); return; }
      engUrl.classList.remove('invalid');
      const name = engName.value.trim().slice(0, 40) || hostLabel(url);
      s.customEngines.push({ id: uid(), name, url });
      engName.value = ''; engUrl.value = '';
      save(); fillEngines(); renderBoard();
      toast(`Added ${name}`);
    };
    [engName, engUrl].forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); addEngine(); } }));

    const withImages = h('input', { type: 'checkbox', id: 'opt-imgs' });
    withImages.checked = true;
    const importInput = h('input', { type: 'file', accept: '.json,.html,.htm,application/json,text/html', hidden: true });
    importInput.addEventListener('change', async () => {
      const f = importInput.files[0];
      importInput.value = '';
      if (f) { m.close(); await importFile(f); }
    });

    const body = h('div', { class: 'modal-body settings' },
      h('section', {},
        h('h4', { text: 'Background' }),
        grid, upload,
        h('div', { class: 'row2' }, field('Darken', dim), field('Blur', blur)),
        field('Widget style', theme),
        h('label', { class: 'check', for: 'opt-newtab' }, newTabBox, ' Open links in a new tab')),
      h('section', {},
        h('h4', { text: 'Search' }),
        field('Default engine for search widgets', defaultSel),
        engineList,
        h('div', { class: 'field-label add-engine-label', text: 'Add a search engine' }),
        h('div', { class: 'add-engine' }, engName, engUrl, h('button', { type: 'button', class: 'btn', text: 'Add', onclick: addEngine })),
        h('small', { class: 'hint', text: 'Run a search on the site, copy the results address, and replace your search words with %s. Searches always open in a new tab. Nothing is sent while you type: no suggestions or autocomplete.' })),
      h('section', {},
        h('h4', { text: 'Backup and sharing' }),
        h('p', { class: 'hint', text: storageOk
          ? 'Your pages are saved in this browser only, on this computer. Download a backup to move them to another machine or keep them safe.'
          : 'This browser is not letting the page save anything. Download a backup before you close it.' }),
        h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn primary', text: 'Download backup', onclick: () => exportBackup(withImages.checked) }),
          h('label', { class: 'check', for: 'opt-imgs' }, withImages, ' Include uploaded backgrounds')),
        h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn', text: 'Import a file…', onclick: () => importInput.click() }), importInput),
        h('p', { class: 'hint', text: 'Import accepts a full backup (replaces everything), a page or widget a colleague exported (added alongside yours), or a bookmarks .html export from a browser or start page (added as a new page).' })),
      h('section', {},
        h('h4', { text: 'Reset' }),
        h('button', {
          type: 'button', class: 'btn danger', text: 'Clear everything in this browser…', onclick: async () => {
            if (!await confirmDialog('This removes all your pages, widgets and uploaded backgrounds from this browser. Download a backup first if you might want them.', 'Clear everything')) return;
            try { await Store.clearAll(); } catch { /* ignore */ }
            m.close();
            state = await loadDefaultState();
            meta = { lastBackup: null, backupHash: contentHash(), firstUnsaved: null, snoozeUntil: 0 };
            saveMeta();
            save(); render(); await applyBackground();
            toast('Cleared');
          }
        })));

    const m = modal({ title: 'Settings', content: body, wide: true, onClose: revokeThumbs });
  }

  /* ---------- startup ---------- */
  async function fetchJSON(url) {
    // Same-origin only (enforced by the Content-Security-Policy too).
    const r = await fetch(url, { cache: 'no-cache', credentials: 'same-origin', referrerPolicy: 'no-referrer' });
    if (!r.ok) throw new Error(r.status + ' ' + url);
    return r.json();
  }

  async function loadDefaultState() {
    if (config.defaultLayout) {
      try { return normState(await fetchJSON(config.defaultLayout), true); } catch { /* fall back */ }
    }
    return normState(null, true);
  }

  async function init() {
    try { config = await fetchJSON('config.json'); } catch { config = {}; }
    if (config.title) document.title = String(config.title);

    let saved = null;
    try { saved = await Store.get('state'); }
    catch { storageOk = false; }
    state = saved ? normState(saved, false) : await loadDefaultState();
    try {
      const m = storageOk ? await Store.get('meta') : null;
      if (m && typeof m === 'object') meta = { ...meta, ...m };
    } catch { /* ignore */ }
    if (!saved) { meta.backupHash = contentHash(); saveMeta(); }
    else if (!meta.backupHash && !meta.lastBackup && !meta.firstUnsaved) { meta.firstUnsaved = Date.now(); saveMeta(); }
    if (!saved && storageOk) save();
    setInterval(renderBackupStatus, 60000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') renderBackupStatus(); });

    $('#addTab').append(icon('plus'));
    $('#settingsBtn').append(icon('settings'));
    $('#addTab').addEventListener('click', addTab);
    $('#addWidget').addEventListener('click', addWidgetDialog);
    $('#settingsBtn').addEventListener('click', settingsDialog);
    $('#lockBtn').addEventListener('click', () => { state.settings.locked = !state.settings.locked; save(); applyLock(); });

    const filter = $('#filter');
    filter.addEventListener('input', applyFilter);
    filter.addEventListener('keydown', e => {
      if (e.key === 'Escape') { filter.value = ''; applyFilter(); filter.blur(); }
      else if (e.key === 'Enter') { const a = $('#board .link:not([hidden]) a'); if (a) a.click(); }
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeMenu();
      if (e.key === '/' && !e.target.closest('input, textarea, [contenteditable]') && !$('.modal')) { e.preventDefault(); filter.focus(); }
    });
    window.addEventListener('resize', closeMenu);
    window.addEventListener('scroll', closeMenu, { passive: true });

    render();
    renderBackupStatus();
    await applyBackground();
    if (!storageOk) toast('This browser is blocking local storage, so changes won’t be kept. Download a backup to keep them.', true, 8000);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
