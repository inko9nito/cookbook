import { Component, useEffect, useState, type ReactNode } from 'react';
import { IonButton } from '@ionic/react';
import { ChevronDown, ChevronUp, RotateCw, TriangleAlert } from 'lucide-react';
import { hideLaunchLoader } from '../data/launch';
import { reopenOnTab, type TabId } from '../data/startTab';
import { isDemo } from '../data/api';

const TABS: TabId[] = ['recipes', 'cookbooks', 'plan', 'groceries', 'settings'];

/** The tab on screen (Ionic's hidden tab bar marks it, main.tsx), to come back to after the reload. */
function shownTab(): TabId | null {
  const button = document.querySelector('ion-tab-bar.ck-ion-tabbar-engine .tab-selected');
  const tab = TABS.find((t) => button?.classList.contains(`ck-ion-engine-${t}`));
  return tab ?? null;
}

/**
 * What shows when the app crashes (issue #140), instead of a blank white screen with no way out but closing the app.
 * React takes the whole app away after an error it can't recover from; this catches it and shows one button, Reload,
 * which opens the app again on the tab it was on. The error itself (the message and where in the code) is folded away
 * under Details, for a screenshot in an issue: it means nothing to the user, so it isn't shown unless asked for.
 * Ionic went with the app, so this is plain markup in the shape of an empty state (DESIGN.md → Crash screen), with the
 * browser's own <details> to fold the error away.
 */
export class CrashBoundary extends Component<{ children: ReactNode }, { error: Error | null; tab: TabId | null }> {
  state = { error: null as Error | null, tab: null as TabId | null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)), tab: shownTab() };
  }

  render() {
    const { error, tab } = this.state;
    return error ? <CrashScreen error={error} tab={tab} /> : this.props.children;
  }
}

/** The message and the stack (where in the code), once: Chrome's stack starts with the message, Safari's doesn't. */
function errorText(error: Error) {
  const message = `${error.name}: ${error.message}`;
  if (!error.stack) return message;
  return error.stack.startsWith(message) ? error.stack : `${message}\n${error.stack}`;
}

function CrashScreen({ error, tab }: { error: Error; tab: TabId | null }) {
  // a crash while the app starts would otherwise stay under the launch loader's pot
  useEffect(() => hideLaunchLoader(), []);
  const reload = () => {
    if (tab) reopenOnTab(tab);
    location.reload();
  };
  return (
    <div className="ck-crash" role="alert">
      <div className="ck-empty">
        <span className="ck-empty-icon" aria-hidden="true">
          <TriangleAlert size={40} strokeWidth={1.75} />
        </span>
        <h1 className="ck-empty-title">Something went wrong</h1>
        <IonButton shape="round" className="ck-ion-cta ck-empty-button" onClick={reload}>
          <RotateCw size={20} strokeWidth={2.5} aria-hidden="true" />
          Reload
        </IonButton>
        <details className="ck-crash-details">
          <summary>
            Details
            <ChevronDown className="ck-crash-more" size={16} strokeWidth={2.25} aria-hidden="true" />
            <ChevronUp className="ck-crash-less" size={16} strokeWidth={2.25} aria-hidden="true" />
          </summary>
          <pre className="ck-crash-error">{errorText(error)}</pre>
        </details>
      </div>
    </div>
  );
}

/**
 * On the demo only (never the real site), window.ckCrash() makes the app crash where it is, so the UI check can see the
 * crash screen and that Reload comes back to the same tab.
 */
export function CrashForCheck() {
  const [crash, setCrash] = useState(false);
  useEffect(() => {
    if (!isDemo) return;
    (window as { ckCrash?: () => void }).ckCrash = () => setCrash(true);
  }, []);
  if (crash) throw new Error('A crash for the UI check (ckCrash)');
  return null;
}
