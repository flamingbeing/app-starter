// Touch and hold: [data-hold-menu="#template-id"] gets a menu from that <template> (its .ui-menu-item buttons, each
// with data-action), with a lifted copy of the element as a preview. Also right-click, Android's own long press, the
// context-menu key and Shift+F10. A pick sends a "ui-menu" event (detail.action) from the element.
// A hold is HOLD_MS without moving more than SLOP; the click that comes with lifting the finger is swallowed (it
// neither opens the row nor presses a menu item); no hold from fields, dialogs, sideways scrollers or select mode.
import { HOLD_MS, SLOP, still, noGesture, haptic, listeners } from './gesture.js';

/**
 * Where the preview and the menu go (pure): the preview stays put and the menu goes under it, or above if there is no
 * room; if neither fits, the preview moves up so the menu fits under it. Left follows the finger when there is one.
 * @param {{ left: number, top: number, bottom: number, height: number }} r  the element's rect
 * @param {{ w: number, h: number }} menu @param {{ w: number, h: number }} view @param {{ x: number } | null} [at]
 * @returns {{ left: number, top: number, previewTop: number, below: boolean }}
 */
export function placeMenu(r, menu, view, at) {
  const gap = 10, edge = 16;
  let top = r.bottom + gap, previewTop = r.top;
  if (top + menu.h > view.h - edge) {
    if (r.top - gap - menu.h > edge) top = r.top - gap - menu.h;
    else { previewTop = Math.max(edge, view.h - edge - menu.h - gap - r.height); top = previewTop + r.height + gap; }
  }
  const left = Math.min(Math.max(edge, at && at.x ? at.x - menu.w / 2 : r.left), view.w - edge - menu.w);
  return { left, top, previewTop, below: top > previewTop };
}

/**
 * Starts hold menus for every [data-hold-menu] inside root (now or added later).
 * @param {ParentNode} [root]
 * @returns {{ open: (el: HTMLElement, at?: { x: number, y: number } | null, byKey?: boolean) => void, close: () => void, stop: () => void }}
 */
