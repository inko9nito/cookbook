import { Page, Navbar, List, ListItem, BlockFooter } from 'framework7-react';
import { FONTS, setFont, useFont } from '../data/font';

/**
 * Settings → Appearance → Font (issue #135): the fonts the user is choosing between. Each row is drawn in its own
 * font (title in the font for titles and buttons, a line in the font for reading), and picking one changes the whole
 * app at once, so it can be tried around the app.
 */
export default function FontPage() {
  const font = useFont();
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
      <BlockFooter>Only on this phone. Fredoka is the font the app has used until now.</BlockFooter>
    </Page>
  );
}
