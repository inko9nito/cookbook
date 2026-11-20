import { useState } from 'react';
import {
  IonButton, IonList, IonItem, IonCheckbox, IonSearchbar, IonSegment, IonSegmentButton, IonLabel, IonItemSliding, IonItemOptions, IonItemOption, IonNote, useIonViewWillLeave,
} from '@ionic/react';
import { ArrowUpRight, ChefHat, ChevronDown, Ellipsis, PenLine, Plus, Share, Trash2 } from 'lucide-react';
import { useGroceries, useNamed, useStore } from '../data/store';
import { AISLE_NAMES, byAisle, byRecipe, instacartSearch, itemNames, linesOf, listText, nameKey, type GroceryItem, type Line } from '../lib/groceries';
import { newId } from '../lib/recipe';
import { say } from './toast';
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
  const more = (el: Element) =>
    openMenu(el, [
      [{ label: 'Share list', icon: Share, onClick: () => navigator.share?.({ text: listText(lines) }).catch(() => {}) }],
      [
        {
          label: 'Clear ticked',
          icon: Trash2,
          danger: true,
          onClick: () => takeOff(items.filter((g) => g.checked), 'Cleared the ticked items'),
        },
      ],
    ]);
  const storeMenu = (el: Element) =>
    openMenu(el, [stores.map((s) => ({ label: s.name, checked: s.slug === store?.slug, onClick: () => changeSettings({ groceryStore: s.slug }) }))]);

  const row = (line: Line, sub?: string) => (
    <IonItemSliding key={line.key}>
      <IonItem className={ticked(line) ? 'ck-done' : ''}>
        <IonCheckbox justify="start" labelPlacement="end" className="ion-text-wrap ck-ion-grocery-check" checked={ticked(line)} onIonChange={(e) => tick(line, e.detail.checked)}>
          <span className="ck-ion-line">
            {cap(line.name)}
            {sub && <IonNote className="ck-ion-line-note">{sub}</IonNote>}
          </span>
        </IonCheckbox>
        {line.amount && (
          <IonNote slot="end" className="ck-ion-amount">
            {line.amount}
          </IonNote>
        )}
        <IonButton slot="end" fill="clear" className="ck-ion-icon-button ck-ion-instacart" href={instacartSearch(line.term, line.store ?? store?.slug)} target="_blank" aria-label={`Search Instacart for ${line.name}`}>
          <ArrowUpRight size={18} />
        </IonButton>
      </IonItem>
      <IonItemOptions side="end">
        <IonItemOption color="danger" expandable onClick={() => takeOff(saved(line), `Removed “${cap(line.name)}”`)}>
          Remove
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
      extra={
        <>
          <IonSearchbar value={query} onIonInput={(e) => setQuery(e.detail.value ?? '')} placeholder="Search the list" />
          <IonSegment
            value={view}
            onIonChange={(e) => {
              setPlaced(new Map());
              changeSettings({ groceryView: e.detail.value as 'aisle' | 'recipe' });
            }}
            className="ck-ion-segment"
          >
            <IonSegmentButton value="aisle">
              <IonLabel>By aisle</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="recipe">
              <IonLabel>By recipe</IonLabel>
            </IonSegmentButton>
          </IonSegment>
        </>
      }
    >
        {stores.length > 0 && (
          <button type="button" className="ck-ion-store" onClick={(e) => storeMenu(e.currentTarget)}>
            Shopping via Instacart at <b>{store?.name}</b> <ChevronDown size={14} />
          </button>
        )}
        {!loading && !lines.length && <p className="ck-note ion-padding">The list is empty. + adds a recipe’s ingredients or anything you type.</p>}
        {view === 'aisle'
          ? byAisle(toGet).map((g) => (
              <div key={g.aisle}>
                <div className="ck-group-label ck-ion-meal">{AISLE_NAMES[g.aisle]}</div>
                <IonList inset lines="full" className="ck-ion-inset">
                  {g.lines.map((l) => row(l, l.recipes.map((r) => r.title).join(' · ')))}
                </IonList>
              </div>
            ))
          : byRecipe(toGet).map((g) => (
              <div key={g.recipe?.id ?? 'typed'}>
                <div className="ck-group-label ck-ion-meal">{g.recipe?.title ?? 'Typed'}</div>
                <IonList inset lines="full" className="ck-ion-inset">
                  {[...new Map(g.parts.map((p) => [p.line.key, p.line])).values()].map((l) => row(l))}
                </IonList>
              </div>
            ))}
        {got.length > 0 && (
          <>
            <div className="ck-group-label ck-ion-meal">Got it</div>
            <IonList inset lines="full" className="ck-ion-inset">
              {got.map((l) => row(l))}
            </IonList>
          </>
        )}
        <CookingPill />
      
      <AddFromRecipeModal open={adding} onClose={() => setAdding(false)} />
    
    </TabPage>
  );
}
