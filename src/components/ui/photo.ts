import type { CSSProperties } from 'react';

/** Background-image style for a recipe photo; empty when the recipe has no photo (the placeholder tone shows instead). */
export const photoStyle = (photo?: string): CSSProperties => (photo ? { backgroundImage: `url(${photo})` } : {});
