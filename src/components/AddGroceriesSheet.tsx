import { useEffect, useState } from 'react';
import { Sheet, Toolbar, Link, PageContent, Block, BlockFooter, List, ListItem, Stepper, f7 } from 'framework7-react';
import { ChefHat, ChevronLeft, ChevronRight } from 'lucide-react';
import { addRows, linesOf, newItems, type AddRow } from '../lib/groceries';
import { coverPhoto, newId, type Recipe } from '../lib/recipe';
import { addDays, dayName, mealName, today, weekDays, weekName, weekRange, weekStart, type Day, type Planned } from '../lib/planner';
import { friendly } from '../lib/ingredients';
import { useGroceries, usePlanner, useStore } from '../data/store';
import { inlineIcon } from './ui/icons';
import { photoStyle } from './ui/photo';

const toast = (text: string) => f7.toast.show({ text, closeTimeout: 2200 });
const itemsWord = (n: number) => `${n} ${n === 1 ? 'item' : 'items'}`;

/** Ticks on an add sheet's rows: each starts as the row says (pantry staples unticked), and a tap flips it. */
function useTicks(rows: AddRow[], round: number) {
  const [flipped, setFlipped] = useState<Set<string>>(new Set());
  useEffect(() => setFlipped(new Set()), [round]);
  const on = (r: AddRow) => r.on !== flipped.has(r.key);
  const flip = (key: string) => setFlipped((s) => (s.has(key) ? new Set([...s].filter((k) => k !== key)) : new Set([...s, key])));
  return { on, flip, ticked: rows.filter(on) };
}

/** The ingredients to add (the thing to buy, its amount under it), ticked unless they're usually on hand: untick what you have. */
function AddList({ rows, on, flip }: { rows: AddRow[]; on: (r: AddRow) => boolean; flip: (key: string) => void }) {
  return (
    <>
      <BlockFooter className="ck-sheet-label">Untick what you have</BlockFooter>
      <List strong inset dividers className="ck-pick-list ck-add-list">
        {rows.map((r) => (
          <ListItem
            key={r.key}
            checkbox
            checked={on(r)}
            onChange={() => flip(r.key)}
            title={r.name ? r.name[0].toUpperCase() + r.name.slice(1) : r.name}
            footer={[r.amount, r.note].filter(Boolean).join(' · ') || undefined}
          />
        ))}
      </List>
    </>
  );
}

/**
 * Issue #64: a recipe's ingredients onto the grocery list (the recipe page's ⋯ → Add to Grocery List, or the list's +
 * → A recipe). A Framework7 sheet: the servings (starting at the ones shown), then the ingredients at those servings,
 * all ticked except what's usually in the pantry; what's already on the list says so. Add (top right) adds the ticked
 * ones. The items hold the recipe's and the ingredient's ids and the servings, never the words.
 */
export function AddRecipeSheet({ recipe, servings: startServings, onClosed }: { recipe: Recipe | null; servings?: number; onClosed: () => void }) {
  const { recipes, settings } = useStore();
  const { items, changeGroceries } = useGroceries();
  const [servings, setServings] = useState(1);
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (!recipe) return;
    setServings(startServings ?? recipe.servings);
    setRound((n) => n + 1);
  }, [recipe]); // eslint-disable-line react-hooks/exhaustive-deps

  const lines = linesOf(items, recipes, settings.groceryAisles);
  const rows = recipe ? addRows([{ recipe, servings: servings === recipe.servings ? undefined : servings }], lines, recipes) : [];
  const { on, flip, ticked } = useTicks(rows, round);

  const add = () => {
    if (!ticked.length) return;
    changeGroceries(newItems(ticked.flatMap((r) => r.adds), newId));
    f7.sheet.close('.ck-add-recipe-sheet');
    toast(`Added ${itemsWord(ticked.length)} to the grocery list`);
  };

  return (
    <Sheet
      opened={!!recipe}
      onSheetClosed={onClosed}
      swipeToClose
      backdrop
      closeByBackdropClick
      style={{ height: 'auto' }}
      className="ck-edit-sheet ck-add-sheet ck-add-recipe-sheet"
    >
      <Toolbar>
        <div className="left">
          <b>Add to Grocery List</b>
        </div>
        <div className="right">
          <Link onClick={add} className={ticked.length ? '' : 'disabled'}>
            {`Add ${ticked.length}`}
          </Link>
        </div>
      </Toolbar>
      <PageContent>
        {recipe && (
          <>
            <Block className="ck-stack">
              <p className="ck-note ck-add-recipe-name">{recipe.title}</p>
              <div className="ck-row" style={{ justifyContent: 'space-between' }}>
                <b>Servings</b>
                <Stepper round className="ck-stepper" value={servings} min={1} max={99} onStepperChange={(v: number) => setServings(v)} />
              </div>
            </Block>
            <AddList rows={rows} on={on} flip={flip} />
          </>
        )}
      </PageContent>
    </Sheet>
  );
}

/**
 * Issue #64: Shop this week, from the grocery list's + or the Planner's cart button. Step one ticks the week's planned
 * recipes (arrows for the weeks around it); days gone by and recipes already on the list start unticked. Step two is
 * their ingredients at the planned servings, added up (two recipes' lemons are one row), untick what you have, then Add.
 */
