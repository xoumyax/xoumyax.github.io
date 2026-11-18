// Dark / light mode. html[data-mode] is set before first paint by the inline script in Base.astro
// when a choice is stored; with none, CSS follows the device (prefers-color-scheme).
type Mode = 'dark' | 'light';

const dark = () => window.matchMedia('(prefers-color-scheme: dark)');

function current(): Mode {
  const set = document.documentElement.getAttribute('data-mode');
  if (set === 'dark' || set === 'light') return set;
  return dark().matches ? 'dark' : 'light';
}

function sync(button: HTMLElement): void {
  const mode = current();
  button.setAttribute('aria-pressed', String(mode === 'dark'));
  // An explicit choice overrides the device, so the browser-chrome colour must follow it too.
  const explicit = document.documentElement.hasAttribute('data-mode');
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    if (explicit) { meta.removeAttribute('media'); meta.content = meta.dataset[mode] ?? meta.content; }
  });
}

export function initModeToggle(): void {
  const button = document.getElementById('mode-toggle');
  if (!button) return;
  button.hidden = false;
  sync(button);
  button.addEventListener('click', () => {
    const next: Mode = current() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-mode', next);
    try { localStorage.setItem('mode', next); } catch { /* private mode: the choice lasts for this page only */ }
    sync(button);
  });
  dark().addEventListener('change', () => sync(button));
}
