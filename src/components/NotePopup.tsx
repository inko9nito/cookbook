import { useRef, useState } from 'react';
import { Popup, Page, Navbar, NavLeft, NavTitle, NavRight, Link, List, ListInput, ListButton, f7 } from 'framework7-react';
import { NOTE_MAX } from '../lib/planner';

const POPUP = '.ck-note-popup';

/**
 * Opens the note screen with its field focused (the keyboard up). Both have to happen in the tap itself: iOS only raises
 * the keyboard for a field focused during a tap. It opens without sliding, as From a Link does: focused while it slid
 * up, the field was low on the screen as the keyboard came up and iOS shifted the whole screen up.
 */
export function openNote() {
  f7.popup.open(POPUP, false);
  const field = document.querySelector<HTMLTextAreaElement>(`${POPUP} textarea`);
  field?.focus({ preventScroll: true });
}

type Props = {
  /** "Note for Tue, Nov 17" */
  title: string;
  /** the note being changed; empty for a new one */
  note: string;
  onSave: (text: string) => void;
  /** only for a note already on the day */
  onRemove?: () => void;
};

/**
 * A Planner note (issue #74): a Framework7 popup with a big field that grows with the text and keeps line breaks, so a
 * longer note ("Dinner at Sam's: bring the salad, pick up wine on the way…") is easy to write and to change. The
 * one-line prompt it replaces was too small to edit anything. Save keeps it; a note already on the day can be removed.
 */
export default function NotePopup({ title, note, onSave, onRemove }: Props) {
  const [text, setText] = useState(note);
  const [shownFor, setShownFor] = useState(note);
  // a different note to edit: start from it
  if (shownFor !== note) {
    setShownFor(note);
    setText(note);
  }
  const then = useRef<(() => void) | null>(null);
  const finish = (action: () => void) => {
    then.current = action;
    f7.popup.close(POPUP);
  };
  const ready = !!text.trim();

  return (
    <Popup
      className="ck-note-popup"
      push
      swipeToClose="to-bottom"
      swipeHandler=".navbar"
      // in case iOS shifted the screen up for the keyboard anyway
      onPopupOpened={() => window.scrollY && window.scrollTo(0, 0)}
      onPopupClosed={() => {
        const action = then.current;
        then.current = null;
        setText(note);
        action?.();
      }}
    >
      <Page>
        <Navbar innerClassName="navbar-inner-centered-title">
          <NavLeft>
            <Link popupClose>Cancel</Link>
          </NavLeft>
          <NavTitle>{title}</NavTitle>
          <NavRight>
            <Link className={`ck-nav-primary ${ready ? '' : 'disabled'}`} onClick={() => ready && finish(() => onSave(text.trim()))}>
              Save
            </Link>
          </NavRight>
        </Navbar>
        <List strongIos insetIos className="ck-note-field">
          <ListInput
            type="textarea"
            resizable
            placeholder="Like “Eating out” or “Leftovers”"
            aria-label="Note"
            maxlength={NOTE_MAX}
            value={text}
            onInput={(e) => setText(e.target.value)}
          />
        </List>
        {onRemove && (
          <List strongIos insetIos className="ck-note-remove">
            <ListButton color="red" onClick={() => finish(onRemove)}>
              Remove Note
            </ListButton>
          </List>
        )}
      </Page>
    </Popup>
  );
}
