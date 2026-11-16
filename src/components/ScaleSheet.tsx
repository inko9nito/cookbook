import { useState } from 'react';
import { Sheet, Toolbar, Link, PageContent, Block, BlockFooter, List, ListItem, Stepper, Chip, Button, Segmented, f7 } from 'framework7-react';
import type { Ingredient, Recipe } from '../lib/recipe';
import { amountValue, friendly, scaleAmount, unitFor } from '../lib/ingredients';

type Props = {
  opened: boolean;
  recipe: Recipe;
  factor: number;
  onFactor: (f: number) => void;
  onClose: () => void;
  /** where the dimmed backdrop goes; cook mode passes one inside its popup, which would otherwise cover the shared one */
  backdropEl?: string;
};

type Mode = 'servings' | 'have';

const amountText = (i: Ingredient, factor: number) => {
  const a = scaleAmount(i.amount, factor);
  return [a, unitFor(i.unit, a)].filter(Boolean).join(' ');
};

/**
 * Adjust amounts: one place for scaling, kept out of the recipe itself. Two modes, picked at the top:
 * - Servings: −/+ and quick ×½ ×1 ×2 ×3.
 * - What I have (issue #3): tap an ingredient, type how much of it you have, and everything scales to match.
 *   The amount is asked in an iOS dialog right where you tapped, so there is nothing to find further down the sheet.
 */
export default function ScaleSheet({ opened, recipe, factor, onFactor, onClose, backdropEl }: Props) {
  const [mode, setMode] = useState<Mode>('servings');
  const [matched, setMatched] = useState<{ id: string; have: string } | null>(null);
  const scalable = recipe.ingredients.filter((i) => i.kind !== 'header' && amountValue(i.amount) !== null);
  const servings = recipe.servings * factor;
  const scaled = Math.abs(factor - 1) > 0.001;
  const matchedIng = matched ? scalable.find((i) => i.id === matched.id) : undefined;

  const setByServings = (f: number) => {
    setMatched(null);
    onFactor(f);
  };

  const askHave = (i: Ingredient) => {
    const base = amountValue(i.amount);
    if (!base) return;
    const unit = unitFor(i.unit, '2');
    const dialog = f7.dialog.prompt(
      `The recipe uses ${amountText(i, 1)}. How much do you have${unit ? ` (in ${unit})` : ''}?`,
      i.name[0].toUpperCase() + i.name.slice(1),
      (value: string) => {
        const n = Number(value.trim().replace(',', '.'));
        if (!(n > 0)) return;
        const have = [friendly(n), unitFor(i.unit, String(n))].filter(Boolean).join(' ');
        setMatched({ id: i.id, have });
        onFactor(n / base);
        // the result line is at the top of the sheet, which may be scrolled away after picking a row further down
        f7.toast.show({ text: `Scaled ×${friendly(n / base)} to match ${have} ${i.name}`, closeTimeout: 2200 });
      },
      undefined,
      matched?.id === i.id ? scaleAmount(i.amount, factor).split('–')[0] : '',
    );
    // number keyboard on the phone
    dialog.$el.find('input').attr('inputmode', 'decimal');
  };

  return (
    <Sheet opened={opened} onSheetClosed={onClose} swipeToClose backdrop backdropEl={backdropEl} closeByBackdropClick style={{ height: 'auto', maxHeight: '85vh' }} className="ck-edit-sheet ck-scale-sheet">
      <Toolbar>
        <div className="left">
          <b>Adjust amounts</b>
        </div>
        <div className="right">
          <Link sheetClose>Done</Link>
        </div>
      </Toolbar>
      <PageContent>
        <Block>
          <Segmented strong>
            <Button active={mode === 'servings'} onClick={() => setMode('servings')}>
              Servings
            </Button>
            <Button active={mode === 'have'} onClick={() => setMode('have')}>
              What I have
            </Button>
          </Segmented>
        </Block>

        {/* the result and the way back sit at the top, so they stay in view whichever mode is open */}
        <Block>
          <div className="ck-row ck-scale-result">
            <span className="ck-note">
              {!scaled
                ? 'Showing the original amounts'
                : matchedIng
                  ? `Matched to ${matched?.have} ${matchedIng.name} · ×${friendly(factor)} · about ${friendly(servings)} servings`
                  : `Showing ×${friendly(factor)} · ${friendly(servings)} servings`}
            </span>
            {scaled && <Link onClick={() => setByServings(1)}>Reset</Link>}
          </div>
        </Block>

        {mode === 'servings' ? (
          <Block className="ck-stack">
            <div className="ck-row" style={{ justifyContent: 'space-between' }}>
              <b>Servings</b>
              <Stepper
                round
                className="ck-stepper"
                value={Math.max(1, Math.round(servings))}
                min={1}
                max={99}
                onStepperChange={(v: number) => setByServings(v / recipe.servings)}
              />
            </div>
            <div className="ck-chips">
              {[0.5, 1, 2, 3].map((m) => (
                <Chip
                  key={m}
                  text={`×${m === 0.5 ? '½' : m}`}
                  className={`ck-chip ${Math.abs(factor - m) < 0.001 ? 'ck-chip-on' : ''}`}
                  onClick={() => setByServings(m)}
                />
              ))}
            </div>
          </Block>
        ) : (
          <>
            <BlockFooter>Tap the ingredient you have a different amount of. Everything else scales to match.</BlockFooter>
            <List className="ck-pick-list" strong inset dividers>
              {scalable.map((i) => (
                <ListItem key={i.id} link="#" onClick={() => askHave(i)} after={matched?.id === i.id ? `You have ${matched.have}` : undefined}>
                  <span slot="title">
                    <span className="ck-amount">{amountText(i, 1)}</span> {i.name}
                  </span>
                </ListItem>
              ))}
            </List>
          </>
        )}

      </PageContent>
    </Sheet>
  );
}
