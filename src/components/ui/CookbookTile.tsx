import { Badge, Link } from 'framework7-react';
import { BookOpen } from 'lucide-react';
import type { BookColor } from '../../lib/cookbook';
import { photoStyle } from './photo';

/**
 * A cookbook's cover (issue #25 redesign, from the user's Spotify reference): up to three of its recipes as round plates
 * with white rims, the first one big in the middle and in front, the next two smaller on each side, running off the
 * card's edges. Missing photos are empty grey plates; a cookbook with none shows a muted book on the middle one.
 * The middle plate comes last in the markup so it paints in front; `order` puts it in the middle.
 */
/** A plate's number in the cover editor (issue #80): chosen (strong), filled in automatically (faint), or none. */
export type PlateNumber = 'chosen' | 'auto' | 'none';

export function CookbookPlates({ photos, numbers }: { photos: string[]; numbers?: PlateNumber[] }) {
  // `numbers` (the cover editor, issue #80), left to right: each plate shows its number, faint when filled in for you
  const plate = (cls: string, at: number, src?: string, icon?: boolean) => (
    <span className={`ck-plate ${cls}${src ? ' ck-photo' : ' ck-plate-empty'}`} style={photoStyle(src)}>
      {icon && <BookOpen size={24} strokeWidth={1.5} />}
      {numbers && numbers[at] !== 'none' && <Badge className={`ck-cover-no${numbers[at] === 'auto' ? ' ck-cover-no-auto' : ''}`}>{at + 1}</Badge>}
    </span>
  );
  return (
    <span className={`ck-plates${numbers ? ' ck-plates-numbered' : ''}`} aria-hidden="true">
      {plate('ck-plate-left', 0, photos[1])}
      {plate('ck-plate-right', 2, photos[2])}
      {plate('ck-plate-middle', 1, photos[0], !photos.some(Boolean))}
    </span>
  );
}

/** The list view's thumbnail: the cookbook's colour with its first plate on it. */
export function CookbookThumb({ color, photo }: { color: BookColor; photo?: string }) {
  return (
    <span className={`ck-book-thumb ck-tint-${color}`} aria-hidden="true">
      <span className={`ck-plate${photo ? ' ck-photo' : ' ck-plate-empty'}`} style={photoStyle(photo)}>
        {!photo && <BookOpen size={16} strokeWidth={1.5} />}
      </span>
    </span>
  );
}

/**
 * A cookbook as a card on the Cookbooks tab: its soft colour, the plates, then the name and how many recipes (and
 * sections), on the left.
 */
export default function CookbookTile({ href, name, meta, color, photos }: { href: string; name: string; meta: string; color: BookColor; photos: string[] }) {
  return (
    <Link href={href} noLinkClass className={`ck-card ck-book-tile ck-tint-${color}`}>
      <CookbookPlates photos={photos} />
      <span className="ck-book-name">{name}</span>
      <span className="ck-book-meta">{meta}</span>
    </Link>
  );
}
