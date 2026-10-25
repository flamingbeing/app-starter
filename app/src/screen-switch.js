// The screen switch: one screen per phase of the app (cloud.js State); showing one hides the others.

/**
 * @param {Record<import('./cloud.js').Phase, import('./dom.js').Screen>} screens
 * @returns {(s: import('./cloud.js').State) => void} show the screen for s.phase
 */
export function screenSwitch(screens) {
  return s => {
    for (const [phase, screen] of Object.entries(screens)) if (phase !== s.phase) screen.hide();
    screens[s.phase].show(s);
  };
}
