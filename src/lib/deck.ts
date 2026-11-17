// Card deck: one card per view in a natively scrolling track, with a numbered pager.

/** Which pager numbers to show: all when the row fits, otherwise five, clamped to the ends. */
export function pagerWindow(count: number, current: number, fits: boolean): { lo: number; hi: number } {
  if (fits || count <= 5) return { lo: 0, hi: count - 1 };
  const lo = Math.max(0, Math.min(current - 2, count - 5));
  return { lo, hi: lo + 4 };
}

export function initDecks(root: ParentNode = document): void {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  root.querySelectorAll<HTMLElement>('[data-deck]').forEach((deck) => {
    const track = deck.querySelector<HTMLElement>('[data-track]');
    const pager = deck.querySelector<HTMLElement>('.pager');
    if (!track || !pager) return;
    const nums = [...pager.querySelectorAll<HTMLButtonElement>('[data-go]')];
    const prev = pager.querySelector<HTMLButtonElement>('[data-prev]')!;
    const next = pager.querySelector<HTMLButtonElement>('[data-next]')!;
    const gapLo = pager.querySelector<HTMLElement>('[data-gap-lo]')!;
    const gapHi = pager.querySelector<HTMLElement>('[data-gap-hi]')!;
    const last = nums.length - 1;
    let fits = true;

    const at = () => Math.max(0, Math.min(last, Math.round(track.scrollLeft / track.clientWidth)));
    // Last requested card while a programmatic scroll is in flight; null once the track settles
    // or the user takes over, so relative moves never read a half-scrolled position.
    let want: number | null = null;
    const base = () => want ?? at();
    const go = (k: number) => {
      const t = Math.max(0, Math.min(last, k));
      want = t;
      track.scrollTo({ left: t * track.clientWidth, behavior: reduce.matches ? 'auto' : 'smooth' });
    };
    const settle = () => { want = null; };
    const measure = () => {
      nums.forEach((b) => { b.hidden = false; });
      gapLo.hidden = gapHi.hidden = true;
      fits = pager.scrollWidth <= pager.clientWidth;
    };
    const sync = () => {
      if (want !== null && Math.abs(track.scrollLeft - want * track.clientWidth) < 2) want = null;
      const k = want ?? at();
      const { lo, hi } = pagerWindow(nums.length, k, fits);
      nums.forEach((b, j) => {
        if (j === k) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
        b.hidden = j < lo || j > hi;
      });
      gapLo.hidden = lo === 0;
      gapHi.hidden = hi === last;
      prev.disabled = k === 0;
      next.disabled = k === last;
    };

    nums.forEach((b, j) => b.addEventListener('click', () => go(j)));
    prev.addEventListener('click', () => go(base() - 1));
    next.addEventListener('click', () => go(base() + 1));
    track.addEventListener('scroll', sync, { passive: true });
    track.addEventListener('scrollend', settle);
    for (const ev of ['pointerdown', 'touchstart', 'wheel']) track.addEventListener(ev, settle, { passive: true });
    track.addEventListener('keydown', (e) => {
      if (e.target !== track || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      go(base() + (e.key === 'ArrowRight' ? 1 : -1));
    });
    addEventListener('resize', () => { measure(); sync(); });
    measure(); sync();
  });
}
