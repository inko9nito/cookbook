import { useState } from 'react';
import {
  Page, Navbar, NavRight, Subnavbar, Link, Searchbar, Block, BlockFooter, Button,
  Actions, ActionsGroup, ActionsLabel, ActionsButton, f7,
} from 'framework7-react';
import { Ellipsis, Plus } from 'lucide-react';
import { navIcon } from '../components/ui/icons';
import { showTabbar } from '../components/ui/tabbar';
import RecipeCard from '../components/ui/RecipeCard';
import { CountSkeleton, RecipeGridSkeleton } from '../components/ui/Skeletons';
import RecipePickerPopup from '../components/RecipePickerPopup';
import EditCoverPopup from '../components/EditCoverPopup';
import OrganizePopup from '../components/OrganizePopup';
import { useCookbooks, useStore } from '../data/store';
import { colorOf, cookbookRecipeIds, coversOf, existing, recipeIdsOf, withRecipeIds, type BookColor, type Cookbook } from '../lib/cookbook';
import { newId, type Recipe } from '../lib/recipe';
import { searchByTitle, searchWords } from '../lib/search';

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
 * (a cookbook's sections too). + adds recipes; ⋯ holds Organize, New Section, Rename, Edit Cover (the three photos
 * on the cookbook's plates and its card's soft colour, issue #80) and Delete.
 */
export default function CookbookPage({ f7route, f7router }: Props) {
  const { recipes } = useStore();
  const { cookbooks, loading, saveCookbook, deleteCookbook } = useCookbooks();
  const [query, setQuery] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [choosingCover, setChoosingCover] = useState(false);
  const [organizing, setOrganizing] = useState(false);

  const book = cookbooks.find((c) => c.id === f7route?.params.id);
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

  // Not there (yet, or any more). Same page and the same header (key "navbar") as below, so if the cookbook turns up a
  // moment later, React keeps the header Framework7 set up instead of building a new one. Still loading (issue #35):
  // grey placeholders in the page's shape, the count and the recipe tiles.
  if (!book || (sectionId && !section)) {
    return (
      // as on Recipes: the title row slides away while scrolling down and comes back on scrolling up; the search bar stays
    <Page name="cookbook" className="ck-cookbook-page" hideNavbarOnScroll onPageAfterIn={showTabbar}>
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

  const save = (c: Cookbook) => saveCookbook(c);
  // what this page holds: the cookbook's Uncategorized recipes, or the section's
  const placeIds = recipeIdsOf(book, placeId);
  const here = existing(placeIds, byId);
  // the search covers everything shown from here: a cookbook's sections too
  const searchable = section ? here : existing(cookbookRecipeIds(book), byId);
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
          save({ ...book, recipeIds: [...new Set([...book.recipeIds, ...section.recipeIds])], sections: book.sections.filter((s) => s.id !== section.id) });
          f7router?.back();
        },
      );
    } else {
      f7.dialog.confirm('Its recipes stay in Recipes.', `Delete “${book.name}”?`, () => {
        deleteCookbook(book.id);
        f7router?.back();
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

  return (
    // as on Recipes: the title row slides away while scrolling down and comes back on scrolling up; the search bar stays
    <Page name="cookbook" className="ck-cookbook-page" hideNavbarOnScroll onPageAfterIn={showTabbar}>
      <Navbar key="navbar" backLink title={name} subtitle={section ? book.name : undefined}>
        <NavRight>
          <Link iconOnly onClick={() => setAdding(true)} aria-label="Add recipes" className="ck-nav-primary">
            <Plus {...navIcon} />
          </Link>
          <Link iconOnly onClick={() => setMoreOpen(true)} aria-label="More actions">
            <Ellipsis {...navIcon} />
          </Link>
        </NavRight>
        {/* issue #63: the search bar stays under the title while the shelves scroll (Framework7's subnavbar, as on
            Recipes). It's always there, even with nothing to search yet, so the page keeps its shape. */}
        <Subnavbar className="ck-docked-bar ck-search-bar">
          <Searchbar
            customSearch
            backdrop={false}
            disableButton={false}
            placeholder={section ? 'Search this section' : 'Search this cookbook'}
            onSearchbarSearch={(_sb, q) => setQuery(String(q ?? ''))}
            onSearchbarClear={() => setQuery('')}
          />
        </Subnavbar>
      </Navbar>

      {/* keys: Page leaves out the blocks that aren't shown and lists the rest by position (see RecipesPage). */}
      {hasAny && (
        <Block key="count" className="ck-count">
          <span className="ck-note">
            {searching ? `${found.length} of ${count(searchable.length, 'recipe')}` : count(searchable.length, 'recipe')}
            {!section && !searching && book.sections.length > 0 && ` · ${count(book.sections.length, 'section')}`}
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
          const inShelf = existing(s.recipeIds, byId);
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

      <Actions key="more" opened={moreOpen} onActionsClosed={() => setMoreOpen(false)}>
        <ActionsGroup>
          <ActionsLabel>{name}</ActionsLabel>
          <ActionsButton onClick={() => setAdding(true)}>Add Recipes</ActionsButton>
          {(cookbookRecipeIds(book).some((id) => byId.has(id)) || book.sections.length > 1) && <ActionsButton onClick={() => setOrganizing(true)}>Organize</ActionsButton>}
          {!section && <ActionsButton onClick={newSection}>New Section</ActionsButton>}
          {!uncategorized && <ActionsButton onClick={rename}>{section ? 'Rename Section' : 'Rename Cookbook'}</ActionsButton>}
          {!section && <ActionsButton onClick={() => setChoosingCover(true)}>Edit Cover</ActionsButton>}
          {!uncategorized && (
            <ActionsButton color="red" onClick={remove}>
              {section ? 'Delete Section' : 'Delete Cookbook'}
            </ActionsButton>
          )}
        </ActionsGroup>
        <ActionsGroup>
          <ActionsButton strong>Cancel</ActionsButton>
        </ActionsGroup>
      </Actions>

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
          save(withRecipeIds(book, placeId, ids));
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
