import { useEffect, useMemo, useRef, useState } from 'react';
import {
  IonModal, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent, IonList, IonItem, IonLabel, IonCheckbox,
  IonSearchbar, IonReorderGroup, IonReorder, IonItemSliding, IonItemOptions, IonItemOption, IonNote,
  IonNav, IonBackButton, IonFooter, IonTextarea, IonAccordionGroup, IonAccordion,
} from '@ionic/react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Pagination, Zoom } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/zoom';
import { BookOpen, ChefHat, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { useCookbooks, useGroceries, useStore } from '../data/store';
import { addToNote, byName, changeNote, emptyCookbook, isIn, platePhotos, organizeRows, fromOrganizeRows, toggleIn, type Cookbook, type OrganizeRow } from '../lib/cookbook';
import { coverPhoto, newId, type Photo, type Recipe } from '../lib/recipe';
import { addRows, linesOf, newItems } from '../lib/groceries';
import { mediumDate, today, type Day } from '../lib/planner';
import type { Swiper as SwiperClass } from 'swiper/types';
import { photoStyle } from './photo';
import { say } from './toast';
import { usePrompt } from './ui';

/**
 * Issue #141, the move to Ionic: the app's popups as Ionic modals. "Card" ones are iOS's card (the app shrinks back behind
 * it, swipe it down to close); sheets snap to their heights; the day picker is Ionic's calendar.
 */

/** the element a card shrinks back behind it: the whole app with its tab bar */
export const appEl = () => document.querySelector<HTMLElement>('ion-tabs') ?? undefined;

function CardHeader({ title, onCancel, onDone, done = 'Done' }: { title: string; onCancel?: () => void; onDone?: () => void; done?: string }) {
  return (
    <IonHeader className="ck-ion-card-header">
      <IonToolbar>
        {onCancel && (
          <IonButtons slot="start">
            <button type="button" className="ck-ion-plain-button ck-ion-pill-cancel" onClick={onCancel}>
              Cancel
            </button>
          </IonButtons>
        )}
        <IonTitle>{title}</IonTitle>
        {onDone && (
          <IonButtons slot="end">
            <button type="button" className="ck-ion-plain-button ck-ion-pill-done" onClick={onDone}>
              {done}
            </button>
          </IonButtons>
        )}
      </IonToolbar>
    </IonHeader>
  );
}

const Thumb = ({ recipe }: { recipe?: Recipe }) => {
  const photo = recipe && coverPhoto(recipe);
  return (
    <span slot="start" className={`ck-ion-thumb ck-photo${photo ? '' : ' ck-photo-empty'}`} style={photoStyle(photo)}>
      {!photo && <ChefHat size={16} strokeWidth={1.5} />}
    </span>
  );
};

// ── Add to Cookbook: a card with each cookbook and section to tick ──

export function AddToCookbookModal({ open, recipe, onClose }: { open: boolean; recipe: Recipe; onClose: () => void }) {
  const { cookbooks, saveCookbook } = useCookbooks();
  const { recipes } = useStore();
  const byId = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);
  const prompt = usePrompt();
  const [draft, setDraft] = useState<Cookbook[]>([]);
  const [made, setMade] = useState<Cookbook[]>([]);
  useEffect(() => {
    if (open) {
      setDraft([...cookbooks]);
      setMade([]);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = () => {
    const changed = draft.filter((c) => JSON.stringify(c) !== JSON.stringify(cookbooks.find((x) => x.id === c.id)));
    [...changed, ...made].forEach(saveCookbook);
    const note = addToNote(recipe.id, cookbooks, [...changed, ...made]);
    onClose();
    if (note) say(note);
  };
  // v1: a new cookbook starts with this recipe in it
  const newCookbook = async () => {
    const name = await prompt('New Cookbook', 'It starts with this recipe in it.', '', 'Add');
    if (name?.trim()) setMade((m) => [...m, { ...emptyCookbook(name, newId), recipeIds: [recipe.id] }]);
  };
  const set = (c: Cookbook, sectionId: string | null, on: boolean) => {
    const next = toggleIn(c, sectionId, recipe.id, on);
    if (made.some((m) => m.id === c.id)) setMade((ms) => ms.map((m) => (m.id === c.id ? next : m)));
    else setDraft((d) => d.map((x) => (x.id === c.id ? next : x)));
  };
  const thumb = (c: Cookbook) => {
    const cover = platePhotos(c, byId)[0];
    return (
      <span slot="start" className={`ck-picker-thumb ck-photo${cover ? '' : ' ck-photo-empty'}`} style={photoStyle(cover)} aria-hidden="true">
        {!cover && <BookOpen size={16} strokeWidth={1.5} />}
      </span>
    );
  };
  const sorted = [...draft, ...made].sort(byName);
  return (
    <IonModal isOpen={open} onDidDismiss={onClose} presentingElement={appEl()} className="ck-ion-card-modal">
      <CardHeader title="Add to Cookbook" onCancel={onClose} onDone={done} />
      <IonContent>
        <IonList inset lines="full" className="ck-ion-inset ck-ion-card-list">
          <IonItem button detail={false} onClick={newCookbook}>
            <Plus slot="start" size={18} strokeWidth={2} className="ck-ion-new-icon" />
            <IonLabel>New Cookbook</IonLabel>
          </IonItem>
        </IonList>
        {sorted.length > 0 && (
          <IonList inset lines="inset" className="ck-ion-inset ck-ion-card-list ck-ion-addto-list">
            {/* a cookbook with sections folds them away (#83): its row says which ones the recipe is in */}
            <IonAccordionGroup multiple>
              {sorted.map((c) => {
                if (!c.sections.length)
                  return (
                    <IonItem key={c.id} className="ck-ion-addto-row">
                      <IonCheckbox slot="start" className="ck-ion-tick" checked={isIn(c, null, recipe.id)} onIonChange={(e) => set(c, null, e.detail.checked)} aria-label={c.name} />
                      {thumb(c)}
                      <IonLabel onClick={() => set(c, null, !isIn(c, null, recipe.id))}>{c.name}</IonLabel>
                    </IonItem>
                  );
                const sections = [{ id: null as string | null, name: 'Uncategorized' }, ...c.sections];
                const inSections = sections.filter((s) => isIn(c, s.id, recipe.id)).map((s) => s.name);
                return (
                  <IonAccordion key={c.id} value={c.id} className="ck-ion-addto-book">
                    <IonItem slot="header" className="ck-ion-addto-row ck-ion-addto-parent">
                      {thumb(c)}
                      <IonLabel>
                        {c.name}
                        {inSections.length > 0 && <p>In {inSections.join(', ')}</p>}
                      </IonLabel>
                    </IonItem>
                    <div slot="content">
                      {sections.map((s) => (
                        <IonItem key={s.id ?? ''} className="ck-ion-addto-section">
                          <IonCheckbox slot="start" className="ck-ion-tick" checked={isIn(c, s.id, recipe.id)} onIonChange={(e) => set(c, s.id, e.detail.checked)} aria-label={s.name} />
                          <IonLabel onClick={() => set(c, s.id, !isIn(c, s.id, recipe.id))}>{s.name}</IonLabel>
                        </IonItem>
                      ))}
                    </div>
                  </IonAccordion>
                );
              })}
            </IonAccordionGroup>
          </IonList>
        )}
      </IonContent>
    </IonModal>
  );
}

// ── Add Recipes (a cookbook's +): a card with search and a tick for each recipe ──

export function RecipePickerModal({ open, title, chosen, onDone, onClose, single = false }: { open: boolean; title: string; chosen: string[]; onDone: (ids: string[]) => void; onClose: () => void; single?: boolean }) {
  const { recipes } = useStore();
  const [picked, setPicked] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (open) {
      setPicked(chosen);
      setQuery('');
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = [...recipes].sort((a, b) => a.title.localeCompare(b.title)).filter((r) => words.every((w) => r.title.toLowerCase().includes(w)));
  return (
    <IonModal isOpen={open} onDidDismiss={onClose} presentingElement={appEl()} className="ck-ion-card-modal">
      <CardHeader title={title} onCancel={onClose} onDone={single ? undefined : () => onDone(picked)} />
      <IonContent>
        <IonSearchbar value={query} onIonInput={(e) => setQuery(e.detail.value ?? '')} placeholder="Search recipes" className="ck-ion-card-search" />
        <IonList inset lines="full" className="ck-ion-inset">
          {shown.map((r) =>
            single ? (
              <IonItem key={r.id} button detail onClick={() => onDone([r.id])}>
                <Thumb recipe={r} />
                <IonLabel>{r.title}</IonLabel>
              </IonItem>
            ) : (
              <IonItem key={r.id}>
                <Thumb recipe={r} />
                <IonCheckbox
                  checked={picked.includes(r.id)}
                  onIonChange={(e) => setPicked((p) => (e.detail.checked ? [...p, r.id] : p.filter((x) => x !== r.id)))}
                  justify="space-between"
                >
                  {r.title}
                </IonCheckbox>
              </IonItem>
            ),
          )}
        </IonList>
      </IonContent>
    </IonModal>
  );
}

/** Add Recipes to a cookbook, with the toast of what changed */
export function AddRecipesModal({ open, cookbook, onClose }: { open: boolean; cookbook: Cookbook; onClose: () => void }) {
  const { saveCookbook } = useCookbooks();
  return (
    <RecipePickerModal
      open={open}
      title="Add Recipes"
      chosen={cookbook.recipeIds}
      onClose={onClose}
      onDone={(ids) => {
        const note = changeNote(cookbook.recipeIds, ids);
        saveCookbook({ ...cookbook, recipeIds: [...cookbook.recipeIds.filter((i) => ids.includes(i)), ...ids.filter((i) => !cookbook.recipeIds.includes(i))] });
        onClose();
        if (note) say(note);
      }}
    />
  );
}

// ── Organize: Ionic's reorder list (hold the handle and drag), swipe a recipe to take it out ──

export function OrganizeModal({ open, cookbook, onClose }: { open: boolean; cookbook: Cookbook; onClose: () => void }) {
  const { recipes } = useStore();
  const { saveCookbook } = useCookbooks();
  const [rows, setRows] = useState<OrganizeRow[]>([]);
  useEffect(() => {
    if (open) setRows(organizeRows(cookbook));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const sectionName = (id: string | null) => (id === null ? 'Uncategorized' : (cookbook.sections.find((s) => s.id === id)?.name ?? ''));
  return (
    <IonModal isOpen={open} onDidDismiss={onClose} presentingElement={appEl()} className="ck-ion-card-modal">
      <CardHeader
        title="Organize"
        onCancel={onClose}
        onDone={() => {
          saveCookbook(fromOrganizeRows(cookbook, rows));
          onClose();
        }}
      />
      <IonContent>
        <p className="ck-ion-footnote">Hold ≡ and drag to move a recipe or a section. Swipe a recipe left to take it out.</p>
        <IonList inset lines="full" className="ck-ion-inset">
          <IonReorderGroup disabled={false} onIonReorderEnd={(e) => setRows(e.detail.complete(rows) as OrganizeRow[])}>
            {rows.map((row) =>
              row.kind === 'heading' ? (
                <IonItem key={row.key} className="ck-ion-organize-heading">
                  <IonLabel>{sectionName(row.sectionId)}</IonLabel>
                  <IonReorder slot="end" />
                </IonItem>
              ) : (
                <IonItemSliding key={row.key}>
                  <IonItem>
                    <Thumb recipe={byId.get(row.recipeId)} />
                    <IonLabel>{byId.get(row.recipeId)?.title ?? 'Deleted recipe'}</IonLabel>
                    <IonReorder slot="end" />
                  </IonItem>
                  <IonItemOptions side="end">
                    <IonItemOption color="danger" expandable onClick={() => setRows((r) => r.filter((x) => x.key !== row.key))}>
                      Remove
                    </IonItemOption>
                  </IonItemOptions>
                </IonItemSliding>
              ),
            )}
          </IonReorderGroup>
        </IonList>
      </IonContent>
    </IonModal>
  );
}

// ── a day: Ionic's calendar in a sheet ──

/**
 * Pick a day (#62, #67): a month at a time in a sheet, drawn exactly like the Planner's week strip (the same circle,
 * number and dot: v1's calendar was styled to match it, and Ionic's date picker didn't), weeks from Monday. Swipe or
 * the arrows for another month (Swiper, as the strip). A tapped day fills in, then the sheet closes and the pick goes
 * through. Swiping the sheet down picks nothing.
 */
export function DaySheet({ open, title, busy, value, onPick, onClose }: { open: boolean; title: string; busy?: Set<Day>; value?: Day; onPick: (day: Day) => void; onClose: () => void }) {
  const now = today();
  const [chosen, setChosen] = useState<Day | null>(null);
  const start = monthStart(value ?? now);
  const months = useMemo(() => Array.from({ length: MONTHS * 2 + 1 }, (_, i) => addMonths(start, i - MONTHS)), [start]);
  const [shown, setShown] = useState(MONTHS);
  const swiper = useRef<SwiperClass | null>(null);
  const picked = chosen ?? value;
  return (
    <IonModal
      isOpen={open}
      onWillPresent={() => {
        setChosen(null);
        setShown(MONTHS);
      }}
      onDidDismiss={onClose}
      breakpoints={[0, 1]}
      initialBreakpoint={1}
      handle={false}
      className="ck-ion-sheet ck-ion-auto-sheet ck-ion-day-sheet"
    >
      <div className="ck-ion-auto-inner">
        <div className="ck-ion-sheet-title ck-ion-day-sheet-title">{title}</div>
        {/* the month as Ionic's calendar heads it (the user's pick): month and year on the left, ‹ › on the right */}
        <div className="ck-month-bar">
          <span className="ck-month-name">{monthName(months[shown])}</span>
          <span className="ck-month-arrows">
            <button type="button" className="ck-ion-plain-button ck-month-arrow" aria-label="Previous month" onClick={() => swiper.current?.slidePrev()}>
              <ChevronLeft size={24} strokeWidth={2.25} />
            </button>
            <button type="button" className="ck-ion-plain-button ck-month-arrow" aria-label="Next month" onClick={() => swiper.current?.slideNext()}>
              <ChevronRight size={24} strokeWidth={2.25} />
            </button>
          </span>
        </div>
        <div className="ck-month-week">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <Swiper initialSlide={MONTHS} onSwiper={(sw) => (swiper.current = sw)} onSlideChange={(sw) => setShown(sw.activeIndex)} observer observeParents>
          {months.map((m) => (
            <SwiperSlide key={m}>
              <div className="ck-month">
                {monthCells(m).map((d, i) =>
                  d ? (
                    <button
                      key={d}
                      type="button"
                      className={`ck-week-day ck-ion-plain-button${d === picked ? ' ck-week-selected' : ''}${d === now ? ' ck-week-today' : ''}${busy?.has(d) ? ' ck-week-busy' : ''}`}
                      aria-label={mediumDate(d)}
                      onClick={() => {
                        if (chosen) return;
                        setChosen(d);
                        setTimeout(() => onPick(d), SHOW_PICK_MS);
                      }}
                    >
                      <span className="ck-week-num" aria-hidden="true">{Number(d.slice(8))}</span>
                      <span className="ck-week-dot" aria-hidden="true" />
                    </button>
                  ) : (
                    <span key={`x${i}`} />
                  ),
                )}
              </div>
            </SwiperSlide>
          ))}
        </Swiper>
      </div>
    </IonModal>
  );
}

const MONTHS = 24; // months either side of the one shown
const SHOW_PICK_MS = 280; // the tapped day shows filled for a moment before the sheet closes (v1)
const monthStart = (day: Day): Day => `${day.slice(0, 7)}-01`;
const addMonths = (first: Day, n: number): Day => {
  const d = new Date(Number(first.slice(0, 4)), Number(first.slice(5, 7)) - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};
const monthName = (first: Day) => new Date(Number(first.slice(0, 4)), Number(first.slice(5, 7)) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
/** a month's six weeks from Monday: its days, and nothing in the cells of the months either side (as iOS's Calendar) */
const monthCells = (first: Day): (Day | null)[] => {
  const lead = (new Date(Number(first.slice(0, 4)), Number(first.slice(5, 7)) - 1, 1).getDay() + 6) % 7;
  const days = new Date(Number(first.slice(0, 4)), Number(first.slice(5, 7)), 0).getDate();
  return Array.from({ length: 42 }, (_, i) => {
    const n = i - lead + 1;
    return n >= 1 && n <= days ? `${first.slice(0, 8)}${String(n).padStart(2, '0')}` : null;
  });
};

// ── Add to Grocery List: a card that opens on the recipe's ingredients ──

export function AddToListModal({ open, recipe, servings, onClose }: { open: boolean; recipe: Recipe; servings?: number; onClose: () => void }) {
  const { recipes, settings } = useStore();
  const { items, changeGroceries } = useGroceries();
  const rows = useMemo(
    () => (open ? addRows([{ recipe, servings }], linesOf(items, recipes, settings.groceryAisles), recipes) : []),
    [open], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [on, setOn] = useState<Set<string>>(new Set());
  useEffect(() => setOn(new Set(rows.filter((r) => r.on).map((r) => r.key))), [rows]);
  const add = () => {
    const adds = rows.filter((r) => on.has(r.key)).flatMap((r) => r.adds);
    if (adds.length) changeGroceries(newItems(adds, newId));
    onClose();
    if (adds.length) say(`Added ${on.size} to the grocery list`);
  };
  return (
    <IonModal isOpen={open} onDidDismiss={onClose} presentingElement={appEl()} className="ck-ion-card-modal">
      <CardHeader title="Add to Grocery List" onCancel={onClose} />
      <IonContent>
        <p className="ck-ion-footnote">{recipe.title}</p>
        <IonList inset lines="full" className="ck-ion-inset">
          {rows.map((r) => (
            <IonItem key={r.key}>
              <IonCheckbox
                checked={on.has(r.key)}
                justify="start"
                labelPlacement="end"
                className="ion-text-wrap"
                onIonChange={(e) =>
                  setOn((s) => {
                    const n = new Set(s);
                    if (e.detail.checked) n.add(r.key);
                    else n.delete(r.key);
                    return n;
                  })
                }
              >
                <span className="ck-ion-line">
                  {r.amount && <span className="ck-amount">{r.amount} </span>}
                  {r.name}
                  {r.note && <IonNote className="ck-ion-line-note">{r.note}</IonNote>}
                </span>
              </IonCheckbox>
            </IonItem>
          ))}
        </IonList>
      </IonContent>
      <IonFooter className="ck-ion-cta-footer">
        <IonToolbar>
          <IonButton expand="block" shape="round" className="ck-ion-cta" disabled={!on.size} onClick={add}>
            Add {on.size} to list
          </IonButton>
        </IonToolbar>
      </IonFooter>
    </IonModal>
  );
}

// ── Add from a recipe (the list's +): a card with its own pages (Ionic's Nav): pick a recipe, then its ingredients ──

function PickRecipeStep({ onPick, onCancel }: { onPick: (r: Recipe) => void; onCancel: () => void }) {
  const { recipes } = useStore();
  const [query, setQuery] = useState('');
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = [...recipes].sort((a, b) => a.title.localeCompare(b.title)).filter((r) => words.every((w) => r.title.toLowerCase().includes(w)));
  return (
    <>
      <CardHeader title="Add a Recipe" onCancel={onCancel} />
      <IonContent>
        <IonSearchbar value={query} onIonInput={(e) => setQuery(e.detail.value ?? '')} placeholder="Search recipes" className="ck-ion-card-search" />
        <IonList inset lines="full" className="ck-ion-inset">
          {shown.map((r) => (
            <IonItem key={r.id} button detail onClick={() => onPick(r)}>
              <Thumb recipe={r} />
              <IonLabel>{r.title}</IonLabel>
            </IonItem>
          ))}
        </IonList>
      </IonContent>
    </>
  );
}

/** Add from a recipe (the list's +): a card with pages of its own (Ionic's Nav): pick a recipe, then its ingredients, Back between */
export function AddFromRecipeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useRef<HTMLIonNavElement>(null);
  return (
    <IonModal isOpen={open} onDidDismiss={onClose} presentingElement={appEl()} className="ck-ion-card-modal">
      <IonNav
        ref={nav}
        root={() => <PickRecipeStep onCancel={onClose} onPick={(r) => nav.current?.push(() => <IngredientsStep recipe={r} onDone={onClose} />)} />}
      />
    </IonModal>
  );
}

function IngredientsStep({ recipe, onDone }: { recipe: Recipe; onDone: () => void }) {
  const { recipes, settings } = useStore();
  const { items, changeGroceries } = useGroceries();
  const rows = useMemo(() => addRows([{ recipe }], linesOf(items, recipes, settings.groceryAisles), recipes), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [on, setOn] = useState(() => new Set(rows.filter((r) => r.on).map((r) => r.key)));
  return (
    <>
      <IonHeader className="ck-ion-card-header">
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton text="Back" className="ck-ion-text-button" />
          </IonButtons>
          <IonTitle>{recipe.title}</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <IonList inset lines="full" className="ck-ion-inset">
          {rows.map((r) => (
            <IonItem key={r.key}>
              <IonCheckbox
                checked={on.has(r.key)}
                justify="start"
                labelPlacement="end"
                className="ion-text-wrap"
                onIonChange={(e) =>
                  setOn((s) => {
                    const n = new Set(s);
                    if (e.detail.checked) n.add(r.key);
                    else n.delete(r.key);
                    return n;
                  })
                }
              >
                <span className="ck-ion-line">
                  {r.amount && <span className="ck-amount">{r.amount} </span>}
                  {r.name}
                  {r.note && <IonNote className="ck-ion-line-note">{r.note}</IonNote>}
                </span>
              </IonCheckbox>
            </IonItem>
          ))}
        </IonList>
      </IonContent>
      <IonFooter className="ck-ion-cta-footer">
        <IonToolbar>
          <IonButton
            expand="block"
            shape="round"
            className="ck-ion-cta"
            disabled={!on.size}
            onClick={() => {
              changeGroceries(newItems(rows.filter((r) => on.has(r.key)).flatMap((r) => r.adds), newId));
              onDone();
              say(`Added ${on.size} to the grocery list`);
            }}
          >
            Add {on.size} to list
          </IonButton>
        </IonToolbar>
      </IonFooter>
    </>
  );
}

// ── a recipe's photos full screen: swipe through them, pinch or double-tap to zoom (Swiper's zoom) ──

export function PhotoViewer({ photos, at, onClose }: { photos: Photo[]; at: number | null; onClose: () => void }) {
  return (
    <IonModal isOpen={at !== null} onDidDismiss={onClose} className="ck-ion-photo-viewer">
      <IonContent scrollY={false}>
        <IonButton shape="round" className="ck-ion-viewer-close" aria-label="Close" onClick={onClose}>
          <X size={22} />
        </IonButton>
        <Swiper modules={[Zoom, Pagination]} zoom initialSlide={at ?? 0} pagination={photos.length > 1} className="ck-ion-viewer-swiper">
          {photos.map((p) => (
            <SwiperSlide key={p.id}>
              <div className="swiper-zoom-container">
                <img src={p.src} alt="" />
              </div>
            </SwiperSlide>
          ))}
        </Swiper>
      </IonContent>
    </IonModal>
  );
}

// ── a note on the Planner: its own screen with a big field, the keyboard up at once ──

export function NoteModal({ open, title, value, onSave, onClose }: { open: boolean; title: string; value: string; onSave: (text: string) => void; onClose: () => void }) {
  const [text, setText] = useState(value);
  const field = useRef<HTMLIonTextareaElement>(null);
  useEffect(() => {
    if (open) setText(value);
  }, [open, value]);
  return (
    <IonModal
      isOpen={open}
      onDidDismiss={onClose}
      presentingElement={appEl()}
      className="ck-ion-card-modal"
      onDidPresent={() => field.current?.setFocus()}
    >
      <CardHeader
        title={title}
        onCancel={onClose}
        onDone={() => {
          if (text.trim()) onSave(text.trim());
          onClose();
        }}
        done="Save"
      />
      <IonContent className="ion-padding">
        <IonTextarea ref={field} value={text} autoGrow placeholder="Leftovers, eating out, a reminder…" onIonInput={(e) => setText(e.detail.value ?? '')} className="ck-ion-note-field" />
      </IonContent>
    </IonModal>
  );
}

