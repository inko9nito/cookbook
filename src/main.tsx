import { createRoot } from 'react-dom/client';
import Framework7 from 'framework7/lite-bundle';
import Framework7React from 'framework7-react';

import 'framework7/css/bundle';
import './theme/cookbook.css';
import './app.css';

import CookbookApp from './App';
import { startTouchLog } from './data/touchLog';

Framework7.use(Framework7React);

// The app always opens on the first page of each tab: forget the page a reload was on (Framework7 keeps it in the
// address after "#!" and in the history entry), so going back from there doesn't reopen it.
if (location.hash.startsWith('#!') || history.state) history.replaceState(null, '', location.pathname + location.search);

// iOS's own back gesture from the first page of a tab can leave this page for an older copy of the app kept in memory,
// such as the sign-in screen from before you signed in. Reload that copy, so it opens fresh with the sign-in saved on
// the phone.
window.addEventListener('pageshow', (e) => {
  if (e.persisted) location.reload();
});

// TEMPORARY (issue #164): `?touchlog` reports what each long hold on a row did
startTouchLog();

createRoot(document.getElementById('app')!).render(<CookbookApp />);
