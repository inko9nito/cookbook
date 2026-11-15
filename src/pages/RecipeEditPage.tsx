import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Page, Navbar, NavLeft, NavTitle, NavRight, Link, List, ListInput, ListItem, BlockTitle, Block, Button, Chip, Stepper,
  SwipeoutActions, SwipeoutButton, Actions, ActionsGroup, ActionsButton,
} from 'framework7-react';
import { Camera, ImagePlus, Trash2, Plus, ArrowUp, ArrowDown } from 'lucide-react';
import { useStore } from '../demo/store';
import { COURSES, emptyRecipe, newId, titleCase, type DemoIngredient, type DemoRecipe, type DemoStep } from '../demo/data';
import { quickParse, isHeaderLine, headerText, pastedLines } from '../demo/quickParse';
import IngredientSheet from '../components/IngredientSheet';
import StepSheet from '../components/StepSheet';
import { inlineIcon } from '../components/ui/icons';
import { photoStyle } from '../components/ui/photo';
import { hideTabbar } from '../components/ui/tabbar';

type Props = { f7route?: { params: Record<string, string> }; f7router?: { back: () => void } };

const move = <T,>(list: T[], from: number, to: number) => {
  const copy = [...list];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
};

/**
 * Move a whole group (its header row and the rows under it, up to the next header) past the group above or below.
 * Rows before the first header aren't in a group and stay at the top.
 */
const moveGroup = <T extends { kind?: string }>(rows: T[], headerIndex: number, dir: -1 | 1): T[] => {
  const starts = rows.flatMap((r, i) => (r.kind === 'header' ? [i] : []));
  const k = starts.indexOf(headerIndex);
  const end = (j: number) => (j + 1 < starts.length ? starts[j + 1] : rows.length);
  const first = dir === -1 ? k - 1 : k; // the upper of the two groups that swap
  if (k < 0 || first < 0 || first + 1 >= starts.length) return rows;
  const a = starts[first], b = starts[first + 1], e = end(first + 1);
  return [...rows.slice(0, a), ...rows.slice(b, e), ...rows.slice(a, b), ...rows.slice(e)];
};

/** ↑ ↓ on a group row: move the whole group (with its rows) past the neighbouring group, without dragging */
// `slot` is read by Framework7's ListItem from this element's props (it places it in the row's "after" area)
function GroupMove({ name, isFirst, isLast, onMove }: { slot: 'after'; name: string; isFirst: boolean; isLast: boolean; onMove: (dir: -1 | 1, el: Element) => void }) {
  const label = name.trim() || 'this group';
  return (
    <span className="ck-group-move">
      <Button round className="ck-move-btn" disabled={isFirst} onClick={(e: { currentTarget: Element }) => onMove(-1, e.currentTarget)} aria-label={`Move ${label} up`}>
        <ArrowUp {...inlineIcon} />
      </Button>
      <Button round className="ck-move-btn" disabled={isLast} onClick={(e: { currentTarget: Element }) => onMove(1, e.currentTarget)} aria-label={`Move ${label} down`}>
        <ArrowDown {...inlineIcon} />
      </Button>
    </span>
  );
}

/**
 * Edit Recipe: a stacked page (pushed, with swipe-back) with Prepear's editing features:
 * photo, name, grouped ingredients and directions with paste boxes, notes, tags (courses included),
 * servings, serving size, prep and cook time, source. Style: Headspace edit screen, compact 14px text.
 */
