import { useMemo, useState } from 'react';
import {
  IonSearchbar, IonChip, IonSkeletonText, useIonRouter,
} from '@ionic/react';
import { ArrowUpDown, Camera, Link2, PenLine, Plus } from 'lucide-react';
import { useAccount, useStore } from '../data/store';
import { SORT_LABELS, sortRecipes, type SortKey } from '../lib/recipe';
import { say } from './toast';
import { TabPage } from './scroll';
import { BarButton, CookingPill, RecipeCard, openMenu } from './ui';

/** Recipes: the title, + and sort in the bar, the search field and the label chips under it, then the grid. */
export default function RecipesPage() {
  const { recipes, loading, sort, setSort, settings, setFilter } = useStore();
  const filterTags = settings.filterTags;
  const [query, setQuery] = useState('');
  const router = useIonRouter();
  const tags = useMemo(() => [...new Set(recipes.flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b)), [recipes]);
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = sortRecipes(recipes, sort).filter(
    (r) => (!filterTags.length || filterTags.some((t) => r.tags.includes(t))) && words.every((w) => r.title.toLowerCase().includes(w)),
  );
  const toggleTag = (t: string) => setFilter(filterTags.includes(t) ? filterTags.filter((x) => x !== t) : [...filterTags, t]);

  // + : the app's pull-down menu (#39), the same three ways in. Reading recipes uses Claude, which only the admin's
  // cookbook has (#146): anyone else's + goes straight to typing one in
  const { admin } = useAccount();
  const typeItIn = () => router.push('/recipes/recipe/new/edit', 'forward');
  const add = (el: Element) =>
    admin
      ? openMenu(el, [
          [
            { label: 'From photos or screenshots', icon: Camera, onClick: () => say('Reading photos isn’t in v2 yet') },
            { label: 'From a link', icon: Link2, onClick: () => say('Reading links isn’t in v2 yet') },
            { label: 'Type it in', icon: PenLine, onClick: typeItIn },
          ],
        ])
      : typeItIn();

  return (
    <TabPage tab="recipes" title="Recipes"
      buttons={
        <>
          <BarButton label="New recipe" icon={Plus} primary onClick={(e) => add(e.currentTarget)} />
            <BarButton
              label="Sort recipes"
              icon={ArrowUpDown}
              onClick={(e) =>
                openMenu(
                  e.currentTarget,
                  [(['newest', 'oldest', 'az', 'cooked'] as SortKey[]).map((k) => ({ label: SORT_LABELS[k], checked: sort === k, onClick: () => setSort(k) }))],
                )
              }
            />
        </>
      }
      extra={
        <>
          <IonSearchbar value={query} onIonInput={(e) => setQuery(e.detail.value ?? '')} placeholder="Search recipes" />
          <div className="ck-ion-chips">
            <IonChip className={filterTags.length ? '' : 'ck-ion-chip-on'} onClick={() => setFilter([])}>
              All
            </IonChip>
            {tags.map((t) => (
              <IonChip key={t} className={filterTags.includes(t) ? 'ck-ion-chip-on' : ''} onClick={() => toggleTag(t)}>
                {t[0].toUpperCase() + t.slice(1)}
              </IonChip>
            ))}
          </div>
        </>
      }
    >
        <p className="ck-note ck-ion-count">{loading ? ' ' : `${shown.length} ${shown.length === 1 ? 'recipe' : 'recipes'} · ${SORT_LABELS[sort]}`}</p>
        <div className="ck-ion-grid">
          {loading
            ? Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="ck-card">
                  <IonSkeletonText animated className="ck-card-photo" />
                  <IonSkeletonText animated style={{ width: '80%', height: 14, marginTop: 10 }} />
                  <IonSkeletonText animated style={{ width: '40%', height: 12 }} />
                </div>
              ))
            : shown.map((r) => <RecipeCard key={r.id} recipe={r} href={`/recipes/recipe/${r.id}`} />)}
        </div>
        <div className="ck-ion-toast-anchor" />
        <CookingPill />
      
    
    </TabPage>
  );
}
