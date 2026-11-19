// Art style switch in the top bar (home only): ASCII is / (Mode II), Pixel is /road/ (Mode I).
// The choice is kept in localStorage['art-style']; Base.astro's head script on / reads it.
export type ArtStyle = 'ascii' | 'pixel';
export const ART_KEY = 'art-style';

/** Where a switch link goes, carrying a #stop-<id> deep link across. */
export function artHref(style: ArtStyle, hash: string): string {
  const keep = /^#stop-[a-z]+$/.test(hash) ? hash : '';
  return (style === 'pixel' ? '/road/' : '/?style=ascii') + keep;
}

export function initArtSwitch(): void {
  document.querySelectorAll<HTMLAnchorElement>('a[data-art]').forEach((a) => {
    const style = a.dataset.art as ArtStyle;
    const sync = () => { a.href = artHref(style, location.hash); };
    // Kept current for hover, copy-link and middle-click as well as a plain click.
    for (const ev of ['pointerenter', 'focus', 'click', 'auxclick', 'contextmenu']) a.addEventListener(ev, sync);
    a.addEventListener('click', () => {
      try { localStorage.setItem(ART_KEY, style); } catch { /* private mode: this visit only */ }
    });
    sync();
  });
}
