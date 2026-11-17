import { Fab } from 'framework7-react';
import { ChefHat } from 'lucide-react';
import { useCook } from '../data/cook';
import { useStore } from '../data/store';
import { navIcon } from './ui/icons';

/**
 * Issue #85: while cook mode is tucked away, this small pill brings it back as it was (like Uber Eats' "View cart • 1"
 * while you keep browsing). Framework7's extended FAB, one per tab (Framework7 places a FAB inside a view above its tab
 * bar), flat dark at the bottom centre, just above the tab bar: a chef hat, "Cooking", a faded dot and how many recipes
 * are open. Recipe pages and the editor don't show it (a recipe page's footer has its own way back).
 */
export default function CookingFab() {
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
        <ChefHat {...navIcon} />
        <span>Cooking</span>
        <span className="ck-cooking-fab-dot">•</span>
        <span className="ck-cooking-fab-count">{count}</span>
      </span>
    </Fab>
  );
}
