import { useState } from 'react';
import { Sheet, Toolbar, Link, PageContent, Block, BlockTitle, List, ListItem, ListInput, Stepper, Chip, Button } from 'framework7-react';
import type { DemoRecipe } from '../demo/data';
import { amountValue, friendly, scaleAmount, unitFor } from '../demo/quickParse';

type Props = {
  opened: boolean;
  recipe: DemoRecipe;
  factor: number;
  onFactor: (f: number) => void;
  onClose: () => void;
};

/**
 * Adjust amounts: one place for scaling, kept out of the recipe itself.
 * - Servings −/+ and quick ×½ ×2 ×3
 * - Issue #3: pick an ingredient and enter how much you actually have ("4 thighs", "1.5 lb"); everything else follows.
 */
export default function ScaleSheet({ opened, recipe, factor, onFactor, onClose }: Props) {
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [have, setHave] = useState('');
  const scalable = recipe.ingredients.filter((i) => i.kind !== 'header' && amountValue(i.amount) !== null);
  const picked = scalable.find((i) => i.id === pickedId) ?? null;
  const servings = recipe.servings * factor;

  const pick = (id: string) => {
    setPickedId(id);
    const ing = scalable.find((i) => i.id === id);
    setHave(ing ? scaleAmount(ing.amount, factor).split('–')[0] : '');
  };
  const applyHave = (text: string) => {
    setHave(text);
    const base = picked ? amountValue(picked.amount) : null;
    const n = Number(text.replace(',', '.'));
    if (base && n > 0) onFactor(n / base);
  };

  return (
    <Sheet opened={opened} onSheetClosed={onClose} swipeToClose backdrop closeByBackdropClick style={{ height: 'auto', maxHeight: '85vh' }} className="ck-edit-sheet ck-scale-sheet">
      <Toolbar>
        <div className="left">
          <b>Adjust amounts</b>
        </div>
        <div className="right">
          <Link sheetClose>Done</Link>
        </div>
      </Toolbar>
      <PageContent>
        <Block className="ck-stack">
          <div className="ck-row" style={{ justifyContent: 'space-between' }}>
            <b>Servings</b>
            <Stepper
              round
              className="ck-stepper"
              value={Math.max(1, Math.round(servings))}
              min={1}
              max={99}
              onStepperChange={(v: number) => {
                setPickedId(null);
                onFactor(v / recipe.servings);
              }}
            />
          </div>
          <div className="ck-chips">
            {[0.5, 1, 2, 3].map((m) => (
              <Chip
                key={m}
                text={`×${m === 0.5 ? '½' : m}`}
                className={`ck-chip ${Math.abs(factor - m) < 0.001 ? 'ck-chip-on' : ''}`}
                onClick={() => {
                  setPickedId(null);
                  onFactor(m);
                }}
              />
            ))}
          </div>
        </Block>

        <BlockTitle medium>Or match what you have</BlockTitle>
        <List className="ck-pick-list" strong inset dividers>
          {scalable.map((i) => (
            <ListItem key={i.id} radio radioIcon="end" name="scale-by" checked={pickedId === i.id} onChange={() => pick(i.id)}>
              <span slot="title">
                <span className="ck-amount">{[scaleAmount(i.amount, 1), unitFor(i.unit, scaleAmount(i.amount, 1))].filter(Boolean).join(' ')}</span> {i.name}
              </span>
            </ListItem>
          ))}
        </List>
        {picked && (
          <List className="ck-fields">
            <ListInput
              label={`How much ${picked.name} do you have${picked.unit ? ` (${unitFor(picked.unit, '2')})` : ''}?`}
              type="text"
              inputmode="decimal"
              value={have}
              onInput={(e) => applyHave(e.target.value)}
              info={`The recipe calls for ${scaleAmount(picked.amount, 1)} ${unitFor(picked.unit, scaleAmount(picked.amount, 1))}. Everything else scales to match.`.replace(/\s+\./, '.')}
            />
          </List>
        )}

        <Block className="ck-stack">
          <span className="ck-note">
            {Math.abs(factor - 1) < 0.001 ? 'Original amounts' : `Showing ×${friendly(factor)} · about ${friendly(servings)} servings`}
          </span>
          {Math.abs(factor - 1) > 0.001 && (
            <Button
              large
              className="ck-soft"
              onClick={() => {
                setPickedId(null);
                onFactor(1);
              }}
            >
              Back to original amounts
            </Button>
          )}
        </Block>
      </PageContent>
    </Sheet>
  );
}
