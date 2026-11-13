import { App, Views, View, Toolbar, ToolbarPane, Link } from 'framework7-react';
import routes from './routes';
import { StoreProvider } from './demo/store';
import RecipeEditorPopup from './components/RecipeEditorPopup';

const f7params = {
  name: 'Cookbook',
  theme: 'ios', // locked to iOS (see CLAUDE.md)
  darkMode: 'auto',
  colors: { primary: '#d9572b' },
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
              <Link tabLink="#view-recipes" tabLinkActive iconF7="book_fill" text="Recipes" />
              <Link tabLink="#view-cookbooks" iconF7="square_grid_2x2_fill" text="Cookbooks" />
              <Link tabLink="#view-plan" iconF7="calendar" text="Plan" />
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
