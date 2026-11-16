import RecipesPage from './pages/RecipesPage';
import RecipePage from './pages/RecipePage';
import RecipeEditPage from './pages/RecipeEditPage';
import CookbooksPage from './pages/CookbooksPage';
import CookbookPage from './pages/CookbookPage';
import PlanPage from './pages/PlanPage';
import GroceriesPage from './pages/GroceriesPage';
import SettingsPage from './pages/SettingsPage';
import StyleGuidePage from './pages/StyleGuidePage';
import PrepearImportPage from './pages/PrepearImportPage';

const routes = [
  { path: '/', component: RecipesPage },
  { path: '/recipe/new/', component: RecipeEditPage },
  { path: '/recipe/:id/edit/', component: RecipeEditPage },
  { path: '/recipe/:id/', component: RecipePage },
  { path: '/cookbooks/', component: CookbooksPage },
  { path: '/cookbook/:id/', component: CookbookPage },
  { path: '/cookbook/:id/section/:sectionId/', component: CookbookPage },
  { path: '/plan/', component: PlanPage },
  { path: '/groceries/', component: GroceriesPage },
  { path: '/settings/', component: SettingsPage },
  { path: '/settings/style-guide/', component: StyleGuidePage },
  { path: '/settings/prepear/', component: PrepearImportPage },
];

export default routes;
