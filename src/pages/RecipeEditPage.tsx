import { useMemo, useRef, useState } from 'react';
import {
  Page, Navbar, NavLeft, NavTitle, NavRight, Link, List, ListInput, ListItem, BlockTitle, Block, Button, Chip, Stepper,
  SwipeoutActions, SwipeoutButton, Actions, ActionsGroup, ActionsButton,
} from 'framework7-react';
import { Camera, ImagePlus, Trash2, Plus } from 'lucide-react';
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
 * Edit Recipe: a stacked page (pushed, with swipe-back) with Prepear's editing features:
 * photo, name, grouped ingredients and directions with paste boxes, notes, course, tags,
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
  const [tagText, setTagText] = useState(original.tags.filter((t) => !COURSES.includes(t)).map((t) => `#${t}`).join(' '));
  const [discardOpen, setDiscardOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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
    const header: DemoIngredient = { id: newId(), kind: 'header', amount: '', unit: '', name: 'New group', note: '' };
    set({ ingredients: [...draft.ingredients, header] });
    setEditingIngredientId(header.id);
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
    const header: DemoStep = { id: newId(), kind: 'header', text: 'New group' };
    set({ steps: [...draft.steps, header] });
    setEditingStepId(header.id);
  };

  // ── course and tags ──
  const toggleCourse = (c: string) => set({ tags: draft.tags.includes(c) ? draft.tags.filter((t) => t !== c) : [...draft.tags, c] });
  const applyTags = (text: string) => {
    setTagText(text);
    const own = text.split(/[\s,]+/).map((t) => t.replace(/^#/, '').toLowerCase()).filter(Boolean);
    set({ tags: [...draft.tags.filter((t) => COURSES.includes(t)), ...own] });
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
        <div className="ck-edit-photo ck-photo" data-tone={draft.tone} style={photoStyle(draft.photo)} role="img" aria-label="Recipe photo">
          {!draft.photo && (
            <span className="ck-edit-photo-empty">
              <Camera {...inlineIcon} /> Add a photo
            </span>
          )}
          <span className="ck-edit-photo-actions">
            {draft.photo && (
              <Button round className="ck-photo-btn" onClick={() => set({ photo: undefined })} aria-label="Remove photo">
                <Trash2 {...inlineIcon} />
              </Button>
            )}
            <Button round className="ck-photo-btn" onClick={() => fileRef.current?.click()} aria-label="Choose photo">
              <ImagePlus {...inlineIcon} />
            </Button>
          </span>
        </div>
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
          sortableOpposite
          onSortableSort={(data: { from: number; to: number }) => set({ ingredients: move(draft.ingredients, data.from, data.to) })}
        >
          {draft.ingredients.map((i) =>
            i.kind === 'header' ? (
              <ListItem key={i.id} swipeout link="#" noChevron className="ck-group-row" onClick={() => setEditingIngredientId(i.id)} onSwipeoutDeleted={() => removeIngredient(i.id)} header="Group" title={i.name}>
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
          sortableOpposite
          onSortableSort={(data: { from: number; to: number }) => set({ steps: move(draft.steps, data.from, data.to) })}
        >
          {draft.steps.map((s) => {
            if (s.kind === 'header') stepNo = 0;
            else stepNo += 1;
            return s.kind === 'header' ? (
              <ListItem key={s.id} swipeout link="#" noChevron className="ck-group-row" onClick={() => setEditingStepId(s.id)} onSwipeoutDeleted={() => removeStep(s.id)} header="Group" title={s.text}>
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
        <span className="ck-label">Course</span>
        <div className="ck-chips">
          {COURSES.map((c) => (
            <Chip key={c} text={titleCase(c)} className={`ck-chip ${draft.tags.includes(c) ? 'ck-chip-on' : ''}`} onClick={() => toggleCourse(c)} />
          ))}
        </div>
      </Block>
      <List className="ck-fields">
        <ListInput label="Tags" type="text" placeholder="#holiday #make-ahead" autocapitalize="off" value={tagText} onInput={(e) => applyTags(e.target.value)} />
      </List>
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
      <Block className="ck-note">Swipe a row left to delete it · drag ☰ on the left (or long-press) to reorder · tap a row to edit it</Block>

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
        noun="Group"
        multiline={false}
        value={editingIngredient && editingIngredient.kind === 'header' ? { id: editingIngredient.id, text: editingIngredient.name } : null}
        onChange={(text) => editingIngredient && updateIngredient({ ...editingIngredient, name: text })}
        onDelete={(rid) => {
          setEditingIngredientId(null);
          removeIngredient(rid);
        }}
        onClose={() => setEditingIngredientId(null)}
      />
      <StepSheet
        noun={editingStep?.kind === 'header' ? 'Group' : 'Step'}
        multiline={editingStep?.kind !== 'header'}
        value={editingStep}
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
