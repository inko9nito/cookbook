import { useState } from 'react';
import {
  Page, Navbar, BlockTitle, Block, BlockFooter, List, ListItem, ListInput, Chip, Button, Stepper, Segmented,
} from 'framework7-react';
import FeaturedRecipeCard from '../components/ui/FeaturedRecipeCard';
import { demoRecipes } from '../demo/data';
import { photoStyle } from '../components/ui/photo';

const SWATCHES: [string, string][] = [
  ['Background', '--ck-bg'], ['Surface', '--ck-surface'], ['Soft', '--ck-soft'], ['Text', '--ck-fg'],
  ['Secondary', '--ck-fg2'], ['Muted', '--ck-muted'], ['Line', '--ck-line'], ['Border', '--ck-strong'],
  ['Tomato', '--ck-accent'], ['Tomato pressed', '--ck-accent-press'], ['Error', '--ck-error'],
];

/** Every Cookbook component in one place, to check the design on the phone. Spec: DESIGN.md */
export default function StyleGuidePage() {
  const [chip, setChip] = useState('All');
  const [servings, setServings] = useState(8);

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
      <Block className="ck-chips">
        {['All', 'Dinner', 'Soup', 'Dessert', 'Under 30 min'].map((t) => (
          <Chip key={t} text={t} className={`ck-chip ${chip === t ? 'ck-chip-on' : ''}`} onClick={() => setChip(t)} />
        ))}
      </Block>

      <BlockTitle medium>Featured recipe · Headspace</BlockTitle>
      <Block>
        <FeaturedRecipeCard recipe={demoRecipes[0]} />
      </Block>

      <BlockTitle medium>Recipe list · Headspace</BlockTitle>
      <List mediaList dividers className="ck-recipes">
        {demoRecipes.slice(1, 4).map((r) => (
          <ListItem key={r.id} title={r.title} text={`${r.minutes} min · Serves ${r.servings}`}>
            <span slot="media" className="ck-thumb ck-photo" data-tone={r.tone} style={photoStyle(r.photo)} />
          </ListItem>
        ))}
      </List>

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

      <BlockTitle medium>Ingredients · Instacart</BlockTitle>
      <List strongIos insetIos dividersIos>
        <ListItem checkbox defaultChecked>
          <span slot="title"><span className="ck-amount">6 cups</span> fresh corn kernels</span>
        </ListItem>
        <ListItem checkbox>
          <span slot="title"><span className="ck-amount">1–2 tsp</span> salt<span className="ck-note">, to taste</span></span>
        </ListItem>
      </List>

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

      <BlockTitle medium>Tab bar · DoorDash</BlockTitle>
      <BlockFooter>Docked flat white bar with a hairline on top; Tomato ink for the active tab. It hides on the recipe and edit pages.</BlockFooter>
    </Page>
  );
}
