import { f7 } from 'framework7-react';

// Recipe and edit pages hide the tab bar (like Airbnb's listing page); tab root pages bring it back.
// Uses Framework7's own toolbar hide/show (its animation, not ours).
const TABBAR = '.views > .toolbar.tabbar';

export const hideTabbar = () => f7.toolbar.hide(TABBAR, true);
export const showTabbar = () => f7.toolbar.show(TABBAR, true);
