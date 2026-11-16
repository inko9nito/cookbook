import { useState } from 'react';
import {
  Page, Navbar, NavRight, Link, Searchbar, Block, BlockTitle, BlockFooter, Button, Preloader,
  Actions, ActionsGroup, ActionsLabel, ActionsButton, f7,
} from 'framework7-react';
import { Ellipsis, Plus } from 'lucide-react';
import { navIcon } from '../components/ui/icons';
import { showTabbar } from '../components/ui/tabbar';
import RecipeCard from '../components/ui/RecipeCard';
import CookbookTile from '../components/ui/CookbookTile';
import RecipePickerPopup from '../components/RecipePickerPopup';
import OrganizePopup from '../components/OrganizePopup';
import { useCookbooks, useStore } from '../data/store';
import { cookbookRecipeIds, coverOf, existing, recipeIdsOf, withRecipeIds, type Cookbook } from '../lib/cookbook';
import { coverPhoto, newId, type Recipe } from '../lib/recipe';
import { searchByTitle, searchWords } from '../lib/search';

type Props = {
  f7route?: { params: Record<string, string> };
  f7router?: { back: () => void; navigate: (url: string) => void };
};

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const aToZ = (a: Recipe, b: Recipe) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });

/**
 * A cookbook, or one of its sections (issue #25): /cookbook/:id/ and /cookbook/:id/section/:sectionId/.
 * A cookbook with sections shows them as tiles, then its Uncategorized recipes; without sections, just its recipes.
 * A section shows its cookbook's name above its own, then its recipes. The search covers every recipe shown from here
 * (a cookbook's sections too). + adds recipes; ⋯ holds Organize, New Section, Rename, Change Cover and Delete.
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
  const section = book && sectionId ? book.sections.find((s) => s.id === sectionId) : undefined;
  const byId = new Map(recipes.map((r) => [r.id, r]));

  if (!book || (sectionId && !section)) {
    return (
      <Page name="cookbook" onPageAfterIn={showTabbar}>
        <Navbar backLink title={loading ? '' : 'Not found'} />
        <Block className="ck-list-state">
          {loading ? <Preloader /> : <p className="ck-note">{sectionId ? 'This section isn’t here any more.' : 'This cookbook isn’t here any more.'}</p>}
        </Block>
      </Page>
    );
  }

  const save = (c: Cookbook) => saveCookbook(c);
  // what this page holds: the cookbook's Uncategorized recipes, or the section's
  const placeIds = recipeIdsOf(book, sectionId);
  const here = existing(placeIds, byId);
  // the search covers everything shown from here: a cookbook's sections too
  const searchable = section ? here : existing(cookbookRecipeIds(book), byId);
  const words = searchWords(query);
  const found = searchByTitle(searchable, words);
  const name = section ? section.name : book.name;

  // where else in this cookbook a recipe is, for Add Recipes ("In Meat", "Uncategorized")
  const elsewhere = (r: Recipe) => {
    const places = [
      ...(sectionId !== null && book.recipeIds.includes(r.id) ? ['Uncategorized'] : []),
      ...book.sections.filter((s) => s.id !== sectionId && s.recipeIds.includes(r.id)).map((s) => s.name),
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

  const setCover = (recipeId: string) => {
    setChoosingCover(false);
    save(section ? { ...book, sections: book.sections.map((s) => (s.id === section.id ? { ...s, coverRecipeId: recipeId } : s)) } : { ...book, coverRecipeId: recipeId });
  };
  const coverChoices = (section ? here : searchable).filter((r) => coverPhoto(r));
  const currentCover = section ? section.coverRecipeId : book.coverRecipeId;

  const searching = words.length > 0;
  // a section with recipes, or a cookbook with recipes or sections: otherwise the page says it's empty
  const hasAny = section ? here.length > 0 : searchable.length > 0 || book.sections.length > 0;

  return (
    <Page name="cookbook" className="ck-cookbook-page" onPageAfterIn={showTabbar}>
      <Navbar key="navbar" backLink title={name} subtitle={section ? book.name : undefined}>
        <NavRight>
          <Link iconOnly onClick={() => setAdding(true)} aria-label="Add recipes">
            <Plus {...navIcon} />
          </Link>
          <Link iconOnly onClick={() => setMoreOpen(true)} aria-label="More actions">
            <Ellipsis {...navIcon} />
          </Link>
        </NavRight>
      </Navbar>

      {/* keys: Page leaves out the blocks that aren't shown and lists the rest by position (see RecipesPage) */}
      {hasAny && (
        <div key="search" className="ck-home-search">
          <Searchbar
            customSearch
            backdrop={false}
            disableButton={false}
            placeholder={section ? 'Search this section' : 'Search this cookbook'}
            onSearchbarSearch={(_sb, q) => setQuery(String(q ?? ''))}
            onSearchbarClear={() => setQuery('')}
          />
        </div>
      )}

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

      {!searching && !section && book.sections.length > 0 && <BlockTitle key="sections-title" medium className="ck-book-heading">Sections</BlockTitle>}
      {!searching && !section && book.sections.length > 0 && (
        <Block key="sections" className="ck-card-grid ck-section-grid">
          <div className="grid grid-cols-2 grid-gap">
            {book.sections.map((s) => (
              <CookbookTile
                key={s.id}
                href={`/cookbook/${book.id}/section/${s.id}/`}
                name={s.name}
                count={existing(s.recipeIds, byId).length}
                cover={coverOf(s.coverRecipeId, s.recipeIds, byId)}
              />
            ))}
          </div>
        </Block>
      )}
      {!searching && !section && book.sections.length > 0 && here.length > 0 && (
        <BlockTitle key="uncategorized-title" medium className="ck-book-heading">
          Uncategorized
        </BlockTitle>
      )}

      <Block key="grid" className="ck-card-grid">
        <div className="grid grid-cols-2 grid-gap">
          {(searching ? found : here).map((r) => (
            <RecipeCard key={r.id} recipe={r} />
          ))}
        </div>
      </Block>

      <Actions key="more" opened={moreOpen} onActionsClosed={() => setMoreOpen(false)}>
        <ActionsGroup>
          <ActionsLabel>{name}</ActionsLabel>
          <ActionsButton onClick={() => setAdding(true)}>Add Recipes</ActionsButton>
          {(cookbookRecipeIds(book).some((id) => byId.has(id)) || book.sections.length > 1) && <ActionsButton onClick={() => setOrganizing(true)}>Organize</ActionsButton>}
          {!section && <ActionsButton onClick={newSection}>New Section</ActionsButton>}
          <ActionsButton onClick={rename}>{section ? 'Rename Section' : 'Rename Cookbook'}</ActionsButton>
          {coverChoices.length > 0 && <ActionsButton onClick={() => setChoosingCover(true)}>Change Cover</ActionsButton>}
          <ActionsButton color="red" onClick={remove}>
            {section ? 'Delete Section' : 'Delete Cookbook'}
          </ActionsButton>
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
          save(withRecipeIds(book, sectionId, ids));
          setAdding(false);
        }}
        onClosed={() => setAdding(false)}
      />
      <RecipePickerPopup
        key="cover"
        mode="one"
        opened={choosingCover}
        title="Change Cover"
        recipes={coverChoices}
        current={currentCover}
        onPick={setCover}
        onClosed={() => setChoosingCover(false)}
      />
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
