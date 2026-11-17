import { useEffect, useState } from 'react';
import { Popup, Page, Navbar, NavLeft, NavTitle, NavRight, Link, Searchbar, Block, Badge, f7 } from 'framework7-react';
import { colorOf, cookbookRecipeIds, coversFromSpots, coverPhotos, existing, spotsOf, type Cookbook, type CoverSpots } from '../lib/cookbook';
import { coverPhoto, type Recipe } from '../lib/recipe';
import { searchByTitle, searchWords } from '../lib/search';
import { CookbookPlates } from './ui/CookbookTile';
import { photoStyle } from './ui/photo';

type Props = {
  opened: boolean;
  cookbook: Cookbook;
  byId: Map<string, Recipe>;
  /** the cookbook's covers to keep, middle first (see `coversFromSpots`) */
  onDone: (coverRecipeIds: string[]) => void;
  onClosed: () => void;
};

const SPOT_NAMES = ['left plate', 'big plate in the middle', 'right plate'];

/**
 * Issue #80: Cover Photos, the cookbook's three plates picked from its recipes' photos. A full-screen Framework7 popup
 * (like Add Recipes): the cover as it will look at the top, with its plates numbered left to right (1 left, 2 the big
 * one in the middle, 3 right), then the photos as a grid of thumbnails (no names: it's the photos being picked).
 * It opens with the three plates shown now, chosen or not, numbered and first in the grid. Tapping a photo puts it on
 * the first free plate; tapping a numbered one takes it off, leaving the others where they are. A plate left free gets
 * the cookbook's next photo, as the cover would anyway, and the preview shows it.
 */
export default function CoverPickerPopup({ opened, cookbook, byId, onDone, onClosed }: Props) {
  const [spots, setSpots] = useState<CoverSpots>([null, null, null]);
  const [order, setOrder] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [round, setRound] = useState(0);

  // the cookbook's recipes with a photo, in the cookbook's order
  const choices = existing(cookbookRecipeIds(cookbook), byId).filter((r) => coverPhoto(r));

  // each opening starts from the cover as it is, its plates first in the grid (left to right), the rest in the
  // cookbook's order; the order then stays put while picking
  useEffect(() => {
    if (!opened) return;
    const now = spotsOf(cookbook, byId);
    const first = now.filter((id): id is string => !!id);
    setSpots(now);
    setOrder([...first, ...choices.map((r) => r.id).filter((id) => !first.includes(id))]);
    setQuery('');
    setRound((n) => n + 1);
  }, [opened]); // eslint-disable-line react-hooks/exhaustive-deps

  const tap = (id: string) => {
    const at = spots.indexOf(id);
    if (at >= 0) return setSpots((s) => s.map((x, i) => (i === at ? null : x)) as CoverSpots);
    const free = spots.indexOf(null);
    if (free < 0) {
      f7.toast.show({ text: 'All three plates are taken. Tap a numbered photo to free one.', closeTimeout: 2200 });
      return;
    }
    setSpots((s) => s.map((x, i) => (i === free ? id : x)) as CoverSpots);
  };

  const covers = coversFromSpots(spots, cookbook, byId);
  const shown = searchByTitle(existing(order, byId), searchWords(query));

  return (
    <Popup className="ck-link-popup ck-picker-popup ck-cover-popup" opened={opened} onPopupClosed={onClosed} push swipeToClose="to-bottom" swipeHandler=".navbar">
      <Page key={round}>
        <Navbar innerClassName="navbar-inner-centered-title">
          <NavLeft>
            <Link popupClose>Cancel</Link>
          </NavLeft>
          <NavTitle>Cover Photos</NavTitle>
          <NavRight>
            <Link className="ck-nav-primary" onClick={() => onDone(covers)}>
              Done
            </Link>
          </NavRight>
        </Navbar>

        {/* the cover as it will look, on the cookbook's colour, its plates numbered as they're picked */}
        <Block className="ck-cover-preview-block">
          <div className={`ck-cover-preview ck-tint-${colorOf(cookbook)}`}>
            <CookbookPlates photos={coverPhotos(covers, [], byId)} numbered />
          </div>
          <p className="ck-note ck-cover-hint">Tap photos in order: 1 is the left plate, 2 the big one in the middle, 3 the right. Tap a numbered photo to take it off.</p>
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
            <p className="ck-note">No recipes found</p>
          </Block>
        ) : (
          <Block className="ck-cover-grid">
            <div className="grid grid-cols-3 grid-gap">
              {shown.map((r) => {
                const spot = spots.indexOf(r.id);
                return (
                  <button
                    key={r.id}
                    type="button"
                    className={`ck-cover-cell ck-photo${spot >= 0 ? ' ck-cover-on' : ''}`}
                    style={photoStyle(coverPhoto(r))}
                    aria-pressed={spot >= 0}
                    aria-label={spot >= 0 ? `${r.title}, ${spot + 1}, the ${SPOT_NAMES[spot]}` : r.title}
                    onClick={() => tap(r.id)}
                  >
                    {spot >= 0 && <Badge className="ck-cover-no">{spot + 1}</Badge>}
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
