import { useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonContent, IonList, IonItem, IonLabel,
  IonSearchbar, IonSkeletonText, useIonRouter,
} from '@ionic/react';
import { ArrowUpDown, BookOpen, Ellipsis, FolderPlus, LayoutGrid, List as ListIcon, ListOrdered, Pencil, Plus, Trash2 } from 'lucide-react';
import { useCookbooks, useStore } from '../data/store';
import { byName, colorOf, cookbookRecipeIds, emptyCookbook, existing, platePhotos, type Cookbook } from '../lib/cookbook';
import { CookbookSort, SORT_LABELS, newId, sortRecipes, type Recipe } from '../lib/recipe';
import { photoStyle } from '../components/ui/photo';
import { say } from '../components/ui/toast';
import { BarButton, CookingPill, Plates, RecipeCard, openMenu, useConfirm, usePrompt, TabBar } from './ui';
import { AddRecipesModal, OrganizeModal } from './modals';

const countOf = (c: Cookbook, byId: Map<string, Recipe>) => {
  const n = existing(cookbookRecipeIds(c), byId).length;
  return [`${n} ${n === 1 ? 'recipe' : 'recipes'}`, c.sections.length ? `${c.sections.length} ${c.sections.length === 1 ? 'section' : 'sections'}` : '']
    .filter(Boolean)
    .join(' · ');
};

/** Cookbooks: tiles or a list (remembered), + names a new one (Ionic's alert with a field) and opens it. */
export function CookbooksPage() {
  const { recipes, settings, setCookbookView } = useStore();
  const { cookbooks, loading, saveCookbook } = useCookbooks();
  const router = useIonRouter();
  const prompt = usePrompt();
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const sorted = [...cookbooks].sort(byName);
  const grid = settings.cookbookView === 'grid';
  const add = async () => {
    const name = await prompt('New Cookbook', 'Name it after what’s in it, like “Soups” or “Holidays”.', '', 'Create');
    if (!name) return;
    const c = emptyCookbook(name, newId);
    saveCookbook(c);
    router.push(`/cookbooks/${c.id}`, 'forward');
  };
  return (
    <IonPage className="ck-ion-anchor">
      <IonHeader className="ck-ion-header">
        <IonToolbar>
          <IonTitle className="ck-ion-title">Cookbooks</IonTitle>
          <IonButtons slot="end">
            <BarButton label="New cookbook" icon={Plus} primary onClick={add} />
            <BarButton label={grid ? 'Show as a list' : 'Show as tiles'} icon={grid ? ListIcon : LayoutGrid} onClick={() => setCookbookView(grid ? 'list' : 'grid')} />
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <p className="ck-note ck-ion-count">{loading ? ' ' : `${sorted.length} ${sorted.length === 1 ? 'cookbook' : 'cookbooks'}`}</p>
        {loading ? (
          <div className="ck-ion-grid">
            {[0, 1, 2, 3].map((i) => (
              <IonSkeletonText key={i} animated className="ck-ion-tile-skeleton" />
            ))}
          </div>
        ) : grid ? (
          <div className="ck-ion-grid">
            {sorted.map((c) => (
              <a
                key={c.id}
                href={`/ionic/cookbooks/${c.id}`}
                className={`ck-card ck-book-tile ck-ion-book-tile ck-tint-${colorOf(c)}`}
                onClick={(e) => {
                  e.preventDefault();
                  router.push(`/cookbooks/${c.id}`, 'forward');
                }}
              >
                <Plates photos={platePhotos(c, byId)} />
                <span className="ck-book-name">{c.name}</span>
                <span className="ck-book-meta">{countOf(c, byId)}</span>
              </a>
            ))}
          </div>
        ) : (
          <IonList inset lines="full" className="ck-ion-inset">
            {sorted.map((c) => {
              const photo = platePhotos(c, byId)[0];
              return (
                <IonItem key={c.id} button detail routerLink={`/cookbooks/${c.id}`}>
                  <span slot="start" className={`ck-ion-thumb ck-ion-thumb-round ck-tint-${colorOf(c)}${photo ? ' ck-photo' : ''}`} style={photoStyle(photo)}>
                    {!photo && <BookOpen size={16} strokeWidth={1.5} />}
                  </span>
                  <IonLabel>
                    <h3>{c.name}</h3>
                    <p>{countOf(c, byId)}</p>
                  </IonLabel>
                </IonItem>
              );
            })}
          </IonList>
        )}
        <CookingPill />
      </IonContent>
      <TabBar current="cookbooks" />
    </IonPage>
  );
}

/**
 * A cookbook: its colour, plates, name and counts are page content under a bar that stays see-through until they've
 * scrolled away (the app's approved #90 behaviour: Ionic's scroll events set the bar solid), then its search and shelves.
 */
