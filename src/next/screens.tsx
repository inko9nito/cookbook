import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpDown, BookOpen, ChefHat, Ellipsis, Pencil, Plus, Search, Star, Trash2 } from 'lucide-react';
import { useCookbooks, useStore } from '../data/store';
import { byName, colorOf, cookbookRecipeIds, emptyCookbook, existing, platePhotos, type Cookbook } from '../lib/cookbook';
import { coverPhoto, newId, sortRecipes, type Recipe } from '../lib/recipe';
import { photoStyle } from '../components/ui/photo';
import { say } from '../components/ui/toast';
import { formatMinutes } from '../components/ui/RecipeCard';
import { back, go } from './router';
import { BackButton, BarButton, Header, MenuButton, confirm, prompt } from './ui';

/** Issue #141: the screens without Framework7. Same data, same look; the document scrolls. */

// ── Recipes ──────────────────────────────────────────────────────────────────────────────────────────────────────────

function RecipeCard({ recipe }: { recipe: Recipe }) {
  const photo = coverPhoto(recipe);
  return (
    <a
      href={`/next/recipe/${recipe.id}`}
      className="ck-card nx-card"
      onClick={(e) => {
        e.preventDefault();
        go({ name: 'recipe', id: recipe.id });
      }}
    >
      {photo ? (
        <span className="ck-card-photo ck-photo" style={photoStyle(photo)} aria-hidden="true" />
      ) : (
        <span className="ck-card-photo ck-photo ck-photo-empty" aria-hidden="true">
          <ChefHat size={28} strokeWidth={1.5} />
        </span>
      )}
      <span className="ck-card-body">
        <span className="ck-card-title">{recipe.title}</span>
        {recipe.minutes > 0 && <span className="ck-card-meta">{formatMinutes(recipe.minutes)}</span>}
        {recipe.rating > 0 && (
          <span className="ck-stars" aria-label={`${recipe.rating} of 5 stars`}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Star key={n} size={10} strokeWidth={0} className={n <= recipe.rating ? 'on' : ''} />
            ))}
          </span>
        )}
      </span>
    </a>
  );
}

const soon = () => say('Comes in the next step of the move');

export function RecipesScreen() {
  const { recipes, loading, sort } = useStore();
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const tags = useMemo(() => [...new Set(recipes.flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b)), [recipes]);
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = sortRecipes(recipes, sort).filter((r) => (!tag || r.tags.includes(tag)) && words.every((w) => r.title.toLowerCase().includes(w)));
  return (
    <>
      <Header title="Recipes" right={<><BarButton label="New recipe" icon={Plus} primary onClick={soon} /><BarButton label="Sort recipes" icon={ArrowUpDown} onClick={soon} /></>}>
        <label className="nx-search">
          <Search size={18} strokeWidth={2} />
          <input type="search" placeholder="Search recipes" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="nx-chips">
          <button type="button" className={`nx-chip${tag === null ? ' nx-chip-on' : ''}`} onClick={() => setTag(null)}>
            All
          </button>
          {tags.map((t) => (
            <button key={t} type="button" className={`nx-chip${tag === t ? ' nx-chip-on' : ''}`} onClick={() => setTag(tag === t ? null : t)}>
              {t}
            </button>
          ))}
        </div>
      </Header>
      <main className="nx-content">
        <p className="ck-note nx-count">{loading ? 'Loading…' : `${shown.length} ${shown.length === 1 ? 'recipe' : 'recipes'}`}</p>
        <div className="nx-grid">
          {shown.map((r) => (
            <RecipeCard key={r.id} recipe={r} />
          ))}
        </div>
      </main>
    </>
  );
}

// ── A recipe: the photo with the bar over it, see-through until it scrolls away ─────────────────────────────────────

/** true once the page has scrolled past `px` (for the bars that turn solid) */
function useScrolledPast(px: number) {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const check = () => setPast(window.scrollY > px);
    check();
    window.addEventListener('scroll', check, { passive: true });
    return () => window.removeEventListener('scroll', check);
  }, [px]);
  return past;
}

export function RecipeScreen({ id }: { id: string }) {
  const { recipes } = useStore();
  const recipe = recipes.find((r) => r.id === id);
  const solid = useScrolledPast(280);
  if (!recipe) {
    return (
      <>
        <Header title="Recipe" left={<BackButton />} />
        <main className="nx-content">
          <p className="ck-note">This recipe isn’t here.</p>
        </main>
      </>
    );
  }
  const photo = coverPhoto(recipe);
  return (
    <>
      <div className={`nx-float-bar${solid ? ' nx-solid' : ''}${photo ? ' nx-over-photo' : ''}`}>
        <BackButton />
        <span className="nx-float-title">{recipe.title}</span>
      </div>
      {photo ? <div className="nx-hero-photo ck-photo" style={photoStyle(photo)} /> : <div className="nx-hero-spacer" />}
      <main className="nx-content nx-recipe">
        <h1 className="nx-recipe-title">{recipe.title}</h1>
        {recipe.minutes > 0 && <p className="ck-note">{formatMinutes(recipe.minutes)}</p>}
        <h2 className="nx-section-title">Ingredients</h2>
        <ul className="nx-lines">
          {recipe.ingredients.map((i) =>
            i.kind === 'header' ? (
              <li key={i.id} className="nx-line-header">
                {i.name}
              </li>
            ) : (
              <li key={i.id}>{i.raw ?? [i.amount, i.unit, i.name, i.note].filter(Boolean).join(' ')}</li>
            ),
          )}
        </ul>
        <h2 className="nx-section-title">Directions</h2>
        <ol className="nx-lines nx-steps">
          {recipe.steps.map((s) =>
            s.kind === 'header' ? (
              <li key={s.id} className="nx-line-header">
                {s.text}
              </li>
            ) : (
              <li key={s.id}>{s.text}</li>
            ),
          )}
        </ol>
      </main>
    </>
  );
}

