import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Navigate, Route } from 'react-router-dom';
import { IonApp, IonRouterOutlet, IonTabs, IonTabBar, IonTabButton, IonButton, setupIonicReact } from '@ionic/react';
import { IonReactMemoryRouter, IonReactRouter } from '@ionic/react-router';
import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';
// the design tokens come in through ionic.css (@import), as in /next/: a module shared with the app's page went into a
// stylesheet of its own, loaded before Framework7's
import './ionic.css';
import { AuthProvider, useAuth } from '../data/auth';
import { SessionGuard, StoreProvider } from '../data/store';
import { CookProvider } from '../data/cook';
import { installHistory } from './history';
import { Bridge, MenuHost, TABS } from './ui';
import RecipesPage from './RecipesPage';
import RecipePage from './RecipePage';
import EditPage from './EditPage';
import { CookbookPage, CookbooksPage } from './CookbooksPages';
import PlanPage from './PlanPage';
import GroceriesPage from './GroceriesPage';
import { AppearancePage, SettingsPage } from './SettingsPages';
import CookMode from './CookMode';

/**
 * Issue #141: the app on Ionic, a trial at /ionic/ on deploy previews. Same data, sign-in and cook-mode state as the app;
 * every screen, sheet, menu, swipe and transition is Ionic's (iOS mode), in the agreed design.
 */

// Back swipe: one gesture only, never two at once (both together slid two copies of the pages, the user's recording).
// - Home Screen app: Ionic's own swipe, the live page following the finger with its shadow and parallax. The pages keep
//   their history inside the app (a memory router), so iOS has no page of the site to go back to and stays out of it.
// - Safari tab: Safari's swipe, which can't be turned off there; the pages are browser history entries, Safari slides
//   back through them and Ionic then shows the page at once (history.ts).
const standalone =
  matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true ||
  new URLSearchParams(location.search).has('standalone'); // ?standalone: the Home Screen app's way, in a browser (checks)
setupIonicReact({ mode: 'ios', swipeBackEnabled: standalone });
installHistory();


function SignIn() {
  const auth = useAuth();
  return (
    <main className="ck-ion-signin">
      <img src="/icons/icon-192.png" alt="" width={88} height={88} />
      <h1>Cookbook</h1>
      {auth.problem && <p className="ck-note">{auth.problem}</p>}
      <IonButton shape="round" className="ck-ion-cta" onClick={auth.signIn}>
        Continue with Google
      </IonButton>
    </main>
  );
}

/**
 * Each tab keeps its own stack of pages (Ionic's tabs). The tab bar is drawn by each tab's first page (`TabBar` in
 * ui.tsx), not over all of them, so a page pushed in a tab slides in over the tab's first page, its bar included, and
 * covers it, as iOS does; back (the button, or a swipe) reveals the page as it was, scroll and all. Ionic's own bar is
 * kept for its tab switching and stacks, out of sight; the pages' bars press its buttons.
 */
function Tabs() {
  return (
    <IonTabs>
      <IonRouterOutlet>
        <Route path="/recipes" element={<RecipesPage />} />
        <Route path="/recipes/recipe/:id" element={<RecipePage />} />
        <Route path="/recipes/recipe/:id/edit" element={<EditPage />} />
        <Route path="/cookbooks" element={<CookbooksPage />} />
        <Route path="/cookbooks/:id" element={<CookbookPage />} />
        <Route path="/cookbooks/recipe/:id" element={<RecipePage />} />
        <Route path="/cookbooks/recipe/:id/edit" element={<EditPage />} />
        <Route path="/plan" element={<PlanPage />} />
        <Route path="/plan/recipe/:id" element={<RecipePage />} />
        <Route path="/plan/recipe/:id/edit" element={<EditPage />} />
        <Route path="/groceries" element={<GroceriesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/settings/appearance" element={<AppearancePage />} />
        <Route path="*" element={<Navigate to="/recipes" replace />} />
      </IonRouterOutlet>
      <IonTabBar slot="bottom" className="ck-ion-tabbar-engine">
        {TABS.map(({ tab, label }) => (
          <IonTabButton key={tab} tab={tab} href={`/${tab}`} aria-label={label} className={`ck-ion-engine-${tab}`} />
        ))}
      </IonTabBar>
    </IonTabs>
  );
}

function Router({ children }: { children: ReactNode }) {
  return standalone ? (
    <IonReactMemoryRouter basename="/ionic" initialEntries={[/^\/ionic\/(recipes|cookbooks|plan|groceries|settings)/.test(location.pathname) ? location.pathname : '/ionic/recipes']}>
      {children}
    </IonReactMemoryRouter>
  ) : (
    <IonReactRouter basename="/ionic">{children}</IonReactRouter>
  );
}

function Screens() {
  return (
    <Router>
      <Tabs />
      <CookMode />
    </Router>
  );
}

function App() {
  const auth = useAuth();
  if (auth.status === 'checking') return null;
  return (
    <IonApp>
      {auth.status === 'signedOut' ? <SignIn /> : <Screens />}
      <MenuHost />
      <Bridge />
      <SessionGuard />
    </IonApp>
  );
}

createRoot(document.getElementById('root')!).render(
  <AuthProvider>
    <StoreProvider>
      <CookProvider>
        <App />
      </CookProvider>
    </StoreProvider>
  </AuthProvider>,
);
