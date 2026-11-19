// Mode II (the ASCII home): background clips, journey tabs, sliding cards, the scratch card.
import { initClips } from './clips';
import { initTabs } from './tabs';
import { initSlides } from './slides';
import { initScratch } from './scratch';

export function initMode2(): void {
  const clips = initClips();
  const slides = initSlides();
  const scratch = initScratch();
  initTabs(clips, (panel) => {
    for (const [el, s] of slides) if (panel.contains(el)) s.refresh();
    scratch.forEach((s) => s.refresh());
  });
}
