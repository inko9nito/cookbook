import { App, Views, View, Toolbar, ToolbarPane, Link, f7 } from 'framework7-react';
import { ChefHat, BookOpen, CalendarDays, ShoppingCart, Settings } from 'lucide-react';
import routes from './routes';
import { tabIcon } from './components/ui/icons';
import { AuthProvider } from './data/auth';
import { SessionGuard, StoreProvider } from './data/store';
import SignInScreen from './components/SignInScreen';
import { takeStartTab } from './data/startTab';

const f7params = {
  name: 'Cookbook',
  theme: 'ios', // locked to iOS (see CLAUDE.md)
  darkMode: false, // the Cookbook design is light-only for now (DESIGN.md)
  colors: { primary: '#c4421c', red: '#d1291f' }, // Tomato ink (--ck-accent-ink): links and text. Fills use bright Tomato via --ck-accent
  routes,
  // Titles sit on the left in the same row as the buttons (the agreed design, not iOS 26 centered titles)
  // snapPageScrollToLargeTitle off: a cookbook's header is Framework7's large title (issue #90), much taller than a
  // title, and snapping it open or shut whenever a scroll stops mid-way fought the finger
  navbar: { iosCenterTitle: false, snapPageScrollToLargeTitle: false },
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
//
// The browser has one history for all the tabs, and Framework7 keeps each tab's place in it, which only works while one
// tab at a time is more than a page deep: with a cookbook open in Cookbooks and the Style Guide open in Settings, one back moved
// both. So leaving a tab takes it back to its first page (issue #25), and coming back to it starts there.
const backToFirstPage = (el?: HTMLElement) => {
  const view = el && f7.views.get(el);
  const router = view?.router;
  if (router && router.history.length > 1) router.back(router.history[0], { force: true, animate: false });
};

const viewHistory = {
  browserHistory: true,
  browserHistoryOnLoad: false,
  browserHistoryStoreHistory: false,
  browserHistoryAnimate: false,
  iosSwipeBack: false,
  onTabHide: backToFirstPage,
};

// Recipes, unless the app reloaded itself from another tab (issue #48: Settings → Version's refresh comes back to Settings).
// Read once, as the app loads.
const startTab = takeStartTab();

export default function CookbookApp() {
  return (
    <AuthProvider>
      <StoreProvider>
        <App {...f7params}>
        <Views tabs className="safe-areas">
          <Toolbar tabbar icons bottom>
            <ToolbarPane>
              <Link tabLink="#view-recipes" aria-label="Recipes" tabLinkActive={startTab === 'recipes'}>
                <ChefHat {...tabIcon} />
              </Link>
              <Link tabLink="#view-cookbooks" aria-label="Cookbooks" tabLinkActive={startTab === 'cookbooks'}>
                <BookOpen {...tabIcon} />
              </Link>
              <Link tabLink="#view-plan" aria-label="Plan" tabLinkActive={startTab === 'plan'}>
                <CalendarDays {...tabIcon} />
              </Link>
              <Link tabLink="#view-groceries" aria-label="Groceries" tabLinkActive={startTab === 'groceries'}>
                <ShoppingCart {...tabIcon} />
              </Link>
              {/* issue #27: Settings is a tab of its own, the last one (it was a button on Recipes) */}
              <Link tabLink="#view-settings" aria-label="Settings" tabLinkActive={startTab === 'settings'}>
                <Settings {...tabIcon} />
              </Link>
            </ToolbarPane>
          </Toolbar>
          <View id="view-recipes" main tab tabActive={startTab === 'recipes'} url="/" {...viewHistory} />
          <View id="view-cookbooks" name="cookbooks" tab tabActive={startTab === 'cookbooks'} url="/cookbooks/" {...viewHistory} />
          <View id="view-plan" name="plan" tab tabActive={startTab === 'plan'} url="/plan/" {...viewHistory} />
          <View id="view-groceries" name="groceries" tab tabActive={startTab === 'groceries'} url="/groceries/" {...viewHistory} />
          <View id="view-settings" name="settings" tab tabActive={startTab === 'settings'} url="/settings/" {...viewHistory} />
        </Views>
        <SignInScreen />
        <SessionGuard />
      </App>
      </StoreProvider>
    </AuthProvider>
  );
}
