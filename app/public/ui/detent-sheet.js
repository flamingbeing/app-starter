// Sheets with detents: dialog.ui-sheet[data-detents="medium large"] opens at its first height; drag the grabber or the
// head between heights, or down to close; tap the grabber (or Enter / Space on it) to expand or collapse. Below full
// height a finger on the body drags the sheet too (sideways scrollers and fields keep theirs); at full height the body
// scrolls, and pulled down from its top it drags the sheet down. Let go, it settles on the nearest height, judged by
// where it is and how fast it moved. From 840 px wide it is a centred dialog: a drag changes its height.
// Each open sheet is a history entry, so Back (Android's, the browser's, the edge swipe) closes it. Done and any
// [data-close] close it; [data-open-sheet="#id"] buttons open it and get focus back.
import { SLOP, listeners, velocity } from './gesture.js';

const WIDE = '(min-width: 840px)';

/**
 * Where a drag lands (pure): -> the detent to settle on, or 'close'.
 * @param {string[]} detents @param {string} now  the detent it started at
 * @param {number} dy  how far it moved (down is +) @param {number} v  px per ms at the end (down is +)
 */
export function settle(detents, now, dy, v) {
  const top = topDetent(detents), lower = detents.find(d => d !== top);
  const projected = dy + v * 200;   // where a flick would carry it
  if (projected < -80) return top;
  if (projected > 140) return now === top && lower ? lower : 'close';
  return now;
}

/** @param {string[]} ds */
export const topDetent = ds => ds.includes('large') ? 'large' : ds[ds.length - 1];

/** @param {HTMLDialogElement} sheet */
const detentsOf = sheet => (sheet.getAttribute('data-detents') || 'medium').split(/\s+/).filter(Boolean);

/**
 * @param {HTMLDialogElement} sheet  dialog.ui-sheet[data-detents]
 * @returns {{ open: (opener?: HTMLElement | null) => void, close: () => void, setDetent: (d: string) => void, stop: () => void }}
 */
