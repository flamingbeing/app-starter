// What every gallery page reads from its address: ?look=a|b|c and ?density=comfortable|regular|compact show that look
// or density on this page without keeping it (links and screenshots); ?edge=always|off forces the edge swipe on or
// off; ?guard=again forgets the glass guard's verdict so it runs again. Applies the theme, then returns the choice shown.
import { applyTheme, previewTheme, themeChoice, keepGlassVerdict } from '../theme/index.js';

export function galleryPreview() {
  const params = new URLSearchParams(location.search);
  if (params.get('guard') === 'again') keepGlassVerdict(null);
  applyTheme();
  /** @type {Record<string, string>} */
  const preview = {};
  for (const k of ['look', 'density']) { const v = params.get(k); if (v) preview[k] = v; }
  const edge = params.get('edge');
  if (edge === 'always' || edge === 'off') document.documentElement.dataset.edgeBack = edge;
  return Object.keys(preview).length ? previewTheme(preview) : themeChoice();
}