export function holdMenus(root = document) {
  const l = listeners();
  const html = document.documentElement;
  /** @type {HTMLDivElement | null} */
  let layer = null;
  /** @type {HTMLElement | null} */
  let menuFor = null;
  let swallowClick = false;

  /** @param {EventTarget | null} t @returns {HTMLElement | null} */
  const holdable = t => {
    const el = t instanceof Element ? /** @type {HTMLElement | null} */ (t.closest('[data-hold-menu]')) : null;
    if (!el || !(root === document || /** @type {Node} */ (root).contains(el))) return null;
    if (noGesture(t) || el.closest('.is-editing')) return null;
    return el;
  };

  function build() {
    const box = document.createElement('div');
    box.className = 'ui-menu-layer';
    const veil = document.createElement('div');
    veil.className = 'ui-menu-veil';
    box.append(veil);
    document.body.append(box);
    box.addEventListener('click', e => { if (!(/** @type {Element} */ (e.target).closest('.ui-menu'))) close(); });
    box.addEventListener('keydown', e => {
      const items = /** @type {HTMLElement[]} */ ([...box.querySelectorAll('.ui-menu-item:not(:disabled)')]);
      let i = items.indexOf(/** @type {HTMLElement} */ (document.activeElement));
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && items.length) {
        e.preventDefault();
        if (i < 0) i = e.key === 'ArrowDown' ? -1 : 0;
        items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
      } else if (e.key === 'Home' && items.length) { e.preventDefault(); items[0].focus(); }
      else if (e.key === 'End' && items.length) { e.preventDefault(); items[items.length - 1].focus(); }
      else if (e.key === 'Tab') e.preventDefault();   // the menu keeps focus until it closes
    });
    return box;
  }

  /** @param {HTMLElement} el @param {{ x: number, y: number } | null} [at] @param {boolean} [byKey] */
  function open(el, at = null, byKey = false) {
    const sel = el.getAttribute('data-hold-menu');
    const tpl = sel ? document.querySelector(sel) : null;
    if (!(tpl instanceof HTMLTemplateElement)) return;
    if (!layer) layer = build();
    close(true);
    menuFor = el;
    const r = el.getBoundingClientRect();
    const copy = /** @type {HTMLElement} */ (el.cloneNode(true));
    copy.removeAttribute('id');
    copy.classList.remove('is-holding');
    copy.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
    const preview = document.createElement('div');
    preview.className = 'ui-menu-preview';
    preview.setAttribute('aria-hidden', 'true');
    preview.inert = true;
    preview.style.left = `${r.left}px`;
    preview.style.top = `${r.top}px`;
    preview.style.width = `${r.width}px`;
    preview.append(copy);
    const menu = document.createElement('div');
    menu.className = 'ui-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', el.getAttribute('aria-label') || (el.textContent || '').trim().slice(0, 60) || 'Actions');
    menu.append(tpl.content.cloneNode(true));
    menu.querySelectorAll('.ui-menu-item').forEach(b => { b.setAttribute('role', 'menuitem'); if (b instanceof HTMLButtonElement) b.type = 'button'; });
    layer.append(preview, menu);
    layer.classList.add('is-open');   // before measuring: a closed layer is display:none, so the menu would measure 0
    const p = placeMenu(r, { w: menu.offsetWidth, h: menu.offsetHeight }, { w: innerWidth, h: innerHeight }, at);
    menu.style.left = `${p.left}px`;
    menu.style.top = `${p.top}px`;
    menu.style.setProperty('--ui-menu-origin', p.below ? '50% 0' : '50% 100%');
    html.classList.add('ui-menu-open');
    requestAnimationFrame(() => {
      preview.style.top = `${p.previewTop}px`;
      if (!still()) preview.classList.add('is-lifted');
    });
    menu.addEventListener('click', e => {
      const b = /** @type {Element} */ (e.target).closest('.ui-menu-item');
      if (!b || !menuFor) return;
      const action = b.getAttribute('data-action'), target = menuFor;
      close();
      target.dispatchEvent(new CustomEvent('ui-menu', { bubbles: true, detail: { action } }));
    });
    // from the keyboard focus goes to the first item; from a finger or a mouse to the menu (no ring until a key)
    menu.tabIndex = -1;
    const first = /** @type {HTMLElement | null} */ (menu.querySelector('.ui-menu-item'));
    (byKey && first ? first : menu).focus({ preventScroll: true });
  }

  /** @param {boolean} [quiet]  true: focus stays where it is (another menu is opening) */
  function close(quiet = false) {
    if (!layer || !layer.classList.contains('is-open')) return;
    layer.classList.remove('is-open');
    html.classList.remove('ui-menu-open');
    layer.querySelectorAll('.ui-menu-preview,.ui-menu').forEach(n => n.remove());
    if (menuFor && !quiet) menuFor.focus({ preventScroll: true });
    menuFor = null;
  }

  // touch and pen: the hold
  let timer = 0;
  /** @type {{ x: number, y: number } | null} */
  let start = null;
  /** @type {HTMLElement | null} */
  let holding = null;
  function cancel() {
    clearTimeout(timer);
    timer = 0;
    holding?.classList.remove('is-holding');
    holding = null;
    start = null;
  }
  l.on(document, 'pointerdown', (/** @type {PointerEvent} */ e) => {
    swallowClick = false;   // a new press: forget the last hold (iOS often sends no click after a long hold)
    if (e.pointerType === 'mouse' || e.button > 0 || !e.isPrimary) { cancel(); return; }
    const el = holdable(e.target);
    if (!el) return;
    holding = el;
    start = { x: e.clientX, y: e.clientY };
    el.classList.add('is-holding');
    timer = window.setTimeout(() => {
      const target = /** @type {HTMLElement} */ (holding), at = start;
      cancel();
      swallowClick = true;
      haptic();
      open(target, at);
    }, HOLD_MS);
  }, { passive: true });
  l.on(document, 'pointermove', (/** @type {PointerEvent} */ e) => {
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > SLOP) cancel();
  }, { passive: true });
  l.on(document, 'pointerup', () => { if (timer) cancel(); }, { passive: true });
  l.on(document, 'pointercancel', cancel, { passive: true });
  l.on(window, 'scroll', () => { if (timer) cancel(); }, { passive: true });
  // lifting the finger after a hold: no mouse events, so focus stays in the menu and the row doesn't open
  l.on(document, 'touchend', (/** @type {TouchEvent} */ e) => { if (swallowClick && e.cancelable) e.preventDefault(); }, { passive: false });
  l.on(document, 'click', (/** @type {MouseEvent} */ e) => {
    if (swallowClick) { swallowClick = false; e.preventDefault(); e.stopPropagation(); }
  }, true);
  // Esc closes wherever focus went
  l.on(document, 'keydown', (/** @type {KeyboardEvent} */ e) => {
    if (e.key === 'Escape' && layer?.classList.contains('is-open') && !layer.contains(/** @type {Node} */ (e.target))) { e.preventDefault(); close(); }
  });
  // right-click, Android's own long press, the context-menu key: this menu instead of the browser's
  l.on(document, 'contextmenu', (/** @type {MouseEvent} */ e) => {
    const el = holdable(e.target);
    if (!el) return;
    e.preventDefault();
    if (menuFor !== el) { cancel(); open(el, e.clientX ? { x: e.clientX, y: e.clientY } : null, !e.clientX); }
  });
  l.on(document, 'keydown', (/** @type {KeyboardEvent} */ e) => {
    if (!(e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))) return;
    const el = holdable(document.activeElement);
    if (el) { e.preventDefault(); open(el, null, true); }
  });
  l.on(window, 'resize', () => close(true));
  return { open, close, stop() { cancel(); close(true); l.stop(); layer?.remove(); layer = null; } };
}