export function detentSheet(sheet) {
  const l = listeners();
  const html = document.documentElement;
  const ds = detentsOf(sheet), top = topDetent(ds);
  const wide = typeof matchMedia === 'function' ? matchMedia(WIDE) : { matches: false };
  const grab = /** @type {HTMLElement | null} */ (sheet.querySelector('.ui-sheet-grabber'));
  const body = /** @type {HTMLElement | null} */ (sheet.querySelector('.ui-sheet-body'));
  /** @type {HTMLElement | null} */
  let opener = null;
  let pushed = false;
  const key = sheet.id || 'sheet';

  /** At full height the body pans freely, except that at its top a finger moving down is left to the sheet. */
  function setBodyPan() {
    if (!body) return;
    const atTop = sheet.getAttribute('data-detent') === top;
    body.style.touchAction = !atTop ? 'pan-x' : body.scrollTop <= 0 ? 'pan-x pan-down' : '';
    // a sideways scroller is a scroll container of its own, so it needs the same rule or an up-down finger on it
    // would scroll the body below full height
    body.querySelectorAll('.ui-scroll-x').forEach(x => { /** @type {HTMLElement} */ (x).style.touchAction = atTop ? '' : 'pan-x'; });
  }
  /** @param {string} d */
  function setDetent(d) {
    sheet.setAttribute('data-detent', d);
    html.classList.toggle('ui-sheet-large-open', d === 'large' && sheet.open);
    grab?.setAttribute('aria-expanded', String(d === top));
    setBodyPan();
  }
  /** @param {HTMLElement | null} [from] */
  function open(from = null) {
    if (sheet.open) return;
    opener = from ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    sheet.showModal();
    setDetent(ds[0]);
    try { history.pushState({ ...(history.state || {}), uiSheet: key }, ''); pushed = true; } catch { /* no history here */ }
  }
  const close = () => { if (sheet.open) sheet.close(); };
  function cycle() { setDetent(ds[(ds.indexOf(sheet.getAttribute('data-detent') || ds[0]) + 1) % ds.length]); }

  document.querySelectorAll(`[data-open-sheet="#${CSS.escape(sheet.id)}"]`).forEach(b =>
    l.on(b, 'click', () => open(/** @type {HTMLElement} */ (b))));
  sheet.querySelectorAll('[data-close]').forEach(b => l.on(b, 'click', close));
  l.on(sheet, 'click', (/** @type {MouseEvent} */ e) => { if (e.target === sheet) close(); });   // the backdrop
  l.on(sheet, 'close', () => {
    sheet.style.transform = ''; sheet.style.height = ''; sheet.style.maxHeight = '';
    setDetent(ds[0]);
    html.classList.remove('ui-sheet-large-open');
    if (pushed) { pushed = false; try { history.back(); } catch { /* none */ } }
    opener?.focus();
  });
  l.on(window, 'popstate', () => { if (sheet.open && history.state?.uiSheet !== key) { pushed = false; close(); } });
  if (grab && ds.length > 1) {
    grab.setAttribute('role', 'button');
    grab.tabIndex = 0;
    if (!grab.getAttribute('aria-label')) grab.setAttribute('aria-label', 'Expand or collapse');
    grab.removeAttribute('aria-hidden');
    l.on(grab, 'keydown', (/** @type {KeyboardEvent} */ e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      cycle();
    });
  }

  // one drag at a time; a drag that moved swallows the click that follows it
  /** @type {number | null} */
  let y0 = null;
  let x0 = 0, h0 = 0, dy = 0, live = false, moved = false, from0 = ds[0];
  /** @type {[number, number][]} */
  let last = [];
  /** @type {number | string | null} */
  let id = null;
  /** @type {HTMLElement | null} */
  let from = null;
  const noGestureInSheet = (/** @type {Element} */ t) => !!t.closest('input,textarea,select,[contenteditable],[data-no-gesture],.ui-scroll-x');

  /** @param {PointerEvent} e @param {HTMLElement} el @param {boolean} fromBody */
  function down(e, el, fromBody) {
    const t = /** @type {Element} */ (e.target);
    if (fromBody) {   // a finger on the body, below full height
      if (e.pointerType === 'mouse' || sheet.getAttribute('data-detent') === top || noGestureInSheet(t)) return;
    } else if (t.closest('button:not(.ui-sheet-grabber),a,input,select,textarea')) return;
    y0 = e.clientY; x0 = e.clientX; dy = 0; last = [[e.timeStamp, e.clientY]]; id = e.pointerId; from = el; moved = false;
    from0 = sheet.getAttribute('data-detent') || ds[0];
    h0 = sheet.getBoundingClientRect().height;
    live = false;
    if (!fromBody) begin();   // the body waits until the finger clearly moves up or down
  }
  function begin() {
    live = true;
    try { if (from && typeof id === 'number') from.setPointerCapture(id); } catch { /* gone */ }
    sheet.classList.add('is-dragging');
  }
  /** @param {{ pointerId: number | string, clientX: number, clientY: number, timeStamp: number }} e */
  function move(e) {
    if (y0 === null || e.pointerId !== id) return;
    dy = e.clientY - y0;
    last.push([e.timeStamp, e.clientY]);
    if (last.length > 5) last.shift();
    if (!live) {
      const dx = Math.abs(e.clientX - x0);
      if (dx > SLOP && dx > Math.abs(dy)) { y0 = null; return; }   // sideways: not ours
      if (Math.abs(dy) < 6) return;
      begin();
    }
    if (Math.abs(dy) > 4) moved = true;
    const maxH = innerHeight - 12;
    if (dy < 0 || wide.matches) {   // pulling up (or any drag on a centred dialog): change the height
      const want = h0 - dy * (wide.matches ? 2 : 1);
      const h = want > maxH ? maxH + (want - maxH) * 0.15 : Math.max(120, want);
      sheet.style.height = `${h}px`; sheet.style.maxHeight = 'none'; sheet.style.transform = '';
    } else { sheet.style.height = ''; sheet.style.maxHeight = ''; sheet.style.transform = `translateY(${dy}px)`; }
  }
  /** @param {{ pointerId: number | string, timeStamp: number }} e */
  function up(e) {
    if (y0 === null || e.pointerId !== id) return;
    const wasLive = live;
    y0 = null; live = false;
    sheet.classList.remove('is-dragging');
    sheet.style.transform = ''; sheet.style.height = ''; sheet.style.maxHeight = '';
    if (!wasLive || !moved) return;
    const to = settle(ds, from0, dy, velocity(last));
    if (to === 'close') close(); else setDetent(to);
  }
  const handles = /** @type {HTMLElement[]} */ ([...sheet.querySelectorAll('.ui-sheet-grabber,.ui-sheet-head')]);
  for (const h of handles) {
    h.style.touchAction = 'none';
    l.on(h, 'pointerdown', (/** @type {PointerEvent} */ e) => down(e, h, false));
    l.on(h, 'pointermove', move);
    l.on(h, 'pointerup', up);
    l.on(h, 'pointercancel', up);
  }
  if (body) {
    l.on(body, 'pointerdown', (/** @type {PointerEvent} */ e) => down(e, body, true));
    l.on(body, 'pointermove', move);
    l.on(body, 'pointerup', up);
    l.on(body, 'pointercancel', up);
    l.on(body, 'scroll', setBodyPan, { passive: true });
    // At full height, scrolled to the top, pulling down drags the sheet. Touch events: only a cancelled touchmove
    // stops the browser taking the pan. Nothing is decided inside the first 6 px (a real finger wobbles).
    /** @type {number | null} */
    let ty = null;
    let tx = 0;
    l.on(sheet, 'touchstart', (/** @type {TouchEvent} */ e) => {
      ty = null;
      if (wide.matches || e.touches.length !== 1 || sheet.getAttribute('data-detent') !== top) return;
      const t = /** @type {Element} */ (e.target);
      if (t.closest('.ui-sheet-grabber,.ui-sheet-head') || noGestureInSheet(t)) return;
      ty = e.touches[0].clientY; tx = e.touches[0].clientX;
    }, { passive: true });
    l.on(sheet, 'touchmove', (/** @type {TouchEvent} */ e) => {
      if (ty === null) return;
      const t = e.touches[0], ddy = t.clientY - ty, ddx = Math.abs(t.clientX - tx);
      if (id !== 'touch') {
        if (body.scrollTop > 0 || ddy <= -6 || (ddx > 6 && ddx > ddy)) { ty = null; return; }   // scrolling or sideways
        if (ddy > 0 && e.cancelable) e.preventDefault();   // hold the pan until it is clearly a pull down
        if (ddy < 6) return;
        y0 = t.clientY; x0 = tx; dy = 0; last = [[e.timeStamp, t.clientY]]; id = 'touch'; from = body; moved = false;
        from0 = top;
        h0 = sheet.getBoundingClientRect().height;
        live = true;
        sheet.classList.add('is-dragging');
      }
      if (e.cancelable) e.preventDefault();
      move({ pointerId: 'touch', clientX: t.clientX, clientY: t.clientY, timeStamp: e.timeStamp });
    }, { passive: false });
    const touchEnd = (/** @type {TouchEvent} */ e) => {
      ty = null;
      if (id !== 'touch') return;
      up({ pointerId: 'touch', timeStamp: e.timeStamp });
      id = null; moved = false;   // a cancelled touchmove means no click to swallow
    };
    l.on(sheet, 'touchend', touchEnd);
    l.on(sheet, 'touchcancel', touchEnd);
  }
  // a new press clears the flag, so a drag with no click after it never eats the next tap
  l.on(sheet, 'pointerdown', () => { moved = false; }, true);
  l.on(sheet, 'click', (/** @type {MouseEvent} */ e) => {
    if (moved) { moved = false; e.preventDefault(); e.stopPropagation(); return; }
    if (grab && ds.length > 1 && e.target === grab) cycle();
  }, true);
  l.on(window, 'resize', () => { if (sheet.open) setDetent(sheet.getAttribute('data-detent') || ds[0]); });
  setDetent(ds[0]);
  return { open, close, setDetent, stop() { l.stop(); close(); } };
}
