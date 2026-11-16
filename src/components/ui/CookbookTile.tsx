import { Link } from 'framework7-react';
import { BookOpen } from 'lucide-react';
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

/** A cookbook as a tile on the Cookbooks tab: the collage, its name, how many recipes (and sections). */
export default function CookbookTile({ href, name, meta, photos }: { href: string; name: string; meta: string; photos: string[] }) {
  return (
    <Link href={href} noLinkClass className="ck-card ck-book-tile">
      <CookbookCollage photos={photos} />
      <span className="ck-card-body">
        <span className="ck-book-name">{name}</span>
        <span className="ck-card-meta">{meta}</span>
      </span>
    </Link>
  );
}
