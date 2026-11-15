import { Link } from 'framework7-react';
import { Star } from 'lucide-react';
import type { DemoRecipe } from '../../demo/data';
import { photoStyle } from './photo';

/**
 * Recipe card (Prepear's grid): white card, photo on top, title (two lines max), source, and stars once rated.
 * Shown two to a row on the Recipes screen. No shadow: the white card on the grey page is enough.
 */
export default function RecipeCard({ recipe }: { recipe: DemoRecipe }) {
  return (
    <Link href={`/recipe/${recipe.id}/`} noLinkClass className="ck-card">
      <span className="ck-card-photo ck-photo" data-tone={recipe.tone} style={photoStyle(recipe.photo)} aria-hidden="true" />
      <span className="ck-card-body">
        <span className="ck-card-title">{recipe.title}</span>
        <span className="ck-card-meta">{recipe.source || formatMinutes(recipe.minutes)}</span>
        {recipe.rating > 0 && (
          <span className="ck-stars" aria-label={`${recipe.rating} of 5 stars`}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Star key={n} size={10} strokeWidth={0} className={n <= recipe.rating ? 'on' : ''} />
            ))}
          </span>
        )}
      </span>
    </Link>
  );
}

export const formatMinutes = (m: number) =>
  m >= 60 ? `${Math.floor(m / 60)} hr${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`;
