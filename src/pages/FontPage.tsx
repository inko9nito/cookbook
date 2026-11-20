import { Page, Navbar, List, ListItem, BlockFooter, BlockTitle } from 'framework7-react';
import { FONTS, fontName, setFont, useFontChoice } from '../data/font';
import FontSizeControls from '../components/FontSizeControls';

/**
 * Settings → Appearance → Font (issue #135): the app's font, Parkinsans unless another is picked, kept so the user can
 * switch at any time. Each row is drawn in its own font (title in the font for titles and buttons, a line in the font
 * for reading), and picking one changes the whole app at once. Under them, the chosen font's sizes.
 */
export default function FontPage() {
  const { font } = useFontChoice();
  return (
    <Page name="font">
      <Navbar title="Font" backLink />
      <List strongIos insetIos dividersIos className="ck-font-list">
        {FONTS.map((f) => (
          <ListItem
            key={f.id}
            radio
            radioIcon="end"
            name="ck-font"
            value={f.id}
            checked={font === f.id}
            onChange={() => setFont(f.id)}
          >
            <div slot="title" className="ck-font-sample" data-font-sample={f.id}>
              <span className="ck-font-sample-name">{f.name}</span>
              <span className="ck-font-sample-text">1½ cups Greek yogurt, minced</span>
            </div>
          </ListItem>
        ))}
      </List>
      <BlockFooter>Only on this phone.</BlockFooter>
      <BlockTitle>{fontName(font)} Sizes</BlockTitle>
      <FontSizeControls />
    </Page>
  );
}