export default function RecipeEditPage({ f7route, f7router }: Props) {
  const { recipes, saveRecipe } = useStore();
  const id = f7route?.params.id;
  const original = useMemo<DemoRecipe>(() => recipes.find((r) => r.id === id) ?? emptyRecipe(), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [draft, setDraft] = useState<DemoRecipe>(original);
  const set = (patch: Partial<DemoRecipe>) => setDraft((d) => ({ ...d, ...patch }));

  const [editingIngredientId, setEditingIngredientId] = useState<string | null>(null);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [ingredientPaste, setIngredientPaste] = useState('');
  const [stepPaste, setStepPaste] = useState('');
  const [discardOpen, setDiscardOpen] = useState(false);
  // a group just added with "Separate into groups": put the cursor in its name field
  const [focusGroupId, setFocusGroupId] = useState<string | null>(null);
  useEffect(() => {
    if (!focusGroupId) return;
    document.querySelector<HTMLInputElement>(`.page-current input[data-group-id="${focusGroupId}"]`)?.focus();
    setFocusGroupId(null);
  }, [focusGroupId]);
  const fileRef = useRef<HTMLInputElement>(null);
  // after ↑/↓ moves a group, scroll so that group stays under the finger
  const keepInView = useRef<{ id: string; dir: -1 | 1; top: number } | null>(null);
  useLayoutEffect(() => {
    const k = keepInView.current;
    if (!k) return;
    keepInView.current = null;
    // the same arrow the finger is on, in the group's new place
    const row = document.querySelector<HTMLElement>(`.page-current input[data-group-id="${k.id}"]`)?.closest('li');
    const arrow = row?.querySelectorAll('.ck-move-btn')[k.dir === -1 ? 0 : 1];
    const scroller = row?.closest('.page-content');
    if (arrow && scroller) scroller.scrollTop += arrow.getBoundingClientRect().top - k.top;
  });
  const shiftGroup = (field: 'ingredients' | 'steps', id: string, dir: -1 | 1, el: Element) => {
    keepInView.current = { id, dir, top: el.getBoundingClientRect().top };
    setDraft((d) => {
      const rows = d[field] as { id: string; kind?: string }[];
      return { ...d, [field]: moveGroup(rows, rows.findIndex((r) => r.id === id), dir) };
    });
  };

  const dirty = JSON.stringify(draft) !== JSON.stringify(original);
  const isNew = !id;

  // ── ingredients ──
  const editingIngredient = draft.ingredients.find((i) => i.id === editingIngredientId) ?? null;
  const updateIngredient = (next: DemoIngredient) => set({ ingredients: draft.ingredients.map((i) => (i.id === next.id ? next : i)) });
  const removeIngredient = (rid: string) => setDraft((d) => ({ ...d, ingredients: d.ingredients.filter((i) => i.id !== rid) }));
  const addPastedIngredients = () => {
    const rows: DemoIngredient[] = pastedLines(ingredientPaste).map((line) =>
      isHeaderLine(line)
        ? { id: newId(), kind: 'header', amount: '', unit: '', name: headerText(line), note: '' }
        : { id: newId(), ...quickParse(line) },
    );
    set({ ingredients: [...draft.ingredients, ...rows] });
    setIngredientPaste('');
  };
  const addIngredientGroup = () => {
    const header: DemoIngredient = { id: newId(), kind: 'header', amount: '', unit: '', name: '', note: '' };
    set({ ingredients: [...draft.ingredients, header] });
    setFocusGroupId(header.id);
  };

  // ── directions ──
  const editingStep = draft.steps.find((s) => s.id === editingStepId) ?? null;
  const updateStep = (text: string) => set({ steps: draft.steps.map((s) => (s.id === editingStepId ? { ...s, text } : s)) });
  const removeStep = (sid: string) => setDraft((d) => ({ ...d, steps: d.steps.filter((s) => s.id !== sid) }));
  const addPastedSteps = () => {
    const rows: DemoStep[] = pastedLines(stepPaste).map((line) =>
      isHeaderLine(line) ? { id: newId(), kind: 'header', text: headerText(line) } : { id: newId(), text: line.replace(/^\d+[.)]\s*/, '') },
    );
    set({ steps: [...draft.steps, ...rows] });
    setStepPaste('');
  };
  const addStepGroup = () => {
    const header: DemoStep = { id: newId(), kind: 'header', text: '' };
    set({ steps: [...draft.steps, header] });
    setFocusGroupId(header.id);
  };

  // ── tags: one set of chips (the course types plus every tag already used), tap to toggle, "Add tag" for a new one ──
  const allTags = useMemo(() => {
    const used = new Set([...recipes.flatMap((r) => r.tags), ...draft.tags]);
    return [...COURSES, ...[...used].filter((t) => !COURSES.includes(t)).sort()];
  }, [recipes, draft.tags]);
  const toggleTag = (t: string) => set({ tags: draft.tags.includes(t) ? draft.tags.filter((x) => x !== t) : [...draft.tags, t] });
  // a new tag is typed right at the end of the chips: Return (or leaving the field) adds it, selected
  const [newTag, setNewTag] = useState('');
  const addTag = () => {
    const t = newTag.trim().replace(/^#+/, '').toLowerCase();
    if (t && !draft.tags.includes(t)) set({ tags: [...draft.tags, t] });
    setNewTag('');
  };

  // ── photo (kept on this phone only until photo upload in Phase 1) ──
  const pickPhoto = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => set({ photo: String(reader.result) });
    reader.readAsDataURL(file);
  };

  const save = () => {
    saveRecipe({ ...draft, title: draft.title.trim() || 'Untitled recipe', minutes: draft.prepMinutes + draft.cookMinutes });
    f7router?.back();
  };
  const cancel = () => (dirty ? setDiscardOpen(true) : f7router?.back());

  let stepNo = 0;
  const ingHeaders = draft.ingredients.filter((i) => i.kind === 'header').map((i) => i.id);
  const stepHeaders = draft.steps.filter((x) => x.kind === 'header').map((x) => x.id);

  return (
    <Page name="recipe-edit" className="ck-edit" noSwipeback={dirty} onPageBeforeIn={hideTabbar}>
      <Navbar innerClassName="navbar-inner-centered-title">
        <NavLeft>
          <Link onClick={cancel}>Cancel</Link>
        </NavLeft>
        <NavTitle>{isNew ? 'New Recipe' : 'Edit Recipe'}</NavTitle>
        <NavRight>
          <Link onClick={save} className="ck-nav-primary">
            Save
          </Link>
        </NavRight>
      </Navbar>

      {/* Photo */}
      <Block>
        {draft.photo ? (
          <div className="ck-edit-photo ck-photo" style={photoStyle(draft.photo)} role="img" aria-label="Recipe photo">
            <span className="ck-edit-photo-actions">
              <Button round className="ck-photo-btn" onClick={() => set({ photo: undefined })} aria-label="Remove photo">
                <Trash2 {...inlineIcon} />
              </Button>
              <Button round className="ck-photo-btn" onClick={() => fileRef.current?.click()} aria-label="Replace photo">
                <ImagePlus {...inlineIcon} />
              </Button>
            </span>
          </div>
        ) : (
          // no photo yet: one plain tappable box (dashed, like "Separate into groups"), no colored placeholder
          <Link noLinkClass className="ck-edit-photo ck-edit-photo-empty" onClick={() => fileRef.current?.click()}>
            <Camera {...inlineIcon} />
            Add a photo
          </Link>
        )}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => pickPhoto(e.target.files?.[0])} />
      </Block>

      <List className="ck-fields">
        <ListInput label="Recipe name" type="text" placeholder="Name of recipe" value={draft.title} onInput={(e) => set({ title: e.target.value })} clearButton />
      </List>

      {/* Ingredients */}
      <BlockTitle medium>Ingredients</BlockTitle>
      {draft.ingredients.length > 0 && (
        <List
          className="ck-edit-list"
          strong
          inset
          dividers
          sortable
          sortableEnabled
          sortableTapHold
          onSortableSort={(data: { from: number; to: number }) => set({ ingredients: move(draft.ingredients, data.from, data.to) })}
        >
          {draft.ingredients.map((i) =>
            i.kind === 'header' ? (
              <ListItem key={i.id} swipeout className="ck-group-row" onSwipeoutDeleted={() => removeIngredient(i.id)}>
                {/* the group name is edited right here, no sheet */}
                <span slot="title" className="ck-group-title">
                  <span className="ck-group-kicker">Group</span>
                  <input
                    className="ck-group-input"
                    data-group-id={i.id}
                    type="text"
                    value={i.name}
                    placeholder="Group name, e.g. Sauce"
                    aria-label="Ingredient group name"
                    enterKeyHint="done"
                    onChange={(e) => updateIngredient({ ...i, name: e.target.value })}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  />
                </span>
                <GroupMove
                  slot="after"
                  name={i.name}
                  isFirst={ingHeaders[0] === i.id}
                  isLast={ingHeaders[ingHeaders.length - 1] === i.id}
                  onMove={(dir, el) => shiftGroup('ingredients', i.id, dir, el)}
                />
                <SwipeoutActions right>
                  <SwipeoutButton delete>Delete</SwipeoutButton>
                </SwipeoutActions>
              </ListItem>
            ) : (
              <ListItem key={i.id} swipeout link="#" noChevron onClick={() => setEditingIngredientId(i.id)} onSwipeoutDeleted={() => removeIngredient(i.id)} footer={i.note || undefined}>
                <span slot="title">
                  <span className="ck-amount">{[i.amount.replace('-', '–'), i.unit].filter(Boolean).join(' ')}</span> {i.name || <span className="ck-note">Tap to edit</span>}
                </span>
                <SwipeoutActions right>
                  <SwipeoutButton delete>Delete</SwipeoutButton>
                </SwipeoutActions>
              </ListItem>
            ),
          )}
        </List>
      )}
      <List className="ck-fields">
        <ListInput
          type="textarea"
          resizable
          placeholder="Add one ingredient per line, or paste your ingredient list here"
          value={ingredientPaste}
          onInput={(e) => setIngredientPaste(e.target.value)}
        />
      </List>
      <Block className="ck-stack">
        {ingredientPaste.trim() && (
          <Button large className="ck-soft" onClick={addPastedIngredients}>
            Add {pastedLines(ingredientPaste).length} {pastedLines(ingredientPaste).length === 1 ? 'line' : 'lines'}
          </Button>
        )}
        <Button className="ck-dashed" onClick={addIngredientGroup}>
          <Plus {...inlineIcon} /> Separate into groups
        </Button>
      </Block>

      {/* Directions */}
      <BlockTitle medium>Directions</BlockTitle>
      {draft.steps.length > 0 && (
        <List
          className="ck-edit-list"
          strong
          inset
          dividers
          sortable
          sortableEnabled
          sortableTapHold
          onSortableSort={(data: { from: number; to: number }) => set({ steps: move(draft.steps, data.from, data.to) })}
        >
          {draft.steps.map((s) => {
            if (s.kind === 'header') stepNo = 0;
            else stepNo += 1;
            return s.kind === 'header' ? (
              <ListItem key={s.id} swipeout className="ck-group-row" onSwipeoutDeleted={() => removeStep(s.id)}>
                <span slot="title" className="ck-group-title">
                  <span className="ck-group-kicker">Group</span>
                  <input
                    className="ck-group-input"
                    data-group-id={s.id}
                    type="text"
                    value={s.text}
                    placeholder="Group name, e.g. Prep"
                    aria-label="Directions group name"
                    enterKeyHint="done"
                    onChange={(e) => set({ steps: draft.steps.map((x) => (x.id === s.id ? { ...x, text: e.target.value } : x)) })}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  />
                </span>
                <GroupMove
                  slot="after"
                  name={s.text}
                  isFirst={stepHeaders[0] === s.id}
                  isLast={stepHeaders[stepHeaders.length - 1] === s.id}
                  onMove={(dir, el) => shiftGroup('steps', s.id, dir, el)}
                />
                <SwipeoutActions right>
                  <SwipeoutButton delete>Delete</SwipeoutButton>
                </SwipeoutActions>
              </ListItem>
            ) : (
              <ListItem key={s.id} swipeout link="#" noChevron onClick={() => setEditingStepId(s.id)} onSwipeoutDeleted={() => removeStep(s.id)}>
                <span slot="title" className="ck-step">
                  <span className="ck-step-no">{stepNo}</span>
                  <span className="ck-step-text">{s.text}</span>
                </span>
                <SwipeoutActions right>
                  <SwipeoutButton delete>Delete</SwipeoutButton>
                </SwipeoutActions>
              </ListItem>
            );
          })}
        </List>
      )}
      <List className="ck-fields">
        <ListInput type="textarea" resizable placeholder="Add a step, or paste all the directions" value={stepPaste} onInput={(e) => setStepPaste(e.target.value)} />
      </List>
      <Block className="ck-stack">
        {stepPaste.trim() && (
          <Button large className="ck-soft" onClick={addPastedSteps}>
            Add {pastedLines(stepPaste).length} {pastedLines(stepPaste).length === 1 ? 'step' : 'steps'}
          </Button>
        )}
        <Button className="ck-dashed" onClick={addStepGroup}>
          <Plus {...inlineIcon} /> Separate into groups
        </Button>
      </Block>

      {/* Notes */}
      <BlockTitle medium>Notes</BlockTitle>
      <List className="ck-fields">
        <ListInput type="textarea" resizable placeholder="Cooking tips, swaps, or thoughts for next time" value={draft.notes} onInput={(e) => set({ notes: e.target.value })} />
      </List>

      {/* Recipe info */}
      <BlockTitle medium>Recipe info</BlockTitle>
      <Block className="ck-stack">
        <span className="ck-label">Tags</span>
        <div className="ck-chips">
          {allTags.map((t) => (
            <Chip key={t} text={titleCase(t)} className={`ck-chip ${draft.tags.includes(t) ? 'ck-chip-on' : ''}`} onClick={() => toggleTag(t)} />
          ))}
          <label className="ck-tag-add">
            <Plus {...inlineIcon} />
            <input
              type="text"
              value={newTag}
              placeholder="Add tag"
              aria-label="Add a tag"
              autoCapitalize="off"
              enterKeyHint="done"
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTag();
                }
              }}
              onBlur={addTag}
            />
          </label>
        </div>
      </Block>
      <Block>
        <div className="ck-row" style={{ justifyContent: 'space-between' }}>
          <b>Servings</b>
          <Stepper round className="ck-stepper" value={draft.servings} min={1} max={99} onStepperChange={(v: number) => set({ servings: v })} />
        </div>
      </Block>
      <List className="ck-fields">
        <ListInput label="Serving size" type="text" placeholder="1 slice" value={draft.servingSize} onInput={(e) => set({ servingSize: e.target.value })} />
      </List>
      <div className="ck-grid2">
        <List className="ck-fields">
          <ListInput
            label="Prep time (min)"
            type="number"
            inputmode="numeric"
            placeholder="0"
            value={draft.prepMinutes || ''}
            onInput={(e) => set({ prepMinutes: Number(e.target.value) || 0 })}
          />
        </List>
        <List className="ck-fields">
          <ListInput
            label="Cook time (min)"
            type="number"
            inputmode="numeric"
            placeholder="0"
            value={draft.cookMinutes || ''}
            onInput={(e) => set({ cookMinutes: Number(e.target.value) || 0 })}
          />
        </List>
      </div>
      <List className="ck-fields">
        <ListInput label="Source" type="text" placeholder="Website or person" value={draft.source} onInput={(e) => set({ source: e.target.value })} clearButton />
      </List>

      <IngredientSheet
        ingredient={editingIngredient && editingIngredient.kind !== 'header' ? editingIngredient : null}
        onChange={updateIngredient}
        onDelete={(rid) => {
          setEditingIngredientId(null);
          removeIngredient(rid);
        }}
        onClose={() => setEditingIngredientId(null)}
      />
      <StepSheet
        noun="Step"
        value={editingStep && editingStep.kind !== 'header' ? editingStep : null}
        onChange={updateStep}
        onDelete={(sid) => {
          setEditingStepId(null);
          removeStep(sid);
        }}
        onClose={() => setEditingStepId(null)}
      />

      <Actions opened={discardOpen} onActionsClosed={() => setDiscardOpen(false)}>
        <ActionsGroup>
          <ActionsButton color="red" onClick={() => f7router?.back()}>
            Discard Changes
          </ActionsButton>
        </ActionsGroup>
        <ActionsGroup>
          <ActionsButton strong>Keep Editing</ActionsButton>
        </ActionsGroup>
      </Actions>
    </Page>
  );
}
