import { useEffect, useState } from 'react';
import { Page, Navbar, List, ListItem, BlockFooter } from 'framework7-react';
import { DEFAULT_ID, loadDesignSystems, savedDesignSystemId } from '../theme/designSystem';

export default function SettingsPage() {
  const [current, setCurrent] = useState('');

  const refresh = async () => {
    const id = savedDesignSystemId();
    if (id === DEFAULT_ID) return setCurrent('iOS default');
    const ds = (await loadDesignSystems()).find((d) => d.id === id);
    setCurrent(ds?.name ?? 'iOS default');
  };
  useEffect(() => {
    refresh();
  }, []);

  return (
    <Page name="settings" onPageBeforeIn={refresh}>
      <Navbar title="Settings" backLink />
      <List strongIos insetIos dividersIos>
        <ListItem link="/settings/design/" title="Design System" after={current} />
      </List>
      <BlockFooter>Changes the app's colors, fonts and corner shapes. Swipes and animations stay native iOS.</BlockFooter>
    </Page>
  );
}
