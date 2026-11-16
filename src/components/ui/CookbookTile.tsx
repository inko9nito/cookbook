import { Link } from 'framework7-react';
import { BookOpen, ChefHat } from 'lucide-react';
import { photoStyle } from './photo';

/**
 * A cookbook's cover (issue #25 redesign, as in RecipeMe): a collage of up to three of its recipes' photos, one across
 * the top half and two quarters below, so a cookbook reads as a collection, not a recipe. With one photo it fills the
 * cover; with none, soft grey with a muted book. `small` is the list view's thumbnail.
 */
export function CookbookCollage({ photos, small }: { photos: string[]; small?: boolean }) {
  const cls = `ck-collage${small ? ' ck-collage-small' : ''}`;
  if (!photos.length) {
    return (
      <span className={`${cls} ck-collage-one ck-photo-empty`} aria-hidden="true">
        <BookOpen size={small ? 18 : 28} strokeWidth={1.5} />
      </span>
    );
  }
  if (photos.length === 1) {
    return (
      <span className={`${cls} ck-collage-one`} aria-hidden="true">
        <span className="ck-photo" style={photoStyle(photos[0])} />
      </span>
    );
  }
  return (
    <span className={cls} aria-hidden="true">
      {[0, 1, 2].map((i) =>
        photos[i] ? <span key={i} className="ck-photo" style={photoStyle(photos[i])} /> : <span key={i} className="ck-photo ck-photo-empty" />,
      )}
    </span>
  );
}

/**
 * A cookbook as a card on the Cookbooks tab, made to look like a book: a Tomato spine down the left edge and page edges
 * along the right (option 3 of the mockups), the collage, a Tomato badge on it with how many recipes (a chef hat and the
 * number), then the name and, when there are any, how many sections.
 */
export default function CookbookTile({ href, name, recipes, sections, photos }: { href: string; name: string; recipes: number; sections: number; photos: string[] }) {
  return (
    <Link href={href} noLinkClass className="ck-card ck-book-tile">
      <span className="ck-book-cover">
        <CookbookCollage photos={photos} />
        <span className="ck-book-badge" aria-label={`${recipes} ${recipes === 1 ? 'recipe' : 'recipes'}`}>
          <ChefHat size={14} strokeWidth={2.25} aria-hidden="true" />
          {recipes}
        </span>
      </span>
      <span className="ck-card-body">
        <span className="ck-book-name">{name}</span>
        {sections > 0 && <span className="ck-card-meta">{sections === 1 ? '1 section' : `${sections} sections`}</span>}
      </span>
    </Link>
  );
}
