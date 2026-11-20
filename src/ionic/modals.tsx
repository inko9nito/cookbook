import { useEffect, useMemo, useRef, useState } from 'react';
import {
  IonModal, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent, IonList, IonItem, IonLabel, IonCheckbox,
  IonSearchbar, IonDatetime, IonReorderGroup, IonReorder, IonItemSliding, IonItemOptions, IonItemOption, IonNote,
  IonNav, IonBackButton, IonFooter, IonTextarea,
} from '@ionic/react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Pagination, Zoom } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/zoom';
import { ChefHat, X } from 'lucide-react';
import { useCookbooks, useGroceries, useStore } from '../data/store';
import { addToNote, byName, changeNote, colorOf, isIn, organizeRows, fromOrganizeRows, toggleIn, type Cookbook, type OrganizeRow } from '../lib/cookbook';
import { coverPhoto, newId, type Photo, type Recipe } from '../lib/recipe';
import { addRows, linesOf, newItems } from '../lib/groceries';
import type { Day } from '../lib/planner';
import { photoStyle } from '../components/ui/photo';
import { say } from '../components/ui/toast';

/**
 * Issue #141, the Ionic trial: the app's popups as Ionic modals. "Card" ones are iOS's card (the app shrinks back behind
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
            <IonButton className="ck-ion-text-button" onClick={onCancel}>
              Cancel
            </IonButton>
          </IonButtons>
        )}
        <IonTitle>{title}</IonTitle>
        {onDone && (
          <IonButtons slot="end">
            <IonButton className="ck-ion-text-button ck-ion-strong" onClick={onDone}>
              {done}
            </IonButton>
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
  const [draft, setDraft] = useState<Cookbook[]>([]);
  useEffect(() => {
    if (open) setDraft([...cookbooks].sort(byName));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = () => {
    const changed = draft.filter((c) => c !== cookbooks.find((x) => x.id === c.id));
    changed.forEach(saveCookbook);
    const note = addToNote(recipe.id, cookbooks, changed);
    onClose();
    if (note) say(note);
  };
  const set = (c: Cookbook, sectionId: string | null, on: boolean) => setDraft((d) => d.map((x) => (x.id === c.id ? toggleIn(x, sectionId, recipe.id, on) : x)));
  return (
    <IonModal isOpen={open} onDidDismiss={onClose} presentingElement={appEl()} className="ck-ion-card-modal">
      <CardHeader title="Add to Cookbook" onCancel={onClose} onDone={done} />
      <IonContent>
        <IonList inset lines="full" className="ck-ion-inset">
          {draft.map((c) => (
            <div key={c.id}>
              <IonItem>
                <span slot="start" className={`ck-ion-swatch ck-tint-${colorOf(c)}`} />
                <IonCheckbox checked={isIn(c, null, recipe.id)} onIonChange={(e) => set(c, null, e.detail.checked)} justify="space-between">
                  {c.name}
                </IonCheckbox>
              </IonItem>
              {c.sections.map((s) => (
                <IonItem key={s.id} className="ck-ion-indented">
                  <IonCheckbox checked={isIn(c, s.id, recipe.id)} onIonChange={(e) => set(c, s.id, e.detail.checked)} justify="space-between">
                    {s.name}
                  </IonCheckbox>
                </IonItem>
              ))}
            </div>
          ))}
        </IonList>
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

export function DaySheet({ open, title, busy, value, onPick, onClose }: { open: boolean; title: string; busy?: Set<Day>; value?: Day; onPick: (day: Day) => void; onClose: () => void }) {
  const picked = useRef(false);
  return (
    <IonModal
      isOpen={open}
      onWillPresent={() => (picked.current = false)}
      onDidDismiss={onClose}
      breakpoints={[0, 1]}
      initialBreakpoint={1}
      className="ck-ion-sheet ck-ion-auto-sheet"
    >
      <div className="ck-ion-auto-inner">
        <div className="ck-ion-sheet-title">{title}</div>
        <IonDatetime
          presentation="date"
          firstDayOfWeek={1}
          value={value}
          highlightedDates={[...(busy ?? [])].map((date) => ({ date, textColor: 'var(--ck-accent-ink)', backgroundColor: 'var(--ck-accent-tint)' }))}
          onIonChange={(e) => {
            const v = String(e.detail.value ?? '').slice(0, 10);
            if (!v || picked.current) return;
            picked.current = true;
            onPick(v);
          }}
        />
      </div>
    </IonModal>
  );
}

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

