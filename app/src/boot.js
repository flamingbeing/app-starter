// Runs first, before anything else on the page. Installable, never prompted: the browser's own install banner is
// cancelled (the manifest, icons and service worker stay, so "Add to Home Screen" from the menu still works).
addEventListener('beforeinstallprompt', e => e.preventDefault());
