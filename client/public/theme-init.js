/* global localStorage, matchMedia, document */
// Apply the saved or system theme before first paint to avoid a flash.
// Kept as a file (not an inline script) so the Content-Security-Policy can forbid inline scripts.
(function () {
  try {
    var saved = localStorage.getItem('theme');
    var dark = saved ? saved === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    if (dark) document.documentElement.classList.add('dark');
  } catch {
    // Storage can be unavailable (private mode); fall back to the light theme.
  }
})();
