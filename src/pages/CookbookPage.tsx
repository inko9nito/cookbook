import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  Page, Navbar, NavRight, Subnavbar, Link, Searchbar, Block, BlockFooter, Button,
  f7,
} from 'framework7-react';
import { ArrowUpDown, Ellipsis, Plus, ListOrdered, FolderPlus, Pencil, ImageIcon, Trash2 } from 'lucide-react';
import Menu from '../components/ui/Menu';
import { navIcon } from '../components/ui/icons';
import { showTabbar } from '../components/ui/tabbar';
import { useAtTop } from '../components/ui/atTop';
import { say } from '../components/ui/toast';
import RecipeCard from '../components/ui/RecipeCard';
import { CountSkeleton, RecipeGridSkeleton } from '../components/ui/Skeletons';
import RecipePickerPopup from '../components/RecipePickerPopup';
import EditCoverPopup from '../components/EditCoverPopup';
import { CookbookPlates } from '../components/ui/CookbookTile';
import OrganizePopup from '../components/OrganizePopup';
import { useCookbooks, useStore } from '../data/store';
import { changeNote, colorOf, platePhotos, cookbookRecipeIds, coversOf, existing, recipeIdsOf, withRecipeIds, type BookColor, type Cookbook } from '../lib/cookbook';
import { CookbookSort, newId, SORT_LABELS, sortRecipes, type Recipe } from '../lib/recipe';
import { searchByTitle, searchWords } from '../lib/search';
import CookingFab from '../components/CookingFab';

type Props = {
  f7route?: { params: Record<string, string> };
  f7router?: { back: () => void; navigate: (url: string) => void };
};

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
// how many recipes a section's shelf shows; See all opens the rest
const SHELF = 12;
// Uncategorized has a shelf and a page like a section's, at /cookbook/:id/section/uncategorized/
const UNCATEGORIZED = 'uncategorized';
const aToZ = (a: Recipe, b: Recipe) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });

/**
 * A cookbook, or one of its sections (issue #25): /cookbook/:id/ and /cookbook/:id/section/:sectionId/.
 * A cookbook with sections shows each as a shelf of its recipes (scrolling sideways, See all opens the section), and
 * its Uncategorized recipes as one more shelf; without sections, just its recipes as a grid.
 * A section shows its cookbook's name above its own, then its recipes. The search covers every recipe shown from here
 * (a cookbook's sections too). Sort (issue #95) orders the recipes everywhere in the cookbook, its sections too, and is
 * remembered for each cookbook; Manual, the default, is the cookbook's own order (Organize). + adds recipes; ⋯ holds Organize, New Section, Rename, Edit Cover (the three photos
 * on the cookbook's plates and its card's soft colour, issue #80) and Delete.
 */
