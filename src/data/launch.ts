import { useEffect } from 'react';
import { useAuth } from './auth';
import { useStore } from './store';

// ?loader keeps the launch loader on screen to look at (index.html). Read once, as the app loads.
const keepLoader = new URLSearchParams(location.search).has('loader');

/** Fades out the launch loader (the boiling pot in index.html) and then takes it out of the page. */
export function hideLaunchLoader() {
  const el = document.getElementById('ck-launch');
  if (!el || keepLoader || el.classList.contains('ck-launch-done')) return;
  el.classList.add('ck-launch-done');
  setTimeout(() => el.remove(), 300);
}

// Never longer than this: after it, the screens' own placeholders (issue #35) show what's coming.
const MAX_MS = 2500;

/**
 * Takes the launch loader away once the first screen has something to show: the recipes (from the phone's cache or the
 * server), or the sign-in screen. No waiting beyond that, so the app never opens slower for the sake of the pot.
 */
export function LaunchLoaderDone() {
  const { status } = useAuth();
  const { loading } = useStore();
  const ready = status === 'signedOut' || (status === 'signedIn' && !loading);
  useEffect(() => {
    if (ready) hideLaunchLoader();
  }, [ready]);
  useEffect(() => {
    const t = setTimeout(hideLaunchLoader, MAX_MS);
    return () => clearTimeout(t);
  }, []);
  return null;
}
