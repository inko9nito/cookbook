import { useEffect, useState, type ReactNode } from 'react';
import { Popup, Page, Navbar, NavLeft, NavTitle, NavRight, Link, Searchbar, List, ListItem, Block } from 'framework7-react';
import { ChefHat } from 'lucide-react';
import { coverPhoto, type Recipe } from '../lib/recipe';
import { searchByTitle, searchWords } from '../lib/search';
import { photoStyle } from './ui/photo';

type Common = {
  opened: boolean;
  title: string;
  /** the recipes to pick from, in the order shown (A–Z) */
  recipes: Recipe[];
  /** a muted line under a recipe ("In Meat") */
  footer?: (r: Recipe) => string | undefined;
  /** issue #67: a control under the search bar (the Planner's meal slot) */
  top?: ReactNode;
  onClosed: () => void;
};
type Props =
  | (Common & {
      /** Add Recipes: tick several; Done gives the ticked ids (those ticked before first, in their order, then the new ones in the order tapped) */
      mode: 'several';
      selected: string[];
      onDone: (ids: string[]) => void;
      /** a muted line above the list */
      hint?: string;
    })
  | (Common & {
      /** pick one (a cover): picking closes it */
      mode: 'one';
      current?: string | null;
      onPick: (id: string) => void;
    });

/**
 * Issue #25: a full-screen Framework7 popup that stacks over the page like an iOS card, with a search bar and the
 * recipes as rows with a thumbnail. "several" ticks recipes (Add Recipes, the Planner's Add: Cancel, Done); "one" picks
 * one. (A cookbook's cover photos have their own picker, CoverPickerPopup.)
 * The search only reports what's typed (customSearch) and the rows are filtered here, like the Recipes screen.
 */
export default function RecipePickerPopup(props: Props) {
  const { opened, title, recipes, footer, onClosed } = props;
  const [query, setQuery] = useState('');
  const [ticked, setTicked] = useState<string[]>([]);
  const [round, setRound] = useState(0);

  // each opening starts fresh: the search empty, the ticks as they are in the cookbook
  useEffect(() => {
    if (!opened) return;
    setQuery('');
    setRound((n) => n + 1);
    if (props.mode === 'several') setTicked(props.selected);
  }, [opened]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = searchByTitle(recipes, searchWords(query));
  const toggle = (id: string, on: boolean) => setTicked((t) => (on ? [...t.filter((x) => x !== id), id] : t.filter((x) => x !== id)));

  return (
    <Popup
      className="ck-link-popup ck-picker-popup"
      opened={opened}
      onPopupClosed={onClosed}
      push
      swipeToClose="to-bottom"
      swipeHandler=".navbar"
    >
      <Page key={round}>
        <Navbar innerClassName="navbar-inner-centered-title">
          {props.mode === 'several' ? (
            <>
              <NavLeft>
                <Link popupClose>Cancel</Link>
              </NavLeft>
              <NavTitle>{title}</NavTitle>
              <NavRight>
                <Link
                  className="ck-nav-primary"
                  onClick={() => {
                    const before = props.selected.filter((id) => ticked.includes(id));
                    props.onDone([...before, ...ticked.filter((id) => !before.includes(id))]);
                  }}
                >
                  Done
                </Link>
              </NavRight>
            </>
          ) : (
            <>
              <NavTitle>{title}</NavTitle>
              <NavRight>
                <Link popupClose>Cancel</Link>
              </NavRight>
            </>
          )}
        </Navbar>
        <div className="ck-link-search">
          <Searchbar
            customSearch
            backdrop={false}
            disableButton={false}
            placeholder="Search recipes"
            onSearchbarSearch={(_sb, q) => setQuery(String(q ?? ''))}
            onSearchbarClear={() => setQuery('')}
          />
        </div>
        {props.top && <Block className="ck-picker-top">{props.top}</Block>}
        {props.mode === 'several' && props.hint && (
          <Block className="ck-note ck-picker-hint">
            <p>{props.hint}</p>
          </Block>
        )}
        {shown.length === 0 ? (
          <List strongIos insetIos className="ck-picker-empty">
            <ListItem title={recipes.length ? 'No recipes found' : 'No recipes yet'} />
          </List>
        ) : (
          <List strongIos insetIos dividersIos className="ck-convert-list ck-picker-list">
            {shown.map((r) => (
              <ListItem
                key={r.id}
                {...(props.mode === 'several'
                  ? { checkbox: true, checked: ticked.includes(r.id), onChange: (e: { target: { checked: boolean } }) => toggle(r.id, e.target.checked) }
                  : { radio: true, radioIcon: 'start' as const, name: 'ck-pick', checked: props.current === r.id, onChange: () => props.onPick(r.id) })}
                title={r.title}
                footer={footer?.(r)}
              >
                <span slot="media" className={`ck-picker-thumb ck-photo${coverPhoto(r) ? '' : ' ck-photo-empty'}`} style={photoStyle(coverPhoto(r))} aria-hidden="true">
                  {!coverPhoto(r) && <ChefHat size={16} strokeWidth={1.5} />}
                </span>
              </ListItem>
            ))}
          </List>
        )}
      </Page>
    </Popup>
  );
}
