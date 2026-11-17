import type { ComponentProps, FunctionComponent } from 'react';
import { Block, List, ListItem, SkeletonBlock as F7SkeletonBlock, SkeletonText as F7SkeletonText } from 'framework7-react';

// skeleton-elements' types mark every prop as required; they're all optional (tag, width, height, radius, effect)
const SkeletonBlock = F7SkeletonBlock as FunctionComponent<Partial<ComponentProps<typeof F7SkeletonBlock>>>;
const SkeletonText = F7SkeletonText as FunctionComponent<Partial<ComponentProps<typeof F7SkeletonText>>>;

/**
 * Loading placeholders (issue #35): Framework7's skeleton elements in the shape of what's coming, so a screen that is
 * still loading already looks like itself (no lone "All" chip, no "0 recipes", no small spinner). Grey blocks with
 * Framework7's wave; the colour is --ck-skeleton (cookbook.css).
 */
const EFFECT = 'wave' as const;

// made-up titles of different lengths, so the grey lines aren't all the same width
const TITLES = ['Roast chicken with lemon', 'Tomato soup', 'Weeknight beef tacos', 'Banana bread', 'Green curry with tofu', 'Pancakes'];
const CHIP_WIDTHS = ['44px', '84px', '70px', '92px', '64px'];

/** A recipe tile still loading: the square photo, a title and a time. */
export function RecipeCardSkeleton({ title = TITLES[0] }: { title?: string }) {
  return (
    <span className="ck-card ck-skeleton-card" aria-hidden="true">
      <SkeletonBlock tag="span" className="ck-card-photo" effect={EFFECT} />
      <span className="ck-card-body">
        <SkeletonText className="ck-card-title" effect={EFFECT}>{title}</SkeletonText>
        <SkeletonText className="ck-card-meta" effect={EFFECT}>35 min</SkeletonText>
      </span>
    </span>
  );
}

/** The recipe grid still loading: six tiles, two to a row (fills a phone screen). */
export function RecipeGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <Block key="grid-loading" className="ck-card-grid" aria-busy="true" aria-label="Loading recipes">
      <div className="grid grid-cols-2 grid-gap">
        {Array.from({ length: count }, (_, i) => (
          <RecipeCardSkeleton key={i} title={TITLES[i % TITLES.length]} />
        ))}
      </div>
    </Block>
  );
}

/** The tag chips still loading: grey pills where the chips go. */
export function ChipsSkeleton() {
  return (
    <>
      {CHIP_WIDTHS.map((w, i) => (
        <SkeletonBlock key={i} tag="span" className="ck-skeleton-chip" width={w} effect={EFFECT} aria-hidden="true" />
      ))}
    </>
  );
}

/** A count line ("24 recipes · Newest first") still loading. */
export function CountSkeleton({ text = '24 recipes · Newest first' }: { text?: string }) {
  return (
    <SkeletonText className="ck-note" effect={EFFECT} aria-hidden="true">
      {text}
    </SkeletonText>
  );
}

/** The Cookbooks tab still loading, as tiles: each with three grey plates, a name and a count. */
export function CookbookGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <Block key="grid-loading" className="ck-card-grid ck-book-grid" aria-busy="true" aria-label="Loading cookbooks">
      <div className="grid grid-cols-2 grid-gap">
        {Array.from({ length: count }, (_, i) => (
          <span key={i} className="ck-card ck-book-tile ck-skeleton-tile" aria-hidden="true">
            <span className="ck-plates">
              <SkeletonBlock tag="span" className="ck-plate ck-plate-left" effect={EFFECT} />
              <SkeletonBlock tag="span" className="ck-plate ck-plate-right" effect={EFFECT} />
              <SkeletonBlock tag="span" className="ck-plate ck-plate-middle" effect={EFFECT} />
            </span>
            <SkeletonText className="ck-book-name" effect={EFFECT}>{['Soups', 'Weeknights', 'Baking', 'Holidays'][i % 4]}</SkeletonText>
            <SkeletonText className="ck-book-meta" effect={EFFECT}>12 recipes</SkeletonText>
          </span>
        ))}
      </div>
    </Block>
  );
}

/** The Cookbooks tab still loading, as a list: rows with a grey square, a name and a count. */
export function CookbookListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <List key="list-loading" strongIos insetIos dividersIos className="ck-book-list" aria-busy="true" aria-label="Loading cookbooks">
      {Array.from({ length: count }, (_, i) => (
        <ListItem key={i} aria-hidden="true">
          <span slot="media">
            <SkeletonBlock tag="span" className="ck-book-thumb" effect={EFFECT} />
          </span>
          <SkeletonText slot="title" effect={EFFECT}>{['Soups', 'Weeknights', 'Baking', 'Holidays', 'Sides'][i % 5]}</SkeletonText>
          <SkeletonText slot="footer" effect={EFFECT}>12 recipes</SkeletonText>
        </ListItem>
      ))}
    </List>
  );
}

/** Issue #17: editor rows still being read from a photo (ingredients or steps), as grey lines in the editor's list. */
export function EditRowsSkeleton({ rows }: { rows: string[] }) {
  return (
    <List className="ck-edit-list" strong inset dividers aria-hidden="true">
      {rows.map((t, i) => (
        <ListItem key={i}>
          <span slot="title">
            <SkeletonText effect={EFFECT}>{t}</SkeletonText>
          </span>
        </ListItem>
      ))}
    </List>
  );
}
