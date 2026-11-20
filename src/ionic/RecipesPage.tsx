import { useMemo, useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonButtons, IonContent, IonSearchbar, IonChip, IonSkeletonText,
  useIonActionSheet, useIonRouter,
} from '@ionic/react';
import { ArrowUpDown, Plus } from 'lucide-react';
import { useStore } from '../data/store';
import { SORT_LABELS, sortRecipes, type SortKey } from '../lib/recipe';
import { say } from '../components/ui/toast';
import { BarButton, CookingPill, RecipeCard, openMenu } from './ui';

/** Recipes: the title, + and sort in the bar, the search field and the label chips under it, then the grid. */
export default function RecipesPage() {
  const { recipes, loading, sort, setSort, settings, setFilter } = useStore();
  const filterTags = settings.filterTags;
  const [query, setQuery] = useState('');
  const [sheet] = useIonActionSheet();
  const router = useIonRouter();
  const tags = useMemo(() => [...new Set(recipes.flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b)), [recipes]);
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = sortRecipes(recipes, sort).filter(
    (r) => (!filterTags.length || filterTags.some((t) => r.tags.includes(t))) && words.every((w) => r.title.toLowerCase().includes(w)),
  );
  const toggleTag = (t: string) => setFilter(filterTags.includes(t) ? filterTags.filter((x) => x !== t) : [...filterTags, t]);

  // + : Ionic's action sheet, the same three ways in as the app
  const add = () =>
    sheet({
      header: 'New recipe',
      buttons: [
        { text: 'From photos or screenshots', handler: () => say('Reading photos isn’t in the trial') },
        { text: 'From a link', handler: () => say('Reading links isn’t in the trial') },
        { text: 'Type it in', handler: () => router.push('/recipes/recipe/new/edit', 'forward') },
        { text: 'Cancel', role: 'cancel' },
      ],
    });

  return (
    <IonPage className="ck-ion-anchor">
      <IonHeader className="ck-ion-header">
        <IonToolbar>
          <IonTitle className="ck-ion-title">Recipes</IonTitle>
          <IonButtons slot="end">
            <BarButton label="New recipe" icon={Plus} primary onClick={add} />
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
          </IonButtons>
        </IonToolbar>
        <IonToolbar className="ck-ion-subbar">
          <div className="ck-ion-subbar-stack">
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
          </div>
        </IonToolbar>
      </IonHeader>
      <IonContent>
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
      </IonContent>
    </IonPage>
  );
}
