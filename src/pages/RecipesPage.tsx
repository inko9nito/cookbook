import { useRef, useState } from 'react';
import {
  Page, Navbar, NavTitle, NavRight, Subnavbar, Link, Searchbar,
  Block, BlockFooter, Chip, Actions, ActionsGroup, ActionsLabel, ActionsButton, Button, f7,
} from 'framework7-react';
import { ArrowUpDown, Plus } from 'lucide-react';
import { useStore, type SortKey } from '../data/store';
import { COURSES } from '../lib/recipe';
import { navIcon } from '../components/ui/icons';
import { showTabbar } from '../components/ui/tabbar';
import RecipeCard from '../components/ui/RecipeCard';
import { ChipsSkeleton, CountSkeleton, RecipeGridSkeleton } from '../components/ui/Skeletons';
import { searchByTitle, searchWords } from '../lib/search';
import { MAX_READ_IMAGES, linkIn, sameLink } from '../lib/read-recipe';

const escapeHtml = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

const SORT_LABELS: Record<SortKey, string> = { newest: 'Newest first', oldest: 'Oldest first', az: 'A–Z' };
const label = (t: string) => t[0].toUpperCase() + t.slice(1);

type Props = { f7router?: { navigate: (url: string, options?: { props?: Record<string, unknown> }) => void } };

