/* global document, localStorage, matchMedia */
// Runs before first paint, as a file of its own (not inline) so a CSP needs no
// 'unsafe-inline'. Resolves the theme (no flash). Kept in sync with src/lib/theme.ts.
try {
  var pref = localStorage.getItem('schools-theme')
  var dark = pref === 'dark' || (pref !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
} catch {
  // Storage blocked (private mode): the app sets the theme once it loads.
}
