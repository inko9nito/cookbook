import { Link } from 'framework7-react';
import type { DemoRecipe } from '../../demo/data';

/** Featured recipe (Headspace shape): photo card, 24px corners, title over a bottom gradient. */
export default function FeaturedRecipeCard({ recipe }: { recipe: DemoRecipe }) {
  return (
    <Link href={`/recipe/${recipe.id}/`} noLinkClass className="ck-feature ck-photo" data-tone={recipe.tone}>
      <span className="ck-feature-scrim" />
      <span className="ck-feature-text">
        {recipe.tags[0] && <span className="ck-tag">{recipe.tags[0][0].toUpperCase() + recipe.tags[0].slice(1)}</span>}
        <span className="ck-feature-title">{recipe.title}</span>
        <span className="ck-feature-meta">
          {recipe.source} · {formatMinutes(recipe.minutes)}
        </span>
      </span>
    </Link>
  );
}

export const formatMinutes = (m: number) =>
  m >= 60 ? `${Math.floor(m / 60)} hr${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`;
