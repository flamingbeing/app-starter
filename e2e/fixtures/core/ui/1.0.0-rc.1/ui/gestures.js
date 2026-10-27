// Starts every gesture part whose markup is on the page, and only those (a page without the markup is not changed):
//   large title     .ui-bar + .ui-large-title               the bar collapses when the title scrolls under it
//   tab bar         nav.ui-tabbar[data-minimise]            shrinks to the current tab while scrolling down
//   hold menu       [data-hold-menu="#template-id"]         touch and hold, right-click, context-menu key, Shift+F10
//   sheets          dialog.ui-sheet[data-detents]           drag between heights, or down to close
//   pushed screens  .ui-screens > .ui-screen                [data-push] / .ui-back, Back, edge swipe (screens.js); the
//                   bar's .ui-bar-title follows the top screen's large title, and .ui-screens sends "ui-screen" (detail.top)
//   select mode     .ui-list[data-select]                   tick rows, drag down the ticks, bottom action bar
// Styles: ui/gestures.css, loaded with <link> after ui.css.
import { largeTitle } from './large-title.js';
import { shrinkingTabBar } from './tab-bar.js';
import { holdMenus } from './hold-menu.js';
import { detentSheet } from './detent-sheet.js';
import { screenStack } from './screens.js';
import { selectMode } from './select-mode.js';

/**
 * @param {ParentNode} [root]
 * @returns {{ title: ReturnType<typeof largeTitle> | null, menus: ReturnType<typeof holdMenus> | null,
 *   sheets: Map<string, ReturnType<typeof detentSheet>>, screens: ReturnType<typeof screenStack> | null,
 *   selects: Map<string, ReturnType<typeof selectMode>>, stop: () => void }}
 */
export function startGestures(root = document) {
  /** @type {(() => void)[]} */
  const stops = [];
  // iOS shows :active press states only when the page listens for touches
  const noop = () => {};
  document.addEventListener('touchstart', noop, { passive: true });
  stops.push(() => document.removeEventListener('touchstart', noop));

  const bar = /** @type {HTMLElement | null} */ (root.querySelector('.ui-bar'));
  const title = bar && root.querySelector('.ui-large-title') ? largeTitle(bar) : null;
  if (title) stops.push(title.stop);
  const tabs = /** @type {HTMLElement | null} */ (root.querySelector('nav.ui-tabbar[data-minimise]'));
  if (tabs) stops.push(shrinkingTabBar(tabs));
  const menus = root.querySelector('[data-hold-menu]') ? holdMenus(root) : null;
  if (menus) stops.push(menus.stop);
  const sheets = new Map();
  for (const d of /** @type {NodeListOf<HTMLDialogElement>} */ (root.querySelectorAll('dialog.ui-sheet[data-detents]'))) {
    const s = detentSheet(d);
    sheets.set(d.id, s);
    stops.push(s.stop);
  }
  const host = /** @type {HTMLElement | null} */ (root.querySelector('.ui-screens'));
  const screens = host ? screenStack(host, {
    onChange: top => {
      const big = /** @type {HTMLElement | null} */ (top.querySelector('.ui-large-title'));
      const small = bar?.querySelector('.ui-bar-title');
      if (small && big) small.textContent = big.textContent;
      title?.watch(big);
      host.dispatchEvent(new CustomEvent('ui-screen', { bubbles: true, detail: { top } }));
    },
  }) : null;
  if (screens) stops.push(screens.stop);
  const selects = new Map();
  for (const list of /** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll('.ui-list[data-select]'))) {
    const s = selectMode(list);
    selects.set(list.id, s);
    stops.push(s.stop);
  }
  return { title, menus, sheets, screens, selects, stop: () => { while (stops.length) /** @type {() => void} */ (stops.pop())(); } };
}
