// Pushed screens with edge-swipe back: .ui-screens holds .ui-screen sections; the first shows, [data-push="#id"]
// pushes another over it (it slides in from the side), and .ui-back or [data-pop] goes back. Each push is a history
// entry, so Back (Android's, the browser's) pops too; the edge swipe moves the top screen with the finger and lets
// the one under show. Only the content moves: bars and the tab bar stay put.
// The edge swipe is on only where the phone has no Back gesture of its own: the iPhone home-screen app (in Safari and
// on Android the system's swipe would fire as well). html[data-edge-back="always"] turns it on everywhere (testing).
// It starts within EDGE px of the left edge and only when the finger moves mostly sideways; past a third of the width
// or a flick, it goes back.
import { still, noGesture, listeners, velocity } from './gesture.js';

export const EDGE = 24;

/** @param {Navigator} [nav] @param {(q: string) => boolean} [media] @param {string | null} [attr]  html[data-edge-back] */
export function edgeBackOn(nav = navigator, media = q => typeof matchMedia === 'function' && matchMedia(q).matches,
  attr = document.documentElement.getAttribute('data-edge-back')) {
  if (attr === 'always') return true;
  if (attr === 'off') return false;
  const ios = /iP(hone|ad|od)/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
  const standalone = /** @type {any} */ (nav).standalone === true || media('(display-mode: standalone)');
  return ios && standalone;
}

/** Whether a let-go swipe goes back (pure). @param {number} dx @param {number} v px/ms @param {number} width */
export const swipeGoesBack = (dx, v, width) => dx > width / 3 || (v > 0.5 && dx > 40);

/**
 * @param {HTMLElement} host  .ui-screens
 * @param {{ onChange?: (top: HTMLElement) => void }} [opts]  onChange: after each push or pop (e.g. largeTitle.watch)
 * @returns {{ push: (target: string | HTMLElement, from?: HTMLElement | null) => void, pop: (animate?: boolean) => void, depth: () => number, stop: () => void }}
 */
