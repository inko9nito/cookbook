import { Link } from 'framework7-react';
import { BookOpen } from 'lucide-react';
import { photoStyle } from './photo';

/**
 * A cookbook or a section of one (issue #25), as a tile like the recipe tiles: the square cover photo (the cover
 * recipe's, else the first recipe's with a photo; none: soft grey with a muted book), the name, and how many recipes.
 */
export default function CookbookTile({ href, name, count, cover }: { href: string; name: string; count: number; cover?: string }) {
  return (
    <Link href={href} noLinkClass className="ck-card ck-book-tile">
      {cover ? (
        <span className="ck-card-photo ck-photo" style={photoStyle(cover)} aria-hidden="true" />
      ) : (
        <span className="ck-card-photo ck-photo ck-photo-empty" aria-hidden="true">
          <BookOpen size={28} strokeWidth={1.5} />
        </span>
      )}
      <span className="ck-card-body">
        <span className="ck-card-title">{name}</span>
        <span className="ck-card-meta">{count === 1 ? '1 recipe' : `${count} recipes`}</span>
      </span>
    </Link>
  );
}
