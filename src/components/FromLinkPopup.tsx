import { useRef, useState } from 'react';
import { Popup, Page, Navbar, NavLeft, NavTitle, NavRight, Link, List, ListItem, ListInput, f7 } from 'framework7-react';
import { ClipboardPaste } from 'lucide-react';
import { useStore } from '../data/store';
import { linkIn, sameLink } from '../lib/read-recipe';
import { inlineIcon } from './ui/icons';

const POPUP = '.ck-from-link-popup';

/**
 * Recipes + → From a link opens this. It has to happen in the tap itself: iOS only raises the keyboard for a field
 * focused during a tap (so the field is ready to paste or type into without tapping it first).
 */
export function openFromLink() {
  f7.popup.open(POPUP);
  document.querySelector<HTMLTextAreaElement>(`${POPUP} textarea`)?.focus();
}

type Props = { onImport: (url: string) => void; onOpenRecipe: (id: string) => void };

/**
 * From a Link (issue #15), a Framework7 popup: Paste Copied Link reads the clipboard (iOS asks with its own Paste
 * button, right on the row tapped) and puts the link it finds in the field, which shows the whole address; the field
 * also takes a link pasted or typed by hand. Under it, the site the recipe comes from, or, for a page already
 * imported (`sameLink` against the recipes' `sourceUrl`), that recipe to open instead. Import opens the editor, which
 * reads the page.
 */
export default function FromLinkPopup({ onImport, onOpenRecipe }: Props) {
  const { recipes } = useStore();
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
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
  const canPaste = typeof navigator !== 'undefined' && !!navigator.clipboard?.readText;

  const pasteCopied = async () => {
    let copied = '';
    try {
      copied = await navigator.clipboard.readText();
    } catch {
      /* the Paste button wasn't tapped */
      return;
    }
    const link = linkIn(copied);
    if (link) {
      setText(link);
      setNote('');
    } else setNote(copied.trim() ? 'What you copied isn’t a link.' : 'Nothing is copied.');
  };

  const finish = (action: () => void) => {
    then.current = action;
    f7.popup.close(POPUP);
  };

  const info = note || (have ? '' : site ? `From ${site}` : '');
  // not while a link is still being typed ("h", "https:"): only for words, or once the field is left
  const notLink = !!text.trim() && !url && (!focused || /\s/.test(text.trim()));

  return (
    <Popup
      className="ck-from-link-popup"
      push
      swipeToClose="to-bottom"
      swipeHandler=".navbar"
      onPopupClosed={() => {
        const action = then.current;
        then.current = null;
        setText('');
        setNote('');
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
        {canPaste && (
          <List strongIos insetIos dividersIos className="ck-from-link-paste">
            <ListItem link="#" noChevron title="Paste Copied Link" onClick={pasteCopied} className="ck-copy-row">
              <ClipboardPaste slot="media" {...inlineIcon} className="ck-icon ck-copy" aria-hidden="true" />
            </ListItem>
          </List>
        )}
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
              setNote('');
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
