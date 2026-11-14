import { useState } from 'react';
import {
  Page, Navbar, NavRight, Link, BlockTitle, Block, List, ListItem, Stepper, Segmented, Button,
  Actions, ActionsGroup, ActionsButton, f7,
} from 'framework7-react';
import { Ellipsis } from 'lucide-react';
import { useStore } from '../demo/store';
import { navIcon } from '../components/ui/icons';
import { scaleAmount } from '../demo/quickParse';
import { formatMinutes } from '../components/ui/FeaturedRecipeCard';
import { photoStyle } from '../components/ui/photo';

type Props = { f7route?: { params: Record<string, string> }; f7router?: { back: () => void } };

export default function RecipePage({ f7route, f7router }: Props) {
  const { recipes, openEditor, deleteRecipe } = useStore();
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

  return (
    <Page name="recipe">
      <Navbar title={recipe.title} backLink>
        <NavRight>
          <Link onClick={() => openEditor(recipe.id)}>Edit</Link>
          <Link iconOnly onClick={() => setMoreOpen(true)} aria-label="More actions">
            <Ellipsis {...navIcon} />
          </Link>
        </NavRight>
      </Navbar>

      <Block>
        <div className="ck-feature ck-photo" data-tone={recipe.tone} role="img" aria-label={recipe.title} style={{ minHeight: 240, ...photoStyle(recipe.photo) }} />
      </Block>
      <BlockTitle large>{recipe.title}</BlockTitle>
      <Block className="ck-note" style={{ fontSize: 15 }}>
        {recipe.source} · {formatMinutes(recipe.minutes)}
      </Block>

      <Block className="ck-stack">
        <div className="ck-row" style={{ justifyContent: 'space-between' }}>
          <b>Servings</b>
          <Stepper round className="ck-stepper" value={servings} min={1} max={99} onStepperChange={setServings} />
        </div>
        <Segmented strong>
          {[0.5, 1, 2, 3].map((m) => (
            <Button key={m} active={Math.abs(factor - m) < 0.001} onClick={() => setServings(recipe.servings * m)}>
              ×{m === 0.5 ? '½' : m}
            </Button>
          ))}
        </Segmented>
      </Block>

      <BlockTitle medium>Ingredients</BlockTitle>
      <List strongIos insetIos dividersIos>
        {recipe.ingredients.map((i) => (
          <ListItem key={i.id} checkbox>
            <span slot="title">
              <span className="ck-amount">{[scaleAmount(i.amount, factor), i.unit].filter(Boolean).join(' ')}</span> {i.name}
              {i.note && <span className="ck-note">, {i.note}</span>}
            </span>
          </ListItem>
        ))}
      </List>

      <BlockTitle medium>Directions</BlockTitle>
      <List mediaList strongIos insetIos dividersIos>
        {recipe.steps.map((s, idx) => (
          <ListItem key={idx} header={`Step ${idx + 1}`} text={s} />
        ))}
      </List>

      <Block className="ck-stack">
        <Button large fill className="ck-main" onClick={() => soon('Cook mode')}>
          Start cooking
        </Button>
        <div className="ck-row">
          <Button large className="ck-soft" style={{ flex: 1 }} onClick={() => soon('Cookbooks')}>
            Add to cookbook
          </Button>
          <Button large className="ck-soft" style={{ flex: 1 }} onClick={() => soon('Grocery list')}>
            Add to list
          </Button>
        </div>
      </Block>

      <Actions opened={moreOpen} onActionsClosed={() => setMoreOpen(false)}>
        <ActionsGroup>
          <ActionsButton onClick={() => soon('Add to plan')}>Add to Plan</ActionsButton>
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