export default function RecipesPage({ f7router }: Props) {
  const { recipes, loading, loadError, reload, sort, setSort, settings, setFilter } = useStore();
  const [sortOpen, setSortOpen] = useState(false);
  // issue #17: + asks how: from a link (#15), from photos or screenshots (picked here, read in the editor), or type it in
  const [newOpen, setNewOpen] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');

  // issue #15: + → From a link asks for the link (Framework7's prompt dialog, a URL keyboard), then the editor reads it.
  // A link already imported (the same page) offers that recipe first.
  // Opened by a tap (`fromTap`), it also reads the clipboard: iOS shows its own Paste button for that, and a copied
  // link fills the field. Both have to start in the tap itself: iOS only raises the keyboard for a field focused
  // during a tap (Framework7 focuses it once the dialog has opened, too late), and only reads the clipboard then.
  const readLink = (url: string) => f7router?.navigate('/recipe/new/', { props: { scanUrl: url } });
  const askLink = (typed = '', fromTap = false) => {
    const copied = fromTap ? navigator.clipboard?.readText?.().catch(() => '') : undefined;
    const dialog = f7.dialog.prompt(
      'Paste the address of the recipe’s page.',
      'From a Link',
      (text: string) => {
        if (!text.trim()) return;
        const url = linkIn(text);
        if (!url) return f7.dialog.alert('Copy the address of the recipe’s page (Share → Copy in Safari) and paste it here.', 'That isn’t a link', () => askLink(text));
        const have = recipes.find((r) => r.sourceUrl && sameLink(r.sourceUrl, url));
        if (!have) return readLink(url);
        f7.dialog
          .create({
            title: 'Already in your recipes',
            text: `“${escapeHtml(have.title)}” came from this link.`,
            verticalButtons: true,
            buttons: [
              { text: 'Open It', strong: true, onClick: () => f7router?.navigate(`/recipe/${have.id}/`) },
              { text: 'Import Again', onClick: () => readLink(url) },
              { text: 'Cancel' },
            ],
          })
          .open();
      },
      undefined,
      typed,
    );
    dialog.$el.find('input').attr({ type: 'url', inputmode: 'url', placeholder: 'https://', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'go', 'aria-label': 'Link to the recipe' });
    const input = dialog.$el.find('input')[0] as HTMLInputElement | undefined;
    input?.focus();
    void copied?.then((text) => {
      const link = text ? linkIn(text) : null;
      // only into the field still open and empty (nothing typed or pasted meanwhile)
      if (!link || !input?.isConnected || input.value.trim()) return;
      input.value = link;
      dialog.$el.find('.dialog-text').text('Use the link you copied, or paste another.');
    });
  };

  // R2: a chip for every tag in use, the course types first (in meal order), then the rest A–Z
  const used = new Set(recipes.flatMap((r) => r.tags));
  const allTags = [...COURSES.filter((t) => used.has(t)), ...[...used].filter((t) => !COURSES.includes(t)).sort()];
  // the remembered filter, minus tags no recipe has any more
  const tags = settings.filterTags.filter((t) => used.has(t));
  const matchAny = settings.filterMode === 'any';

  const shown = recipes
    .filter((r) => !tags.length || (matchAny ? tags.some((t) => r.tags.includes(t)) : tags.every((t) => r.tags.includes(t))))
    .sort((a, b) =>
      sort === 'az'
        ? a.title.localeCompare(b.title)
        : sort === 'newest'
          ? b.createdAt.localeCompare(a.createdAt)
          : a.createdAt.localeCompare(b.createdAt),
    );
  // search: titles with every word typed, among the recipes the chips show
  const words = searchWords(query);
  const found = searchByTitle(shown, words);
  const toggleTag = (t: string) => setFilter(tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t]);

  return (
    // the title row slides away while scrolling down and comes back on scrolling up; the search bar and chips under it
    // stay (Framework7's hideNavbarOnScroll moves the navbar up by its own height, leaving the subnavbar showing)
    <Page name="recipes" className={`ck-recipes-page ${loadError ? 'ck-no-chips' : ''}`} hideNavbarOnScroll onPageAfterIn={showTabbar}>
      <Navbar key="navbar" className="ck-navbar-root">
        <NavTitle>Recipes</NavTitle>
        <NavRight>
          {/* issue #27: the plus is the screen's main action, a filled Tomato button */}
          <Link iconOnly onClick={() => setNewOpen(true)} aria-label="New recipe" className="ck-nav-primary">
            <Plus {...navIcon} />
          </Link>
          <Link iconOnly onClick={() => setSortOpen(true)} aria-label="Sort recipes">
            <ArrowUpDown {...navIcon} />
          </Link>
        </NavRight>
        {/* issue #63: the search bar and the tag chips stay under the title while the recipes scroll (Framework7's
            subnavbar, like the Planner's week strip), so searching or filtering never needs a scroll back up.
            customSearch: it only says what's typed, and the page filters (so the count can say "6 of 240", and chips
            tapped mid-search filter too). No backdrop: the user wants no overlay while searching. */}
        <Subnavbar className="ck-docked-bar ck-search-bar">
          <Searchbar
            customSearch
            backdrop={false}
            disableButton={false}
            placeholder="Search recipes"
            onSearchbarSearch={(_sb, q) => setQuery(String(q ?? ''))}
            onSearchbarClear={() => setQuery('')}
          />
          {/* issue #35: until the recipes arrive, grey placeholders stand in for the chips (no lone "All" chip); if they
              can't be loaded, there are no chips */}
          {!loadError && (
            <div className="ck-chips ck-chips-scroll">
              {loading ? (
                <ChipsSkeleton />
              ) : (
                <>
                  <Chip text="All" className={`ck-chip ${tags.length === 0 ? 'ck-chip-on' : ''}`} onClick={() => setFilter([])} />
                  {allTags.map((t) => (
                    <Chip key={t} text={label(t)} className={`ck-chip ${tags.includes(t) ? 'ck-chip-on' : ''}`} onClick={() => toggleTag(t)} />
                  ))}
                </>
              )}
            </div>
          )}
        </Subnavbar>
      </Navbar>

      {/* Every block here has a key: Page drops the ones that aren't shown (loading, error) and lists the rest by
          position, so without keys React rebuilds the blocks below whenever loading ends. Until the recipes arrive, the
          count and the tiles are grey placeholders (issue #35, no "0 recipes"); if they can't be loaded, only the error
          shows. */}
      {!loadError && (
        <Block key="count" className="ck-count">
          {loading ? (
            <CountSkeleton />
          ) : (
            <span className="ck-note">
              {words.length ? `${found.length} of ${shown.length}` : shown.length} {shown.length === 1 ? 'recipe' : 'recipes'} · {SORT_LABELS[sort]}
              {tags.length > 1 && (matchAny ? ' · any tag' : ' · all tags')}
            </span>
          )}
        </Block>
      )}
      {loading && <RecipeGridSkeleton key="loading" />}
      {loadError && (
        <Block key="error" className="ck-list-state">
          <p className="ck-note">Couldn’t load your recipes. {loadError}</p>
          <Button round className="ck-soft ck-inline-button" onClick={() => reload()}>
            Try again
          </Button>
        </Block>
      )}
      {words.length > 0 && !found.length && (
        <BlockFooter key="not-found" className="ck-not-found">
          No recipes found
        </BlockFooter>
      )}
      {/* Prepear's grid: two cards per row */}
      <Block key="grid" className="ck-card-grid">
        <div className="grid grid-cols-2 grid-gap">
          {found.map((r) => (
            <RecipeCard key={r.id} recipe={r} />
          ))}
        </div>
      </Block>

      <Actions key="new" opened={newOpen} onActionsClosed={() => setNewOpen(false)}>
        <ActionsGroup>
          <ActionsLabel>New recipe</ActionsLabel>
          {/* the picker has to open in the tap itself (iOS only lets a tap open it) */}
          <ActionsButton onClick={() => askLink('', true)}>From a link</ActionsButton>
          <ActionsButton onClick={() => scanRef.current?.click()}>From photos or screenshots</ActionsButton>
          <ActionsButton onClick={() => f7router?.navigate('/recipe/new/')}>Type it in</ActionsButton>
        </ActionsGroup>
        <ActionsGroup>
          <ActionsButton strong>Cancel</ActionsButton>
        </ActionsGroup>
      </Actions>
      {/* iOS offers the photo library, the camera (a cookbook page) and files */}
      <input
        key="scan-input"
        ref={scanRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])].slice(0, MAX_READ_IMAGES);
          e.target.value = ''; // picking the same photo again still fires
          if (files.length) f7router?.navigate('/recipe/new/', { props: { scanFiles: files } });
        }}
      />

      <Actions key="sort" opened={sortOpen} onActionsClosed={() => setSortOpen(false)}>
        <ActionsGroup>
          <ActionsLabel>Sort recipes</ActionsLabel>
          {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
            <ActionsButton key={k} strong={k === sort} onClick={() => setSort(k)}>
              {SORT_LABELS[k]}
            </ActionsButton>
          ))}
        </ActionsGroup>
        {tags.length > 1 && (
          <ActionsGroup>
            <ActionsLabel>With more than one tag picked, show recipes with</ActionsLabel>
            <ActionsButton strong={!matchAny} onClick={() => setFilter(tags, 'all')}>
              All the tags
            </ActionsButton>
            <ActionsButton strong={matchAny} onClick={() => setFilter(tags, 'any')}>
              Any of the tags
            </ActionsButton>
          </ActionsGroup>
        )}
        <ActionsGroup>
          <ActionsButton strong>Cancel</ActionsButton>
        </ActionsGroup>
      </Actions>
    </Page>
  );
}
