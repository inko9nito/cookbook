import { Fab, Badge } from 'framework7-react';
import { ChefHat, Timer as TimerIcon } from 'lucide-react';
import { useCook, useNow } from '../data/cook';
import { useStore } from '../data/store';
import { clock } from '../lib/cook';
import { inlineIcon } from './ui/icons';

/**
 * Issue #85: while cook mode is tucked away, this pill (Framework7's extended FAB, bottom centre, above the tab bar)
 * brings it back as it was. It says how many recipes are open in cook mode when there's more than one, and counts down
 * the soonest timer.
 */
export default function CookingFab() {
  const cook = useCook();
  const { recipes } = useStore();
  const s = cook.session;
  const count = s ? s.open.filter((id) => recipes.some((r) => r.id === id)).length : 0;
  const away = !!s && !s.expanded && count > 0;
  const now = useNow(away && s.timers.length > 0);
  if (!away) return null;
  const soonest = [...s.timers].sort((a, b) => a.endsAt - b.endsAt)[0];
  const left = soonest && clock((soonest.endsAt - now) / 1000);
  const label = ['Back to cook mode', count > 1 && `${count} recipes`, left && `next timer ${left}`].filter(Boolean).join(', ');
  return (
    <Fab position="center-bottom" className="ck-cooking-fab" onClick={() => cook.expand()} aria-label={label}>
      <ChefHat {...inlineIcon} aria-hidden="true" />
      <span slot="text" className="ck-cooking-fab-text" aria-hidden="true">
        Cooking
        {count > 1 && <Badge className="ck-cooking-count">{count}</Badge>}
        {left && (
          <span className="ck-cooking-timer">
            <TimerIcon {...inlineIcon} />
            {left}
          </span>
        )}
      </span>
    </Fab>
  );
}
