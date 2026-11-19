import { useEffect, useState } from 'react';
import { Popup, Page, Navbar, NavLeft, NavTitle, NavRight, Link, Searchbar, Block, Badge } from 'framework7-react';
import { Check } from 'lucide-react';
import { BOOK_COLORS, colorOf, cookbookRecipeIds, coversFromSpots, existing, platesOf, spotsOf, type BookColor, type Cookbook, type CoverSpots } from '../lib/cookbook';
import { coverPhoto, type Recipe } from '../lib/recipe';
import { searchByTitle, searchWords } from '../lib/search';
import { CookbookPlates, type PlateNumber } from './ui/CookbookTile';
import { photoStyle } from './ui/photo';
import { tell } from './ui/toast';

type Props = {
  opened: boolean;
  cookbook: Cookbook;
  byId: Map<string, Recipe>;
  /** Done: the plates to keep (middle first, '' for an automatic plate) and the card's colour */
  onDone: (cover: { coverRecipeIds: string[]; color: BookColor }) => void;
  onClosed: () => void;
};

const SPOT_NAMES = ['left plate', 'big plate in the middle', 'right plate'];
const COLOR_NAMES: Record<BookColor, string> = { blush: 'Blush', sage: 'Sage', butter: 'Butter', sky: 'Sky', oat: 'Oat', lilac: 'Lilac' };

/**
 * Issue #80: Edit Cover, the cookbook's card made in one place: its three plates and its colour. A full-screen
 * Framework7 popup (like Add Recipes): the cover as it will look at the top, the six colours under it, then the
 * cookbook's photos as a grid of thumbnails (no names: it's the photos being picked).
 * The plates are numbered left to right (1 left, 2 the big one in the middle, 3 right). A plate is chosen or automatic:
 * an automatic plate shows the cookbook's next photo with a faint number on the preview, so it's clear nothing was
 * picked for it; in the grid only chosen photos are numbered. Tapping a photo puts it on the first plate that isn't
 * chosen yet (a strong Tomato number and ring); tapping a chosen one makes its plate automatic again, the others
 * staying put. Or tap a plate first (it's selected: a Tomato rim, and the hint says so), then the photo to put on it.
 * Nothing is saved until Done.
 */
