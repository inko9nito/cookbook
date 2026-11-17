import { useState } from 'react';
import {
  Page, Navbar, NavRight, Link, Block, List, ListItem, Button, Toolbar,
  Actions, ActionsGroup, ActionsButton, f7,
} from 'framework7-react';
import { BookOpen, CalendarDays, CookingPot, Ellipsis, Plus, Star, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import ScaleSheet from '../components/ScaleSheet';
import RecipePhotos from '../components/RecipePhotos';
import AddToCookbookPopup from '../components/AddToCookbookPopup';
import { useCookbooks, usePlanner, useStore } from '../data/store';
import { showInPlanner } from '../data/plannerNav';
import { busyDays, mealName, MEALS, mediumDate, plan, today, upcomingDaysOf, type Day, type Meal } from '../lib/planner';
import { pickDay } from '../components/ui/pickDay';
import { colorOf, placesOfRecipe } from '../lib/cookbook';
import { titleCase, linkedRecipe, newId, usedIn, type Ingredient } from '../lib/recipe';
import { friendly } from '../lib/ingredients';
import { footerText, type UnitPicks } from '../components/ui/ingredientLine';
import { ConvertibleAmount, toggleTarget, withPick, type ConvertTarget } from '../components/UnitChoices';
import UnitSheet from '../components/UnitSheet';
import { formatMinutes } from '../components/ui/RecipeCard';
import { navIcon, inlineIcon } from '../components/ui/icons';
import { hideTabbar } from '../components/ui/tabbar';
import { useCook } from '../data/cook';

/** Splits the ingredient list at group rows: [{ label, items }]. Rows before the first group get no label. */
function groupIngredients(list: Ingredient[]) {
  const groups: { id: string; label?: string; items: Ingredient[] }[] = [];
  for (const i of list) {
    if (i.kind === 'header') groups.push({ id: i.id, label: i.name, items: [] });
    else {
      if (!groups.length) groups.push({ id: 'ungrouped', items: [] });
      groups[groups.length - 1].items.push(i);
    }
  }
  return groups.filter((g) => g.items.length || g.label);
}


/** Issue #11: an ingredient made from another recipe ("tahini sauce") opens that recipe, pushed like any page. */
function IngredientName({ ing, linked }: { ing: Ingredient; linked?: { id: string; title: string } }) {
  if (!linked) return <>{ing.name}</>;
  return (
    <Link href={`/recipe/${linked.id}/`} className="ck-ing-linked" aria-label={`${ing.name}, open the ${linked.title} recipe`}>
      {ing.name}
      <ChevronRight {...inlineIcon} aria-hidden="true" />
    </Link>
  );
}

/**
 * A section with nothing in it yet (issue #82: a recipe without directions showed a bare heading over a gap): a soft
 * card saying so, with a button that opens the editor at that section.
 */
function EmptySection({ text, action, onAdd }: { text: string; action: string; onAdd: () => void }) {
  return (
    <div className="ck-sec-empty">
      <p>{text}</p>
      <Button round small className="ck-soft" onClick={onAdd}>
        <Plus {...inlineIcon} aria-hidden="true" />
        {action}
      </Button>
    </div>
  );
}

/** The delete question; a recipe used as an ingredient elsewhere (issue #11) says where, and that those lines stay. */
const deleteText = (title: string, users: string[]) =>
  users.length
    ? `Delete “${title}”? It’s an ingredient in ${users.map((t) => `“${t}”`).join(', ')}. That line stays, without the link.`
    : `Delete “${title}”?`;

type Router = {
  back: (url?: string, options?: { force?: boolean }) => void;
  navigate: (url: string) => void;
  history: string[];
  view: { el: HTMLElement };
};
type Props = { f7route?: { params: Record<string, string>; query?: Record<string, string> }; f7router?: Router };

/** The source's web address as a short name ("seriouseats.com"), for a source with an address and no name. */
const siteOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

/**
 * Recipe page (Airbnb listing layout, solid top bar like Prepear), reading like a plain recipe: photo, title, info, ingredients,
 * directions, notes, then where it belongs (labels, cookbooks; meal plans with #26) and its source (issue #41). App controls stay out of the content: back and ••• (edit, cookbook, plan, groceries,
 * share, duplicate, delete) on top; the servings button next to Ingredients opens Adjust amounts; the footer holds Start cooking.
 * The tab bar is hidden here.
 */
export default function RecipePage({ f7route, f7router }: Props) {
  const { recipes, deleteRecipe, setFilter } = useStore();
  const { cookbooks } = useCookbooks();
  const { planned, savePlanned } = usePlanner();
  const recipe = recipes.find((r) => r.id === f7route?.params.id);
  const cook = useCook();
  // issue #67: opened from the Planner, it starts at the servings it was planned with (?servings=6)
  const [ownFactor, setOwnFactor] = useState(() => {
    const planned = Number(f7route?.query?.servings);
    return recipe && planned > 0 ? planned / recipe.servings : 1;
  });
  const [scaleOpen, setScaleOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [addingToCookbook, setAddingToCookbook] = useState(false);
  // issue #6: the tapped amount (its popover is open), and units picked for some ingredients until the recipe is
  // closed; cook mode shows and changes the same picks
  const [converting, setConverting] = useState<ConvertTarget | null>(null);
  const [ownPicks, setOwnPicks] = useState<UnitPicks>({});
  // issue #85: while the recipe is open in cook mode (on screen or tucked away), the page shows and changes cook mode's
  // amounts, so both read the same
  const cooked = recipe ? cook.amountsOf(recipe.id) : undefined;
  // other recipes open in cook mode, while this one isn't
  const othersCooking = cooked ? 0 : (cook.session?.open.filter((id) => recipes.some((r) => r.id === id)).length ?? 0);
  const factor = cooked?.factor ?? ownFactor;
  const picks = cooked?.picks ?? ownPicks;
  const setFactor = (f: number) => (cooked && recipe ? cook.setFactor(recipe.id, f) : setOwnFactor(f));
  const pickUnit = (id: string, unit: string | null) => (cooked && recipe ? cook.setPick(recipe.id, id, unit) : setOwnPicks((p) => withPick(p, id, unit)));

  if (!recipe) {
    return (
      <Page>
        <Navbar title="Recipe" backLink />
        <Block>This recipe was deleted.</Block>
      </Page>
    );
  }

  const soon = (what: string) => f7.toast.show({ text: `${what} comes in a later phase`, closeTimeout: 1500 });
  const places = placesOfRecipe(cookbooks, recipe.id);
  // issue #62: the days it's planned for, from today on
  const planDays = upcomingDaysOf(planned, recipe.id, today());
  // Add to Planner: a day, then which meal (Framework7 action sheets). The servings shown now go with it (issue #67), so
  // it opens at them from the Planner.
  const addToPlanner = () =>
    pickDay({
      title: 'Plan for which day?',
      busy: busyDays(planned.filter((p) => p.recipeId === recipe.id)),
      onPick: (day) => {
        const servings = scaled ? Math.round(recipe.servings * factor * 100) / 100 : undefined;
        const add = (meal?: Meal) => {
          savePlanned(plan(recipe.id, day, newId, { meal, servings }));
          const what = [mediumDate(day), meal && mealName(meal), servings && `${friendly(servings)} servings`].filter(Boolean).join(' · ');
          f7.toast.show({ text: `Added to ${what}`, closeTimeout: 2000 });
        };
        const sheet = f7.actions.create({
          buttons: [
            [
              { text: `${mediumDate(day)}: which meal?`, label: true },
              ...MEALS.map((m) => ({ text: mealName(m), onClick: () => add(m) })),
              { text: 'Any time', onClick: () => add() },
            ],
            [{ text: 'Cancel', strong: true }],
          ],
          on: { closed: () => sheet.destroy() },
        });
        sheet.open();
      },
    });
  // a Planned chip opens the Planner on that day: back to the Planner in the Plan tab, or over to it
  const showDay = (day: Day) => {
    showInPlanner(day);
    if (f7router?.view.el.id === 'view-plan') f7router.back(f7router.history[0], { force: true });
    else f7.tab.show('#view-plan');
  };
  // a label opens Recipes showing just that label (R2's filter): back to the list in the Recipes tab, or over to it
  const showLabel = (tag: string) => {
    setFilter([tag]);
    if (f7router?.view.el.id === 'view-recipes') f7router.back(f7router.history[0], { force: true });
    else f7.tab.show('#view-recipes');
  };
  const scaled = Math.abs(factor - 1) > 0.001;
  const servingsLabel = `${friendly(recipe.servings * factor)} servings`;
  let stepNo = 0;
  const stepCount = recipe.steps.filter((s) => s.kind !== 'header').length;

  return (
    <Page name="recipe" className="ck-recipe-page" hideNavbarOnScroll onPageBeforeIn={hideTabbar}>
      {/* App controls stay out of the content: back and ••• float over the photo with no bar behind them (issue #7; they
          slide away while scrolling down and come back on scroll up, like Prepear), Start cooking in the footer */}
      <Navbar backLink className="ck-float-bar">
        <NavRight>
          <Link iconOnly onClick={() => setMoreOpen(true)} aria-label="More actions">
            <Ellipsis {...navIcon} />
          </Link>
        </NavRight>
      </Navbar>

      <Toolbar bottom className="ck-cta">
        {/* issue #85: while other recipes are cooking, a dark round cooking-pot button (how many are cooking) goes back to cook
            mode beside "Add to cooking", which adds this one as a tab (the floating Cooking pill hides on recipe pages) */}
        {othersCooking > 0 && (
          <Link className="ck-cta-back" onClick={() => cook.expand()} aria-label={`Back to cook mode, ${othersCooking} ${othersCooking === 1 ? 'recipe' : 'recipes'} cooking`}>
            <CookingPot {...navIcon} />
            <span>{othersCooking}</span>
          </Link>
        )}
        {/* Start cooking opens cook mode on this recipe; once it's there, this brings cook mode back */}
        <Button fill large className="ck-cta-button" onClick={() => cook.start(recipe.id, { factor, picks })}>
          {othersCooking > 0 && <Plus {...navIcon} />}
          {cooked ? 'Resume cooking' : othersCooking > 0 ? 'Add to cooking' : 'Start cooking'}
        </Button>
      </Toolbar>

      <RecipePhotos photos={recipe.photos} title={recipe.title} />

      <div className="ck-panel">
        <div className="ck-panel-head">
          <h1 className="ck-recipe-title">{recipe.title}</h1>
        </div>

        <div className="ck-stats">
          <div>
            <b>{recipe.rating ? recipe.rating.toFixed(1) : '–'}</b>
            <span className="ck-stars" aria-label={`${recipe.rating} of 5 stars`}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Star key={n} size={11} strokeWidth={0} className={n <= recipe.rating ? 'on' : ''} />
              ))}
            </span>
          </div>
          <div>
            <b>{recipe.timesMade}×</b>
            <span>made it</span>
          </div>
          <div>
            {/* no time set: a dash, like an unrated recipe (#14 feedback: "0m" read as instant) */}
            <b>{recipe.minutes > 0 ? formatMinutes(recipe.minutes).replace(' hr ', 'h ').replace(' min', 'm').replace(' hr', 'h') : '–'}</b>
            <span>total time</span>
          </div>
        </div>

        <div className="ck-sec">
          <h2>Ingredients</h2>
          {/* the one place servings show: tap to adjust amounts */}
          <Link className="ck-scale-button" onClick={() => setScaleOpen(true)} aria-label={`${scaled ? `×${friendly(factor)} · ` : ''}${servingsLabel}, adjust amounts`}>
            <span>{scaled ? `×${friendly(factor)} · ${servingsLabel}` : servingsLabel}</span>
            <ChevronDown {...inlineIcon} />
          </Link>
        </div>
        {!recipe.ingredients.some((i) => i.kind !== 'header') && (
          <EmptySection text="No ingredients yet." action="Add ingredients" onAdd={() => f7router?.navigate(`/recipe/${recipe.id}/edit/?at=ingredients`)} />
        )}
      </div>

      {/* each group: a plain label that scrolls with the content (not F7's sticky group title), then its rows */}
      {groupIngredients(recipe.ingredients).map((g) => (
        <div key={g.id} className="ck-ing-group">
          {g.label && <div className="ck-group-label">{g.label}</div>}
          <List dividers className="ck-plain-list ck-ing-list">
            {g.items.map((i) => (
              <ListItem key={i.id} className={converting?.ing.id === i.id ? 'ck-ing-on' : ''}>
                <span slot="media" className="ck-bullet" aria-hidden="true" />
                <span slot="title">
                  {/* issue #6: an amount in a measuring unit is underlined; tap it to pick another unit */}
                  <ConvertibleAmount ing={i} factor={factor} picks={picks} onOpen={(t) => setConverting((cur) => toggleTarget(cur, t))} />{' '}
                  <IngredientName ing={i} linked={linkedRecipe(i, recipes)} />
                </span>
                {/* the note, and "not scaled" for an amount that isn't a number (R5) */}
                {footerText(i, factor) && <span slot="footer">{footerText(i, factor)}</span>}
              </ListItem>
            ))}
          </List>
        </div>
      ))}

      <div className="ck-panel ck-panel-rest">
        <div className="ck-sec">
          <h2>Directions</h2>
        </div>
        {/* issue #82: no directions yet says so, with a way to add them, instead of a gap under the heading */}
        {stepCount === 0 && (
          <EmptySection text="No directions yet." action="Add directions" onAdd={() => f7router?.navigate(`/recipe/${recipe.id}/edit/?at=directions`)} />
        )}
        {recipe.steps.length > 0 && (
          <div className="ck-steps">
            {recipe.steps.map((s) => {
              if (s.kind === 'header') {
                stepNo = 0;
                return (
                  <div key={s.id} className="ck-group-label">
                    {s.text}
                  </div>
                );
              }
              stepNo += 1;
              return (
                <div key={s.id} className="ck-step">
                  <span className="ck-step-no">{stepNo}</span>
                  <span className="ck-step-text">{s.text}</span>
                </div>
              );
            })}
          </div>
        )}

        {recipe.notes && (
          <>
            <div className="ck-sec">
              <h2>Notes</h2>
            </div>
            <div className="ck-notes">{recipe.notes}</div>
          </>
        )}

        {/* issue #41: where it belongs, as chips that open it. Labels open Recipes filtered by that label; each cookbook
            (or section) it's in is a chip in the cookbook's colour; the days it's planned for (#62) open the Planner there.
            Meal plans (#26) will follow, with a clipboard icon. */}
        {recipe.tags.length > 0 && (
          <>
            <div className="ck-sec">
              <h2>Labels</h2>
            </div>
            <div className="ck-chips ck-belongs">
              {recipe.tags.map((t) => (
                <Link key={t} noLinkClass className="chip ck-chip" onClick={() => showLabel(t)}>
                  <span className="chip-label">{titleCase(t)}</span>
                </Link>
              ))}
            </div>
          </>
        )}
        {places.length > 0 && (
          <>
            <div className="ck-sec">
              <h2>Cookbooks</h2>
            </div>
            <div className="ck-chips ck-belongs">
              {places.map((p) => (
                <Link key={p.key} href={p.href} noLinkClass className={`chip ck-chip ck-book-chip ck-tint-${colorOf(p.cookbook)}`}>
                  <BookOpen {...inlineIcon} aria-hidden="true" />
                  <span className="chip-label">{p.label}</span>
                </Link>
              ))}
            </div>
          </>
        )}
        {planDays.length > 0 && (
          <>
            <div className="ck-sec">
              <h2>Planned</h2>
            </div>
            <div className="ck-chips ck-belongs">
              {planDays.map((d) => (
                <Link key={d} noLinkClass className="chip ck-chip ck-plan-chip" onClick={() => showDay(d)}>
                  <CalendarDays {...inlineIcon} aria-hidden="true" />
                  <span className="chip-label">{d === today() ? 'Today' : mediumDate(d)}</span>
                </Link>
              ))}
            </div>
          </>
        )}
        {(recipe.source || recipe.sourceUrl) && (
          <>
            <div className="ck-sec">
              <h2>Source</h2>
            </div>
            {recipe.sourceUrl ? (
              <Link href={recipe.sourceUrl} external target="_blank" className="ck-source ck-source-link">
                {recipe.source || siteOf(recipe.sourceUrl)}
                <ExternalLink {...inlineIcon} aria-hidden="true" />
              </Link>
            ) : (
              <p className="ck-source">{recipe.source}</p>
            )}
          </>
        )}
      </div>


      <UnitSheet slot="fixed" target={converting} factor={factor} picks={picks} onPick={pickUnit} onClosed={() => setConverting(null)} />
      <ScaleSheet opened={scaleOpen} recipe={recipe} factor={factor} onFactor={setFactor} onClose={() => setScaleOpen(false)} />

      <AddToCookbookPopup opened={addingToCookbook} recipe={recipe} onClosed={() => setAddingToCookbook(false)} />

      <Actions opened={moreOpen} onActionsClosed={() => setMoreOpen(false)}>
        <ActionsGroup>
          <ActionsButton onClick={() => f7router?.navigate(`/recipe/${recipe.id}/edit/`)}>Edit Recipe</ActionsButton>
          <ActionsButton onClick={() => setAddingToCookbook(true)}>Add to Cookbook</ActionsButton>
          <ActionsButton onClick={addToPlanner}>Add to Planner</ActionsButton>
          <ActionsButton onClick={() => soon('The grocery list')}>Add to Grocery List</ActionsButton>
          <ActionsButton onClick={() => soon('Sharing')}>Share</ActionsButton>
          <ActionsButton onClick={() => soon('Duplicating')}>Duplicate</ActionsButton>
        </ActionsGroup>
        <ActionsGroup>
          <ActionsButton
            color="red"
            onClick={() =>
              f7.dialog.confirm(deleteText(recipe.title, usedIn(recipe.id, recipes).map((r) => r.title)), 'Delete Recipe', () => {
                deleteRecipe(recipe.id);
                f7router?.back();
              })
            }
          >
            Delete Recipe
          </ActionsButton>
        </ActionsGroup>
        <ActionsGroup>
          <ActionsButton strong>Cancel</ActionsButton>
        </ActionsGroup>
      </Actions>
    </Page>
  );
}
