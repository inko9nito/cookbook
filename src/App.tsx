import { App, Views, View, Toolbar, ToolbarPane, Link } from 'framework7-react';
import { ChefHat, BookOpen, CalendarDays } from 'lucide-react';
import routes from './routes';
import { tabIcon } from './components/ui/icons';
import { StoreProvider } from './demo/store';
import RecipeEditorPopup from './components/RecipeEditorPopup';

const f7params = {
  name: 'Cookbook',
  theme: 'ios', // locked to iOS (see CLAUDE.md)
  darkMode: false, // the Cookbook design is light-only for now (DESIGN.md)
  colors: { primary: '#c4421c' }, // Tomato ink (--ck-accent-ink): links and text. Fills use bright Tomato via --ck-accent
  routes,
  // Long-press to start dragging a row (sortableTapHold) needs tap-hold events.
  touch: { tapHold: true },
  // React owns the list contents: Framework7 animates, then React updates state.
  swipeout: { removeElements: false },
  sortable: { moveElements: false },
};

export default function CookbookApp() {
  return (
    <StoreProvider>
      <App {...f7params}>
        <Views tabs className="safe-areas">
          <Toolbar tabbar icons bottom>
            <ToolbarPane>
              <Link tabLink="#view-recipes" tabLinkActive>
                <ChefHat {...tabIcon} />
                <span className="tabbar-label">Recipes</span>
              </Link>
              <Link tabLink="#view-cookbooks">
                <BookOpen {...tabIcon} />
                <span className="tabbar-label">Cookbooks</span>
              </Link>
              <Link tabLink="#view-plan">
                <CalendarDays {...tabIcon} />
                <span className="tabbar-label">Plan</span>
              </Link>
            </ToolbarPane>
          </Toolbar>
          <View id="view-recipes" main tab tabActive url="/" iosSwipeBack />
          <View id="view-cookbooks" name="cookbooks" tab url="/cookbooks/" iosSwipeBack />
          <View id="view-plan" name="plan" tab url="/plan/" iosSwipeBack />
        </Views>
        <RecipeEditorPopup />
      </App>
    </StoreProvider>
  );
}
