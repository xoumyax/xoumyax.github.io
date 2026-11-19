// Mode II journey tabs (ARIA tabs, automatic activation): click, arrow keys, Home/End. The
// selected stop goes into the hash (#stop-<id>, replaceState) and picks the background clip.
// The inline script in Console.astro has already shown the deep-linked panel before paint.
import { STOP_CLIP, stopFromHash, tabKeyTarget, type ClipId } from '../../lib/mode2';
import type { Clips } from './clips';

type StopId = keyof typeof STOP_CLIP;

export function initTabs(clips: Clips | null, onShow: (panel: HTMLElement) => void): void {
  const root = document.querySelector<HTMLElement>('[data-console]');
  const list = root?.querySelector<HTMLElement>('[role="tablist"]');
  if (!root || !list) return;
  const tabs = [...list.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const panels = tabs.map((t) => document.getElementById(t.getAttribute('aria-controls')!)!);
  const ids = tabs.map((t) => t.dataset.tab as StopId);
  panels.forEach((p, i) => {
    p.setAttribute('role', 'tabpanel');
    p.setAttribute('aria-labelledby', tabs[i].id);
  });

  let at = Math.max(0, ids.indexOf(root.dataset.active as StopId));
  const select = (i: number, how: { focus?: boolean; hash?: boolean; clip?: boolean } = {}) => {
    at = i;
    tabs.forEach((t, j) => {
      t.setAttribute('aria-selected', String(j === i));
      t.tabIndex = j === i ? 0 : -1;
    });
    panels.forEach((p, j) => { p.hidden = j !== i; });
    root.dataset.active = ids[i];
    if (how.focus) tabs[i].focus();
    // Keep the chosen chip in view in the phone's scrolling row (the row only, never the page).
    const t = tabs[i];
    if (list.scrollWidth > list.clientWidth) {
      const left = t.offsetLeft - (list.clientWidth - t.offsetWidth) / 2;
      list.scrollTo({ left, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
    if (how.hash) history.replaceState(history.state, '', `#stop-${ids[i]}`);
    if (how.clip !== false) clips?.show(STOP_CLIP[ids[i]] as ClipId);
    onShow(panels[i]);
  };

  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(i, { hash: true }));
    const warm = () => clips?.warm(STOP_CLIP[ids[i]] as ClipId);
    t.addEventListener('pointerenter', warm);
    t.addEventListener('focus', warm);
  });
  list.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const k = tabKeyTarget(e.key, at, tabs.length);
    if (k === null) return;
    e.preventDefault();
    select(k, { focus: true, hash: true });
  });
  addEventListener('hashchange', () => {
    const id = stopFromHash(location.hash, ids);
    if (id) select(ids.indexOf(id));
  });

  // A deep link already shows its stop (and the inline backdrop script its clip); without one
  // the landing clip stays until a tab is chosen.
  select(at, { clip: false });
}
