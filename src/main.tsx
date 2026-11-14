import { createRoot } from 'react-dom/client';
import Framework7 from 'framework7/lite-bundle';
import Framework7React from 'framework7-react';

import 'framework7/css/bundle';
import './theme/cookbook.css';
import './theme/placeholder-photos.css';
import './app.css';

import CookbookApp from './App';

Framework7.use(Framework7React);

createRoot(document.getElementById('app')!).render(<CookbookApp />);
