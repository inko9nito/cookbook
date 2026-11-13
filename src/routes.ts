import RecipesPage from './pages/RecipesPage';
import RecipePage from './pages/RecipePage';
import CookbooksPage from './pages/CookbooksPage';
import PlanPage from './pages/PlanPage';

const routes = [
  { path: '/', component: RecipesPage },
  { path: '/recipe/:id/', component: RecipePage },
  { path: '/cookbooks/', component: CookbooksPage },
  { path: '/plan/', component: PlanPage },
];

export default routes;
