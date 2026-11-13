import { Sheet, Toolbar, Link, PageContent, List, ListInput, Block, Button } from 'framework7-react';
import { formatIngredient, type DemoIngredient } from '../demo/data';

type Props = {
  ingredient: DemoIngredient | null;
  onChange: (i: DemoIngredient) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
};

/**
 * R4: edit one ingredient. Exactly four fields, changes apply live (no save step),
 * one Done button; swipe down or tap outside also keeps the changes.
 */
export default function IngredientSheet({ ingredient, onChange, onDelete, onClose }: Props) {
  const set = (patch: Partial<DemoIngredient>) => ingredient && onChange({ ...ingredient, ...patch });

  return (
    <Sheet
      opened={!!ingredient}
      onSheetClosed={onClose}
      swipeToClose
      backdrop
      closeByBackdropClick
      style={{ height: 'auto' }}
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
            <List strongIos insetIos dividersIos>
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
            <Block className="demo-banner">{formatIngredient(ingredient) || 'Preview'}</Block>
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
