import { useEffect, useRef, useState, type ComponentProps } from 'react';
import {
  Page, Navbar, NavRight, Link, Block, List, ListItem, Button, Toolbar,
  Actions, ActionsGroup, ActionsButton, Popover, f7,
} from 'framework7-react';
import { Ellipsis, Star, ChevronDown } from 'lucide-react';
import ScaleSheet from '../components/ScaleSheet';
import CookMode from '../components/CookMode';
import RecipePhotos from '../components/RecipePhotos';
import { useStore } from '../data/store';
import { titleCase, type Ingredient } from '../lib/recipe';
import { scaleAmount, friendly } from '../lib/ingredients';
import { conversions, formatConverted } from '../lib/units';
import { amountText, footerText } from '../components/ui/ingredientLine';
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

type PopoverRef = NonNullable<ComponentProps<typeof Popover>['ref']>;

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
  const [converting, setConverting] = useState<{ ing: Ingredient; el: Element } | null>(null);
  const convertPopover = useRef(null) as unknown as PopoverRef;
  // issue #6: once the tapped row's conversions are rendered, point the popover at it
  useEffect(() => {
    if (converting) convertPopover.current?.f7Popover().open(converting.el as HTMLElement);
  }, [converting]);

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
              <ListItem
                key={i.id}
                // issue #6: an amount in a measuring unit opens a popover with it in the other units
                {...(conversions(scaleAmount(i.amount, factor), i.unit).length
                  ? { link: '#', noChevron: true, onClick: (e: { target: Element }) => setConverting({ ing: i, el: e.target.closest('li') ?? e.target }) }
                  : {})}
              >
                <span slot="media" className="ck-bullet" aria-hidden="true" />
                <span slot="title">
                  <span className="ck-amount">{amountText(i, factor)}</span> {i.name}
                </span>
                {/* the neater unit ("= ¾ cup"), the note, and "not scaled" for an amount that isn't a number (R5) */}
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

      {cooking && <CookMode recipe={recipe} factor={factor} onFactor={setFactor} onClose={() => setCooking(false)} />}

      {/* issue #6: the tapped amount in other units, pointing at its row */}
      {/* opened from code with the tapped row as its target (see the effect above); slot="fixed" keeps it outside the
          scrolling content, where Framework7 positions it */}
      <Popover slot="fixed" ref={convertPopover} className="ck-convert" onPopoverClosed={() => setConverting(null)}>
        {converting && (
          <>
            <p className="ck-convert-head">
              <b>{amountText(converting.ing, factor)}</b> {converting.ing.name} is
            </p>
            <List dividersIos className="ck-convert-list">
              {conversions(scaleAmount(converting.ing.amount, factor), converting.ing.unit).map((c) => (
                <ListItem key={c.unit} title={formatConverted(c)} />
              ))}
            </List>
          </>
        )}
      </Popover>
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
              f7.dialog.confirm(`Delete “${recipe.title}”?`, 'Delete Recipe', () => {
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
