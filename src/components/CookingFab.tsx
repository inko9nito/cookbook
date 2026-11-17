import { Fab } from 'framework7-react';
import { ChefHat } from 'lucide-react';
import { useCook, useNow } from '../data/cook';
import { useStore } from '../data/store';
import { clock } from '../lib/cook';
import { navIcon } from './ui/icons';

/**
 * Issue #85: while cook mode is tucked away, this bar brings it back as it was, like Instacart's cart bar while you keep
 * shopping. Framework7's extended FAB, one per tab (Framework7 places a FAB inside a view above its tab bar), a flat
 * bright Tomato pill at the bottom centre: the recipe shown in cook mode, then the next timer or how many steps are
 * ticked, and on the right a chef hat with how many recipes are open when there's more than one. A recipe page that's
 * cooking hides it: its own Resume cooking button does the same.
 */
export default function CookingFab() {
  const cook = useCook();
  const { recipes } = useStore();
  const s = cook.session;
  const open = (s?.open ?? []).map((id) => recipes.find((r) => r.id === id)).filter((r) => !!r);
  const away = !!s && !s.expanded && open.length > 0;
  const now = useNow(away && s.timers.length > 0);
  if (!away) return null;
  const shown = open.find((r) => r.id === s.shown) ?? open[0];
  const soonest = [...s.timers].sort((a, b) => a.endsAt - b.endsAt)[0];
  const steps = shown.steps.filter((x) => x.kind !== 'header').length;
  const done = s.ticks[shown.id]?.steps.size ?? 0;
  const detail = soonest ? `Timer ${clock((soonest.endsAt - now) / 1000)}` : steps ? `${done} of ${steps} steps done` : 'Cooking';
  const label = ['Back to cook mode', shown.title, detail, open.length > 1 && `${open.length} recipes`].filter(Boolean).join(', ');
  return (
    <Fab position="center-bottom" className="ck-cooking-fab" onClick={() => cook.expand()} aria-label={label}>
      <span slot="text" className="ck-cooking-fab-body" aria-hidden="true">
        <span className="ck-cooking-fab-lines">
          <span className="ck-cooking-fab-title">{shown.title}</span>
          <span className="ck-cooking-fab-detail">{detail}</span>
        </span>
        <span className="ck-cooking-fab-count">
          <ChefHat {...navIcon} />
          {open.length > 1 && <span>{open.length}</span>}
        </span>
      </span>
    </Fab>
  );
}
