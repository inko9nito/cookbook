import { useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonContent, IonList, IonItem, IonLabel,
  IonRadioGroup, IonRadio, IonRange, IonNote, IonSegment, IonSegmentButton,
} from '@ionic/react';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '../data/auth';
import { appVersion, updateApp } from '../lib/appUpdate';
import { reopenOnTab } from '../data/startTab';
import { clearCache, useAccount } from '../data/store';
import { useConfirm } from './ui';
import { FONTS, SIZE_MAX, SIZE_MIN, resetFontSizes, setFont, setFontSizes, sizesOf, useFontChoice, type FontId } from '../data/font';
import { say, tell } from './toast';
import { TabPage, setScrollStyle, useScrollStyle, type ScrollStyle } from './scroll';

/** Settings on Ionic: inset grouped lists (iOS Settings' look), a pushed page, Sign Out confirmed in an action sheet. */
export function SettingsPage() {
  const auth = useAuth();
  const confirm = useConfirm();
  const [refreshing, setRefreshing] = useState(false);
  const scroll = useScrollStyle();
  const { admin } = useAccount();
  // as v1: a dialog, the main button "Sign out"; signing out forgets this phone's offline copy
  const signOut = async () => {
    if (!(await confirm('Sign out?', 'Your recipes stay saved. This phone forgets its offline copy until you sign in again.', 'Sign out'))) return;
    await clearCache();
    await auth.signOut();
  };
  // #48: tapping the version copies it (for a bug report)
  const copyVersion = async () => {
    try {
      await navigator.clipboard.writeText(appVersion());
      say('Version copied');
    } catch {
      tell('Couldn’t copy the version');
    }
  };
  // #91: the refresh icon spins while it brings in a new version if there is one, then reloads either way, back on
  // Settings (#48); at least a moment, so a quick reload still reads as refreshed, and never forever
  const refresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    const shortest = new Promise((r) => setTimeout(r, 700));
    setTimeout(() => setRefreshing(false), 30000);
    void updateApp({
      beforeReload: async () => {
        reopenOnTab('settings');
        await shortest;
      },
    });
  };
  return (
    <TabPage tab="settings" title="Settings">
      <IonList inset lines="full" className="ck-ion-inset ck-ion-settings-list">
        <IonItem className="ck-ion-account-row">
          <IonLabel>{auth.email}</IonLabel>
          <button type="button" slot="end" className="ck-ion-plain-button ck-ion-sign-out" onClick={signOut}>
            Sign Out
          </button>
        </IonItem>
      </IonList>
      {/* bringing recipes over from Prepear (#14; only into the admin's cookbook, #146), and Appearance */}
      <IonList inset lines="full" className="ck-ion-inset ck-ion-settings-list">
        {admin && (
          <IonItem button detail onClick={() => tell('Import isn’t in v2 yet')}>
            <IonLabel>Import</IonLabel>
          </IonItem>
        )}
        <IonItem button detail routerLink="/settings/appearance">
          <IonLabel>Appearance</IonLabel>
        </IonItem>
      </IonList>
      <div className="ck-version ck-ion-version-row">
        <span className="ck-version-text" role="button" tabIndex={0} onClick={copyVersion} onKeyDown={(e) => e.key === 'Enter' && copyVersion()}>
          {appVersion()}
        </span>
        <button type="button" className="ck-ion-plain-button ck-ion-refresh" aria-label="Refresh the app" onClick={refresh}>
          <RefreshCw size={18} strokeWidth={2} className={`ck-refresh${refreshing ? ' ck-spinning' : ''}`} />
        </button>
      </div>
      {/* v2 only, until one is picked: the two ways of scrolling (scroll.tsx) */}
      <div className="ck-plan-slot-label ck-ion-settings-label">Scrolling (v2 test)</div>
      <IonSegment value={scroll} onIonChange={(e) => setScrollStyle(e.detail.value as ScrollStyle)} className="ck-ion-segment ck-ion-strong-segment ck-ion-settings-segment">
        <IonSegmentButton value="old">
          <IonLabel>Like v1</IonLabel>
        </IonSegmentButton>
        <IonSegmentButton value="ios">
          <IonLabel>iOS large titles</IonLabel>
        </IonSegmentButton>
      </IonSegment>
      <p className="ck-ion-footnote">
        {scroll === 'old'
          ? 'As v1: on Recipes, a cookbook and a recipe the title row slides away as you scroll down and comes back as you scroll up; search and chips stay at the top. A cookbook’s plates fade under a see-through bar.'
          : 'Ionic’s own: the big title scrolls away with the page and a small one fades into the bar, which stays. Search and chips scroll away.'}
      </p>
    </TabPage>
  );
}

/** Appearance → the font (radio rows) and its sizes (Ionic's range sliders), for this phone */
export function AppearancePage() {
  const choice = useFontChoice();
  const sizes = sizesOf(choice);
  return (
    <IonPage>
      <IonHeader className="ck-ion-header">
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/settings" text="" className="ck-ion-round-back" />
          </IonButtons>
          <IonTitle className="ck-ion-title-small">Appearance</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <div className="ck-group-label ck-ion-meal">Font</div>
        <IonRadioGroup value={choice.font} onIonChange={(e) => setFont(e.detail.value as FontId)}>
          <IonList inset lines="full" className="ck-ion-inset">
            {FONTS.map((f) => (
              <IonItem key={f.id}>
                <IonRadio value={f.id} justify="space-between">
                  {f.name}
                </IonRadio>
              </IonItem>
            ))}
          </IonList>
        </IonRadioGroup>
        <div className="ck-group-label ck-ion-meal">Sizes</div>
        <IonList inset lines="full" className="ck-ion-inset">
          <IonItem>
            <IonRange
              label="Titles and buttons"
              labelPlacement="stacked"
              min={SIZE_MIN}
              max={SIZE_MAX}
              step={5}
              snaps
              value={sizes.display}
              onIonChange={(e) => setFontSizes({ display: e.detail.value as number })}
            >
              <IonNote slot="end">{sizes.display}%</IonNote>
            </IonRange>
          </IonItem>
          <IonItem>
            <IonRange
              label="Reading text"
              labelPlacement="stacked"
              min={SIZE_MIN}
              max={SIZE_MAX}
              step={5}
              snaps
              value={sizes.text}
              onIonChange={(e) => setFontSizes({ text: e.detail.value as number })}
            >
              <IonNote slot="end">{sizes.text}%</IonNote>
            </IonRange>
          </IonItem>
          <IonItem button detail={false} onClick={resetFontSizes}>
            <IonLabel className="ck-ion-accent-text">Usual sizes</IonLabel>
          </IonItem>
        </IonList>
      </IonContent>
    </IonPage>
  );
}