export function ShopWeekSheet({ opened, day, onClosed }: { opened: boolean; day?: Day; onClosed: () => void }) {
  const { recipes, settings } = useStore();
  const { planned } = usePlanner();
  const { items, changeGroceries } = useGroceries();
  const now = today();
  const [start, setStart] = useState<Day>(weekStart(now));
  const [step, setStep] = useState<'recipes' | 'ingredients'>('recipes');
  const [flipped, setFlipped] = useState<Set<string>>(new Set());
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (!opened) return;
    setStart(weekStart(day ?? now));
    setStep('recipes');
    setFlipped(new Set());
    setRound((n) => n + 1);
  }, [opened]); // eslint-disable-line react-hooks/exhaustive-deps

  const byId = new Map(recipes.map((r) => [r.id, r]));
  const days = weekDays(start);
  const week = planned
    .filter((p) => p.recipeId && byId.has(p.recipeId) && days.includes(p.day))
    .sort((a, b) => a.day.localeCompare(b.day) || a.createdAt.localeCompare(b.createdAt));
  const onList = new Set(items.map((g) => g.plannedId).filter(Boolean));
  const startsOn = (p: Planned) => p.day >= now && !onList.has(p.id);
  const isOn = (p: Planned) => startsOn(p) !== flipped.has(p.id);
  const picked = week.filter(isOn);
  const flip = (id: string) => setFlipped((s) => (s.has(id) ? new Set([...s].filter((k) => k !== id)) : new Set([...s, id])));

  const lines = linesOf(items, recipes, settings.groceryAisles);
  const rows =
    step === 'ingredients'
      ? addRows(picked.map((p) => ({ recipe: byId.get(p.recipeId!)!, servings: p.servings, plannedId: p.id })), lines, recipes)
      : [];
  const ticks = useTicks(rows, round);

  const moveWeek = (by: number) => {
    setStart(addDays(start, by * 7));
    setFlipped(new Set());
  };
  const add = () => {
    if (!ticks.ticked.length) return;
    changeGroceries(newItems(ticks.ticked.flatMap((r) => r.adds), newId));
    f7.sheet.close('.ck-shop-week-sheet');
    toast(`Added ${itemsWord(ticks.ticked.length)} to the grocery list`);
  };
  const label = [weekName(start, now), weekRange(start, now)].filter(Boolean).join(' · ');

  return (
    <Sheet
      opened={opened}
      onSheetClosed={onClosed}
      swipeToClose
      backdrop
      closeByBackdropClick
      style={{ height: 'auto' }}
      className="ck-edit-sheet ck-add-sheet ck-shop-week-sheet"
    >
      <Toolbar>
        <div className="left">
          {step === 'recipes' ? (
            <b>Shop this week</b>
          ) : (
            // plain text, so it lines up with the sheet's 24px edge like every sheet's header
            <Link onClick={() => setStep('recipes')} aria-label="Back to the recipes">
              Back
            </Link>
          )}
        </div>
        <div className="right">
          {step === 'recipes' ? (
            <Link onClick={() => setStep('ingredients')} className={picked.length ? '' : 'disabled'}>
              Next
            </Link>
          ) : (
            <Link onClick={add} className={ticks.ticked.length ? '' : 'disabled'}>
              {`Add ${ticks.ticked.length}`}
            </Link>
          )}
        </div>
      </Toolbar>
      <PageContent>
        {step === 'recipes' ? (
          <>
            <Block className="ck-row ck-week-nav">
              <Link iconOnly onClick={() => moveWeek(-1)} aria-label="The week before" className="ck-round-soft">
                <ChevronLeft {...inlineIcon} />
              </Link>
              <b>{label}</b>
              <Link iconOnly onClick={() => moveWeek(1)} aria-label="The week after" className="ck-round-soft">
                <ChevronRight {...inlineIcon} />
              </Link>
            </Block>
            {week.length ? (
              days
                .filter((d) => week.some((p) => p.day === d))
                .map((d) => (
                  <div key={d}>
                    <BlockFooter className="ck-sheet-label">{`${dayName(d, now)}${d < now ? ' (gone by)' : ''}`}</BlockFooter>
                    <List strong inset dividers className="ck-pick-list ck-week-list">
                      {week
                        .filter((p) => p.day === d)
                        .map((p) => {
                          const r = byId.get(p.recipeId!)!;
                          const photo = coverPhoto(r);
                          const meta = [
                            p.meal ? mealName(p.meal) : '',
                            `${friendly(p.servings ?? r.servings)} servings`,
                            onList.has(p.id) ? 'Already on your list' : '',
                          ].filter(Boolean);
                          return (
                            <ListItem key={p.id} checkbox checked={isOn(p)} onChange={() => flip(p.id)} title={r.title} footer={meta.join(' · ')}>
                              <span slot="media" className={`ck-picker-thumb ck-photo${photo ? '' : ' ck-photo-empty'}`} style={photoStyle(photo)} aria-hidden="true">
                                {!photo && <ChefHat size={16} strokeWidth={1.5} />}
                              </span>
                            </ListItem>
                          );
                        })}
                    </List>
                  </div>
                ))
            ) : (
              <Block>
                <p className="ck-note">Nothing planned this week. Plan recipes in the Plan tab, or look at another week.</p>
              </Block>
            )}
          </>
        ) : (
          <>
            <Block>
              <p className="ck-note">{`${picked.length} ${picked.length === 1 ? 'recipe' : 'recipes'} · ${label}`}</p>
            </Block>
            <AddList rows={rows} on={ticks.on} flip={ticks.flip} />
          </>
        )}
      </PageContent>
    </Sheet>
  );
}