export default function CookbookPage({ f7route, f7router }: Props) {
  const { recipes, cookbookSort, setCookbookSort } = useStore();
  const { cookbooks, loading, saveCookbook, deleteCookbook } = useCookbooks();
  const [query, setQuery] = useState('');
  // issue #90 (the cookbook's header), set by its scroll listener below: `docked` once the header's search bar has
  // scrolled up to the bar (which then shows its own, Framework7's docked subnavbar), `titled` once the name is under
  // the bar, `solid` once the plates and colour have faded
  const [docked, setDocked] = useState(false);
  const [titled, setTitled] = useState(false);
  const [solid, setSolid] = useState(false);
  const headerRef = useRef<HTMLDivElement>(null);
  const headerSearchRef = useRef<HTMLDivElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [choosingCover, setChoosingCover] = useState(false);
  const [organizing, setOrganizing] = useState(false);

  // Deleting the cookbook (or this section) goes back at once, and this page keeps showing it as it was while it slides
  // away, instead of turning into "Not found" mid-slide (seen in issue #141's recording)
  const leaving = useRef<Cookbook | null>(null);
  const book = leaving.current ?? cookbooks.find((c) => c.id === f7route?.params.id);
  const sectionId = f7route?.params.sectionId ?? null;
  const uncategorized = sectionId === UNCATEGORIZED;
  // the place this page shows: a section, Uncategorized (null), or the whole cookbook (null, with no section)
  const placeId = uncategorized ? null : sectionId;
  const section =
    book && sectionId
      ? uncategorized
        ? { id: UNCATEGORIZED, name: 'Uncategorized', coverRecipeId: null, recipeIds: book.recipeIds }
        : book.sections.find((s) => s.id === sectionId)
      : undefined;
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const hasHeader = !!book && !sectionId;
  // issue #99: the docked search bar's line and shadow show only once the page has scrolled (as on Recipes)
  const { atTop, onPageInit } = useAtTop();

  // issue #90 (the user's mockup): the header scrolls with the page, and as it does
  // - its plates and colour fade out from the first pixel (`--ck-hero-p`, 0 at the top to 1 once the plates have gone
  //   under the bar); the bar stays fully see-through until they've gone, then takes the page colour (`solid`), which
  //   is what's under it by then; its buttons are the usual bar buttons throughout;
  // - the title comes into the bar once the header's name has gone all the way under it, as in iOS (never in both
  //   places), and the count under the name hides at that moment (`titled`);
  // - once the header's search bar reaches the bar, the bar's docked one takes over exactly there and the header's is
  //   hidden (`docked`), so there's only ever one; from then on the title row hides on scrolling down and comes back on
  //   scrolling up with Framework7's own navbar.hide()/show() (its hideNavbarOnScroll would start after 44px, taking the
  //   buttons away with the header still on screen).
  // The user approved this one listener (Nov 2026) because Framework7 has no header that scrolls away like this.
  useEffect(() => {
    const header = headerRef.current;
    const search = headerSearchRef.current;
    const content = header?.closest<HTMLElement>('.page-content');
    const pageEl = header?.closest<HTMLElement>('.page');
    const navbar = pageEl?.querySelector<HTMLElement>(':scope > .navbar');
    const plates = header?.querySelector<HTMLElement>('.ck-plates');
    const name = header?.querySelector<HTMLElement>('.ck-book-hero-title');
    if (!header || !search || !content || !pageEl || !navbar || !plates || !name) return;
    let previous = content.scrollTop;
    const check = () => {
      const now = content.scrollTop;
      // where the bar ends when it's showing (its height ignores the slide when Framework7 hides it)
      const barBottom = pageEl.getBoundingClientRect().top + navbar.offsetHeight;
      // how far the page scrolls before the plates are under the bar
      const fade = Math.max(1, plates.getBoundingClientRect().bottom + now - barBottom);
      const progress = Math.min(1, Math.max(0, now / fade));
      pageEl.style.setProperty('--ck-hero-p', String(progress));
      setSolid(progress >= 1);
      // as iOS does it: the title is in the bar only once the name has gone all the way under it, never both at once
      setTitled(name.getBoundingClientRect().bottom <= barBottom + 1);
      const isDocked = search.getBoundingClientRect().top <= barBottom;
      setDocked(isDocked);
      if (isDocked && now > previous) f7.navbar.hide(navbar, true);
      else if (now < previous || !isDocked) f7.navbar.show(navbar, true);
      previous = now;
    };
    check();
    content.addEventListener('scroll', check, { passive: true });
    return () => content.removeEventListener('scroll', check);
  }, [hasHeader]);

  // Not there (yet, or any more). Same page and the same header (key "navbar") as below, so if the cookbook turns up a
  // moment later, React keeps the header Framework7 set up instead of building a new one. Still loading (issue #35):
  // grey placeholders in the page's shape, the count and the recipe tiles.
  if (!book || (sectionId && !section)) {
    return (
      // as on Recipes: the title row slides away while scrolling down and comes back on scrolling up; the search bar stays
    <Page name="cookbook" className={`ck-cookbook-page${atTop ? ' ck-at-top' : ''}`} hideNavbarOnScroll onPageInit={onPageInit} onPageAfterIn={showTabbar}>
      {/* issue #85: back to tucked-away cook mode; part of the page, so it slides with it */}
      <CookingFab slot="fixed" />
        <Navbar key="navbar" backLink title={loading ? '' : 'Not found'} />
        {loading ? (
          [
            <Block key="count" className="ck-count">
              <CountSkeleton text="12 recipes · 3 sections" />
            </Block>,
            <RecipeGridSkeleton key="grid-loading" />,
          ]
        ) : (
          <Block key="missing" className="ck-list-state">
            <p className="ck-note">{sectionId ? 'This section isn’t here any more.' : 'This cookbook isn’t here any more.'}</p>
          </Block>
        )}
      </Page>
    );
  }
  // something for Organize to order: recipes, or sections to move
  const canOrganize = cookbookRecipeIds(book).some((id) => byId.has(id)) || book.sections.length > 1;

  const save = (c: Cookbook) => saveCookbook(c);
  // issue #95: the cookbook's sort, for every shelf, section and search in it (Manual: the order Organize sets)
  const sort = cookbookSort(book.id);
  const sorted = (ids: string[]) => sortRecipes(existing(ids, byId), sort);
  // what this page holds: the cookbook's Uncategorized recipes, or the section's
  const placeIds = recipeIdsOf(book, placeId);
  const here = sorted(placeIds);
  // the search covers everything shown from here: a cookbook's sections too
  const searchable = section ? here : sorted(cookbookRecipeIds(book));
  // the count says how they're sorted, as on Recipes, once it isn't the cookbook's own order
  const sortNote = sort === 'manual' ? '' : ` · ${SORT_LABELS[sort]}`;
  const words = searchWords(query);
  const found = searchByTitle(searchable, words);
  const name = section ? section.name : book.name;

  // where else in this cookbook a recipe is, for Add Recipes ("In Meat", "Uncategorized")
  const elsewhere = (r: Recipe) => {
    const places = [
      ...(placeId !== null && book.recipeIds.includes(r.id) ? ['Uncategorized'] : []),
      ...book.sections.filter((s) => s.id !== placeId && s.recipeIds.includes(r.id)).map((s) => s.name),
    ];
    return places.length ? places.map((p) => (p === 'Uncategorized' ? p : `In ${p}`)).join(' · ') : undefined;
  };

  const rename = () =>
    f7.dialog.prompt(
      '',
      section ? 'Rename Section' : 'Rename Cookbook',
      (value: string) => {
        if (!value.trim()) return;
        save(section ? { ...book, sections: book.sections.map((s) => (s.id === section.id ? { ...s, name: value.trim() } : s)) } : { ...book, name: value.trim() });
      },
      () => undefined,
      name,
    );

  const newSection = () =>
    f7.dialog.prompt('Like “Meat”, “Seafood” or “Sides”.', 'New Section', (value: string) => {
      if (!value.trim()) return;
      const s = { id: newId(), name: value.trim(), coverRecipeId: null, recipeIds: [] };
      save({ ...book, sections: [...book.sections, s] });
      f7router?.navigate(`/cookbook/${book.id}/section/${s.id}/`);
    });

  const remove = () => {
    if (section) {
      const moving = section.recipeIds.filter((id) => byId.has(id) && !book.recipeIds.includes(id)).length;
      f7.dialog.confirm(
        moving ? `Its ${count(moving, 'recipe')} move to Uncategorized.` : 'It has no recipes.',
        `Delete “${section.name}”?`,
        () => {
          leaving.current = book;
          save({ ...book, recipeIds: [...new Set([...book.recipeIds, ...section.recipeIds])], sections: book.sections.filter((s) => s.id !== section.id) });
          f7router?.back();
          say(`Deleted “${section.name}”`);
        },
      );
    } else {
      f7.dialog.confirm('Its recipes stay in Recipes.', `Delete “${book.name}”?`, () => {
        leaving.current = book;
        deleteCookbook(book.id);
        f7router?.back();
        say(`Deleted “${book.name}”`);
      });
    }
  };

  // Edit Cover (issue #80): the cookbook's plates (middle first, '' for one filled in automatically) and its colour
  const saveCover = ({ coverRecipeIds, color }: { coverRecipeIds: string[]; color: BookColor }) => {
    setChoosingCover(false);
    if (coverRecipeIds.join() === coversOf(book).join() && color === colorOf(book)) return;
    save({ ...book, coverRecipeIds, coverRecipeId: coverRecipeIds[0] || null, color });
  };

  const searching = words.length > 0;
  // a section with recipes, or a cookbook with recipes or sections: otherwise the page says it's empty
  const hasAny = section ? here.length > 0 : searchable.length > 0 || book.sections.length > 0;

  // issue #90: a cookbook's page opens with its card's look, a header in its colour with its plates and its name large
  // (from the user's Spotify reference); a section's page keeps the plain bar
  const hero = !section;
  // the search bar: the bar's own (docked), and on a cookbook's page the header's too, showing the same search
  const searchbar = (
    <Searchbar
      customSearch
      backdrop={false}
      disableButton={false}
      value={query}
      placeholder={section ? 'Search this section' : 'Search this cookbook'}
      onSearchbarSearch={(_sb, q) => setQuery(String(q ?? ''))}
      onSearchbarClear={() => setQuery('')}
    />
  );
  const tint = hero ? ({ '--ck-tint': `var(--ck-book-${colorOf(book)})` } as CSSProperties) : undefined;

  return (
    // as on Recipes: the title row slides away while scrolling down and comes back on scrolling up; the search bar stays.
    // With the header (issue #90), the bar has no background over the header, and no title or search bar of its own until
    // the header's search bar reaches it; the title row's hiding is done by the header's scroll listener (above).
    <Page name="cookbook" className={`ck-cookbook-page${hero ? ' ck-book-hero-page' : ''}${atTop ? ' ck-at-top' : ''}`} style={tint} hideNavbarOnScroll={!hero} onPageInit={onPageInit} onPageAfterIn={showTabbar}>
      {/* issue #85: back to tucked-away cook mode; part of the page, so it slides with it */}
      <CookingFab slot="fixed" />
      <Navbar
        key="navbar"
        backLink
        title={name}
        subtitle={section ? book.name : undefined}
        className={hero ? `ck-hero-bar${docked ? ' ck-hero-docked' : ''}${titled ? ' ck-hero-titled' : ''}${solid ? ' ck-hero-solid' : ''}` : undefined}
      >
        <NavRight>
          <Link iconOnly onClick={() => setAdding(true)} aria-label="Add recipes" className="ck-nav-primary">
            <Plus {...navIcon} />
          </Link>
          {/* issue #95: sorting, as on Recipes */}
          <Link iconOnly onClick={() => setSortOpen(true)} aria-label="Sort recipes">
            <ArrowUpDown {...navIcon} />
          </Link>
          {/* Uncategorized's ⋯ only organizes: no ⋯ while there's nothing to organize */}
          {(!uncategorized || canOrganize) && (
            <Link iconOnly onClick={() => setMoreOpen(true)} aria-label="More actions">
              <Ellipsis {...navIcon} />
            </Link>
          )}
        </NavRight>
        {/* issue #63: the search bar stays under the title while the shelves scroll (Framework7's subnavbar, as on
            Recipes). It's always there, even with nothing to search yet, so the page keeps its shape. */}
        <Subnavbar className="ck-docked-bar ck-search-bar">{searchbar}</Subnavbar>
      </Navbar>

      {/* issue #90: the header, from the user's Spotify reference and their mockup: the cookbook's colour fading into the
          page, its plates big, its name and counts, then its search bar; it all scrolls away with the page, and the
          search bar hands over to the bar's own once it gets there */}
      {hero && (
        <div key="header" className="ck-book-hero" ref={headerRef}>
          <CookbookPlates photos={platePhotos(book, byId)} />
          <h1 className="ck-book-hero-title">{name}</h1>
          <p className={`ck-book-hero-meta${titled ? ' ck-book-hero-meta-gone' : ''}`}>
            {count(searchable.length, 'recipe')}
            {book.sections.length > 0 && ` · ${count(book.sections.length, 'section')}`}
            {sortNote}
          </p>
        </div>
      )}
      {hero && (
        <div key="header-search" className={`ck-hero-search${docked ? ' ck-hero-search-handed-over' : ''}`} ref={headerSearchRef} aria-hidden={docked || undefined}>
          {searchbar}
        </div>
      )}

      {/* keys: Page leaves out the blocks that aren't shown and lists the rest by position (see RecipesPage). The
          header already counts a cookbook's recipes, so its count line shows only while searching. */}
      {hasAny && (!hero || searching) && (
        <Block key="count" className="ck-count">
          <span className="ck-note">
            {searching ? `${found.length} of ${count(searchable.length, 'recipe')}` : count(searchable.length, 'recipe')}
            {!section && !searching && book.sections.length > 0 && ` · ${count(book.sections.length, 'section')}`}
            {sortNote}
          </span>
        </Block>
      )}

      {!hasAny && (
        <Block key="empty" className="ck-list-state">
          <p className="ck-note">{section ? 'No recipes in this section yet.' : 'No recipes in this cookbook yet.'}</p>
          <Button round fill className="ck-main ck-inline-button" onClick={() => setAdding(true)}>
            Add recipes
          </Button>
        </Block>
      )}

      {searching && found.length === 0 && (
        <BlockFooter key="not-found" className="ck-not-found">
          No recipes found
        </BlockFooter>
      )}

      {/* each section is a shelf: its name and count (both open it), See all, and its first recipes in a row that scrolls
          sideways (issue #25 redesign: cookbooks are plates, sections shelves, recipes square tiles). Uncategorized is
          the last shelf, when it has recipes. */}
      {!searching &&
        !section &&
        book.sections.length > 0 &&
        [...book.sections, ...(here.length ? [{ id: UNCATEGORIZED, name: 'Uncategorized', recipeIds: book.recipeIds }] : [])].map((s) => {
          const inShelf = sorted(s.recipeIds);
          const href = `/cookbook/${book.id}/section/${s.id}/`;
          return (
            <div key={`shelf-${s.id}`} className="ck-shelf">
              <div className="ck-shelf-head">
                <Link href={href} noLinkClass className="ck-shelf-title">
                  {s.name} <span className="ck-shelf-count">{inShelf.length}</span>
                </Link>
                <Link href={href} className="ck-shelf-all">
                  See all
                </Link>
              </div>
              {inShelf.length ? (
                <div className="ck-shelf-row">
                  {inShelf.slice(0, SHELF).map((r) => (
                    <RecipeCard key={r.id} recipe={r} />
                  ))}
                </div>
              ) : (
                <p className="ck-note ck-shelf-empty">No recipes yet.</p>
              )}
            </div>
          );
        })}
      {/* a grid: search results, a section's (or Uncategorized's) recipes, or a cookbook without sections */}
      {(searching || section || !book.sections.length) && (
        <Block key="grid" className="ck-card-grid">
          <div className="grid grid-cols-2 grid-gap">
            {(searching ? found : here).map((r) => (
              <RecipeCard key={r.id} recipe={r} />
            ))}
          </div>
        </Block>
      )}

      <Menu
        opened={moreOpen}
        onClosed={() => setMoreOpen(false)}
        groups={[
          // the user's order and words (#39); Add Recipes is the bar's +
          [
            !uncategorized && { label: 'Rename', icon: Pencil, onClick: rename },
            !section && { label: 'Edit Cover', icon: ImageIcon, onClick: () => setChoosingCover(true) },
          ],
          [
            canOrganize && { label: 'Organize', icon: ListOrdered, onClick: () => setOrganizing(true) },
            !section && { label: 'Add Section', icon: FolderPlus, onClick: newSection },
          ],
          [!uncategorized && { label: 'Delete', icon: Trash2, danger: true, onClick: remove }],
        ]}
      />

      <Menu
        opened={sortOpen}
        onClosed={() => setSortOpen(false)}
        groups={[
          CookbookSort.options.map((k) => ({
            label: k === 'manual' ? 'Manual (as organized)' : SORT_LABELS[k],
            checked: k === sort,
            onClick: () => setCookbookSort(book.id, k),
          })),
        ]}
      />

      <RecipePickerPopup
        key="add"
        mode="several"
        opened={adding}
        title="Add Recipes"
        recipes={[...recipes].sort(aToZ)}
        selected={placeIds.filter((id) => byId.has(id))}
        footer={elsewhere}
        onDone={(ids) => {
          // ids no longer a recipe (deleted elsewhere) drop out here too
          const note = changeNote(placeIds.filter((id) => byId.has(id)), ids.filter((id) => byId.has(id)));
          save(withRecipeIds(book, placeId, ids));
          if (note) say(note);
          setAdding(false);
        }}
        onClosed={() => setAdding(false)}
      />
      <EditCoverPopup key="cover" opened={choosingCover} cookbook={book} byId={byId} onDone={saveCover} onClosed={() => setChoosingCover(false)} />
      <OrganizePopup
        key="organize"
        opened={organizing}
        cookbook={book}
        recipes={byId}
        onDone={(c) => {
          save(c);
          setOrganizing(false);
        }}
        onClosed={() => setOrganizing(false)}
      />
    </Page>
  );
}
