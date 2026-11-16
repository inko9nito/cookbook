import { App, Views, View, Toolbar, ToolbarPane, Link } from 'framework7-react';
import { ChefHat, BookOpen, CalendarDays, ShoppingCart } from 'lucide-react';
import routes from './routes';
import { tabIcon } from './components/ui/icons';
import { AuthProvider } from './data/auth';
import { SessionGuard, StoreProvider } from './data/store';
import SignInScreen from './components/SignInScreen';

const f7params = {
  name: 'Cookbook',
  theme: 'ios', // locked to iOS (see CLAUDE.md)
  darkMode: false, // the Cookbook design is light-only for now (DESIGN.md)
  colors: { primary: '#c4421c', red: '#d1291f' }, // Tomato ink (--ck-accent-ink): links and text. Fills use bright Tomato via --ck-accent
  routes,
  // Titles sit on the left in the same row as the buttons (the agreed design, not iOS 26 centered titles)
  navbar: { iosCenterTitle: false },
  // Long-press to start dragging a row (sortableTapHold) needs tap-hold events.
  // touchHighlight off: it's iOS 26's press effect (the tab bar, round bar buttons and toasts swell and glow under
  // the finger), which read as a bounce and isn't part of the agreed design.
  touch: { tapHold: true, touchHighlight: false },
  // React owns the list contents: Framework7 animates, then React updates state.
  swipeout: { removeElements: false },
  sortable: { moveElements: false },
};

// Each page the app opens is a step in the browser history (Framework7's browserHistory), so iOS's own back gesture
// from the left edge (Safari and the home-screen app both have one) goes back a page inside the app. Without it the
// gesture left the app for whatever came before it, such as Google's sign-in page. That gesture is the swipe-back:
// Framework7's own (iosSwipeBack) is off, or one swipe would go back twice. Opening the app starts on the first page of
// each tab, as before (browserHistoryOnLoad off), and the page under iOS's swipe doesn't animate a second time.
const viewHistory = {
  browserHistory: true,
  browserHistoryOnLoad: false,
  browserHistoryStoreHistory: false,
  browserHistoryAnimate: false,
  iosSwipeBack: false,
};

export default function CookbookApp() {
  return (
    <AuthProvider>
      <StoreProvider>
        <App {...f7params}>
        <Views tabs className="safe-areas">
          <Toolbar tabbar icons bottom>
            <ToolbarPane>
              <Link tabLink="#view-recipes" aria-label="Recipes" tabLinkActive>
                <ChefHat {...tabIcon} />
              </Link>
              <Link tabLink="#view-cookbooks" aria-label="Cookbooks">
                <BookOpen {...tabIcon} />
              </Link>
              <Link tabLink="#view-plan" aria-label="Plan">
                <CalendarDays {...tabIcon} />
              </Link>
              <Link tabLink="#view-groceries" aria-label="Groceries">
                <ShoppingCart {...tabIcon} />
              </Link>
            </ToolbarPane>
          </Toolbar>
          <View id="view-recipes" main tab tabActive url="/" {...viewHistory} />
          <View id="view-cookbooks" name="cookbooks" tab url="/cookbooks/" {...viewHistory} />
          <View id="view-plan" name="plan" tab url="/plan/" {...viewHistory} />
          <View id="view-groceries" name="groceries" tab url="/groceries/" {...viewHistory} />
        </Views>
        <SignInScreen />
        <SessionGuard />
      </App>
      </StoreProvider>
    </AuthProvider>
  );
}