export default function EditCoverPopup({ opened, cookbook, byId, onDone, onClosed }: Props) {
  const [spots, setSpots] = useState<CoverSpots>([null, null, null]);
  // a plate tapped in the preview: the next photo tapped goes on it
  const [target, setTarget] = useState<number | null>(null);
  const [color, setColor] = useState<BookColor>(colorOf(cookbook));
  const [order, setOrder] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [round, setRound] = useState(0);

  // the cookbook's recipes with a photo, in the cookbook's order
  const choices = existing(cookbookRecipeIds(cookbook), byId).filter((r) => coverPhoto(r));

  // each opening starts from the card as it is, the plates' photos first in the grid (left to right), the rest in the
  // cookbook's order; the order then stays put while picking
  useEffect(() => {
    if (!opened) return;
    const now = spotsOf(cookbook, byId);
    const first = platesOf(now, cookbook, byId).flatMap((p) => (p.id ? [p.id] : []));
    setSpots(now);
    setTarget(null);
    setColor(colorOf(cookbook));
    setOrder([...first, ...choices.map((r) => r.id).filter((id) => !first.includes(id))]);
    setQuery('');
    setRound((n) => n + 1);
  }, [opened]); // eslint-disable-line react-hooks/exhaustive-deps

  const plates = platesOf(spots, cookbook, byId);
  const tap = (id: string) => {
    const at = spots.indexOf(id);
    // a plate is selected: the photo goes on it (a photo chosen for another plate swaps places with what was there)
    if (target !== null) {
      if (at !== target) setSpots((s) => s.map((x, i) => (i === target ? id : i === at ? s[target] : x)) as CoverSpots);
      setTarget(null);
      return;
    }
    if (at >= 0) return setSpots((s) => s.map((x, i) => (i === at ? null : x)) as CoverSpots);
    const free = spots.indexOf(null);
    if (free < 0) {
      tell('All three plates are chosen. Tap a numbered photo to free one.', 2200);
      return;
    }
    setSpots((s) => s.map((x, i) => (i === free ? id : x)) as CoverSpots);
  };

  const shown = searchByTitle(existing(order, byId), searchWords(query));
  // the preview's plates, middle first, and their numbers, left to right
  const photoOf = (id: string | null) => (id ? coverPhoto(byId.get(id)!) : undefined);
  const numbers = plates.map((p): PlateNumber => (p.id ? (p.chosen ? 'chosen' : 'auto') : 'none'));

  return (
    <Popup className="ck-link-popup ck-picker-popup ck-cover-popup" opened={opened} onPopupClosed={onClosed} push swipeToClose="to-bottom" swipeHandler=".navbar">
      <Page key={round}>
        <Navbar innerClassName="navbar-inner-centered-title">
          <NavLeft>
            <Link popupClose>Cancel</Link>
          </NavLeft>
          <NavTitle>Edit Cover</NavTitle>
          <NavRight>
            <Link className="ck-nav-primary" onClick={() => onDone({ coverRecipeIds: coversFromSpots(spots), color })}>
              Done
            </Link>
          </NavRight>
        </Navbar>

        {/* the card as it will look, in the colour picked, its plates numbered */}
        <Block className="ck-cover-preview-block">
          <div className={`ck-cover-preview ck-tint-${color}`}>
            <CookbookPlates
              photos={[plates[1], plates[0], plates[2]].map((p) => photoOf(p.id) ?? '')}
              numbers={numbers}
              selected={target}
              onPlate={(at) => setTarget((t) => (t === at ? null : at))}
              labels={plates.map((p, at) => `Plate ${at + 1}, the ${SPOT_NAMES[at]}: ${p.id ? byId.get(p.id)!.title : 'empty'}${p.id && !p.chosen ? ', filled in for you' : ''}`)}
            />
          </div>
          {/* the six colours, right under the card they change */}
          <div className="ck-cover-colors" role="radiogroup" aria-label="Cookbook colour">
            {BOOK_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={color === c}
                aria-label={COLOR_NAMES[c]}
                className={`ck-swatch ck-tint-${c}${color === c ? ' ck-swatch-on' : ''}`}
                onClick={() => setColor(c)}
              >
                {color === c && <Check size={20} strokeWidth={2.5} aria-hidden="true" />}
              </button>
            ))}
          </div>
          {target === null ? (
            <p className="ck-note ck-cover-hint">Tap photos in order for plates 1, 2 and 3, or tap a plate first to change just that one. Plates with a faint number are filled in for you.</p>
          ) : (
            <p className="ck-note ck-cover-hint ck-cover-hint-on" role="status">
              Now tap a photo for plate {target + 1}, the {SPOT_NAMES[target]}.
            </p>
          )}
        </Block>

        {choices.length > 9 && (
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
        )}

        {shown.length === 0 ? (
          <Block className="ck-cover-none">
            <p className="ck-note">{choices.length ? 'No recipes found' : 'No photos in this cookbook yet'}</p>
          </Block>
        ) : (
          <Block className="ck-cover-grid">
            <div className="grid grid-cols-3 grid-gap">
              {shown.map((r) => {
                const at = plates.findIndex((p) => p.id === r.id);
                const chosen = at >= 0 && plates[at].chosen;
                return (
                  <button
                    key={r.id}
                    type="button"
                    className={`ck-cover-cell ck-photo${chosen ? ' ck-cover-on' : ''}`}
                    style={photoStyle(coverPhoto(r))}
                    aria-pressed={chosen}
                    aria-label={at >= 0 ? `${r.title}, ${at + 1}, the ${SPOT_NAMES[at]}${chosen ? '' : ', filled in for you'}` : r.title}
                    onClick={() => tap(r.id)}
                  >
                    {chosen && <Badge className="ck-cover-no">{at + 1}</Badge>}
                  </button>
                );
              })}
            </div>
          </Block>
        )}
      </Page>
    </Popup>
  );
}
