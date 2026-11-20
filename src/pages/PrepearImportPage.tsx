import { Fragment, useEffect, useRef, useState } from 'react';
import { BookOpen, Copy, FileUp } from 'lucide-react';
import { Page, Navbar, List, ListItem, Block, BlockTitle, Button, Progressbar, Preloader, f7 } from 'framework7-react';
import { inlineIcon } from '../components/ui/icons';
import { prepearExport } from '../prepear/export';
import { prepearPeek } from '../prepear/peek';
import { planPrepearImport, readPrepearExport, type PrepearItem, type PrepearPlan } from '../lib/prepear';
import { planPrepearCookbooks, type PrepearCookbookPlan } from '../lib/prepear-cookbooks';
import type { Cookbook } from '../lib/cookbook';
import { newId } from '../lib/recipe';
import { ApiError, backend } from '../data/api';
import { useCookbooks, useStore } from '../data/store';
import { say } from '../components/ui/toast';

/*
  Settings → Import from Prepear (issue #14, docs/PLAN.md §6). Prepear has no export, so the recipes come out
  through a bookmarklet run on app.prepear.com, where the user is signed in.
  Step 1: the export bookmarklet, which saves everything of theirs as one file.
  Step 2: choosing that file here: it says what's in it, then imports the recipes (src/lib/prepear.ts converts them),
  copying their photos, and keeps the whole file on the server for the cookbooks and meal plan later.
  Step 3 (issue #25): the cookbooks, from the file kept on the server, once the recipes are in
  (src/lib/prepear-cookbooks.ts converts them).
  At the bottom, the peek bookmarklet, in case Claude needs to look at Prepear's site again.
*/

// a bookmarklet: the function's own source, called at once (each is self-contained; see export.ts and peek.ts)
const bookmarklet = (fn: () => void) => `javascript:${encodeURIComponent(`(${fn.toString()})()`)}`;
const exportBookmarklet = bookmarklet(prepearExport);
const peekBookmarklet = bookmarklet(prepearPeek);

const copy = async (code: string) => {
  try {
    await navigator.clipboard.writeText(code);
    say('Bookmarklet copied');
  } catch {
    f7.dialog.alert('This browser wouldn’t let the app copy. Try again from Safari.', 'Couldn’t copy');
  }
};

type Phase =
  | { kind: 'idle' }
  | { kind: 'ready'; text: string; plan: PrepearPlan }
  | { kind: 'importing'; done: number; total: number }
  | { kind: 'done'; imported: number; noPhoto: number; failed: PrepearItem[] }
  | { kind: 'error'; message: string };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Keep the phone awake while importing (it takes a few minutes); nothing happens where the browser can't. */
async function stayAwake(): Promise<() => void> {
  try {
    const wl = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock;
    const lock = await wl?.request('screen');
    return () => void lock?.release().catch(() => undefined);
  } catch {
    return () => undefined;
  }
}

