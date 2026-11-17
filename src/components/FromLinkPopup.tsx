import { useRef, useState } from 'react';
import { Popup, Page, Navbar, NavLeft, NavTitle, NavRight, Link, List, ListItem, ListInput, f7 } from 'framework7-react';
import { useStore } from '../data/store';
import { linkIn, sameLink } from '../lib/read-recipe';

const POPUP = '.ck-from-link-popup';

/**
 * Recipes + → From a link opens this, with its field focused (the keyboard up, one tap from iOS's Paste). Both have to
 * happen in the tap itself: iOS only raises the keyboard for a field focused during a tap. The popup opens without
 * sliding: focused while it slid up, the field was low on the screen as the keyboard came up, and iOS shifted the
 * whole screen up to show it, leaving the header off the top.
 */
export function openFromLink() {
  f7.popup.open(POPUP, false);
  document.querySelector<HTMLTextAreaElement>(`${POPUP} textarea`)?.focus({ preventScroll: true });
}

type Props = { onImport: (url: string) => void; onOpenRecipe: (id: string) => void };

/**
 * From a Link (issue #15), a Framework7 popup: one field for the link (pasted with iOS's own Paste, or typed), showing
 * the whole address. A web app can't read the clipboard by itself: iOS asks with its Paste button every time, so the
 * field is the one place to paste (a separate Paste Copied Link row was confusing). Under the field, the site the
 * recipe comes from, or, for a page already imported (`sameLink` against the recipes' `sourceUrl`), that recipe to
 * open instead. Import opens the editor, which reads the page.
 */
export default function FromLinkPopup({ onImport, onOpenRecipe }: Props) {
  const { recipes } = useStore();
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  // what to do once the popup has slid away
  const then = useRef<(() => void) | null>(null);

  const url = linkIn(text);
  const have = url ? recipes.find((r) => r.sourceUrl && sameLink(r.sourceUrl, url)) : undefined;
  let site = '';
  try {
    site = url ? new URL(url).hostname.replace(/^www\./, '') : '';
  } catch {
    /* not a web address after all */
  }
  const finish = (action: () => void) => {
    then.current = action;
    f7.popup.close(POPUP);
  };

  const info = have ? '' : site ? `From ${site}` : text.trim() ? '' : 'Tap here and choose Paste, or type the link.';
  // not while a link is still being typed ("h", "https:"): only for words, or once the field is left
  const notLink = !!text.trim() && !url && (!focused || /\s/.test(text.trim()));

  return (
    <Popup
      className="ck-from-link-popup"
      push
      swipeToClose="to-bottom"
      swipeHandler=".navbar"
      // in case iOS shifted the screen up for the keyboard anyway
      onPopupOpened={() => window.scrollY && window.scrollTo(0, 0)}
      onPopupClosed={() => {
        const action = then.current;
        then.current = null;
        setText('');
        action?.();
      }}
    >
      <Page>
        <Navbar innerClassName="navbar-inner-centered-title">
          <NavLeft>
            <Link popupClose>Cancel</Link>
          </NavLeft>
          <NavTitle>From a Link</NavTitle>
          <NavRight>
            <Link className={`ck-nav-primary ${url ? '' : 'disabled'}`} onClick={() => url && finish(() => onImport(url))}>
              Import
            </Link>
          </NavRight>
        </Navbar>
        <List strongIos insetIos dividersIos className="ck-from-link-field">
          <ListInput
            label="Link"
            type="textarea"
            resizable
            inputmode="url"
            placeholder="https://"
            autocapitalize="off"
            autocorrect="off"
            spellcheck="false"
            aria-label="Link to the recipe"
            value={text}
            onInput={(e) => {
              setText(e.target.value.replace(/[\r\n]+/g, ' '));
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            clearButton
            info={notLink ? undefined : info}
            errorMessage="That isn’t a link. Copy the address of the recipe’s page (Share → Copy in Safari)."
            errorMessageForce={notLink}
          />
        </List>
        {have && (
          <List strongIos insetIos dividersIos className="ck-from-link-have">
            <ListItem
              link="#"
              header="Already in your recipes"
              title={have.title}
              onClick={() => finish(() => onOpenRecipe(have.id))}
            />
          </List>
        )}
      </Page>
    </Popup>
  );
}
