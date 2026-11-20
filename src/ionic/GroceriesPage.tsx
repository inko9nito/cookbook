import { useState } from 'react';
import {
  IonList, IonItem, IonCheckbox, IonSearchbar, IonSegment, IonSegmentButton, IonLabel, IonItemSliding, IonItemOptions, IonItemOption, useIonViewWillLeave,
} from '@ionic/react';
import { ArrowUpRight, ChefHat, ChevronDown, Ellipsis, ListChecks, PenLine, Plus, Share, Store, Trash2 } from 'lucide-react';
import { useGroceries, useNamed, useStore } from '../data/store';
import { AISLE_NAMES, byAisle, byRecipe, instacartSearch, itemNames, linesOf, listText, nameKey, type GroceryItem, type Line } from '../lib/groceries';
import { coverPhoto, newId, type Recipe } from '../lib/recipe';
import { friendly } from '../lib/ingredients';
import { photoStyle } from './photo';
import { say, tell } from './toast';
import { TabPage } from './scroll';
import { BarButton, CookingPill, openMenu, usePrompt } from './ui';
import { AddFromRecipeModal } from './modals';

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * The grocery list on Ionic: By aisle / By recipe (Ionic's segment), a checkbox per line (a ticked row stays where it is
 * until you leave the tab, then gathers in Got it: Ionic's page lifecycle), swipe a row left to remove it, ↗ searches
 * Instacart at the store picked in the store menu. + adds a recipe (a card with its own pages) or a typed item.
 */
export default function GroceriesPage() {
  const { recipes, settings, changeSettings, loading: recipesLoading } = useStore();
  const { items, changeGroceries, loading: listLoading } = useGroceries();
  const prompt = usePrompt();
  const [query, setQuery] = useState('');
  const [placed, setPlaced] = useState<Map<string, boolean>>(new Map());
  const [adding, setAdding] = useState(false);
  const loading = recipesLoading || listLoading;
  const { names } = useNamed(itemNames(items, recipes), !loading);
  useIonViewWillLeave(() => setPlaced(new Map()));

  const real = new Map(items.map((g) => [g.id, g]));
  const lines = linesOf(items.map((g) => (placed.has(g.id) ? { ...g, checked: placed.get(g.id)! } : g)), recipes, settings.groceryAisles, names);
  const words = nameKey(query);
  const matches = (l: Line) => !words || ` ${nameKey(l.name)} `.includes(` ${words}`) || l.recipes.some((r) => r.title.toLowerCase().includes(query.trim().toLowerCase()));
  const toGet = lines.filter((l) => !l.checked && matches(l));
  const got = lines.filter((l) => l.checked && matches(l));
  const stores = settings.groceryStores;
  const store = stores.find((s) => s.slug === settings.groceryStore) ?? stores[0];
  const view = settings.groceryView;

  const saved = (line: Line) => line.parts.map((p) => real.get(p.item.id) ?? p.item);
  const tick = (line: Line, checked: boolean) => {
    setPlaced((m) => {
      const next = new Map(m);
      for (const g of saved(line)) if (!next.has(g.id)) next.set(g.id, g.checked);
      return next;
    });
    changeGroceries(saved(line).map((g) => ({ ...g, checked })));
  };
  const takeOff = (gone: GroceryItem[], text: string) => {
    if (!gone.length) return;
    changeGroceries([], gone.map((g) => g.id));
    say(text, { undo: () => changeGroceries(gone) });
  };
  const ticked = (line: Line) => line.parts.every((p) => real.get(p.item.id)?.checked);

  const add = (el: Element) =>
    openMenu(el, [
      [
        { label: 'Add a recipe', icon: ChefHat, onClick: () => setAdding(true) },
        {
          label: 'Type an item',
          icon: PenLine,
          onClick: async () => {
            const text = await prompt('Add to the list', 'Like “2 avocados” or “paper towels”.', '', 'Add');
            if (text) changeGroceries([{ id: newId(), text, checked: false, createdAt: new Date().toISOString() }]);
          },
        },
      ],
    ]);
  const ticked_ = items.filter((g) => g.checked);
  const clearGot = () => takeOff(ticked_, 'Cleared the ticked items');
  const more = (el: Element) =>
    openMenu(el, [
      [
        { label: 'Share', icon: Share, onClick: () => navigator.share?.({ text: listText(lines) }).catch(() => {}) },
        { label: 'Edit stores', icon: Store, onClick: () => tell('Grocery Stores isn’t in v2 yet') },
      ],
      [
        { label: `Clear completed${ticked_.length ? ` (${ticked_.length})` : ''}`, icon: ListChecks, onClick: clearGot },
        { label: 'Clear all', icon: Trash2, danger: true, onClick: () => takeOff(items, 'Cleared the list') },
      ],
    ]);
  const storeMenu = (el: Element) =>
    openMenu(el, [
      stores.map((s) => ({ label: s.name, checked: s.slug === store?.slug, onClick: () => changeSettings({ groceryStore: s.slug }) })),
      [{ label: stores.length ? 'Edit stores…' : 'Add a store…', icon: Store, onClick: () => tell('Grocery Stores isn’t in v2 yet') }],
    ]);
  const recipeMeta = (r: Recipe) => (r.servings ? `${friendly(r.servings)} servings` : '');

  // a row as v1's: the thing (and the recipes it's for, small, under it), its amount, Instacart's ↗ in a soft circle
  const row = (line: Line, sub?: string) => (
    <IonItemSliding key={line.key}>
      <IonItem className={`ck-ion-grocery-row${ticked(line) ? ' ck-done' : ''}`}>
        <IonCheckbox slot="start" className="ck-ion-tick" checked={ticked(line)} onIonChange={(e) => tick(line, e.detail.checked)} aria-label={cap(line.name)} />
        <div className="ck-ion-grocery-text" onClick={() => tick(line, !ticked(line))}>
          <span className="ck-ion-grocery-name">{cap(line.name)}</span>
          {sub && <span className="ck-ion-grocery-sub">{sub}</span>}
        </div>
        {line.amount && (
          <span slot="end" className="ck-grocery-amount">
            {line.amount}
          </span>
        )}
        <a slot="end" className="ck-instacart-link ck-ion-instacart-link" href={instacartSearch(line.term, line.store ?? store?.slug)} target="_blank" rel="noreferrer" aria-label={`Find ${line.name} on Instacart`}>
          <ArrowUpRight size={18} strokeWidth={2} />
        </a>
      </IonItem>
      <IonItemOptions side="end" onIonSwipe={() => takeOff(saved(line), `Removed “${cap(line.name)}”`)}>
        <IonItemOption className="ck-ion-option-meal" onClick={() => tell('Editing a grocery row isn’t in v2 yet')}>
          Edit
        </IonItemOption>
        {stores.length > 1 && (
          <IonItemOption className="ck-ion-option-move" onClick={() => tell('Another store for one item isn’t in v2 yet')}>
            Store
          </IonItemOption>
        )}
        <IonItemOption color="danger" expandable onClick={() => takeOff(saved(line), `Removed “${cap(line.name)}”`)}>
          Delete
        </IonItemOption>
      </IonItemOptions>
    </IonItemSliding>
  );

  return (
    <TabPage tab="groceries" title="Groceries"
      buttons={
        <>
          <BarButton label="Add to the list" icon={Plus} primary onClick={(e) => add(e.currentTarget)} />
            <BarButton label="More actions" icon={Ellipsis} onClick={(e) => more(e.currentTarget)} />
        </>
      }
      extra={<IonSearchbar value={query} onIonInput={(e) => setQuery(e.detail.value ?? '')} placeholder="Search the list" />}
    >
        {/* as v1: the view switch and the store under the docked search, scrolling with the list */}
        <div className="ck-grocery-head ck-ion-grocery-head">
          <IonSegment
            value={view}
            onIonChange={(e) => {
              setPlaced(new Map());
              changeSettings({ groceryView: e.detail.value as 'aisle' | 'recipe' });
            }}
            className="ck-ion-segment ck-ion-strong-segment"
          >
            <IonSegmentButton value="aisle">
              <IonLabel>By aisle</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="recipe">
              <IonLabel>By recipe</IonLabel>
            </IonSegmentButton>
          </IonSegment>
          <button type="button" className="ck-instacart-store ck-ion-plain-button" onClick={(e) => storeMenu(e.currentTarget)}>
            <span>
              {store ? (
                <>
                  Shopping via Instacart at <b>{store.name}</b>
                </>
              ) : (
                <>
                  Shopping via Instacart · <b>Pick a store</b>
                </>
              )}
            </span>
            <ChevronDown size={14} strokeWidth={2.25} className="ck-icon" aria-hidden="true" />
          </button>
        </div>
        {!loading && !lines.length && <p className="ck-note ion-padding">The list is empty. + adds a recipe’s ingredients or anything you type.</p>}
        <div className="ck-grocery-groups">
          {view === 'aisle'
            ? byAisle(toGet).map((g) => (
                <section key={g.aisle} className="ck-grocery-group">
                  <div className="ck-plan-slot-label">{AISLE_NAMES[g.aisle]}</div>
                  <IonList inset lines="full" className="ck-ion-plan-list ck-ion-grocery-list">
                    {g.lines.map((l) => row(l, l.recipes.map((r) => r.title).join(' · ')))}
                  </IonList>
                </section>
              ))
            : byRecipe(toGet).map((g) => {
                const photo = g.recipe && coverPhoto(g.recipe);
                return (
                  <section key={g.recipe?.id ?? 'typed'} className="ck-grocery-group">
                    {g.recipe ? (
                      <div className="ck-grocery-recipe-head">
                        <span className={`ck-picker-thumb ck-photo${photo ? '' : ' ck-photo-empty'}`} style={photoStyle(photo)} aria-hidden="true">
                          {!photo && <ChefHat size={16} strokeWidth={1.5} />}
                        </span>
                        <div>
                          <h2>{g.recipe.title}</h2>
                          <div className="ck-note">{recipeMeta(g.recipe)}</div>
                        </div>
                      </div>
                    ) : (
                      <div className="ck-plan-slot-label">Added by you</div>
                    )}
                    <IonList inset lines="full" className="ck-ion-plan-list ck-ion-grocery-list">
                      {[...new Map(g.parts.map((p) => [p.line.key, p.line])).values()].map((l) => row(l))}
                    </IonList>
                  </section>
                );
              })}
          {got.length > 0 && (
            <section className="ck-grocery-group">
              <div className="ck-plan-slot-label ck-grocery-got">
                <span>{`Got it · ${got.length}`}</span>
                <button type="button" className="ck-ion-plain-button ck-ion-got-clear" onClick={clearGot}>
                  Clear
                </button>
              </div>
              <IonList inset lines="full" className="ck-ion-plan-list ck-ion-grocery-list">
                {got.map((l) => row(l, l.recipes.map((r) => r.title).join(' · ')))}
              </IonList>
            </section>
          )}
        </div>
        <CookingPill />
      
      <AddFromRecipeModal open={adding} onClose={() => setAdding(false)} />
    
    </TabPage>
  );
}
