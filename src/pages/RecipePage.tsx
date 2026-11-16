import { useState } from 'react';
import {
  Page, Navbar, NavRight, Link, Block, List, ListItem, Button, Toolbar,
  Actions, ActionsGroup, ActionsButton, f7,
} from 'framework7-react';
import { Ellipsis, Star, ChevronDown, ChevronRight } from 'lucide-react';
import ScaleSheet from '../components/ScaleSheet';
import CookMode from '../components/CookMode';
import RecipePhotos from '../components/RecipePhotos';
import { useStore } from '../data/store';
import { titleCase, linkedRecipe, usedIn, type Ingredient } from '../lib/recipe';
import { friendly } from '../lib/ingredients';
import { footerText, type UnitPicks } from '../components/ui/ingredientLine';
import { ConvertibleAmount, toggleTarget, withPick, type ConvertTarget } from '../components/UnitChoices';
import UnitSheet from '../components/UnitSheet';
import { formatMinutes } from '../components/ui/RecipeCard';
import { navIcon, inlineIcon } from '../components/ui/icons';
import { hideTabbar } from '../components/ui/tabbar';

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

/** The delete question; a recipe used as an ingredient elsewhere (issue #11) says where, and that those lines stay. */
const deleteText = (title: string, users: string[]) =>
  users.length
    ? `Delete “${title}”? It’s an ingredient in ${users.map((t) => `“${t}”`).join(', ')}. That line stays, without the link.`
    : `Delete “${title}”?`;

type Props = { f7route?: { params: Record<string, string> }; f7router?: { back: () => void; navigate: (url: string) => void } };

/**
 * Recipe page (Airbnb listing layout, solid top bar like Prepear), reading like a plain recipe: photo, title, info, ingredients,
 * directions, notes. App controls stay out of the content: back and ••• (edit, cookbook, plan, groceries,
 * share, duplicate, delete) on top; the servings button next to Ingredients opens Adjust amounts; the footer holds Start cooking.
 * The tab bar is hidden here.
 */
export default function RecipePage({ f7route, f7router }: Props) {
  const { recipes, deleteRecipe } = useStore();
  const recipe = recipes.find((r) => r.id === f7route?.params.id);
  const [factor, setFactor] = useState(1);
  const [scaleOpen, setScaleOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [cooking, setCooking] = useState(false);
  // issue #6: the tapped amount (its popover is open), and units picked for some ingredients until the recipe is
  // closed; cook mode shows and changes the same picks
  const [converting, setConverting] = useState<ConvertTarget | null>(null);
  const [picks, setPicks] = useState<UnitPicks>({});
  const pickUnit = (id: string, unit: string | null) => setPicks((p) => withPick(p, id, unit));

  if (!recipe) {
    return (
      <Page>
        <Navbar title="Recipe" backLink />
        <Block>This recipe was deleted.</Block>
      </Page>
    );
  }

  const soon = (what: string) => f7.toast.show({ text: `${what} comes in a later phase`, closeTimeout: 1500 });
  const courses = recipe.tags.map(titleCase).join(' · ');
  const scaled = Math.abs(factor - 1) > 0.001;
  const servingsLabel = `${friendly(recipe.servings * factor)} servings`;
  let stepNo = 0;

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
        <Button fill large className="ck-cta-button" onClick={() => setCooking(true)}>
          Start cooking
        </Button>
      </Toolbar>

      <RecipePhotos photos={recipe.photos} title={recipe.title} />

      <div className="ck-panel">
        <div className="ck-panel-head">
          <h1 className="ck-recipe-title">{recipe.title}</h1>
          <span className="ck-note">{[recipe.source, courses].filter(Boolean).join(' · ')}</span>
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
            <b>{formatMinutes(recipe.minutes).replace(' hr ', 'h ').replace(' min', 'm').replace(' hr', 'h')}</b>
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

        {recipe.notes && (
          <>
            <div className="ck-sec">
              <h2>Notes</h2>
            </div>
            <div className="ck-notes">{recipe.notes}</div>
          </>
        )}
      </div>

      {cooking && <CookMode recipe={recipe} factor={factor} picks={picks} onPick={pickUnit} onFactor={setFactor} onClose={() => setCooking(false)} />}

      <UnitSheet slot="fixed" target={converting} factor={factor} picks={picks} onPick={pickUnit} onClosed={() => setConverting(null)} />
      <ScaleSheet opened={scaleOpen} recipe={recipe} factor={factor} onFactor={setFactor} onClose={() => setScaleOpen(false)} />

      <Actions opened={moreOpen} onActionsClosed={() => setMoreOpen(false)}>
        <ActionsGroup>
          <ActionsButton onClick={() => f7router?.navigate(`/recipe/${recipe.id}/edit/`)}>Edit Recipe</ActionsButton>
          <ActionsButton onClick={() => soon('Cookbooks')}>Add to Cookbook</ActionsButton>
          <ActionsButton onClick={() => soon('Meal planning')}>Add to Plan</ActionsButton>
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
