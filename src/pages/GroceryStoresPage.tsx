import { Page, Navbar, List, ListItem, ListButton, BlockFooter, SwipeoutActions, SwipeoutButton, f7 } from 'framework7-react';
import { useStore } from '../data/store';
import { storeNameFrom, storeSlugFrom, type GroceryStore } from '../lib/groceries';
import { say, tell } from '../components/ui/toast';

/**
 * Issue #64: the Instacart stores the grocery list's links search (Settings → Grocery Stores, or the list's store pill).
 * Kept in the app's settings on the server, not in the code: the repo is public. A store is added from its Instacart
 * link (Share → Copy on the store's page in Instacart); its name can be changed by tapping it; swipe to delete.
 */
export default function GroceryStoresPage() {
  const { settings, changeSettings } = useStore();
  const stores = settings.groceryStores;

  const saveStores = (next: GroceryStore[]) => {
    const current = next.some((s) => s.slug === settings.groceryStore) ? settings.groceryStore : (next[0]?.slug ?? '');
    changeSettings({ groceryStores: next, groceryStore: current });
  };

  const add = () =>
    f7.dialog.prompt(
      'In Instacart, open the store, tap Share and Copy, then paste the link here.',
      'Add a Store',
      (text: string) => {
        const slug = storeSlugFrom(text);
        if (!slug) {
          f7.dialog.alert('That isn’t a link to a store on Instacart. It looks like instacart.com/store/the-store-name.', 'Not a Store Link');
          return;
        }
        if (stores.some((s) => s.slug === slug)) {
          tell('That store is already here', 2000);
          return;
        }
        f7.dialog.prompt('What to call it on the list.', 'Store Name', (name: string) => {
          const store = { slug, name: name.trim() || storeNameFrom(slug) };
          saveStores([...stores, store]);
          say(`Added “${store.name}”`);
        }, undefined, storeNameFrom(slug));
      },
    );

  // #46: a store deleted can be put back, and the store being shopped with it
  const removeStore = (s: GroceryStore) => {
    const was = { groceryStores: stores, groceryStore: settings.groceryStore };
    saveStores(stores.filter((x) => x.slug !== s.slug));
    say(`Deleted “${s.name}”`, { undo: () => changeSettings(was) });
  };

  const rename = (s: GroceryStore) =>
    f7.dialog.prompt('What to call it on the list.', 'Store Name', (name: string) => {
      if (name.trim()) saveStores(stores.map((x) => (x.slug === s.slug ? { ...x, name: name.trim() } : x)));
    }, undefined, s.name);

  return (
    <Page name="grocery-stores">
      <Navbar title="Grocery Stores" backLink />
      <List strongIos insetIos dividersIos className="ck-store-list">
        {stores.map((s) => (
          <ListItem
            key={s.slug}
            link="#"
            swipeout
            title={s.name}
            footer={`instacart.com/store/${s.slug}`}
            after={s.slug === (settings.groceryStore || stores[0]?.slug) ? 'Shopping here' : undefined}
            onClick={() => rename(s)}
            onSwipeoutDeleted={() => removeStore(s)}
          >
            <SwipeoutActions right>
              <SwipeoutButton delete>Delete</SwipeoutButton>
            </SwipeoutActions>
          </ListItem>
        ))}
        <ListButton onClick={add}>Add a Store</ListButton>
      </List>
      <BlockFooter>
        The grocery list’s links open Instacart and search the store you’re shopping at. Pick it from the list’s “Shopping at” button; swipe a
        single item to get it from another store.
      </BlockFooter>
    </Page>
  );
}