export function CookbookPage() {
  const { id = '' } = useParams();
  const router = useIonRouter();
  const { recipes, cookbookSort, setCookbookSort } = useStore();
  const { cookbooks, saveCookbook, deleteCookbook } = useCookbooks();
  const prompt = usePrompt();
  const confirm = useConfirm();
  const leaving = useRef<Cookbook | null>(null);
  const book = leaving.current ?? cookbooks.find((c) => c.id === id);
  const [solid, setSolid] = useState(false);
  const [titled, setTitled] = useState(false);
  // #90: the header's search hands over to one docked in the bar once it reaches the bar, so it's always there
  const [docked, setDocked] = useState(false);
  const bar = useRef<HTMLIonToolbarElement>(null);
  const heroSearch = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [organizing, setOrganizing] = useState(false);
  if (!book) {
    return (
      <IonPage>
        <IonHeader className="ck-ion-header">
          <IonToolbar>
            <IonButtons slot="start">
              <IonBackButton defaultHref="/cookbooks" text="" />
            </IonButtons>
          </IonToolbar>
        </IonHeader>
        <IonContent className="ion-padding">
          <p className="ck-note">This cookbook isn’t here.</p>
        </IonContent>
      </IonPage>
    );
  }
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const sort = cookbookSort(book.id);
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (r: Recipe) => words.every((w) => r.title.toLowerCase().includes(w));
  const shelves = [
    { id: null as string | null, name: book.sections.length ? 'Uncategorized' : '', ids: book.recipeIds },
    ...book.sections.map((s) => ({ id: s.id as string | null, name: s.name, ids: s.recipeIds })),
  ]
    .map((s) => ({ ...s, recipes: sortRecipes(existing(s.ids, byId), sort).filter(matches) }))
    .filter((s) => s.recipes.length || (s.id !== null && !words.length));

  const rename = async () => {
    const name = await prompt('Rename Cookbook', '', book.name, 'Save');
    if (name) saveCookbook({ ...book, name });
  };
  const addSection = async () => {
    const name = await prompt('New Section', 'Like “Weeknights” or “For guests”.', '', 'Add');
    if (name) saveCookbook({ ...book, sections: [...book.sections, { id: newId(), name, recipeIds: [] }] });
  };
  const remove = async () => {
    if (!(await confirm(`Delete “${book.name}”?`, 'Its recipes stay in Recipes.', 'Delete', true))) return;
    leaving.current = book;
    router.goBack();
    deleteCookbook(book.id);
    say(`Deleted “${book.name}”`);
  };
  const sortMenu = (el: Element) =>
    openMenu(el, [CookbookSort.options.map((k) => ({ label: SORT_LABELS[k], checked: sort === k, onClick: () => setCookbookSort(book.id, k) }))]);
  const more = (el: Element) =>
    openMenu(el, [
      [
        { label: 'Add Recipes', icon: Plus, onClick: () => setAdding(true) },
        { label: 'New Section', icon: FolderPlus, onClick: addSection },
        { label: 'Organize', icon: ListOrdered, onClick: () => setOrganizing(true) },
      ],
      [{ label: 'Rename', icon: Pencil, onClick: rename }],
      [{ label: 'Delete', icon: Trash2, danger: true, onClick: remove }],
    ]);

  return (
    <IonPage className="ck-ion-anchor">
      <IonHeader className={`ck-ion-header ck-ion-hero-bar${solid ? ' ck-ion-solid' : ''}`}>
        <IonToolbar ref={bar}>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/cookbooks" text="" className="ck-ion-round-back" />
          </IonButtons>
          {/* the name only once it has gone under the bar: never in both places, and nothing for Ionic's transition to show */}
          <IonTitle className="ck-ion-title-small ck-ion-hero-title">{titled ? book.name : ''}</IonTitle>
          <IonButtons slot="end">
            <BarButton label="Add recipes" icon={Plus} primary onClick={() => setAdding(true)} />
            <BarButton label="Sort" icon={ArrowUpDown} onClick={(e) => sortMenu(e.currentTarget)} />
            <BarButton label="More actions" icon={Ellipsis} onClick={(e) => more(e.currentTarget)} />
          </IonButtons>
        </IonToolbar>
        {docked && (
          <div className="ck-ion-header-extra">
            <IonSearchbar value={query} onIonInput={(e) => setQuery(e.detail.value ?? '')} placeholder="Search this cookbook" />
          </div>
        )}
      </IonHeader>
      <IonContent
        fullscreen
        className="ck-ion-book"
        scrollEvents
        onIonScroll={(e) => {
          const y = e.detail.scrollTop;
          const barBottom = bar.current?.getBoundingClientRect().bottom ?? 56;
          const search = heroSearch.current?.getBoundingClientRect().top ?? Infinity;
          setSolid(y > 150);
          setTitled(y > 210);
          // the pill (16pt into its box) has reached the bar
          setDocked(search + 16 < barBottom + 4);
        }}
      >
        <section className={`ck-ion-book-hero ck-tint-${colorOf(book)}`}>
          <Plates photos={platePhotos(book, byId)} />
          <h1 className="ck-ion-book-title">{book.name}</h1>
          <p className="ck-ion-book-meta">{countOf(book, byId)}</p>
          <div ref={heroSearch} className={docked ? 'ck-ion-handed-over' : ''}>
            <IonSearchbar value={query} onIonInput={(e) => setQuery(e.detail.value ?? '')} placeholder="Search this cookbook" className="ck-ion-hero-search" />
          </div>
        </section>
        {shelves.length === 0 ? (
          <p className="ck-note ion-padding">{words.length ? 'Nothing matches.' : 'No recipes in this cookbook yet.'}</p>
        ) : (
          shelves.map((s) => (
            <div key={s.id ?? 'none'} className="ck-ion-shelf">
              {s.name && (
                <div className="ck-ion-sec">
                  <h2>
                    {s.name} <span className="ck-note">{s.recipes.length}</span>
                  </h2>
                </div>
              )}
              {s.recipes.length ? (
                <div className={s.name ? 'ck-ion-shelf-row' : 'ck-ion-grid'}>
                  {s.recipes.map((r) => (
                    <RecipeCard key={r.id} recipe={r} href={`/cookbooks/recipe/${r.id}`} />
                  ))}
                </div>
              ) : (
                <p className="ck-note ck-ion-shelf-empty">Nothing in this section yet.</p>
              )}
            </div>
          ))
        )}
      </IonContent>
      <AddRecipesModal open={adding} cookbook={book} onClose={() => setAdding(false)} />
      <OrganizeModal open={organizing} cookbook={book} onClose={() => setOrganizing(false)} />
    </IonPage>
  );
}
