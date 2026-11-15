import { useState } from 'react';
import {
  Page, Navbar, NavRight, Link, Block, List, ListItem, Stepper, Segmented, Button, Toolbar,
  Actions, ActionsGroup, ActionsButton, f7,
} from 'framework7-react';
import { Ellipsis, BookOpen, CalendarDays, ShoppingCart, Share, Heart, Star } from 'lucide-react';
import { useStore } from '../demo/store';
import { titleCase } from '../demo/data';
import { scaleAmount, unitFor } from '../demo/quickParse';
import { formatMinutes } from '../components/ui/FeaturedRecipeCard';
import { photoStyle } from '../components/ui/photo';
import { navIcon, inlineIcon } from '../components/ui/icons';
import { hideTabbar } from '../components/ui/tabbar';

type Props = { f7route?: { params: Record<string, string> }; f7router?: { back: () => void; navigate: (url: string) => void } };

/**
 * Recipe page (Airbnb listing layout): full-bleed photo under a transparent top bar, a rounded panel with
 * a centered title, a stats row, an action row, then servings, ingredients, directions and notes,
 * with a bottom bar for "Start cooking". The tab bar is hidden here.
 */
export default function RecipePage({ f7route, f7router }: Props) {
  const { recipes, deleteRecipe } = useStore();
  const recipe = recipes.find((r) => r.id === f7route?.params.id);
  const [servings, setServings] = useState(recipe?.servings ?? 1);
  const [moreOpen, setMoreOpen] = useState(false);

  if (!recipe) {
    return (
      <Page>
        <Navbar title="Recipe" backLink />
        <Block>This recipe was deleted.</Block>
      </Page>
    );
  }

  const factor = servings / recipe.servings;
  const soon = (what: string) => f7.toast.show({ text: `${what} comes in a later phase`, closeTimeout: 1500 });
  const courses = recipe.tags.map(titleCase).join(' · ');
  let stepNo = 0;

  return (
    <Page name="recipe" className="ck-recipe-page" onPageBeforeIn={hideTabbar}>
      <Navbar title={recipe.title} backLink transparent>
        <NavRight>
          <Link iconOnly onClick={() => soon('Sharing')} aria-label="Share">
            <Share {...navIcon} />
          </Link>
          <Link iconOnly onClick={() => soon('Favorites')} aria-label="Favorite">
            <Heart {...navIcon} />
          </Link>
          <Link iconOnly onClick={() => setMoreOpen(true)} aria-label="More actions">
            <Ellipsis {...navIcon} />
          </Link>
        </NavRight>
      </Navbar>

      <Toolbar bottom className="ck-cta">
        <div className="ck-cta-text">
          <b>{servings} servings</b>
          <span className="ck-note">{formatMinutes(recipe.minutes)}</span>
        </div>
        <Button fill large className="ck-cta-button" onClick={() => soon('Cook mode')}>
          Start cooking
        </Button>
      </Toolbar>

      <div className="ck-hero ck-photo" data-tone={recipe.tone} style={photoStyle(recipe.photo)} role="img" aria-label={recipe.title} />

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

        <div className="ck-actions4">
          {(
            [
              [BookOpen, 'Cookbook', 'Cookbooks'],
              [CalendarDays, 'Plan', 'Meal planning'],
              [ShoppingCart, 'Groceries', 'The grocery list'],
              [Share, 'Share', 'Sharing'],
            ] as const
          ).map(([Icon, label, what]) => (
            <Link key={label} noLinkClass className="ck-action" onClick={() => soon(what)}>
              <span className="ck-action-icon">
                <Icon {...inlineIcon} />
              </span>
              {label}
            </Link>
          ))}
        </div>

        <div className="ck-row" style={{ justifyContent: 'space-between' }}>
          <b>Servings</b>
          <Stepper round className="ck-stepper ck-stepper-outline" value={servings} min={1} max={99} onStepperChange={setServings} />
        </div>
        <Segmented strong className="ck-underline-tabs">
          {[0.5, 1, 2, 3].map((m) => (
            <Button key={m} active={Math.abs(factor - m) < 0.001} onClick={() => setServings(recipe.servings * m)}>
              ×{m === 0.5 ? '½' : m}
            </Button>
          ))}
        </Segmented>

        <div className="ck-sec">
          <h2>Ingredients</h2>
          <Link onClick={() => soon('The grocery list')}>Add to list</Link>
        </div>
      </div>

      <List dividers className="ck-plain-list">
        {recipe.ingredients.map((i) =>
          i.kind === 'header' ? (
            <ListItem key={i.id} groupTitle title={i.name} />
          ) : (
            <ListItem key={i.id} checkbox>
              <span slot="title">
                <span className="ck-amount">{[scaleAmount(i.amount, factor), unitFor(i.unit, scaleAmount(i.amount, factor))].filter(Boolean).join(' ')}</span> {i.name}
              </span>
              {i.note && <span slot="footer">{i.note}</span>}
            </ListItem>
          ),
        )}
      </List>

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

        <Button large className="ck-soft" onClick={() => f7router?.navigate(`/recipe/${recipe.id}/edit/`)}>
          Edit recipe
        </Button>
      </div>

      <Actions opened={moreOpen} onActionsClosed={() => setMoreOpen(false)}>
        <ActionsGroup>
          <ActionsButton onClick={() => f7router?.navigate(`/recipe/${recipe.id}/edit/`)}>Edit Recipe</ActionsButton>
          <ActionsButton onClick={() => soon('Duplicating')}>Duplicate</ActionsButton>
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
