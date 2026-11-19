import { Fab } from 'framework7-react';
import { useCook } from '../data/cook';
import { useStore } from '../data/store';

/**
 * Issue #85: while cook mode is tucked away, this small pill brings it back as it was (like Uber Eats' "View cart • 1"
 * while you keep browsing). Framework7's extended FAB, flat dark at the bottom centre, just above the tab bar (Framework7
 * places it there): a cooking pot, "Cooking", a faded dot and how many recipes are open. Each page in the tabs has its
 * own, so it slides with its page: pushing a recipe or the editor (which don't have one; a recipe page's footer has its
 * own way back) slides it away with the list, and back brings it back the same way. Pages give it `slot="fixed"`, so
 * Framework7's Page puts it outside the scrolling content.
 */
export default function CookingFab(_: { slot?: 'fixed' }) {
  const cook = useCook();
  const { recipes } = useStore();
  const s = cook.session;
  const count = s ? s.open.filter((id) => recipes.some((r) => r.id === id)).length : 0;
  // there the whole time cook mode is going, open or not: open, cook mode covers it, so tucking cook mode away (the
  // minimize button, or swiping it down) uncovers it where it already is, instead of it popping up afterwards
  if (!s || !count) return null;
  return (
    <Fab
      position="center-bottom"
      className="ck-cooking-fab"
      onClick={() => cook.expand()}
      aria-label={`Back to cook mode, ${count} ${count === 1 ? 'recipe' : 'recipes'}`}
    >
      <span slot="text" className="ck-cooking-fab-body" aria-hidden="true">
        <BoilingPot />
        <span>Cooking</span>
        <span className="ck-cooking-fab-dot">•</span>
        <span className="ck-cooking-fab-count">{count}</span>
      </span>
    </Fab>
  );
}

/**
 * Issue #124: Lucide's cooking pot, split into the pot and its lid. At rest it's Lucide's icon, the lid ajar (the outer
 * layer, `.ck-pill-pot-open`, lifts and tips the loader's level lid back to where Lucide draws it). Now and then the lid
 * drops shut onto the rim, plays the launch loader's boil-over once (index.html) and pops open again (CSS keyframes in
 * cookbook.css, `.ck-pill-pot`; still and ajar with Reduce Motion). 22px, stroke 2, like the nav icons; the pot and the
 * lid's layers sit in one grid cell.
 */
function BoilingPot() {
  const svg = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  return (
    <span className="ck-pill-pot">
      <svg {...svg} className="ck-pill-pot-body"><path d="M2 12h20" /><path d="M20 12v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8" /></svg>
      <span className="ck-pill-pot-open">
        <span className="ck-pill-pot-lid">
          <span>
            <svg {...svg}>
              <g transform="translate(0 3.4) rotate(14.04 12 6)"><path d="m4 8 16-4" /><path d="m8.86 6.78-.45-1.81a2 2 0 0 1 1.45-2.43l1.94-.48a2 2 0 0 1 2.43 1.46l.45 1.8" /></g>
            </svg>
          </span>
        </span>
      </span>
    </span>
  );
}
