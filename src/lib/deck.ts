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
    const go = (k: number) => track.scrollTo({
      left: Math.max(0, Math.min(last, k)) * track.clientWidth,
      behavior: reduce.matches ? 'auto' : 'smooth',
    });
    const measure = () => {
      nums.forEach((b) => { b.hidden = false; });
      gapLo.hidden = gapHi.hidden = true;
      fits = pager.scrollWidth <= pager.clientWidth;
    };
    const sync = () => {
      const k = at();
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
    prev.addEventListener('click', () => go(at() - 1));
    next.addEventListener('click', () => go(at() + 1));
    track.addEventListener('scroll', sync, { passive: true });
    track.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      go(at() + (e.key === 'ArrowRight' ? 1 : -1));
    });
    addEventListener('resize', () => { measure(); sync(); });
    measure(); sync();
  });
}
