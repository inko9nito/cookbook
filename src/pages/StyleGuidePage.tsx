import { useState } from 'react';
import {
  Page, Navbar, BlockTitle, Block, BlockFooter, List, ListItem, ListInput, Chip, Button, Stepper, Segmented, f7,
} from 'framework7-react';
import { Carrot, Croissant, Milk } from 'lucide-react';
import RecipeCard from '../components/ui/RecipeCard';
import EmptyState, { EMPTY_LOOKS, setEmptyLook, useEmptyLook } from '../components/ui/EmptyState';
import { sampleRecipes } from '../demo/data';

const SWATCHES: [string, string][] = [
  ['Background', '--ck-bg'], ['Surface', '--ck-surface'], ['Soft', '--ck-soft'], ['Text', '--ck-fg'],
  ['Secondary', '--ck-fg2'], ['Muted', '--ck-muted'], ['Line', '--ck-line'], ['Border', '--ck-strong'],
  ['Tomato', '--ck-accent'], ['Tomato pressed', '--ck-accent-press'], ['Tomato ink', '--ck-accent-ink'],
  ['Error', '--ck-error'],
];

/** Every Cookbook component in one place, to check the design on the phone. Spec: DESIGN.md */
export default function StyleGuidePage() {
  const [chip, setChip] = useState('All');
  const [servings, setServings] = useState(8);
  const emptyLook = useEmptyLook();
  const toast = (text: string) => f7.toast.show({ text, closeTimeout: 1800 });

  return (
    <Page name="style-guide">
      <Navbar title="Style Guide" backLink />

      <BlockTitle medium>Colors</BlockTitle>
      <Block>
        <div className="ck-swatches">
          {SWATCHES.map(([name, v]) => (
            <div key={v} className="ck-swatch">
              <span style={{ background: `var(${v})` }} />
              {name}
            </div>
          ))}
        </div>
      </Block>

      <BlockTitle medium>Search bar · Headspace</BlockTitle>
      <BlockFooter>A soft grey pill. See it at the top of the Recipes screen.</BlockFooter>

      <BlockTitle medium>Filter chips · Headspace</BlockTitle>
      <Block className="ck-chips ck-chips-scroll">
        {['All', 'Dinner', 'Soup', 'Dessert', 'Under 30 min'].map((t) => (
          <Chip key={t} text={t} className={`ck-chip ${chip === t ? 'ck-chip-on' : ''}`} onClick={() => setChip(t)} />
        ))}
      </Block>

      <BlockTitle medium>Recipe cards · Prepear grid</BlockTitle>
      <Block>
        <div className="grid grid-cols-2 grid-gap ck-card-grid">
          {sampleRecipes.slice(0, 2).map((r) => (
            <RecipeCard key={r.id} recipe={r} />
          ))}
        </div>
      </Block>

      <BlockTitle medium>Servings and scaling · Pinterest (list) / Airbnb (recipe page)</BlockTitle>
      <Block className="ck-stack">
        <div className="ck-row" style={{ justifyContent: 'space-between' }}>
          <b>Servings</b>
          <Stepper round className="ck-stepper" value={servings} min={1} max={99} onStepperChange={setServings} />
        </div>
        <Segmented strong>
          <Button>×½</Button>
          <Button active>×1</Button>
          <Button>×2</Button>
          <Button>×3</Button>
        </Segmented>
      </Block>

      <BlockTitle medium>Ingredients and directions · recipe page</BlockTitle>
      <BlockFooter>15px rows with hairlines, bold amount, muted note. No checkboxes: checking off comes with Start cooking. Steps use plain bold numbers.</BlockFooter>
      <div className="ck-ing-group">
        <div className="ck-group-label">Marinade</div>
        <List dividers className="ck-plain-list ck-ing-list">
          <ListItem>
            <span slot="media" className="ck-bullet" aria-hidden="true" />
            <span slot="title"><span className="ck-amount">1 cup</span> plain whole milk Greek yogurt</span>
          </ListItem>
          <ListItem>
            <span slot="media" className="ck-bullet" aria-hidden="true" />
            <span slot="title"><span className="ck-amount">½–1 tsp</span> crushed red pepper flakes</span>
            <span slot="footer">reduce if you don’t like heat</span>
          </ListItem>
        </List>
      </div>
      <Block>
        <div className="ck-steps">
          <div className="ck-step">
            <span className="ck-step-no">1</span>
            <span className="ck-step-text">Whisk the yogurt, oil and spices together until smooth.</span>
          </div>
        </div>
      </Block>

      <BlockTitle medium>Buttons · main pill, soft others</BlockTitle>
      <Block className="ck-stack">
        <Button large fill className="ck-main">Start cooking</Button>
        <div className="ck-row">
          <Button large className="ck-soft" style={{ flex: 1 }}>Add to cookbook</Button>
          <Button large className="ck-soft" style={{ flex: 1 }}>Add to list</Button>
        </div>
        <div className="ck-row">
          <span className="ck-badge">Quick</span>
          <span className="ck-badge">New</span>
        </div>
      </Block>

      <BlockTitle medium>Form fields · Headspace (edit page, 14px)</BlockTitle>
      <div className="ck-edit">
        <List className="ck-fields">
          <ListInput label="Recipe name" type="text" defaultValue="Corn pudding" clearButton />
          <ListInput label="Amount" type="text" placeholder="e.g. 1-2" info="Ranges like 1-2 scale correctly" />
          <ListInput label="Recipe name" type="text" placeholder="Name of recipe" errorMessage="Give your recipe a name to save it" errorMessageForce />
          <ListInput type="textarea" placeholder="Add one ingredient per line, or paste your ingredient list here" />
        </List>
      </div>

      {/* issue #118: the three looks for an empty screen, side by side; the one picked is what the app's empty screens
          show on this phone (the Groceries list, for now) until the user settles on one */}
      <BlockTitle medium>Empty states · pick one</BlockTitle>
      <BlockFooter>
        What a screen shows with nothing on it yet: a picture, a few words and one button that opens the same choices as
        the screen’s +. The look picked here is the one the empty grocery list shows on this phone.
      </BlockFooter>
      <Block>
        <Segmented strong className="ck-empty-pick">
          {EMPTY_LOOKS.map(({ look, name }) => (
            <Button key={look} active={emptyLook === look} onClick={() => setEmptyLook(look)}>
              {name}
            </Button>
          ))}
        </Segmented>
      </Block>
      {EMPTY_LOOKS.map(({ look, name }) => (
        <div key={look} className={`ck-empty-sample${emptyLook === look ? ' ck-empty-sample-on' : ''}`}>
          <div className="ck-empty-sample-name">{`${name}${emptyLook === look ? ' · picked' : ''}`}</div>
          <EmptyState
            look={look}
            icons={[Carrot, Milk, Croissant]}
            title="Nothing to buy yet"
            text="Add ingredients from a recipe or your plan."
            action={{ label: 'Add to the list', onClick: () => toast('Opens the same choices as +') }}
          />
        </div>
      ))}

      <BlockTitle medium>Tab bar · DoorDash</BlockTitle>
      <BlockFooter>Docked flat white bar with a hairline on top; Tomato ink for the active tab. It hides on the recipe and edit pages.</BlockFooter>
    </Page>
  );
}
