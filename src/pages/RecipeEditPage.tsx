import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Page, Navbar, NavLeft, NavTitle, NavRight, Link, List, ListInput, ListItem, BlockTitle, Block, Button, Chip, Stepper,
  SwipeoutActions, SwipeoutButton, Actions, ActionsGroup, ActionsButton, PhotoBrowser, Progressbar, f7,
} from 'framework7-react';
import { Camera, ImagePlus, Trash2, Plus, ArrowUp, ArrowDown, Crop, Star, Globe } from 'lucide-react';
import { useStore } from '../data/store';
import { COURSES, emptyRecipe, newId, titleCase, withRaw, linkedRecipe, recipeNamed, type Ingredient, type Photo, type Recipe, type Step } from '../lib/recipe';
import { parseLine, isHeaderLine, headerText, pastedLines, isStepLabel, stepText } from '../lib/ingredients';
import IngredientSheet from '../components/IngredientSheet';
import RecipeLinkPopup from '../components/RecipeLinkPopup';
import { inlineIcon } from '../components/ui/icons';
import { photoStyle, photoFromFile, recrop, imageForReading, photoCroppedTo } from '../components/ui/photo';
import { READ_IMAGE_EDGE, dishCrop, withReading } from '../lib/read-recipe';
import { ApiError, backend } from '../data/api';
import PhotoCropper from '../components/PhotoCropper';
import { EditRowsSkeleton } from '../components/ui/Skeletons';
import { hideTabbar } from '../components/ui/tabbar';

type Props = {
  /** `?at=ingredients` or `?at=directions` (issue #82: a recipe page's Add ingredients / Add directions) opens it there */
  f7route?: { params: Record<string, string>; query?: Record<string, string> };
  f7router?: { back: () => void };
  /** issue #17: photos or screenshots picked with + → From photos or screenshots, to read the new recipe from */
  scanFiles?: File[];
  /** issue #15: a link given with + → From a link, to read the new recipe from */
  scanUrl?: string;
};

/** "https://www.example.com/…" → "example.com" */
const siteOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

/** Reading a new recipe from photos (issue #17) or a link (#15): under way, done, nothing found, or failed (with why). */
type Scan = { status: 'reading' | 'read' | 'empty' } | { status: 'failed'; message: string };

const move = <T,>(list: T[], from: number, to: number) => {
  const copy = [...list];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
};

/**
 * Move a whole group (its header row and the rows under it, up to the next header) past the group above or below.
 * Rows before the first header aren't in a group and stay at the top.
 */
const moveGroup = <T extends { kind?: string }>(rows: T[], headerIndex: number, dir: -1 | 1): T[] => {
  const starts = rows.flatMap((r, i) => (r.kind === 'header' ? [i] : []));
  const k = starts.indexOf(headerIndex);
  const end = (j: number) => (j + 1 < starts.length ? starts[j + 1] : rows.length);
  const first = dir === -1 ? k - 1 : k; // the upper of the two groups that swap
  if (k < 0 || first < 0 || first + 1 >= starts.length) return rows;
  const a = starts[first], b = starts[first + 1], e = end(first + 1);
  return [...rows.slice(0, a), ...rows.slice(b, e), ...rows.slice(a, b), ...rows.slice(e)];
};

/** ↑ ↓ on a group row: move the whole group (with its rows) past the neighbouring group, without dragging */
// `slot` is read by Framework7's ListItem from this element's props (it places it in the row's "after" area)
function GroupMove({ name, isFirst, isLast, onMove }: { slot: 'after'; name: string; isFirst: boolean; isLast: boolean; onMove: (dir: -1 | 1, el: Element) => void }) {
  const label = name.trim() || 'this group';
  return (
    <span className="ck-group-move">
      <Button round className="ck-move-btn" disabled={isFirst} onClick={(e: { currentTarget: Element }) => onMove(-1, e.currentTarget)} aria-label={`Move ${label} up`}>
        <ArrowUp {...inlineIcon} />
      </Button>
      <Button round className="ck-move-btn" disabled={isLast} onClick={(e: { currentTarget: Element }) => onMove(1, e.currentTarget)} aria-label={`Move ${label} down`}>
        <ArrowDown {...inlineIcon} />
      </Button>
    </span>
  );
}

/** Turns pasted direction lines into rows (R6): blank lines and "Step 1" labels skipped, headings become groups. */
const stepRows = (lines: string[]): Step[] =>
  lines.filter((line) => !isStepLabel(line)).map((line) => (isHeaderLine(line) ? { id: newId(), kind: 'header', text: headerText(line) } : { id: newId(), text: stepText(line) }));

type StepFieldProps = {
  step: Step;
  no: number;
  onType: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
};

