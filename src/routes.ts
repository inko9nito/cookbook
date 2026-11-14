import RecipesPage from './pages/RecipesPage';
import RecipePage from './pages/RecipePage';
import CookbooksPage from './pages/CookbooksPage';
import PlanPage from './pages/PlanPage';
import SettingsPage from './pages/SettingsPage';
import DesignSystemsPage from './pages/DesignSystemsPage';

const routes = [
  { path: '/', component: RecipesPage },
  { path: '/recipe/:id/', component: RecipePage },
  { path: '/cookbooks/', component: CookbooksPage },
  { path: '/plan/', component: PlanPage },
  { path: '/settings/', component: SettingsPage },
  { path: '/settings/design/', component: DesignSystemsPage },
];

export default routes;
