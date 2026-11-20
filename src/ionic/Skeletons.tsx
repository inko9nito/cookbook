import { IonSkeletonText, IonList, IonItem } from '@ionic/react';

/**
 * Loading placeholders (#35) as v1's, in the shape of what's coming: a screen still loading already looks like itself
 * (no lone "All" chip, no "0 recipes", no spinner). Ionic's skeleton (its shimmer), in --ck-skeleton; words are grey
 * bars, one per word, so lines aren't all the same width (v1's skeleton font drew them so).
 */

// made-up titles of different lengths (v1's)
const TITLES = ['Roast chicken with lemon', 'Tomato soup', 'Weeknight beef tacos', 'Banana bread', 'Green curry with tofu', 'Pancakes'];
const CHIP_WIDTHS = [44, 84, 70, 92, 64];

/** a line of words as grey bars, about as wide as the words */
export function SkelText({ text, className = '' }: { text: string; className?: string }) {
  return (
    <span className={`ck-skel-text ${className}`} aria-hidden="true">
      {text.split(' ').map((w, i) => (
        <IonSkeletonText key={i} animated style={{ width: `${Math.max(1, w.length) * 0.56}em` }} />
      ))}
    </span>
  );
}

/** a recipe tile still loading: the square photo, a title and a time */
function RecipeCardSkeleton({ title }: { title: string }) {
  return (
    <span className="ck-card ck-skeleton-card" aria-hidden="true">
      <IonSkeletonText animated className="ck-card-photo ck-skel-photo" />
      <span className="ck-card-body">
        <SkelText className="ck-card-title" text={title} />
        <SkelText className="ck-card-meta" text="35 min" />
      </span>
    </span>
  );
}

/** the recipe grid still loading: six tiles, two to a row */
export function RecipeGridSkeleton({ count = 6, className = '' }: { count?: number; className?: string }) {
  return (
    <div className={`ck-ion-grid ${className}`} aria-busy="true" aria-label="Loading recipes">
      {Array.from({ length: count }, (_, i) => (
        <RecipeCardSkeleton key={i} title={TITLES[i % TITLES.length]} />
      ))}
    </div>
  );
}

/** the label chips still loading: grey pills where the chips go */
export function ChipsSkeleton() {
  return (
    <>
      {CHIP_WIDTHS.map((w, i) => (
        <IonSkeletonText key={i} animated className="ck-skel-chip" style={{ width: w }} aria-hidden="true" />
      ))}
    </>
  );
}

/** a count line ("24 recipes · Newest first") still loading */
export function CountSkeleton({ text = '24 recipes · Newest first', className = '' }: { text?: string; className?: string }) {
  return <SkelText className={`ck-note ${className}`} text={text} />;
}

/** the Cookbooks tab still loading: white tiles, each with three grey plates, a name and a count */
export function CookbookGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="ck-ion-grid ck-ion-book-grid" aria-busy="true" aria-label="Loading cookbooks">
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="ck-card ck-book-tile ck-ion-book-tile ck-skeleton-tile" aria-hidden="true">
          <span className="ck-plates">
            <IonSkeletonText animated className="ck-plate ck-plate-left" />
            <IonSkeletonText animated className="ck-plate ck-plate-right" />
            <IonSkeletonText animated className="ck-plate ck-plate-middle" />
          </span>
          <SkelText className="ck-book-name" text={['Soups', 'Weeknights', 'Baking', 'Holidays'][i % 4]} />
          <SkelText className="ck-book-meta" text="12 recipes" />
        </span>
      ))}
    </div>
  );
}

/** a Planner day's recipes, or the grocery list, still loading: a white row with a grey thumbnail and a title */
export function RowSkeleton({ className = '' }: { className?: string }) {
  return (
    <IonList inset lines="none" className={`ck-ion-plan-list ${className}`} aria-busy="true" aria-label="Loading">
      <IonItem aria-hidden="true">
        <IonSkeletonText animated slot="start" className="ck-picker-thumb ck-skel-thumb" />
        <span className="ck-skel-row">
          <SkelText className="ck-skel-row-title" text="Roast chicken with lemon" />
          <SkelText className="ck-skel-row-footer" text="45 min" />
        </span>
      </IonItem>
    </IonList>
  );
}
