// Mode II background clips: two stacked <video>s; the one on show has .on. A change loads the
// other one (its poster is the clip's first frame, so it can fade in at once) and cross-fades.
// Reduced motion: posters only, nothing plays. A hidden tab pauses.
import { CLIP_IDS, clipUrl, posterUrl, type ClipId } from '../../lib/mode2';

export interface Clips {
  show(id: ClipId): void;
  warm(id: ClipId): void;
}

const isClip = (s: string | undefined): s is ClipId => !!s && (CLIP_IDS as readonly string[]).includes(s);

export function initClips(): Clips | null {
  const bg = document.querySelector<HTMLElement>('[data-m2-bg]');
  const vids = bg ? [...bg.querySelectorAll<HTMLVideoElement>('video')] : [];
  if (!bg || vids.length !== 2) return null;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const portrait = matchMedia('(orientation: portrait)');
  let active = vids.find((v) => v.classList.contains('on')) ?? vids[0];
  const other = () => (active === vids[0] ? vids[1] : vids[0]);
  const motion = () => !reduce.matches;

  const play = (v: HTMLVideoElement) => {
    if (!motion() || document.hidden || !v.getAttribute('src') && !v.querySelector('source')) return;
    v.muted = true;
    v.play()?.catch(() => { /* autoplay refused or the load was replaced: the poster stays */ });
  };

  /** Points a video at a clip (poster always; the file only when motion is welcome). */
  const load = (v: HTMLVideoElement, id: ClipId, force = false) => {
    if (v.dataset.clip === id && !force) {
      if (motion() && !v.getAttribute('src') && !v.querySelector('source')) v.src = clipUrl(id, portrait.matches);
      return;
    }
    v.dataset.clip = id;
    v.poster = posterUrl(id);
    v.querySelectorAll('source').forEach((s) => s.remove());
    if (motion()) {
      v.preload = 'auto';
      v.src = clipUrl(id, portrait.matches);
    } else {
      v.removeAttribute('src');
      v.load();
    }
  };

  let fade = 0;
  const clips: Clips = {
    show(id) {
      if (!isClip(id) || active.dataset.clip === id) return;
      const prev = active;
      const next = other();
      load(next, id);
      next.classList.add('on');
      prev.classList.remove('on');
      active = next;
      bg.dataset.clip = id;
      bg.style.setProperty('--poster', `url(${posterUrl(id)})`);
      play(next);
      clearTimeout(fade);
      fade = window.setTimeout(() => prev.pause(), motion() ? 700 : 0);
    },
    warm(id) {
      if (!isClip(id) || !motion() || active.dataset.clip === id) return;
      const standby = other();
      if (standby.dataset.clip !== id) load(standby, id);
    },
  };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) vids.forEach((v) => v.pause());
    else play(active);
  });
  reduce.addEventListener('change', () => {
    if (!motion()) vids.forEach((v) => v.pause());
    else { load(active, active.dataset.clip as ClipId); play(active); }
  });
  portrait.addEventListener('change', () => {
    if (!motion()) return;
    load(active, active.dataset.clip as ClipId, true);
    play(active);
  });
  play(active);
  return clips;
}
