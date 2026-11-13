'use strict';
/* Small pointer-based drag-and-drop sorter. No third-party code.
   Each group: { name, handle, item, resolve(el) -> container|null, axis: 'x'|'y',
                 disabled(), onEnd(item), dropOn?: selector, onDropOn?(item, target) } */
const Drag = (() => {
  const groups = [];
  const NODRAG = 'button, input, textarea, select, .nodrag';
  let st = null;
  let suppressClick = false;

  function register(g) { groups.push(g); }

  // Stop the browser's own link/image dragging inside the app.
  document.addEventListener('dragstart', e => {
    if (e.target.closest && e.target.closest('#board, #tabs')) e.preventDefault();
  });

  document.addEventListener('pointerdown', e => {
    suppressClick = false;
    if (e.button !== 0 || st) return;
    if (e.target.closest(NODRAG)) return;
    for (const g of groups) {
      if (g.disabled && g.disabled()) continue;
      const handle = e.target.closest(g.handle);
      if (!handle) continue;
      const item = handle.closest(g.item);
      if (!item) continue;
      st = { g, item, x: e.clientX, y: e.clientY, active: false };
      return;
    }
  });

  window.addEventListener('pointermove', e => {
    if (!st) return;
    if (!st.active) {
      if (Math.hypot(e.clientX - st.x, e.clientY - st.y) < 6) return;
      begin(e);
    }
    e.preventDefault();
    track(e);
  }, { passive: false });

  window.addEventListener('pointerup', () => finish(false));
  window.addEventListener('pointercancel', () => finish(true));
  window.addEventListener('blur', () => finish(true));
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && st && st.active) finish(true); });
  window.addEventListener('click', e => {
    if (suppressClick) { e.preventDefault(); e.stopPropagation(); suppressClick = false; }
  }, true);

  function begin(e) {
    const { item, g } = st;
    const r = item.getBoundingClientRect();
    st.dx = e.clientX - r.left;
    st.dy = e.clientY - r.top;
    st.origParent = item.parentNode;
    st.origNext = item.nextSibling;

    const ghost = item.cloneNode(true);
    ghost.classList.add('drag-ghost');
    ghost.style.width = r.width + 'px';
    ghost.style.height = r.height + 'px';
    // Keep icon-view styling on the ghost by giving it a matching wrapper.
    let ghostHost = document.body;
    const gridCtx = item.closest('.view-grid');
    if (gridCtx) {
      ghostHost = document.createElement('div');
      ghostHost.className = 'view-grid ghost-holder';
      document.body.append(ghostHost);
    }
    ghostHost.append(ghost);
    st.ghostHost = ghostHost === document.body ? null : ghostHost;

    const ph = document.createElement(item.tagName === 'LI' ? 'li' : 'div');
    ph.className = 'drag-placeholder';
    ph.style.height = r.height + 'px';
    if (g.axis === 'x') ph.style.width = r.width + 'px';
    item.parentNode.insertBefore(ph, item);
    item.classList.add('drag-hidden');

    Object.assign(st, { ghost, ph, active: true, dropTarget: null });
    document.body.classList.add('dragging', 'dragging-' + g.name);
    const sel = window.getSelection && window.getSelection();
    if (sel) sel.removeAllRanges();
  }

  function track(e) {
    const { g, ghost } = st;
    ghost.style.transform = `translate(${e.clientX - st.dx}px, ${e.clientY - st.dy}px)`;
    const el = document.elementFromPoint(e.clientX, e.clientY);

    const target = g.dropOn && el ? el.closest(g.dropOn) : null;
    if (st.dropTarget !== target) {
      if (st.dropTarget) st.dropTarget.classList.remove('drop-hover');
      st.dropTarget = target;
      if (target) target.classList.add('drop-hover');
    }
    if (target) return;

    const cont = el ? g.resolve(el) : null;
    if (cont) place(cont, e);
    autoscroll(e);
  }

  function place(cont, e) {
    const { g, ph, item } = st;
    const axis = g.axisFor ? g.axisFor(cont) : g.axis;
    const items = [...cont.children].filter(c => c !== item && c !== ph && c.matches(g.item) && !c.hidden);
    let before = null;
    for (const it of items) {
      const r = it.getBoundingClientRect();
      let isBefore;
      if (axis === 'grid') {
        // Wrapping rows: anything on an earlier row, or earlier in this row.
        isBefore = e.clientY < r.top || (e.clientY <= r.bottom && e.clientX < r.left + r.width / 2);
      } else if (axis === 'x') isBefore = e.clientX < r.left + r.width / 2;
      else isBefore = e.clientY < r.top + r.height / 2;
      if (isBefore) { before = it; break; }
    }
    if (before) {
      if (ph.nextElementSibling !== before) cont.insertBefore(ph, before);
    } else {
      const last = items[items.length - 1];
      if (last) { if (last.nextElementSibling !== ph) last.after(ph); }
      else if (ph.parentNode !== cont) cont.prepend(ph);
    }
  }

  function autoscroll(e) {
    if (e.clientY > window.innerHeight - 40) window.scrollBy(0, 14);
    else if (e.clientY < 70) window.scrollBy(0, -14);
  }

  function finish(cancel) {
    if (!st) return;
    const s = st; st = null;
    if (!s.active) return;
    s.ghost.remove();
    if (s.ghostHost) s.ghostHost.remove();
    document.body.classList.remove('dragging', 'dragging-' + s.g.name);
    s.item.classList.remove('drag-hidden');
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 300);
    if (s.dropTarget) s.dropTarget.classList.remove('drop-hover');

    if (cancel || s.dropTarget) {
      s.ph.remove();
      s.origParent.insertBefore(s.item, s.origNext);
      if (!cancel && s.g.onDropOn) s.g.onDropOn(s.item, s.dropTarget);
      return;
    }
    s.ph.replaceWith(s.item);
    s.g.onEnd(s.item);
  }

  return { register };
})();
