import { useState } from 'react';
import {
  Page, Navbar, NavRight, Link, BlockTitle, Block, List, ListItem, Stepper, Segmented, Button,
  Actions, ActionsGroup, ActionsButton, f7,
} from 'framework7-react';
import { useStore } from '../demo/store';
import { scaleAmount } from '../demo/quickParse';

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

  return (
    <Page name="recipe">
      <Navbar title={recipe.title} backLink>
        <NavRight>
          <Link onClick={() => openEditor(recipe.id)}>Edit</Link>
          <Link iconF7="ellipsis_circle" onClick={() => setMoreOpen(true)} />
        </NavRight>
      </Navbar>

      <BlockTitle large>{recipe.title}</BlockTitle>
      <Block>
        {recipe.source} · {recipe.minutes} min
      </Block>

      <List strongIos insetIos dividersIos>
        <ListItem title="Servings">
          <Stepper slot="after" small round fill value={servings} min={1} max={99} onStepperChange={setServings} />
        </ListItem>
      </List>
      <Block>
        <Segmented strong>
          {[0.5, 1, 2, 3].map((m) => (
            <Button key={m} active={Math.abs(factor - m) < 0.001} onClick={() => setServings(recipe.servings * m)}>
              ×{m === 0.5 ? '½' : m}
            </Button>
          ))}
        </Segmented>
      </Block>

      <BlockTitle>Ingredients</BlockTitle>
      <List strongIos insetIos dividersIos>
        {recipe.ingredients.map((i) => (
          <ListItem key={i.id} checkbox title={[scaleAmount(i.amount, factor), i.unit, i.name].filter(Boolean).join(' ')} footer={i.note || undefined} />
        ))}
      </List>

      <BlockTitle>Directions</BlockTitle>
      <List strongIos insetIos dividersIos>
        {recipe.steps.map((s, idx) => (
          <ListItem key={idx} header={`Step ${idx + 1}`} text={s} />
        ))}
      </List>

      <Actions opened={moreOpen} onActionsClosed={() => setMoreOpen(false)}>
        <ActionsGroup>
          <ActionsButton onClick={() => f7.toast.show({ text: 'Add to cookbook — Phase 4', closeTimeout: 1500 })}>Add to Cookbook</ActionsButton>
          <ActionsButton onClick={() => f7.toast.show({ text: 'Add to plan — Phase 5', closeTimeout: 1500 })}>Add to Plan</ActionsButton>
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
