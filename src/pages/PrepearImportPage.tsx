import { useEffect, useRef } from 'react';
import { Copy } from 'lucide-react';
import { Page, Navbar, List, ListItem, Block, BlockTitle, f7 } from 'framework7-react';
import { inlineIcon } from '../components/ui/icons';
import { prepearExport } from '../prepear/export';
import { prepearPeek } from '../prepear/peek';

/*
  Settings → Import from Prepear (issue #14, docs/PLAN.md §6). Prepear has no export, so the recipes come out
  through a bookmarklet run on app.prepear.com, where the user is signed in.
  Step 1: the export bookmarklet, which saves everything of theirs as one file.
  Step 2 (next): choosing that file here to import it.
  At the bottom, the peek bookmarklet, in case Claude needs to look at Prepear's site again.
*/

// a bookmarklet: the function's own source, called at once (each is self-contained; see export.ts and peek.ts)
const bookmarklet = (fn: () => void) => `javascript:${encodeURIComponent(`(${fn.toString()})()`)}`;
const exportBookmarklet = bookmarklet(prepearExport);
const peekBookmarklet = bookmarklet(prepearPeek);

const copy = async (code: string) => {
  try {
    await navigator.clipboard.writeText(code);
    f7.toast.show({ text: 'Bookmarklet copied', closeTimeout: 1800 });
  } catch {
    f7.dialog.alert('This browser wouldn’t let the app copy. Try again from Safari.', 'Couldn’t copy');
  }
};

export default function PrepearImportPage() {
  // on a Mac, the link is dragged to the Favorites bar. React won't render a javascript: address, so it's set
  // here; tapping it in the app does nothing (it's meant for Prepear's page, not this one)
  const dragLink = useRef<HTMLAnchorElement>(null);
  useEffect(() => dragLink.current?.setAttribute('href', exportBookmarklet), []);

  return (
    <Page name="prepear-import">
      <Navbar title="Import from Prepear" backLink />
      <Block className="ck-import-intro">
        <p>
          Prepear has no export button, so your recipes come out through a bookmarklet you tap while signed in at
          app.prepear.com. It saves all your recipes, cookbooks and meal plans as one file, which you then choose here.
        </p>
      </Block>

      <BlockTitle>Step 1 · Export from Prepear</BlockTitle>
      <List strongIos insetIos dividersIos>
        <ListItem link="#" noChevron title="Copy the export bookmarklet" onClick={() => copy(exportBookmarklet)} className="ck-copy-row ck-copy-export">
          <Copy slot="after" {...inlineIcon} className="ck-icon ck-copy" aria-hidden="true" />
        </ListItem>
      </List>
      <Block strong inset className="ck-steps">
        <ol>
          <li>Copy the export bookmarklet.</li>
          <li>In Safari, open any page, tap Share, then Add Bookmark, and save it.</li>
          <li>Open Bookmarks, tap Edit, then the new bookmark. Name it “Cookbook export” and replace its address with what you copied.</li>
          <li>Sign in at app.prepear.com and open your profile.</li>
          <li>Type “Cookbook export” in the address bar and tap the bookmark. A panel counts through your recipes, which takes a few minutes. Keep the page open.</li>
          <li>When it says Done, tap Save file.</li>
        </ol>
        <p className="ck-note">
          On a Mac, drag{' '}
          <a ref={dragLink} className="external ck-bookmarklet" onClick={(e) => e.preventDefault()} draggable>
            Cookbook export
          </a>{' '}
          to the Favorites bar instead. If the page reloads or the phone sleeps, tap the bookmarklet again: it carries on.
        </p>
      </Block>

      <BlockTitle>Step 2 · Import</BlockTitle>
      <Block className="ck-note">
        <p>Then you choose that file here, check what’s in it, and import. Photos come over too.</p>
      </Block>

      {/* the first step of #14: it showed Claude how Prepear's site works. Kept in case Prepear changes. */}
      <BlockTitle>For Claude</BlockTitle>
      <List strongIos insetIos dividersIos>
        <ListItem link="#" noChevron title="Copy the peek bookmarklet" onClick={() => copy(peekBookmarklet)} className="ck-copy-row ck-copy-peek">
          <Copy slot="after" {...inlineIcon} className="ck-icon ck-copy" aria-hidden="true" />
        </ListItem>
      </List>
      <Block className="ck-note">
        <p>Only if the export stops working: the peek records how Prepear’s site loads recipes, leaving out your password, sign-in and email address, so Claude can fix the export.</p>
      </Block>
    </Page>
  );
}
