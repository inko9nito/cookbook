import { useEffect, useState } from 'react';
import { Page, Navbar, Subnavbar, Searchbar, List, ListItem, BlockFooter } from 'framework7-react';
import {
  DEFAULT_ID, SUGGESTED, applyDesignSystem, loadDesignSystems, savedDesignSystemId, type DesignSystem,
} from '../theme/designSystem';

function Swatches({ ds }: { ds: DesignSystem | null }) {
  const colors = ds ? [ds.tokens.bg, ds.tokens.surface, ds.tokens.accent, ds.tokens.fg] : ['#efeff4', '#ffffff', '#d9572b', '#000000'];
  return (
    <span slot="media" className="ds-swatches">
      {colors.map((c, i) => (
        <span key={i} className="ds-swatch" style={{ background: c }} />
      ))}
    </span>
  );
}

export default function DesignSystemsPage() {
  const [all, setAll] = useState<DesignSystem[]>([]);
  const [selected, setSelected] = useState(savedDesignSystemId());

  useEffect(() => {
    loadDesignSystems().then(setAll);
  }, []);

  const choose = (id: string) => {
    setSelected(id);
    applyDesignSystem(id);
  };

  const suggested = SUGGESTED.map((id) => all.find((d) => d.id === id)).filter(Boolean) as DesignSystem[];
  const categories = [...new Set(all.map((d) => d.category))].sort();

  const item = (ds: DesignSystem | null) => {
    const id = ds ? ds.id : DEFAULT_ID;
    return (
      <ListItem
        key={id}
        radio
        radioIcon="end"
        name="design-system"
        value={id}
        checked={selected === id}
        onChange={() => choose(id)}
        title={ds ? ds.name : 'iOS Default'}
        footer={ds ? ds.summary : 'Standard iOS look. Follows light and dark mode.'}
      >
        <Swatches ds={ds} />
      </ListItem>
    );
  };

  return (
    <Page name="design-systems">
      <Navbar title="Design System" backLink>
        <Subnavbar inner={false}>
          <Searchbar searchContainer=".ds-list" searchIn=".item-title" placeholder="Search 195 design systems" disableButtonText="Cancel" />
        </Subnavbar>
      </Navbar>

      <List className="searchbar-not-found" strongIos insetIos>
        <ListItem title="No design systems found" />
      </List>

      <List className="ds-list searchbar-found" strongIos insetIos dividersIos mediaList>
        <ListItem groupTitle title="Suggested for recipes" />
        {item(null)}
        {suggested.map(item)}
        {categories.map((cat) => [
          <ListItem key={`t-${cat}`} groupTitle title={cat} />,
          ...all.filter((d) => d.category === cat).map(item),
        ])}
      </List>
      <BlockFooter>
        Design systems come from Open Design (open-design-agent-kit). Tap one to apply it to the whole app right away.
      </BlockFooter>
    </Page>
  );
}
