import { createRoot } from 'react-dom/client';
import { Navigate, Route } from 'react-router-dom';
import { IonApp, IonRouterOutlet, IonTabs, IonTabBar, IonTabButton, IonButton, setupIonicReact } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { BookOpen, CalendarDays, ChefHat, Settings, ShoppingCart } from 'lucide-react';
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
import { Bridge, MenuHost } from './ui';
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

// Ionic's own swipe-back is off: Safari (the tab and the home-screen app) has its own back swipe, and the two together
// slid two copies of the pages at once (the user's recording). Safari's swipe goes back in the history; Ionic then shows
// the page under it at once (history.ts).
setupIonicReact({ mode: 'ios', swipeBackEnabled: false });
installHistory();

const TABS = [
  { tab: 'recipes', label: 'Recipes', icon: ChefHat },
  { tab: 'cookbooks', label: 'Cookbooks', icon: BookOpen },
  { tab: 'plan', label: 'Plan', icon: CalendarDays },
  { tab: 'groceries', label: 'Groceries', icon: ShoppingCart },
  { tab: 'settings', label: 'Settings', icon: Settings },
];

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

/** the tab bar and each tab's first page */
function Tabs() {
  return (
    <IonTabs>
      <IonRouterOutlet>
        <Route path="/recipes" element={<RecipesPage />} />
        <Route path="/cookbooks" element={<CookbooksPage />} />
        <Route path="/plan" element={<PlanPage />} />
        <Route path="/groceries" element={<GroceriesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/" element={<Navigate to="/recipes" replace />} />
      </IonRouterOutlet>
      <IonTabBar slot="bottom" className="ck-ion-tabbar">
        {TABS.map(({ tab, label, icon: Icon }) => (
          <IonTabButton key={tab} tab={tab} href={`/${tab}`} aria-label={label}>
            <Icon size={26} strokeWidth={1.75} />
          </IonTabButton>
        ))}
      </IonTabBar>
    </IonTabs>
  );
}

/**
 * Pages opened from a tab (a recipe, a cookbook, the editor, Settings' pages) are pushed over the whole tab view, so they
 * slide in over the tab bar and cover it, as iOS apps do; back slides them away to the tab as it was.
 */
function Screens() {
  return (
    <IonReactRouter basename="/ionic">
      <IonRouterOutlet>
        <Route path="/recipe/:id" element={<RecipePage />} />
        <Route path="/recipe/:id/edit" element={<EditPage />} />
        <Route path="/cookbook/:id" element={<CookbookPage />} />
        <Route path="/settings/appearance" element={<AppearancePage />} />
        <Route path="/*" element={<Tabs />} />
      </IonRouterOutlet>
      <CookMode />
    </IonReactRouter>
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