export default function PrepearImportPage() {
  const { recipes, loading, reload } = useStore();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const fileInput = useRef<HTMLInputElement>(null);
  // the export file is kept on the server once per file, before the first recipe is saved
  const keptFile = useRef<string | null>(null);

  // on a Mac, the link is dragged to the Favorites bar. React won't render a javascript: address, so it's set
  // here; tapping it in the app does nothing (it's meant for Prepear's page, not this one)
  const dragLink = useRef<HTMLAnchorElement>(null);
  useEffect(() => dragLink.current?.setAttribute('href', exportBookmarklet), []);

  const chooseFile = () => {
    if (phase.kind === 'importing') return;
    fileInput.current?.click();
  };

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      setPhase({ kind: 'ready', text, plan: planPrepearImport(readPrepearExport(text), recipes) });
    } catch (e) {
      setPhase({ kind: 'error', message: e instanceof Error ? e.message : 'That file couldn’t be read.' });
    }
  };

  const runImport = async (items: PrepearItem[], text: string) => {
    setPhase({ kind: 'importing', done: 0, total: items.length });
    const release = await stayAwake();
    try {
      if (keptFile.current !== text) {
        await backend.keepPrepearExport(text);
        keptFile.current = text;
      }
      const queue = [...items];
      const failed: PrepearItem[] = [];
      let done = 0;
      let noPhoto = 0;
      const worker = async () => {
        for (let item = queue.shift(); item; item = queue.shift()) {
          // the photo first (the server copies it from Prepear's photo host); a recipe still comes in without one
          if (item.photo && !item.recipe.photos.length) {
            try {
              const src = await backend.copyPrepearPhoto(item.photo);
              if (src) item.recipe.photos = [{ id: newId(), src }];
            } catch (e) {
              if (e instanceof ApiError && (e.status === 401 || e.status === 403)) throw e;
              noPhoto++;
            }
          }
          try {
            await backend.saveRecipe(item.recipe);
          } catch (e) {
            if (e instanceof ApiError && (e.status === 401 || e.status === 403)) throw e;
            failed.push(item);
          }
          done++;
          setPhase({ kind: 'importing', done, total: items.length });
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      setPhase({ kind: 'done', imported: items.length - failed.length, noPhoto, failed });
    } catch (e) {
      setPhase({ kind: 'error', message: `The import stopped: ${e instanceof Error ? e.message : String(e)} Choose the file again to carry on; recipes already in won’t be imported twice.` });
    } finally {
      release();
      reload();
    }
  };

  const ready = phase.kind === 'ready' ? phase : null;

  return (
    <Page name="prepear-import">
      <Navbar title="Import from Prepear" backLink />
      <Block className="ck-import-intro">
        <p>
          Prepear has no export button, so your recipes come out through a bookmarklet you tap while signed in at
          app.prepear.com. It saves all your recipes, cookbooks and meal plans as one file, which you then choose here.
        </p>
      </Block>

      <BlockTitle>Step 1 · Export from Prepear</BlockTitle>
      <List strongIos insetIos dividersIos>
        <ListItem link="#" noChevron title="Copy the export bookmarklet" onClick={() => copy(exportBookmarklet)} className="ck-copy-row ck-copy-export">
          <Copy slot="after" {...inlineIcon} className="ck-icon ck-copy" aria-hidden="true" />
        </ListItem>
      </List>
      <Block strong inset className="ck-import-steps">
        <ol>
          <li>Copy the export bookmarklet.</li>
          <li>In Safari, open any page, tap Share, then Add Bookmark, and save it.</li>
          <li>Open Bookmarks, tap Edit, then the new bookmark. Name it “Cookbook export” and replace its address with what you copied.</li>
          <li>Sign in at app.prepear.com and open your profile.</li>
          <li>Type “Cookbook export” in the address bar and tap the bookmark. A panel counts through your recipes, which takes a few minutes. Keep the page open.</li>
          <li>When it says Done, tap Save file.</li>
        </ol>
        <p className="ck-note">
          On a Mac, drag{' '}
          <a ref={dragLink} className="external ck-bookmarklet" onClick={(e) => e.preventDefault()} draggable>
            Cookbook export
          </a>{' '}
          to the Favorites bar instead. If the page reloads or the phone sleeps, tap the bookmarklet again: it carries on.
        </p>
      </Block>

      <BlockTitle>Step 2 · Import</BlockTitle>
      <List strongIos insetIos dividersIos>
        <ListItem
          link="#"
          noChevron
          title={ready ? 'Choose another file' : 'Choose the export file'}
          onClick={chooseFile}
          disabled={loading || phase.kind === 'importing'}
          className="ck-copy-row ck-choose-file"
        >
          <FileUp slot="after" {...inlineIcon} className="ck-icon ck-copy" aria-hidden="true" />
        </ListItem>
      </List>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          readFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      {phase.kind === 'idle' && (
        <Block className="ck-note">
          <p>It’s the prepear-export file the bookmarklet saved, in Files (Downloads). You’ll see what’s in it before anything is imported. Photos come over too.</p>
        </Block>
      )}

      {ready && (
        <Fragment key="ready">
          <List strongIos insetIos dividersIos className="ck-import-summary">
            <ListItem title="Recipes to import" after={String(ready.plan.items.length)} />
            <ListItem title="With a photo" after={String(ready.plan.items.filter((i) => i.photo).length)} />
            {ready.plan.alreadyHere > 0 && <ListItem title="Already imported" after={String(ready.plan.alreadyHere)} />}
            {ready.plan.skipped.length > 0 && <ListItem title="Can’t import" after={String(ready.plan.skipped.length)} footer="Deleted in Prepear, or Prepear didn’t send them" />}
          </List>
          <Block>
            <Button large fill round className="ck-main ck-import-button" disabled={!ready.plan.items.length} onClick={() => runImport(ready.plan.items, ready.text)}>
              {ready.plan.items.length ? `Import ${plural(ready.plan.items.length, 'recipe')}` : 'Nothing new to import'}
            </Button>
            <p className="ck-note">Keep the app open while it imports. Your cookbooks come in next, in step 3; your meal plan is kept for when the app has it.</p>
          </Block>
        </Fragment>
      )}

      {phase.kind === 'importing' && (
        <Block key="importing" strong inset className="ck-import-progress">
          <Progressbar progress={Math.round((phase.done / Math.max(1, phase.total)) * 100)} />
          <p>
            Importing {phase.done} of {phase.total}… Keep the app open.
          </p>
        </Block>
      )}

      {phase.kind === 'done' && (
        <Block key="done" strong inset className="ck-import-progress ck-import-done">
          <p>
            <strong>Imported {plural(phase.imported, 'recipe')}.</strong>
            {phase.noPhoto > 0 && ` ${plural(phase.noPhoto, 'photo')} couldn’t be copied; those recipes came in without one.`}
            {phase.failed.length > 0 && ` ${plural(phase.failed.length, 'recipe')} couldn’t be saved.`}
          </p>
          {phase.failed.length > 0 && (
            <Button large fill round className="ck-main" onClick={() => keptFile.current && runImport(phase.failed, keptFile.current)}>
              Try again
            </Button>
          )}
        </Block>
      )}

      {phase.kind === 'error' && (
        <Block key="error" strong inset>
          <p className="ck-import-error">{phase.message}</p>
        </Block>
      )}

      <CookbooksStep key="cookbooks" chosenFile={keptFile.current ?? (ready ? ready.text : null)} />

      {/* the first step of #14: it showed Claude how Prepear's site works. Kept in case Prepear changes. */}
      <BlockTitle key="for-claude-title">For Claude</BlockTitle>
      <List key="for-claude" strongIos insetIos dividersIos>
        <ListItem link="#" noChevron title="Copy the peek bookmarklet" onClick={() => copy(peekBookmarklet)} className="ck-copy-row ck-copy-peek">
          <Copy slot="after" {...inlineIcon} className="ck-icon ck-copy" aria-hidden="true" />
        </ListItem>
      </List>
      <Block key="for-claude-note" className="ck-note">
        <p>Only if the export stops working: the peek records how Prepear’s site loads recipes, leaving out your password, sign-in and email address, so Claude can fix the export.</p>
      </Block>
    </Page>
  );
}

type BooksPhase =
  | { kind: 'idle' }
  | { kind: 'reading' }
  | { kind: 'ready'; plan: PrepearCookbookPlan }
  | { kind: 'importing'; done: number; total: number }
  | { kind: 'done'; imported: number; failed: Cookbook[] }
  | { kind: 'error'; message: string };

/**
 * Step 3 (issue #25): Prepear's cookbooks, from the export kept on the server in step 2 (or the file chosen just now),
 * with their recipes found among the imported ones. Says what's in it, then brings them in; ones brought in before are
 * skipped.
 */
function CookbooksStep({ chosenFile }: { chosenFile: string | null }) {
  const { recipes, loading } = useStore();
  const { cookbooks, saveCookbookNow } = useCookbooks();
  const [phase, setPhase] = useState<BooksPhase>({ kind: 'idle' });

  const look = async () => {
    setPhase({ kind: 'reading' });
    try {
      const text = chosenFile ?? (await backend.keptPrepearExport());
      if (!text) {
        setPhase({ kind: 'error', message: 'There’s no Prepear export here yet. Import your recipes in step 2 first: that keeps the file.' });
        return;
      }
      setPhase({ kind: 'ready', plan: planPrepearCookbooks(readPrepearExport(text), recipes, cookbooks, newId) });
    } catch (e) {
      setPhase({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  };

  const run = async (list: Cookbook[]) => {
    setPhase({ kind: 'importing', done: 0, total: list.length });
    const failed: Cookbook[] = [];
    let done = 0;
    for (const c of list) {
      try {
        await saveCookbookNow(c);
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          setPhase({ kind: 'error', message: `The import stopped: ${e.message}` });
          return;
        }
        // 409: brought in meanwhile (another tap, another phone): nothing to do
        if (!(e instanceof ApiError && e.status === 409)) failed.push(c);
      }
      done++;
      setPhase({ kind: 'importing', done, total: list.length });
    }
    setPhase({ kind: 'done', imported: list.length - failed.length, failed });
  };

  const ready = phase.kind === 'ready' ? phase.plan : null;

  return (
    <>
      <BlockTitle>Step 3 · Cookbooks</BlockTitle>
      <List strongIos insetIos dividersIos>
        <ListItem
          link="#"
          noChevron
          title="Look at your Prepear cookbooks"
          onClick={() => phase.kind !== 'importing' && phase.kind !== 'reading' && look()}
          disabled={loading || phase.kind === 'importing' || phase.kind === 'reading'}
          className="ck-copy-row ck-look-books"
        >
          <BookOpen slot="after" {...inlineIcon} className="ck-icon ck-copy" aria-hidden="true" />
        </ListItem>
      </List>
      {phase.kind === 'idle' && (
        <Block className="ck-note">
          <p>Once your recipes are in. It reads the file kept in step 2, so there’s nothing to export again, and finds each cookbook’s recipes among the ones you imported.</p>
        </Block>
      )}
      {phase.kind === 'reading' && (
        <Block className="ck-list-state">
          <Preloader />
        </Block>
      )}
      {ready && (
        <>
          <List strongIos insetIos dividersIos className="ck-import-summary ck-books-summary">
            <ListItem title="Cookbooks to import" after={String(ready.cookbooks.length)} />
            <ListItem title="With sections" after={String(ready.cookbooks.filter((c) => c.sections.length).length)} />
            {ready.alreadyHere > 0 && <ListItem title="Already imported" after={String(ready.alreadyHere)} />}
            {ready.missingRecipes > 0 && (
              <ListItem title="Recipes not found" after={String(ready.missingRecipes)} footer="Deleted in Prepear, or not imported: left out of the cookbooks" />
            )}
          </List>
          <Block>
            <Button large fill round className="ck-main ck-import-books-button" disabled={!ready.cookbooks.length} onClick={() => run(ready.cookbooks)}>
              {ready.cookbooks.length ? `Import ${plural(ready.cookbooks.length, 'cookbook')}` : 'Nothing new to import'}
            </Button>
          </Block>
        </>
      )}
      {phase.kind === 'importing' && (
        <Block strong inset className="ck-import-progress">
          <Progressbar progress={Math.round((phase.done / Math.max(1, phase.total)) * 100)} />
          <p>
            Importing {phase.done} of {phase.total}…
          </p>
        </Block>
      )}
      {phase.kind === 'done' && (
        <Block strong inset className="ck-import-progress ck-import-done">
          <p>
            <strong>Imported {plural(phase.imported, 'cookbook')}.</strong>
            {phase.failed.length > 0 && ` ${plural(phase.failed.length, 'cookbook')} couldn’t be saved.`} They’re in the Cookbooks tab.
          </p>
          {phase.failed.length > 0 && (
            <Button large fill round className="ck-main" onClick={() => run(phase.failed)}>
              Try again
            </Button>
          )}
        </Block>
      )}
      {phase.kind === 'error' && (
        <Block strong inset>
          <p className="ck-import-error">{phase.message}</p>
        </Block>
      )}
    </>
  );
}