export function screenStack(host, { onChange } = {}) {
  const l = listeners();
  const all = () => /** @type {HTMLElement[]} */ ([...host.querySelectorAll(':scope > .ui-screen')]);
  /** @type {{ screen: HTMLElement, from: HTMLElement | null }[]} */
  const stack = [{ screen: all()[0], from: null }];
  all().forEach((s, i) => { s.hidden = i > 0; });
  const top = () => stack[stack.length - 1].screen;

  /** @param {HTMLElement} s */
  function focusIn(s) {
    const h = /** @type {HTMLElement | null} */ (s.querySelector('h1,h2,[data-screen-focus]'));
    const t = h ?? s;
    if (!t.hasAttribute('tabindex')) t.tabIndex = -1;
    t.focus({ preventScroll: true });
  }
  /** @param {HTMLElement} el @param {Keyframe[]} frames */
  const slide = (el, frames) => still() ? Promise.resolve()
    : el.animate(frames, { duration: 340, easing: 'cubic-bezier(.2,.8,.2,1)' }).finished.catch(() => {});

  /** @param {string | HTMLElement} target @param {HTMLElement | null} [from] */
  function push(target, from = null) {
    const s = typeof target === 'string' ? /** @type {HTMLElement | null} */ (host.querySelector(target)) : target;
    if (!s || s === top() || stack.some(x => x.screen === s)) return;
    const under = top();
    stack.push({ screen: s, from });
    try { history.pushState({ ...(history.state || {}), uiScreens: stack.length - 1 }, ''); } catch { /* none */ }
    s.hidden = false;
    s.classList.add('is-top');
    under.classList.remove('is-top');
    scrollTo(0, 0);
    void slide(s, [{ transform: 'translateX(100%)' }, { transform: 'none' }]).then(() => { if (top() !== under) under.hidden = true; });
    focusIn(s);
    onChange?.(s);
  }
  // one step back, shown (the history entry is already gone: popstate, or the caller went back)
  async function popShown(animate = true) {
    if (stack.length < 2) return;
    const gone = /** @type {{ screen: HTMLElement, from: HTMLElement | null }} */ (stack.pop());
    const s = top();
    s.hidden = false;
    s.classList.add('is-top');
    gone.screen.classList.remove('is-top');
    if (animate) await slide(gone.screen, [{ transform: 'none' }, { transform: 'translateX(100%)' }]);
    gone.screen.hidden = true;
    gone.screen.style.transform = '';
    if (gone.from && s.contains(gone.from)) gone.from.focus({ preventScroll: true }); else focusIn(s);
    onChange?.(s);
  }
  let skipAnim = false;
  // animate false: the edge swipe has already moved the screen away
  function pop(animate = true) {
    if (stack.length < 2) return;
    if (history.state?.uiScreens === stack.length - 1) { skipAnim = !animate; history.back(); }
    else void popShown(animate);
  }
  l.on(window, 'popstate', () => {
    const want = typeof history.state?.uiScreens === 'number' ? history.state.uiScreens : 0;
    const anim = !skipAnim;
    skipAnim = false;
    while (stack.length - 1 > want) void popShown(anim && stack.length - 2 === want);
  });
  l.on(host, 'click', (/** @type {MouseEvent} */ e) => {
    const t = /** @type {Element} */ (e.target);
    const b = /** @type {HTMLElement | null} */ (t.closest('[data-push],.ui-back,[data-pop]'));
    if (!b || !host.contains(b)) return;
    e.preventDefault();
    const to = b.getAttribute('data-push');
    if (to) push(to, b); else pop(true);
  });

  // the edge swipe
  if (edgeBackOn()) {
    /** @type {number | null} */
    let x0 = null;
    let y0 = 0, dx = 0, going = false;
    /** @type {[number, number][]} */
    let hist = [];
    /** @type {HTMLElement | null} */
    let moving = null;
    /** @type {HTMLElement | null} */
    let shade = null;
    l.on(document, 'touchstart', (/** @type {TouchEvent} */ e) => {
      const t = e.touches[0];
      x0 = null;
      const on = /** @type {Node} */ (e.target);
      // the screen's edge: on the screens, or on the page beside them when they are narrower than the window
      if (stack.length < 2 || going || e.touches.length > 1 || t.clientX > EDGE) return;
      if (!host.contains(on) && on !== document.body && on !== document.documentElement) return;
      if (noGesture(e.target) || document.documentElement.classList.contains('ui-menu-open')) return;
      x0 = t.clientX; y0 = t.clientY; dx = 0; hist = [[e.timeStamp, t.clientX]]; moving = null;
    }, { passive: true });
    l.on(document, 'touchmove', (/** @type {TouchEvent} */ e) => {
      if (x0 === null) return;
      const t = e.touches[0], mx = t.clientX - x0, my = t.clientY - y0;
      if (!moving) {
        if (Math.abs(my) > Math.abs(mx) && Math.abs(my) > 8) { x0 = null; return; }   // vertical: let it scroll
        if (mx < 8) return;
        moving = top();
        const under = stack[stack.length - 2].screen;
        under.hidden = false;
        if (!shade) { shade = document.createElement('div'); shade.className = 'ui-swipe-shade'; }
        moving.before(shade);
        host.classList.add('is-swiping');
      }
      if (e.cancelable) e.preventDefault();
      dx = Math.max(0, mx);
      hist.push([e.timeStamp, t.clientX]);
      if (hist.length > 5) hist.shift();
      moving.style.transform = `translateX(${dx}px)`;
      /** @type {HTMLElement} */ (shade).style.opacity = String(1 - dx / innerWidth);
    }, { passive: false });
    const end = async () => {
      if (x0 === null) return;
      x0 = null;
      if (!moving) return;
      const m = moving;
      moving = null;
      const done = swipeGoesBack(dx, velocity(hist), innerWidth);
      going = true;
      host.classList.remove('is-swiping');
      shade?.remove();
      if (done) {
        await slide(m, [{ transform: `translateX(${dx}px)` }, { transform: 'translateX(100%)' }]);
        m.hidden = true;
        m.style.transform = '';
        pop(false);
      } else {
        await slide(m, [{ transform: `translateX(${dx}px)` }, { transform: 'none' }]);
        m.style.transform = '';
        stack[stack.length - 2].screen.hidden = true;
      }
      going = false;
    };
    l.on(document, 'touchend', end, { passive: true });
    l.on(document, 'touchcancel', end, { passive: true });
  }
  top().classList.add('is-top');
  return { push, pop, depth: () => stack.length - 1, stop: l.stop };
}
