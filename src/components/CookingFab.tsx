import { Fab } from 'framework7-react';
import { CookingPot } from 'lucide-react';
import { useCook } from '../data/cook';
import { useStore } from '../data/store';
import { navIcon } from './ui/icons';

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
  if (!s || s.expanded || !count) return null;
  return (
    <Fab
      position="center-bottom"
      className="ck-cooking-fab"
      onClick={() => cook.expand()}
      aria-label={`Back to cook mode, ${count} ${count === 1 ? 'recipe' : 'recipes'}`}
    >
      <span slot="text" className="ck-cooking-fab-body" aria-hidden="true">
        <CookingPot {...navIcon} />
        <span>Cooking</span>
        <span className="ck-cooking-fab-dot">•</span>
        <span className="ck-cooking-fab-count">{count}</span>
      </span>
    </Fab>
  );
}
