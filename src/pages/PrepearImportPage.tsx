import { useEffect, useRef } from 'react';
import { Copy } from 'lucide-react';
import { Page, Navbar, List, ListItem, Block, BlockTitle, f7 } from 'framework7-react';
import { inlineIcon } from '../components/ui/icons';
import { prepearPeek } from '../prepear/peek';

/*
  Settings → Import from Prepear (issue #14, docs/PLAN.md §6). Prepear has no export, so the recipes come out
  through bookmarklets run on app.prepear.com, where the user is signed in.
  Step 1 (this version): the peek bookmarklet, which shows Claude how Prepear's site loads recipes.
  Steps 2 and 3 (the export bookmarklet, and choosing its file here) come once Claude has seen the peek.
*/

// the bookmarklet: the peek function's own source, called at once (it's self-contained; see peek.ts)
const peekBookmarklet = `javascript:${encodeURIComponent(`(${prepearPeek.toString()})()`)}`;

export default function PrepearImportPage() {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(peekBookmarklet);
      f7.toast.show({ text: 'Bookmarklet copied', closeTimeout: 1800 });
    } catch {
      f7.dialog.alert('This browser wouldn’t let the app copy. Try again from Safari.', 'Couldn’t copy');
    }
  };

  // on a Mac, the link is dragged to the Favorites bar. React won't render a javascript: address, so it's set
  // here; tapping it in the app does nothing (it's meant for Prepear's page, not this one)
  const dragLink = useRef<HTMLAnchorElement>(null);
  useEffect(() => dragLink.current?.setAttribute('href', peekBookmarklet), []);

  return (
    <Page name="prepear-import">
      <Navbar title="Import from Prepear" backLink />
      <Block className="ck-import-intro">
        <p>
          Prepear has no export button, so your recipes come out through a bookmarklet you tap while signed in at
          app.prepear.com. First a peek: it shows Claude how Prepear’s site loads your recipes, so Claude can write the
          bookmarklet that exports them.
        </p>
      </Block>

      <BlockTitle>Step 1 · Peek at Prepear</BlockTitle>
      <List strongIos insetIos dividersIos>
        <ListItem link="#" noChevron title="Copy the peek bookmarklet" onClick={copy} className="ck-copy-row">
          <Copy slot="after" {...inlineIcon} className="ck-icon ck-copy" aria-hidden="true" />
        </ListItem>
      </List>
      <Block strong inset className="ck-steps">
        <ol>
          <li>Copy the peek bookmarklet.</li>
          <li>In Safari, open any page, tap Share, then Add Bookmark, and save it.</li>
          <li>Open Bookmarks, tap Edit, then the new bookmark. Name it “Cookbook peek” and replace its address with what you copied.</li>
          <li>Sign in at app.prepear.com. Type “Cookbook peek” in the address bar and tap the bookmark.</li>
          <li>A panel opens. Scroll your recipe list to the end, open a recipe or two, a cookbook with sections and your meal plan.</li>
          <li>Tap Save file and send prepear-peek.json to Claude in the chat.</li>
        </ol>
        <p className="ck-note">
          On a Mac, drag{' '}
          <a ref={dragLink} className="external ck-bookmarklet" onClick={(e) => e.preventDefault()} draggable>
            Cookbook peek
          </a>{' '}
          to the Favorites bar instead. The file leaves out your password, sign-in tokens, cookies and email address.
        </p>
      </Block>

      <BlockTitle>Step 2 · Export</BlockTitle>
      <Block className="ck-note">
        <p>Claude writes the export bookmarklet from what the peek shows. It downloads all your recipes, cookbooks and meal plans as one file.</p>
      </Block>

      <BlockTitle>Step 3 · Import</BlockTitle>
      <Block className="ck-note">
        <p>Then you choose that file here, check what’s in it, and import. Photos come over too.</p>
      </Block>
    </Page>
  );
}
