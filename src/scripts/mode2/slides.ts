// Sliding cards (Slides.astro): Previous / Next move one card along the snapping track and the
// read-out says which cards are in view. Everything is measured when it is needed, because a
// track may sit in a hidden tab panel or a closed dropdown (0 wide) when the page loads.
import { slidesLabel } from '../../lib/mode2';

export interface SlidesTrack { refresh(): void }

export function initSlides(root: ParentNode = document): Map<HTMLElement, SlidesTrack> {
  const out = new Map<HTMLElement, SlidesTrack>();
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  root.querySelectorAll<HTMLElement>('[data-slides]').forEach((el) => {
    const track = el.querySelector<HTMLElement>('[data-track]')!;
    const ctl = el.querySelector<HTMLElement>('[data-ctl]');
    const cards = [...track.children] as HTMLElement[];
    if (!ctl || cards.length < 2) return;
    const prev = ctl.querySelector<HTMLButtonElement>('[data-prev]')!;
    const next = ctl.querySelector<HTMLButtonElement>('[data-next]')!;
    const pos = ctl.querySelector<HTMLElement>('[data-pos]')!;

    /** Distance from one card's start to the next. */
    const step = () => (cards[1].offsetLeft - cards[0].offsetLeft) || cards[0].offsetWidth || 1;
    const maxScroll = () => Math.max(0, track.scrollWidth - track.clientWidth);
    const inView = () => Math.max(1, Math.floor((track.clientWidth + 2) / step()));
    const last = () => Math.max(0, cards.length - inView());
    const at = () => Math.min(last(), Math.round(track.scrollLeft / step()));
    // The card a smooth scroll is heading for, so quick presses each move one card.
    let want: number | null = null;

    const sync = () => {
      if (!track.clientWidth) return;
      const fits = maxScroll() <= 1;
      ctl.hidden = fits;
      const end = want !== null ? want >= last() : track.scrollLeft >= maxScroll() - 1;
      // At the end the last card is in full view even when the snap stops short of its start.
      const k = want ?? (end ? last() : at());
      // aria-disabled, not disabled: a disabled button drops focus to <body>.
      prev.setAttribute('aria-disabled', String(k <= 0));
      next.setAttribute('aria-disabled', String(end));
      const text = slidesLabel(k, inView(), cards.length);
      if (pos.textContent !== text) pos.textContent = text;
    };
    const go = (k: number) => {
      const t = Math.max(0, Math.min(last(), k));
      want = t;
      track.scrollTo({ left: Math.min(maxScroll(), t * step()), behavior: reduce.matches ? 'auto' : 'smooth' });
      sync();
    };
    const settle = () => { want = null; sync(); };
    let timer = 0;
    prev.addEventListener('click', () => go((want ?? at()) - 1));
    next.addEventListener('click', () => go((want ?? at()) + 1));
    track.addEventListener('scroll', () => { if (want === null) sync(); clearTimeout(timer); timer = window.setTimeout(settle, 160); }, { passive: true });
    track.addEventListener('scrollend', settle);
    for (const ev of ['pointerdown', 'touchstart', 'wheel']) track.addEventListener(ev, () => { want = null; }, { passive: true });
    addEventListener('resize', settle);
    el.closest('details')?.addEventListener('toggle', settle);
    sync();
    out.set(el, { refresh: settle });
  });
  return out;
}
