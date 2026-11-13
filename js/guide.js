'use strict';
document.addEventListener('DOMContentLoaded', () => {
  // Use the reader's own background, darkening and widget style from Dark Start, if they have one.
  (async () => {
    try {
      const st = await Store.get('state');
      const s = st && st.settings;
      if (!s) return;
      const root = document.body;
      if (typeof s.dim === 'number') root.style.setProperty('--dim', String(Math.max(s.dim, 30) / 100));
      if (typeof s.blur === 'number') root.style.setProperty('--blur', s.blur + 'px');
      if (s.theme === 'light' || s.theme === 'dark') document.body.dataset.theme = s.theme;
      const bg = document.getElementById('bg');
      if (s.bg === 'none') { bg.style.backgroundImage = 'none'; document.body.classList.add('plain-bg'); }
      else if (s.bg && s.bg.startsWith('custom:')) {
        const rec = await Store.getImage(s.bg.slice(7));
        if (rec && rec.blob) bg.style.backgroundImage = `url("${URL.createObjectURL(rec.blob)}")`;
      } else if (s.bg && s.bg.startsWith('base:')) {
        const cfg = await (await fetch('config.json', { cache: 'no-cache' })).json();
        const b = (cfg.backgrounds || []).find(x => x.id === s.bg.slice(5));
        if (b) bg.style.backgroundImage = `url("${b.file}")`;
      }
    } catch { /* keep the default look */ }
  })();

  // Screenshot placeholders: if guide/<name>.png exists on the server, show it instead of the box.
  for (const fig of document.querySelectorAll('figure.shot[data-img]')) {
    const img = new Image();
    img.alt = fig.querySelector('.shot-ph span')?.textContent.replace(/^Screenshot:\s*/, '') || '';
    img.onload = () => fig.replaceChildren(img);
    img.src = fig.dataset.img;
  }

  // Highlight the current section in the contents.
  const links = new Map([...document.querySelectorAll('.toc a')].map(a => [a.getAttribute('href').slice(1), a]));
  const obs = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      links.forEach(a => a.classList.remove('active'));
      const a = links.get(e.target.id);
      if (a) a.classList.add('active');
    }
  }, { rootMargin: '-80px 0px -65% 0px' });
  document.querySelectorAll('.guide-main > section[id]').forEach(s => obs.observe(s));
});
