import { Sheet, Toolbar, Link, PageContent, List, ListInput, ListItem, Block, Button } from 'framework7-react';
import type { Ingredient } from '../lib/recipe';
import { formatIngredient } from '../lib/ingredients';

type Props = {
  ingredient: Ingredient | null;
  /** issue #11: the name of the recipe it's made from, and opening the list to pick one */
  linkedTitle?: string;
  onLink: () => void;
  /** where Framework7 puts the sheet: the page's view, so the recipe list stacks over the page and this sheet together */
  containerEl?: string;
  onChange: (i: Ingredient) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
};

/**
 * R4: edit one ingredient. Exactly four fields, changes apply live (no save step),
 * one Done button; swipe down or tap outside also keeps the changes.
 * Issue #11: under them, "Recipe" links the ingredient to another recipe (a sauce, a pie crust): it opens the
 * recipe list (RecipeLinkPopup) stacked over the page and this sheet, which stays open behind it.
 */
export default function IngredientSheet({ ingredient, linkedTitle, onLink, containerEl, onChange, onDelete, onClose }: Props) {
  const set = (patch: Partial<Ingredient>) => ingredient && onChange({ ...ingredient, ...patch });
  return (
    <Sheet
      className="ck-edit-sheet"
      opened={!!ingredient}
      onSheetClosed={onClose}
      swipeToClose
      backdrop
      closeByBackdropClick
      style={{ height: 'auto' }}
      {...(containerEl ? { containerEl } : {})}
    >
      <Toolbar>
        <div className="left">
          <b>&nbsp;&nbsp;Edit Ingredient</b>
        </div>
        <div className="right">
          <Link sheetClose>
            <b>Done</b>
          </Link>
        </div>
      </Toolbar>
      <PageContent>
        {ingredient && (
          <>
            {/* the whole line as it will read, at the top where it's seen while typing */}
            <Block className="ck-note ck-ing-preview">{formatIngredient(ingredient) || 'Preview'}</Block>
            <List className="ck-fields">
              <ListInput
                label="Amount"
                type="text"
                inputmode="decimal"
                placeholder="e.g. 1-2, 1 1/2"
                value={ingredient.amount}
                onInput={(e) => set({ amount: e.target.value })}
                clearButton
              />
              <ListInput
                label="Unit"
                type="text"
                placeholder="cup, tsp, lb…"
                autocapitalize="off"
                value={ingredient.unit}
                onInput={(e) => set({ unit: e.target.value })}
                clearButton
              />
              <ListInput
                label="Ingredient"
                type="text"
                placeholder="kosher salt"
                value={ingredient.name}
                onInput={(e) => set({ name: e.target.value })}
                clearButton
              />
              <ListInput
                label="Note"
                type="text"
                placeholder="divided, chopped…"
                value={ingredient.note}
                onInput={(e) => set({ note: e.target.value })}
                clearButton
              />
            </List>
            {/* issue #11: the recipe it's made from; opens the recipe list (RecipeLinkPopup) */}
            <List strongIos insetIos dividersIos className="ck-link-field">
              <ListItem link="#" title="Recipe" after={linkedTitle ?? 'None'} onClick={onLink} />
            </List>
            <Block>
              <Button large color="red" onClick={() => onDelete(ingredient.id)}>
                Delete Ingredient
              </Button>
            </Block>
          </>
        )}
      </PageContent>
    </Sheet>
  );
}