/**
 * Issue #71: a step is typed right in its row, no sheet. Framework7 grows a `textarea.resizable` as you type; it's
 * also asked to after the text changes some other way (a step split with Return, or joined with Backspace).
 */
// `slot` is read by Framework7's ListItem from this element's props (it places it in the row's title)
function StepField({ step, no, onType, onKeyDown }: StepFieldProps & { slot: 'title' }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    if (ref.current) f7?.input?.resizeTextarea(ref.current);
  }, [step.text]);
  return (
    <label className="ck-step">
      <span className="ck-step-no">{no}</span>
      <textarea
        ref={ref}
        className="ck-step-input resizable"
        data-step-id={step.id}
        rows={1}
        value={step.text}
        placeholder="Describe this step"
        aria-label={`Step ${no}`}
        onChange={(e) => onType(e.target.value)}
        onKeyDown={onKeyDown}
      />
    </label>
  );
}

/**
 * Edit Recipe: a stacked page (pushed, with swipe-back) with Prepear's editing features:
 * photo, name, grouped ingredients and directions with paste boxes, notes, tags (courses included),
 * servings, serving size, prep and cook time, source. Style: Headspace edit screen, compact 14px text.
 */
export default function RecipeEditPage({ f7route, f7router, scanFiles, scanUrl }: Props) {
  const { recipes, saveRecipe } = useStore();
  const id = f7route?.params.id;
  const original = useMemo<Recipe>(() => recipes.find((r) => r.id === id) ?? emptyRecipe(), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [draft, setDraft] = useState<Recipe>(original);
  const set = (patch: Partial<Recipe>) => setDraft((d) => ({ ...d, ...patch }));

  const [editingIngredientId, setEditingIngredientId] = useState<string | null>(null);
  const [ingredientPaste, setIngredientPaste] = useState('');
  const [stepPaste, setStepPaste] = useState('');
  const [discardOpen, setDiscardOpen] = useState(false);
  // a group just added with "Separate into groups": put the cursor in its name field
  const [focusGroupId, setFocusGroupId] = useState<string | null>(null);
  useEffect(() => {
    if (!focusGroupId) return;
    document.querySelector<HTMLInputElement>(`.page-current input[data-group-id="${focusGroupId}"]`)?.focus();
    setFocusGroupId(null);
  }, [focusGroupId]);
  // a step just split, joined or pasted into: put the cursor there (at a character, or in a group's name field).
  // A layout effect, so it runs inside the key press that asked for it and iOS keeps the keyboard up.
  const [focusStep, setFocusStep] = useState<{ id: string; at: number } | null>(null);
  useLayoutEffect(() => {
    if (!focusStep) return;
    const el = document.querySelector<HTMLTextAreaElement | HTMLInputElement>(
      `.page-current textarea[data-step-id="${focusStep.id}"], .page-current input[data-group-id="${focusStep.id}"]`,
    );
    if (el) {
      el.focus();
      const at = Math.min(focusStep.at, el.value.length);
      el.setSelectionRange(at, at);
    }
    setFocusStep(null);
  }, [focusStep]);
  const fileRef = useRef<HTMLInputElement>(null);
  // after ↑/↓ moves a group, scroll so that group stays under the finger
  const keepInView = useRef<{ id: string; dir: -1 | 1; top: number } | null>(null);
  useLayoutEffect(() => {
    const k = keepInView.current;
    if (!k) return;
    keepInView.current = null;
    // the same arrow the finger is on, in the group's new place
    const row = document.querySelector<HTMLElement>(`.page-current input[data-group-id="${k.id}"]`)?.closest('li');
    const arrow = row?.querySelectorAll('.ck-move-btn')[k.dir === -1 ? 0 : 1];
    const scroller = row?.closest('.page-content');
    if (arrow && scroller) scroller.scrollTop += arrow.getBoundingClientRect().top - k.top;
  });
  const shiftGroup = (field: 'ingredients' | 'steps', id: string, dir: -1 | 1, el: Element) => {
    keepInView.current = { id, dir, top: el.getBoundingClientRect().top };
    setDraft((d) => {
      const rows = d[field] as { id: string; kind?: string }[];
      return { ...d, [field]: moveGroup(rows, rows.findIndex((r) => r.id === id), dir) };
    });
  };

  const dirty = JSON.stringify(draft) !== JSON.stringify(original);
  const isNew = !id;

  // ── ingredients ──
  const editingIngredient = draft.ingredients.find((i) => i.id === editingIngredientId) ?? null;
  const updateIngredient = (next: Ingredient) => set({ ingredients: draft.ingredients.map((i) => (i.id === next.id ? withRaw(next) : i)) });
  const removeIngredient = (rid: string) => setDraft((d) => ({ ...d, ingredients: d.ingredients.filter((i) => i.id !== rid) }));
  // issue #11: the recipes an ingredient can link to (not this one), A–Z. "Recipe" in the ingredient sheet opens the
  // list stacked over the page and the sheet, which stays open behind it
  const others = useMemo(() => recipes.filter((r) => r.id !== draft.id).sort((a, b) => a.title.localeCompare(b.title)), [recipes, draft.id]);
  const [linkOpen, setLinkOpen] = useState(false);
  const linkRecipe = (recipeId: string | undefined) => {
    const r = others.find((x) => x.id === recipeId);
    const i = editingIngredient;
    if (i) updateIngredient({ ...i, recipeId: r?.id, ...(r && !i.name.trim() ? { name: r.title.toLowerCase() } : {}) });
    setLinkOpen(false);
  };
  const addPastedIngredients = () => {
    const rows: Ingredient[] = pastedLines(ingredientPaste).map((line) => {
      if (isHeaderLine(line)) return { id: newId(), kind: 'header', amount: '', unit: '', name: headerText(line), note: '' };
      const parsed = parseLine(line);
      // a line named exactly like one of the recipes ("1/2 cup tahini sauce") links to it
      const r = recipeNamed(parsed.name, others);
      return { id: newId(), ...parsed, raw: line, ...(r ? { recipeId: r.id } : {}) };
    });
    set({ ingredients: [...draft.ingredients, ...rows] });
    setIngredientPaste('');
  };
  const addIngredientGroup = () => {
    const header: Ingredient = { id: newId(), kind: 'header', amount: '', unit: '', name: '', note: '' };
    set({ ingredients: [...draft.ingredients, header] });
    setFocusGroupId(header.id);
  };

  // ── directions ──
  const removeStep = (sid: string) => setDraft((d) => ({ ...d, steps: d.steps.filter((s) => s.id !== sid) }));
  /** Typing in a step. Several lines at once (pasted) become several steps, like the paste box below the list. */
  const typeStep = (s: Step, value: string) => {
    // only a line break that wasn't there before splits (a step read from photos may already have one)
    const breaks = (t: string) => t.split('\n').length;
    if (breaks(value) <= breaks(s.text)) return set({ steps: draft.steps.map((x) => (x.id === s.id ? { ...x, text: value } : x)) });
    const lines = pastedLines(value);
    // what was already in the step stays as typed; into an empty step, the first line is read like the others
    const [first, ...rest] = s.text.trim() ? lines : [];
    const rows = [...(first !== undefined ? [{ ...s, text: first }] : []), ...stepRows(s.text.trim() ? rest : lines)];
    if (!rows.length) rows.push({ ...s, text: '' });
    rows[0] = { ...rows[0], id: s.id };
    const at = draft.steps.findIndex((x) => x.id === s.id);
    set({ steps: [...draft.steps.slice(0, at), ...rows, ...draft.steps.slice(at + 1)] });
    const last = rows[rows.length - 1];
    setFocusStep({ id: last.id, at: last.text.length });
  };
  /** Return starts a new step after this one (with the text after the cursor); Backspace at the start joins it to the step above. */
  const stepKeyDown = (s: Step) => (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const start = el.selectionStart, end = el.selectionEnd;
    const at = draft.steps.findIndex((x) => x.id === s.id);
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      const next: Step = { id: newId(), text: el.value.slice(end).trimStart() };
      const steps = [...draft.steps];
      steps.splice(at, 1, { ...s, text: el.value.slice(0, start).trimEnd() }, next);
      set({ steps });
      setFocusStep({ id: next.id, at: 0 });
    } else if (e.key === 'Backspace' && start === 0 && end === 0 && at > 0) {
      const prev = draft.steps[at - 1];
      if (prev.kind === 'header') {
        // an empty step under a group name: remove it and go back to the name
        if (s.text) return;
        e.preventDefault();
        removeStep(s.id);
        return setFocusStep({ id: prev.id, at: prev.text.length });
      }
      e.preventDefault();
      const join = prev.text && s.text ? ' ' : '';
      set({ steps: draft.steps.flatMap((x) => (x.id === s.id ? [] : x.id === prev.id ? [{ ...x, text: x.text + join + s.text }] : [x])) });
      setFocusStep({ id: prev.id, at: prev.text.length + join.length });
    }
  };
  const pastedSteps = pastedLines(stepPaste).filter((line) => !isStepLabel(line));
  const addPastedSteps = () => {
    set({ steps: [...draft.steps, ...stepRows(pastedLines(stepPaste))] });
    setStepPaste('');
  };
  const addStepGroup = () => {
    const header: Step = { id: newId(), kind: 'header', text: '' };
    set({ steps: [...draft.steps, header] });
    setFocusGroupId(header.id);
  };

  // ── tags: one set of chips (the course types plus every tag already used), tap to toggle, "Add tag" for a new one ──
  const allTags = useMemo(() => {
    const used = new Set([...recipes.flatMap((r) => r.tags), ...draft.tags]);
    return [...COURSES, ...[...used].filter((t) => !COURSES.includes(t)).sort()];
  }, [recipes, draft.tags]);
  const toggleTag = (t: string) => set({ tags: draft.tags.includes(t) ? draft.tags.filter((x) => x !== t) : [...draft.tags, t] });
  // a new tag is typed right at the end of the chips: Return (or leaving the field) adds it, selected
  const [newTag, setNewTag] = useState('');
  const addTag = () => {
    const t = newTag.trim().replace(/^#+/, '').toLowerCase();
    if (t && !draft.tags.includes(t)) set({ tags: [...draft.tags, t] });
    setNewTag('');
  };

  // ── photos (kept on this phone only until photo upload in Phase 1). The first is the cover. ──
  const [photoIdx, setPhotoIdx] = useState(0);
  const [cropping, setCropping] = useState<Photo | null>(null);
  const shown = draft.photos[Math.min(photoIdx, draft.photos.length - 1)];
  const addPhotos = async (files: FileList | null) => {
    const picked = [...(files ?? [])];
    if (!picked.length) return;
    const added = await Promise.all(picked.map((f) => photoFromFile(f, newId())));
    setDraft((d) => ({ ...d, photos: [...d.photos, ...added] }));
    setPhotoIdx(draft.photos.length); // the first new one
    // one photo: straight to cropping it; several: each is centre-cropped, crop any of them after
    if (added.length === 1) setCropping(added[0]);
  };
  const applyCrop = async (box: NonNullable<Photo['crop']>, rotated?: string) => {
    if (!cropping) return;
    // issue #59: a photo turned in the cropper keeps the turned one as its original, so a later crop starts from it
    const next = await recrop(rotated ? { ...cropping, original: rotated } : cropping, box);
    setDraft((d) => ({ ...d, photos: d.photos.map((p) => (p.id === next.id ? next : p)) }));
    setCropping(null);
  };
  const removePhoto = (id: string) => {
    setDraft((d) => ({ ...d, photos: d.photos.filter((p) => p.id !== id) }));
    setPhotoIdx((i) => Math.max(0, i - 1));
  };
  const makeCover = (id: string) => {
    setDraft((d) => ({ ...d, photos: [...d.photos.filter((p) => p.id === id), ...d.photos.filter((p) => p.id !== id)] }));
    setPhotoIdx(0);
  };

  // ── issue #17: a new recipe read from photos or screenshots. The editor opens at once and fills in when Claude has
  // read them; the photos stay at the top to check the recipe against (tap one to see it full screen). ──
  const [scan, setScan] = useState<Scan | null>(scanFiles?.length || scanUrl ? { status: 'reading' } : null);
  const [sources] = useState(() => (scanFiles ?? []).map((f) => URL.createObjectURL(f)));
  const several = sources.length > 1;
  useEffect(() => () => sources.forEach((u) => URL.revokeObjectURL(u)), [sources]);
  const sourceBrowser = useRef<{ f7PhotoBrowser: () => { open: (index?: number) => void } } | null>(null);
  // the server's and the app's own messages are written for the person; anything else (a bug) isn't shown raw
  const failed = (e: unknown) => {
    console.error(e);
    const message =
      e instanceof ApiError
        ? e.message
        : e instanceof TypeError // fetch couldn't reach the server ("Load failed" on the iPhone)
          ? 'Couldn’t reach the server. Check the connection and try again.'
          : 'Something went wrong. Try again, or update the app in Settings → Version.';
    setScan({ status: 'failed', message });
  };
  // issue #15: the page's recipe, its link kept as the source, its photo added (cropped to 4:3, to recrop if needed)
  const readLink = async (link: string) => {
    setScan({ status: 'reading' });
    try {
      const { url, recipe, photo } = await backend.readLink(link);
      if (!recipe.found) return setScan({ status: 'empty' });
      const picture = photo
        ? await fetch(photo)
            .then((r) => r.blob())
            .then((b) => photoFromFile(new File([b], 'photo', { type: b.type }), newId()))
            .catch(() => null)
        : null;
      setDraft((d) => ({ ...withReading(d, recipe, others), sourceUrl: d.sourceUrl || url, photos: picture ? [...d.photos, picture] : d.photos }));
      setScan({ status: 'read' });
    } catch (e) {
      failed(e);
    }
  };
  const readScan = async () => {
    if (scanUrl) return readLink(scanUrl);
    const files = scanFiles ?? [];
    setScan({ status: 'reading' });
    let images: Awaited<ReturnType<typeof imageForReading>>[];
    try {
      images = await Promise.all(files.map((f) => imageForReading(f, READ_IMAGE_EDGE)));
    } catch {
      return setScan({ status: 'failed', message: several ? 'One of those photos couldn’t be opened. Try others.' : 'That photo couldn’t be opened. Try another.' });
    }
    try {
      const reading = await backend.readRecipe(images);
      if (!reading.found) return setScan({ status: 'empty' });
      // the photo of the dish in a screenshot or on the page, cropped to it, if Claude found one
      const dish = reading.dishPhoto;
      const sent = dish ? images[dish.image] : undefined;
      const photo = dish && sent ? await photoCroppedTo(files[dish.image], newId(), (w, h) => dishCrop(dish, sent.width, w, h)) : null;
      setDraft((d) => ({ ...withReading(d, reading, others), photos: photo ? [...d.photos, photo] : d.photos }));
      setScan({ status: 'read' });
    } catch (e) {
      failed(e);
    }
  };
  useEffect(() => {
    if (scanFiles?.length || scanUrl) void readScan();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const reading = scan?.status === 'reading';
  const scanTitle: Record<Scan['status'], string> = {
    reading: 'Reading the recipe…',
    read: 'Recipe read',
    empty: 'No recipe found',
    failed: 'Couldn’t read the recipe',
  };

  const save = () => {
    const { sourceUrl, ...rest } = draft;
    const link = sourceUrl?.trim().slice(0, 2000);
    saveRecipe({
      ...rest,
      ...(link ? { sourceUrl: link } : {}),
      title: draft.title.trim() || 'Untitled recipe',
      minutes: draft.prepMinutes + draft.cookMinutes,
      // a step left empty (Return pressed at the end of the last one) isn't kept
      steps: draft.steps.filter((s) => s.kind === 'header' || s.text.trim()),
    });
    f7router?.back();
  };
  const cancel = () => (dirty ? setDiscardOpen(true) : f7router?.back());
  // issue #82: opened from a recipe page's Add directions (or Add ingredients), the editor starts at that section
  const at = f7route?.query?.at;
  const scrollToSection = (page: { el: HTMLElement }) => {
    if (at !== 'ingredients' && at !== 'directions') return;
    const title = page.el.querySelector<HTMLElement>(`.block-title[data-at="${at}"]`);
    const content = page.el.querySelector<HTMLElement>('.page-content');
    // the title bar lies over the page's content, so the section starts just under the bar
    const top = page.el.querySelector('.navbar')?.getBoundingClientRect().bottom ?? content?.getBoundingClientRect().top ?? 0;
    if (title && content) content.scrollTop += title.getBoundingClientRect().top - top - 8;
  };

  let stepNo = 0;
  const ingHeaders = draft.ingredients.filter((i) => i.kind === 'header').map((i) => i.id);
  const stepHeaders = draft.steps.filter((x) => x.kind === 'header').map((x) => x.id);

  return (
    <Page name="recipe-edit" className="ck-edit" noSwipeback={dirty} onPageBeforeIn={hideTabbar} onPageAfterIn={scrollToSection}>
      <Navbar innerClassName="navbar-inner-centered-title">
        <NavLeft>
          <Link onClick={cancel}>Cancel</Link>
        </NavLeft>
        <NavTitle>{isNew ? 'New Recipe' : 'Edit Recipe'}</NavTitle>
        <NavRight>
          <Link onClick={save} className="ck-nav-primary">
            Save
          </Link>
        </NavRight>
      </Navbar>

      {scan && (
        <Block strong inset className="ck-scan" aria-live="polite">
          <div className="ck-scan-row">
            <div className="ck-scan-sources">
              {scanUrl && (
                <span className="ck-scan-source ck-scan-site" aria-hidden="true">
                  <Globe {...inlineIcon} />
                </span>
              )}
              {sources.map((u, i) => (
                <Link
                  key={u}
                  noLinkClass
                  className="ck-scan-source ck-photo"
                  style={photoStyle(u)}
                  onClick={() => sourceBrowser.current?.f7PhotoBrowser().open(i)}
                  aria-label={sources.length > 1 ? `Your photo ${i + 1} of ${sources.length}. Open full screen` : 'Your photo. Open full screen'}
                />
              ))}
            </div>
            <div className="ck-scan-text">
              <p className={`ck-scan-title ${scan.status === 'failed' ? 'ck-scan-failed' : ''}`}>{scanTitle[scan.status]}</p>
              {scanUrl ? (
                <p className="ck-scan-detail">
                  {scan.status === 'reading' && 'This takes a few seconds, sometimes half a minute. You can type while you wait.'}
                  {scan.status === 'read' && 'Check it against the page before saving.'}
                  {scan.status === 'empty' && 'Type it in below, or take screenshots of the recipe and use From photos or screenshots.'}
                  {scan.status === 'failed' && scan.message}
                </p>
              ) : (
                <p className="ck-scan-detail">
                  {scan.status === 'reading' && 'This takes about half a minute. You can type while you wait.'}
                  {scan.status === 'read' && `Check it against your ${several ? 'photos' : 'photo'} before saving.`}
                  {scan.status === 'empty' && `Type it in below, or try ${several ? 'other photos' : 'another photo'}.`}
                  {scan.status === 'failed' && scan.message}
                </p>
              )}
              {scanUrl && (
                <Link external href={scanUrl} target="_blank" className="ck-scan-link">
                  {siteOf(scanUrl)}
                </Link>
              )}
            </div>
          </div>
          {scan.status === 'reading' && <Progressbar infinite />}
          {scan.status === 'failed' && (
            <Button large fill round className="ck-main" onClick={() => void readScan()}>
              Try again
            </Button>
          )}
          <PhotoBrowser ref={sourceBrowser as never} photos={sources} type="popup" theme="dark" toolbar={false} swipeToClose popupCloseLinkText="Close" navbarOfText="of" />
        </Block>
      )}

      {/* Photos: the selected one large (crop, make cover, remove), then a strip of all of them with + to add more */}
      <Block>
        {shown ? (
          <div className="ck-edit-photo ck-photo" style={photoStyle(shown.src)} role="img" aria-label={photoIdx === 0 ? 'Cover photo' : `Photo ${photoIdx + 1}`}>
            <span className="ck-edit-photo-actions">
              <Button round className="ck-photo-btn" onClick={() => removePhoto(shown.id)} aria-label="Remove photo">
                <Trash2 {...inlineIcon} />
              </Button>
              {draft.photos[0]?.id !== shown.id && (
                <Button round className="ck-photo-btn" onClick={() => makeCover(shown.id)} aria-label="Make cover photo">
                  <Star {...inlineIcon} />
                </Button>
              )}
              <Button round className="ck-photo-btn" onClick={() => setCropping(shown)} aria-label="Crop photo">
                <Crop {...inlineIcon} />
              </Button>
            </span>
          </div>
        ) : (
          // no photo yet: one plain tappable box (dashed, like "Separate into groups"), no colored placeholder
          <Link noLinkClass className="ck-edit-photo ck-edit-photo-empty" onClick={() => fileRef.current?.click()}>
            <Camera {...inlineIcon} />
            Add photos
          </Link>
        )}
        {draft.photos.length > 0 && (
          <div className="ck-thumbs">
            {draft.photos.map((p, i) => (
              <Link
                key={p.id}
                noLinkClass
                className={`ck-thumb ck-photo ${p.id === shown?.id ? 'ck-thumb-on' : ''}`}
                style={photoStyle(p.src)}
                onClick={() => setPhotoIdx(i)}
                aria-label={i === 0 ? 'Cover photo' : `Photo ${i + 1}`}
              >
                {i === 0 && <span className="ck-thumb-badge">Cover</span>}
              </Link>
            ))}
            <Link noLinkClass className="ck-thumb ck-thumb-add" onClick={() => fileRef.current?.click()} aria-label="Add photos">
              <ImagePlus {...inlineIcon} />
            </Link>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            void addPhotos(e.target.files);
            e.target.value = ''; // picking the same file again still fires
          }}
        />
      </Block>

      <List className="ck-fields">
        <ListInput label="Recipe name" type="text" placeholder="Name of recipe" value={draft.title} onInput={(e) => set({ title: e.target.value })} clearButton />
      </List>

      {/* Ingredients */}
      <BlockTitle medium data-at="ingredients">Ingredients</BlockTitle>
      {reading && <EditRowsSkeleton rows={['2 cups flour', '1 tsp baking soda', '3 large eggs, beaten', '1 cup milk']} />}
      {draft.ingredients.length > 0 && (
        <List
          className="ck-edit-list"
          strong
          inset
          dividers
          sortable
          sortableEnabled
          sortableTapHold
          onSortableSort={(data: { from: number; to: number }) => set({ ingredients: move(draft.ingredients, data.from, data.to) })}
        >
          {draft.ingredients.map((i) =>
            i.kind === 'header' ? (
              <ListItem key={i.id} swipeout className="ck-group-row" onSwipeoutDeleted={() => removeIngredient(i.id)}>
                {/* the group name is edited right here, no sheet */}
                <span slot="title" className="ck-group-title">
                  <span className="ck-group-kicker">Group</span>
                  <input
                    className="ck-group-input"
                    data-group-id={i.id}
                    type="text"
                    value={i.name}
                    placeholder="Group name, e.g. Sauce"
                    aria-label="Ingredient group name"
                    enterKeyHint="done"
                    onChange={(e) => updateIngredient({ ...i, name: e.target.value })}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  />
                </span>
                <GroupMove
                  slot="after"
                  name={i.name}
                  isFirst={ingHeaders[0] === i.id}
                  isLast={ingHeaders[ingHeaders.length - 1] === i.id}
                  onMove={(dir, el) => shiftGroup('ingredients', i.id, dir, el)}
                />
                <SwipeoutActions right>
                  <SwipeoutButton delete>Delete</SwipeoutButton>
                </SwipeoutActions>
              </ListItem>
            ) : (
              <ListItem
                key={i.id}
                swipeout
                link="#"
                noChevron
                onClick={() => setEditingIngredientId(i.id)}
                onSwipeoutDeleted={() => removeIngredient(i.id)}
                footer={[i.note, linkedRecipe(i, recipes) && `Recipe: ${linkedRecipe(i, recipes)?.title}`].filter(Boolean).join(' · ') || undefined}
              >
                <span slot="title">
                  <span className="ck-amount">{[i.amount.replace('-', '–'), i.unit].filter(Boolean).join(' ')}</span>{' '}
{i.name || <span className="ck-note">Tap to edit</span>}
                </span>
                <SwipeoutActions right>
                  <SwipeoutButton delete>Delete</SwipeoutButton>
                </SwipeoutActions>
              </ListItem>
            ),
          )}
        </List>
      )}
      <List className="ck-fields">
        <ListInput
          type="textarea"
          resizable
          placeholder="Add one ingredient per line, or paste your ingredient list here"
          value={ingredientPaste}
          onInput={(e) => setIngredientPaste(e.target.value)}
        />
      </List>
      <Block className="ck-stack">
        {ingredientPaste.trim() && (
          <Button large className="ck-soft" onClick={addPastedIngredients}>
            Add {pastedLines(ingredientPaste).length} {pastedLines(ingredientPaste).length === 1 ? 'line' : 'lines'}
          </Button>
        )}
        <Button className="ck-dashed" onClick={addIngredientGroup}>
          <Plus {...inlineIcon} /> Separate into groups
        </Button>
      </Block>

      {/* Directions */}
      <BlockTitle medium data-at="directions">Directions</BlockTitle>
      {reading && <EditRowsSkeleton rows={['Heat the oven and grease the tin.', 'Mix everything together until smooth and pour it in.', 'Bake until golden.']} />}
      {draft.steps.length > 0 && (
        <List
          className="ck-edit-list"
          strong
          inset
          dividers
          sortable
          sortableEnabled
          sortableTapHold
          onSortableSort={(data: { from: number; to: number }) => set({ steps: move(draft.steps, data.from, data.to) })}
        >
          {draft.steps.map((s) => {
            if (s.kind === 'header') stepNo = 0;
            else stepNo += 1;
            return s.kind === 'header' ? (
              <ListItem key={s.id} swipeout className="ck-group-row" onSwipeoutDeleted={() => removeStep(s.id)}>
                <span slot="title" className="ck-group-title">
                  <span className="ck-group-kicker">Group</span>
                  <input
                    className="ck-group-input"
                    data-group-id={s.id}
                    type="text"
                    value={s.text}
                    placeholder="Group name, e.g. Prep"
                    aria-label="Directions group name"
                    enterKeyHint="done"
                    onChange={(e) => set({ steps: draft.steps.map((x) => (x.id === s.id ? { ...x, text: e.target.value } : x)) })}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  />
                </span>
                <GroupMove
                  slot="after"
                  name={s.text}
                  isFirst={stepHeaders[0] === s.id}
                  isLast={stepHeaders[stepHeaders.length - 1] === s.id}
                  onMove={(dir, el) => shiftGroup('steps', s.id, dir, el)}
                />
                <SwipeoutActions right>
                  <SwipeoutButton delete>Delete</SwipeoutButton>
                </SwipeoutActions>
              </ListItem>
            ) : (
              <ListItem key={s.id} swipeout className="ck-step-row" onSwipeoutDeleted={() => removeStep(s.id)}>
                <StepField slot="title" step={s} no={stepNo} onType={(value) => typeStep(s, value)} onKeyDown={stepKeyDown(s)} />
                <SwipeoutActions right>
                  <SwipeoutButton delete>Delete</SwipeoutButton>
                </SwipeoutActions>
              </ListItem>
            );
          })}
        </List>
      )}
      <List className="ck-fields">
        <ListInput type="textarea" resizable placeholder="Add a step, or paste all the directions" value={stepPaste} onInput={(e) => setStepPaste(e.target.value)} />
      </List>
      <Block className="ck-stack">
        {stepPaste.trim() && (
          <Button large className="ck-soft" onClick={addPastedSteps}>
            Add {pastedSteps.length} {pastedSteps.length === 1 ? 'step' : 'steps'}
          </Button>
        )}
        <Button className="ck-dashed" onClick={addStepGroup}>
          <Plus {...inlineIcon} /> Separate into groups
        </Button>
      </Block>

      {/* Notes */}
      <BlockTitle medium>Notes</BlockTitle>
      <List className="ck-fields">
        <ListInput type="textarea" resizable placeholder="Cooking tips, swaps, or thoughts for next time" value={draft.notes} onInput={(e) => set({ notes: e.target.value })} />
      </List>

      {/* Recipe info */}
      <BlockTitle medium>Recipe info</BlockTitle>
      <Block className="ck-stack">
        <span className="ck-label">Tags</span>
        <div className="ck-chips">
          {allTags.map((t) => (
            <Chip key={t} text={titleCase(t)} className={`ck-chip ${draft.tags.includes(t) ? 'ck-chip-on' : ''}`} onClick={() => toggleTag(t)} />
          ))}
          <label className="ck-tag-add">
            <Plus {...inlineIcon} />
            {/* the field is exactly as wide as its text (the placeholder, or what's typed so far): an invisible copy of the
                text sizes the cell the input fills */}
            <span className="ck-tag-sizer" data-value={newTag || 'Add tag'}>
              <input
                type="text"
                value={newTag}
                placeholder="Add tag"
                aria-label="Add a tag"
                autoCapitalize="off"
                enterKeyHint="done"
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag();
                  }
                }}
                onBlur={addTag}
              />
            </span>
          </label>
        </div>
      </Block>
      <Block>
        <div className="ck-row" style={{ justifyContent: 'space-between' }}>
          <b>Servings</b>
          <Stepper round className="ck-stepper" value={draft.servings} min={1} max={99} onStepperChange={(v: number) => set({ servings: v })} />
        </div>
      </Block>
      <List className="ck-fields">
        <ListInput label="Serving size" type="text" placeholder="1 slice" value={draft.servingSize} onInput={(e) => set({ servingSize: e.target.value })} />
      </List>
      <div className="ck-grid2">
        <List className="ck-fields">
          <ListInput
            label="Prep time (min)"
            type="number"
            inputmode="numeric"
            placeholder="0"
            value={draft.prepMinutes || ''}
            onInput={(e) => set({ prepMinutes: Number(e.target.value) || 0 })}
          />
        </List>
        <List className="ck-fields">
          <ListInput
            label="Cook time (min)"
            type="number"
            inputmode="numeric"
            placeholder="0"
            value={draft.cookMinutes || ''}
            onInput={(e) => set({ cookMinutes: Number(e.target.value) || 0 })}
          />
        </List>
      </div>
      <List className="ck-fields">
        <ListInput label="Source" type="text" placeholder="Website or person" value={draft.source} onInput={(e) => set({ source: e.target.value })} clearButton />
        {/* issue #15: the full address of the recipe's page (the recipe page shows only the site, linked to it), wrapped
            onto as many lines as it takes so all of it shows; a line break can't get into it */}
        <ListInput
          label="Source link"
          type="textarea"
          resizable
          inputmode="url"
          placeholder="https://"
          autocapitalize="off"
          autocorrect="off"
          spellcheck="false"
          value={draft.sourceUrl ?? ''}
          onInput={(e) => set({ sourceUrl: e.target.value.replace(/[\r\n]+/g, '') })}
          clearButton
        />
      </List>

      <PhotoCropper photo={cropping} onDone={(box, rotated) => void applyCrop(box, rotated)} onClose={() => setCropping(null)} />
      <IngredientSheet
        ingredient={editingIngredient && editingIngredient.kind !== 'header' ? editingIngredient : null}
        linkedTitle={editingIngredient ? linkedRecipe(editingIngredient, recipes)?.title : undefined}
        onLink={() => setLinkOpen(true)}
        containerEl=".views > .view.tab-active"
        onChange={updateIngredient}
        onDelete={(rid) => {
          setEditingIngredientId(null);
          removeIngredient(rid);
        }}
        onClose={() => setEditingIngredientId(null)}
      />
      <RecipeLinkPopup opened={linkOpen} recipes={others} current={editingIngredient?.recipeId} onPick={linkRecipe} onClosed={() => setLinkOpen(false)} />

      <Actions opened={discardOpen} onActionsClosed={() => setDiscardOpen(false)}>
        <ActionsGroup>
          <ActionsButton color="red" onClick={() => f7router?.back()}>
            Discard Changes
          </ActionsButton>
        </ActionsGroup>
        <ActionsGroup>
          <ActionsButton strong>Keep Editing</ActionsButton>
        </ActionsGroup>
      </Actions>
    </Page>
  );
}
