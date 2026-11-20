import { createRoot } from 'react-dom/client';
import { BookOpen, CalendarDays, ChefHat, Settings, ShoppingCart, type LucideIcon } from 'lucide-react';
import '../theme/cookbook.css';
import './next.css';
import { AuthProvider, useAuth } from '../data/auth';
import { SessionGuard, StoreProvider } from '../data/store';
import { go, tabOf, useRoute, type Tab } from './router';
import { CookbookScreen, CookbooksScreen, NotYet, RecipeScreen, RecipesScreen } from './screens';
import { Dialogs, Toasts } from './ui';

/**
 * Issue #141: the app without Framework7, a trial at /next/ on deploy previews. Same data (the store, sign-in), same
 * design tokens; the layout is an ordinary web page: the document scrolls, the header is sticky, the tab bar fixed.
 */

const TABS: { tab: Tab; label: string; icon: LucideIcon }[] = [
  { tab: 'recipes', label: 'Recipes', icon: ChefHat },
  { tab: 'cookbooks', label: 'Cookbooks', icon: BookOpen },
  { tab: 'plan', label: 'Plan', icon: CalendarDays },
  { tab: 'groceries', label: 'Groceries', icon: ShoppingCart },
  { tab: 'settings', label: 'Settings', icon: Settings },
];

function TabBar() {
  const current = tabOf(useRoute());
  return (
    <nav className="nx-tabbar" aria-label="Tabs">
      {TABS.map(({ tab, label, icon: Icon }) => (
        <button
          key={tab}
          type="button"
          className={`nx-tab${tab === current ? ' nx-tab-on' : ''}`}
          aria-label={label}
          aria-current={tab === current ? 'page' : undefined}
          onClick={() => {
            if (tab === current && window.scrollY > 0) window.scrollTo({ top: 0, behavior: 'smooth' });
            else go(tab === 'recipes' ? { name: 'recipes' } : { name: tab }, { tab: true });
          }}
        >
          <Icon size={26} strokeWidth={1.75} />
        </button>
      ))}
    </nav>
  );
}

function Screen() {
  const route = useRoute();
  switch (route.name) {
    case 'recipes':
      return <RecipesScreen />;
    case 'recipe':
      return <RecipeScreen key={route.id} id={route.id} />;
    case 'cookbooks':
      return <CookbooksScreen />;
    case 'cookbook':
      return <CookbookScreen key={route.id} id={route.id} />;
    case 'plan':
      return <NotYet title="Planner" />;
    case 'groceries':
      return <NotYet title="Groceries" />;
    case 'settings':
      return <NotYet title="Settings" />;
  }
}

function SignIn() {
  const auth = useAuth();
  return (
    <main className="nx-signin">
      <img src="/icons/icon-192.png" alt="" width={88} height={88} />
      <h1 className="nx-title">Cookbook</h1>
      {auth.problem && <p className="ck-note">{auth.problem}</p>}
      <button type="button" className="nx-button nx-primary" onClick={auth.signIn}>
        Continue with Google
      </button>
    </main>
  );
}

function App() {
  const auth = useAuth();
  if (auth.status === 'checking') return null;
  if (auth.status === 'signedOut') return <SignIn />;
  return (
    <>
      <div className="nx-screen">
        <Screen />
      </div>
      <TabBar />
      <Dialogs />
      <Toasts />
      <SessionGuard />
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <AuthProvider>
    <StoreProvider>
      <App />
    </StoreProvider>
  </AuthProvider>,
);
