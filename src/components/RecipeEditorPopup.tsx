import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Popup, View, Page, Navbar, NavLeft, NavTitle, NavRight, Link, List, ListInput, ListItem, ListButton,
  BlockTitle, Stepper, SwipeoutActions, SwipeoutButton, Sheet, Toolbar, PageContent, Block,
  Actions, ActionsGroup, ActionsButton,
} from 'framework7-react';
import { useStore } from '../demo/store';
import { newId, type DemoIngredient, type DemoRecipe } from '../demo/data';
import { quickParse } from '../demo/quickParse';
import IngredientSheet from './IngredientSheet';

const emptyRecipe = (): DemoRecipe => ({
  id: newId(),
  title: '',
  source: '',
  minutes: 30,
  servings: 4,
  createdAt: new Date().toISOString().slice(0, 10),
  tone: 'green',
  tags: [],
  ingredients: [],
  steps: [],
});

const move = <T,>(list: T[], from: number, to: number) => {
  const copy = [...list];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
};

export default function RecipeEditorPopup() {
  const { recipes, editorOpen, editingId, closeEditor, saveRecipe } = useStore();
  const popupRef = useRef<{ el: HTMLElement | null; f7Popup: () => { params: { swipeToClose: boolean | string } } } | null>(null);

  const [original, setOriginal] = useState<DemoRecipe>(emptyRecipe);
  const [draft, setDraft] = useState<DemoRecipe>(original);
  const [editingIngredientId, setEditingIngredientId] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [discardOpen, setDiscardOpen] = useState(false);

  // Load the recipe each time the editor opens.
  useEffect(() => {
    if (!editorOpen) return;
    const start = recipes.find((r) => r.id === editingId) ?? emptyRecipe();
    setOriginal(start);
    setDraft(start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorOpen, editingId]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(original), [draft, original]);

  // With unsaved changes, swipe-down is turned off so work can't be lost by accident;
  // Cancel then asks "Discard changes?" (like iOS Mail / Notes).
  useEffect(() => {
    const popup = popupRef.current?.f7Popup?.();
    if (popup) popup.params.swipeToClose = dirty ? false : true;
  }, [dirty, editorOpen]);

  const editingIngredient = draft.ingredients.find((i) => i.id === editingIngredientId) ?? null;

  const updateIngredient = (next: DemoIngredient) =>
    setDraft((d) => ({ ...d, ingredients: d.ingredients.map((i) => (i.id === next.id ? next : i)) }));
  const removeIngredient = (id: string) =>
    setDraft((d) => ({ ...d, ingredients: d.ingredients.filter((i) => i.id !== id) }));

  const addIngredient = () => {
    const ing: DemoIngredient = { id: newId(), amount: '', unit: '', name: '', note: '' };
    setDraft((d) => ({ ...d, ingredients: [...d.ingredients, ing] }));
    setEditingIngredientId(ing.id);
  };

  const addPasted = () => {
    const lines = pasteText.split('\n').map((l) => l.trim()).filter(Boolean); // R6: blank lines ignored
    setDraft((d) => ({ ...d, ingredients: [...d.ingredients, ...lines.map((l) => ({ id: newId(), ...quickParse(l) }))] }));
    setPasteText('');
    setPasteOpen(false);
  };

  const cancel = () => (dirty ? setDiscardOpen(true) : closeEditor());
  const save = () => {
    saveRecipe({ ...draft, title: draft.title.trim() || 'Untitled recipe' });
    closeEditor();
  };

  return (
    <Popup ref={popupRef as never} opened={editorOpen} onPopupClosed={closeEditor} push swipeToClose>
      <View>
        <Page>
          <Navbar>
            <NavLeft>
              <Link onClick={cancel}>Cancel</Link>
            </NavLeft>
            <NavTitle>{editingId ? 'Edit Recipe' : 'New Recipe'}</NavTitle>
            <NavRight>
              <Link onClick={save}>
                <b>Save</b>
              </Link>
            </NavRight>
          </Navbar>

          <List>
            <ListInput
              outline
              label="Title"
              type="text"
              placeholder="Recipe name"
              value={draft.title}
              onInput={(e) => setDraft({ ...draft, title: e.target.value })}
              clearButton
            />
            <ListInput
              outline
              label="Source"
              type="text"
              placeholder="Website or person"
              value={draft.source}
              onInput={(e) => setDraft({ ...draft, source: e.target.value })}
              clearButton
            />
          </List>
          <List strongIos insetIos dividersIos>
            <ListItem title="Servings">
              <Stepper slot="after" round className="ck-stepper" value={draft.servings} min={1} max={99} onStepperChange={(v: number) => setDraft((d) => ({ ...d, servings: v }))} />
            </ListItem>
          </List>

          <BlockTitle medium>Ingredients</BlockTitle>
          <List
            strongIos
            insetIos
            dividersIos
            sortable
            sortableEnabled
            sortableOpposite // drag handles on the left, so they never sit on top of the swipe-to-delete button on the right
            sortableTapHold
            onSortableSort={(data: { from: number; to: number }) =>
              setDraft((d) => ({ ...d, ingredients: move(d.ingredients, data.from, data.to) }))
            }
          >
            {draft.ingredients.map((i) => (
              <ListItem
                key={i.id}
                swipeout
                link="#"
                noChevron
                onClick={() => setEditingIngredientId(i.id)}
                onSwipeoutDeleted={() => removeIngredient(i.id)}
                footer={i.note || undefined}
              >
                <span slot="title">
                  <span className="ingredient-amount">{[i.amount.replace('-', '–'), i.unit].filter(Boolean).join(' ')}</span>{' '}
                  {i.name || <span className="ingredient-note">Tap to edit</span>}
                </span>
                <SwipeoutActions right>
                  <SwipeoutButton delete>Delete</SwipeoutButton>
                </SwipeoutActions>
              </ListItem>
            ))}
          </List>
          <List strongIos insetIos dividersIos>
            <ListButton title="Add Ingredient" onClick={addIngredient} />
            <ListButton title="Paste Ingredients" onClick={() => setPasteOpen(true)} />
          </List>
          <Block className="ck-note">
            Tap a row to edit · swipe left to delete · drag ☰ on the left (or long-press) to reorder
          </Block>

          <IngredientSheet
            ingredient={editingIngredient}
            onChange={updateIngredient}
            onDelete={(id) => {
              setEditingIngredientId(null);
              removeIngredient(id);
            }}
            onClose={() => setEditingIngredientId(null)}
          />

          <Sheet opened={pasteOpen} onSheetClosed={() => setPasteOpen(false)} swipeToClose backdrop style={{ height: 'auto' }}>
            <Toolbar>
              <div className="left">
                <Link sheetClose>Cancel</Link>
              </div>
              <div className="right">
                <Link onClick={addPasted}>
                  <b>Add</b>
                </Link>
              </div>
            </Toolbar>
            <PageContent>
              <List>
                <ListInput
                  outline
                  type="textarea"
                  label="One ingredient per line"
                  placeholder={'1-2 tsp kosher salt, divided\n2 cups flour'}
                  value={pasteText}
                  onInput={(e) => setPasteText(e.target.value)}
                  resizable
                />
              </List>
            </PageContent>
          </Sheet>

          <Actions opened={discardOpen} onActionsClosed={() => setDiscardOpen(false)}>
            <ActionsGroup>
              <ActionsButton color="red" onClick={closeEditor}>
                Discard Changes
              </ActionsButton>
            </ActionsGroup>
            <ActionsGroup>
              <ActionsButton strong>Keep Editing</ActionsButton>
            </ActionsGroup>
          </Actions>
        </Page>
      </View>
    </Popup>
  );
}