// ── Cookbooks ────────────────────────────────────────────────────────────────────────────────────────────────────────

function Plates({ photos }: { photos: string[] }) {
  const plate = (cls: string, src?: string, icon?: boolean) => (
    <span className={`ck-plate ${cls}${src ? ' ck-photo' : ' ck-plate-empty'}`} style={photoStyle(src)}>
      {icon && <BookOpen size={24} strokeWidth={1.5} />}
    </span>
  );
  return (
    <span className="ck-plates" aria-hidden="true">
      {plate('ck-plate-left', photos[1])}
      {plate('ck-plate-right', photos[2])}
      {plate('ck-plate-middle', photos[0], !photos.some(Boolean))}
    </span>
  );
}

const countOf = (c: Cookbook, byId: Map<string, Recipe>) => {
  const n = existing(cookbookRecipeIds(c), byId).length;
  return [`${n} ${n === 1 ? 'recipe' : 'recipes'}`, c.sections.length ? `${c.sections.length} ${c.sections.length === 1 ? 'section' : 'sections'}` : ''].filter(Boolean).join(' · ');
};

export function CookbooksScreen() {
  const { recipes } = useStore();
  const { cookbooks, loading, saveCookbook } = useCookbooks();
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const sorted = [...cookbooks].sort(byName);
  const add = async () => {
    const name = await prompt('New Cookbook', 'Name it after what’s in it, like “Soups” or “Holidays”.');
    if (!name) return;
    const c = emptyCookbook(name, newId);
    saveCookbook(c);
    go({ name: 'cookbook', id: c.id });
  };
  return (
    <>
      <Header title="Cookbooks" right={<BarButton label="New cookbook" icon={Plus} primary onClick={add} />} />
      <main className="nx-content">
        <p className="ck-note nx-count">{loading ? 'Loading…' : `${sorted.length} ${sorted.length === 1 ? 'cookbook' : 'cookbooks'}`}</p>
        <div className="nx-grid">
          {sorted.map((c) => (
            <a
              key={c.id}
              href={`/next/cookbook/${c.id}`}
              className={`ck-card ck-book-tile nx-book-tile ck-tint-${colorOf(c)}`}
              onClick={(e) => {
                e.preventDefault();
                go({ name: 'cookbook', id: c.id });
              }}
            >
              <Plates photos={platePhotos(c, byId)} />
              <span className="ck-book-name">{c.name}</span>
              <span className="ck-book-meta">{countOf(c, byId)}</span>
            </a>
          ))}
        </div>
      </main>
    </>
  );
}

// ── A cookbook: its colour, plates and name as page content; the bar over it is see-through until they've scrolled away ──

export function CookbookScreen({ id }: { id: string }) {
  const { recipes } = useStore();
  const { cookbooks, saveCookbook, deleteCookbook } = useCookbooks();
  // once Delete is confirmed, the screen keeps showing the cookbook until it has gone
  const leaving = useRef<Cookbook | null>(null);
  const book = leaving.current ?? cookbooks.find((c) => c.id === id);
  const solid = useScrolledPast(170);
  if (!book) {
    return (
      <>
        <Header title="Cookbook" left={<BackButton />} />
        <main className="nx-content">
          <p className="ck-note">This cookbook isn’t here.</p>
        </main>
      </>
    );
  }
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const inBook = existing(cookbookRecipeIds(book), byId);
  const rename = async () => {
    const name = await prompt('Rename Cookbook', '', book.name);
    if (name) saveCookbook({ ...book, name });
  };
  const remove = async () => {
    if (!(await confirm(`Delete “${book.name}”?`, 'Its recipes stay in Recipes.', 'Delete', true))) return;
    leaving.current = book;
    back();
    deleteCookbook(book.id);
    say(`Deleted “${book.name}”`);
  };
  return (
    <div className="nx-book-page">
      <div className={`nx-float-bar${solid ? ' nx-solid' : ''}`}>
        <BackButton />
        <span className="nx-float-title">{book.name}</span>
        <div className="nx-header-buttons">
          <BarButton label="Add recipes" icon={Plus} primary onClick={soon} />
          <MenuButton
            label="More actions"
            icon={Ellipsis}
            groups={[
              [{ label: 'Rename', icon: Pencil, onClick: rename }],
              [{ label: 'Delete', icon: Trash2, danger: true, onClick: remove }],
            ]}
          />
        </div>
      </div>
      <section className={`nx-book-hero ck-tint-${colorOf(book)}`}>
        <Plates photos={platePhotos(book, byId)} />
        <h1 className="nx-book-title">{book.name}</h1>
        <p className="nx-book-meta">{countOf(book, byId)}</p>
      </section>
      <main className="nx-content nx-book-content">
        {inBook.length ? (
          <div className="nx-grid">
            {inBook.map((r) => (
              <RecipeCard key={r.id} recipe={r} />
            ))}
          </div>
        ) : (
          <p className="ck-note nx-empty">No recipes in this cookbook yet.</p>
        )}
      </main>
    </div>
  );
}

// ── Not moved yet ────────────────────────────────────────────────────────────────────────────────────────────────────

export function NotYet({ title }: { title: string }) {
  return (
    <>
      <Header title={title} />
      <main className="nx-content">
        <p className="ck-note">{title} hasn’t moved to the new version yet.</p>
        <p>
          <a className="nx-link" href="/">
            Open the current app
          </a>
        </p>
      </main>
    </>
  );
}
