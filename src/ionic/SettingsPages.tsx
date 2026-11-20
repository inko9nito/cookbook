import { useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonButton, IonContent, IonList, IonItem, IonLabel,
  IonRadioGroup, IonRadio, IonRange, IonNote, useIonActionSheet,
} from '@ionic/react';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '../data/auth';
import { appVersion } from '../lib/appUpdate';
import { FONTS, SIZE_MAX, SIZE_MIN, resetFontSizes, setFont, setFontSizes, sizesOf, useFontChoice, type FontId } from '../data/font';
import { tell } from '../components/ui/toast';
import { TabBar } from './ui';

/** Settings on Ionic: inset grouped lists (iOS Settings' look), a pushed page, Sign Out confirmed in an action sheet. */
export function SettingsPage() {
  const auth = useAuth();
  const [sheet] = useIonActionSheet();
  const [refreshing, setRefreshing] = useState(false);
  const signOut = () =>
    sheet({
      header: 'Sign out of Cookbook on this phone? This trial shares its sign-in with the app on this preview.',
      buttons: [
        { text: 'Sign Out', role: 'destructive', handler: () => auth.signOut() },
        { text: 'Cancel', role: 'cancel' },
      ],
    });
  return (
    <IonPage>
      <IonHeader className="ck-ion-header">
        <IonToolbar>
          <IonTitle className="ck-ion-title">Settings</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <IonList inset lines="full" className="ck-ion-inset">
          <IonItem>
            <IonLabel>{auth.email}</IonLabel>
            <IonButton slot="end" fill="clear" className="ck-ion-text-button" onClick={signOut}>
              Sign Out
            </IonButton>
          </IonItem>
        </IonList>
        <IonList inset lines="full" className="ck-ion-inset">
          <IonItem button detail onClick={() => tell('Import isn’t in the trial')}>
            <IonLabel>Import</IonLabel>
          </IonItem>
          <IonItem button detail routerLink="/settings/appearance">
            <IonLabel>Appearance</IonLabel>
          </IonItem>
        </IonList>
        <div className="ck-ion-version">
          <span>Ionic trial · {appVersion()}</span>
          <IonButton
            fill="clear"
            className="ck-ion-icon-button"
            aria-label="Refresh"
            onClick={() => {
              setRefreshing(true);
              setTimeout(() => window.location.reload(), 600);
            }}
          >
            <RefreshCw size={18} className={refreshing ? 'ck-spinning' : ''} />
          </IonButton>
        </div>
        <p className="ck-ion-footnote">
          <a href="/">Open the current app</a>
        </p>
      </IonContent>
      <TabBar current="settings" />
    </IonPage>
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
