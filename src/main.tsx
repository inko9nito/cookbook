import { createRoot } from 'react-dom/client';
import Framework7 from 'framework7/lite-bundle';
import Framework7React from 'framework7-react';

import 'framework7/css/bundle';
import './theme/cookbook.css';
import './app.css';

import CookbookApp from './App';

Framework7.use(Framework7React);

// iOS's own back gesture from the screen edge (it comes along with Framework7's swipe-back) can leave this page for an
// older copy of the app kept in memory, such as the sign-in screen from before you signed in. Reload that copy, so it
// opens fresh with the sign-in saved on the phone.
window.addEventListener('pageshow', (e) => {
  if (e.persisted) location.reload();
});

createRoot(document.getElementById('app')!).render(<CookbookApp />);
