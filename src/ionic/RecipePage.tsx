import { useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  IonPage, IonHeader, IonToolbar, IonButtons, IonBackButton, IonContent, IonFooter, IonButton, IonChip, IonList, IonItem,
  IonLabel, useIonRouter,
} from '@ionic/react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Pagination } from 'swiper/modules';
import {
  BookOpen, BookPlus, CalendarDays, CalendarPlus, ChefHat, ChevronDown, ChevronRight, Copy, CookingPot, Ellipsis, Pencil,
  Plus, Share, ShoppingCart, Star, Trash2,
} from 'lucide-react';
import { useCookbooks, usePlanner, useStore } from '../data/store';
import { useCook } from '../data/cook';
import { linkedRecipe, newId, titleCase, usedIn, type Ingredient, type Recipe } from '../lib/recipe';
import { friendly } from '../lib/ingredients';
import { busyDays, mealName, MEALS, mediumDate, plan, today, upcomingDaysOf, type Day, type Meal } from '../lib/planner';
import { colorOf, placesOfRecipe } from '../lib/cookbook';
import { footerText, type UnitPicks } from '../components/ui/ingredientLine';
import { ConvertibleAmount, toggleTarget, withPick, type ConvertTarget } from '../components/UnitChoices';
import { formatMinutes } from '../components/ui/RecipeCard';
import { photoStyle } from '../components/ui/photo';
import { say } from '../components/ui/toast';
import { BarButton, openMenu, recipePath, useConfirm, useTab } from './ui';
import { ScaleSheet, UnitSheet } from './sheets';
import { AddToCookbookModal, AddToListModal, DaySheet, PhotoViewer } from './modals';

function groupIngredients(list: Ingredient[]) {
  const groups: { id: string; label?: string; items: Ingredient[] }[] = [];
  for (const i of list) {
    if (i.kind === 'header') groups.push({ id: i.id, label: i.name, items: [] });
    else {
      if (!groups.length) groups.push({ id: 'ungrouped', items: [] });
      groups[groups.length - 1].items.push(i);
    }
  }
  return groups.filter((g) => g.items.length || g.label);
}

/**
 * A recipe, on Ionic. The bar is Ionic's fading header (`collapse="fade"`): see-through over the photo, filling in as
 * the page scrolls; back and ⋯ are round buttons over the photo. Start cooking sits in the footer.
 */
export default function RecipePage() {
  const { id = '' } = useParams();
  const tab = useTab();
  const router = useIonRouter();
  const { recipes, deleteRecipe, setFilter, saveRecipe } = useStore();
  const { cookbooks } = useCookbooks();
  const { planned, savePlanned } = usePlanner();
  const cook = useCook();
  const confirm = useConfirm();
  const leaving = useRef<Recipe | null>(null);
  const moreButton = useRef<Element | null>(null);
  const recipe = leaving.current ?? recipes.find((r) => r.id === id);
  const [ownFactor, setOwnFactor] = useState(1);
  const [ownPicks, setOwnPicks] = useState<UnitPicks>({});
  const [scaleOpen, setScaleOpen] = useState(false);
  const [converting, setConverting] = useState<ConvertTarget | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const [toCookbook, setToCookbook] = useState(false);
  const [toList, setToList] = useState(false);
  const [dayOpen, setDayOpen] = useState(false);

  if (!recipe) {
    return (
      <IonPage>
        <IonHeader className="ck-ion-header">
          <IonToolbar>
            <IonButtons slot="start">
              <IonBackButton defaultHref={`/${tab}`} text="" />
            </IonButtons>
          </IonToolbar>
        </IonHeader>
        <IonContent className="ion-padding">
          <p className="ck-note">This recipe isn’t here.</p>
        </IonContent>
      </IonPage>
    );
  }

  const cooked = cook.amountsOf(recipe.id);
  const othersCooking = cooked ? 0 : (cook.session?.open.filter((x) => recipes.some((r) => r.id === x)).length ?? 0);
  const factor = cooked?.factor ?? ownFactor;
  const picks = cooked?.picks ?? ownPicks;
  const setFactor = (f: number) => (cooked ? cook.setFactor(recipe.id, f) : setOwnFactor(f));
  const pickUnit = (ingId: string, unit: string | null) => (cooked ? cook.setPick(recipe.id, ingId, unit) : setOwnPicks((p) => withPick(p, ingId, unit)));
  const scaled = Math.abs(factor - 1) > 0.001;
  const servingsLabel = `${friendly(recipe.servings * factor)} servings`;
  const places = placesOfRecipe(cookbooks, recipe.id);
  const planDays = upcomingDaysOf(planned, recipe.id, today());
  let stepNo = 0;

  const addPlanned = (day: Day, meal?: Meal) => {
    const servings = scaled ? Math.round(recipe.servings * factor * 100) / 100 : undefined;
    savePlanned(plan(recipe.id, day, newId, { meal, servings }));
    say(`Added to ${[mediumDate(day), meal && mealName(meal)].filter(Boolean).join(' · ')}`);
  };
  // which meal: the app's menu (#39), from the ⋯ the Add to Planner came from
  const pickMeal = (day: Day) =>
    moreButton.current &&
    openMenu(moreButton.current, [[...MEALS, null].map((m) => ({ label: m ? mealName(m) : 'Any time', onClick: () => addPlanned(day, m ?? undefined) }))]);
  const remove = async () => {
    const users = usedIn(recipe.id, recipes).map((r) => `“${r.title}”`);
    const ok = await confirm(`Delete “${recipe.title}”?`, users.length ? `It’s an ingredient in ${users.join(', ')}. That line stays, without the link.` : '', 'Delete', true);
    if (!ok) return;
    leaving.current = recipe;
    router.goBack();
    deleteRecipe(recipe.id);
    say(`Deleted “${recipe.title}”`);
  };
  const more = (el: Element) =>
    openMenu(el, [
      [{ label: 'Edit', icon: Pencil, onClick: () => router.push(`${recipePath(tab, recipe.id)}/edit`, 'forward') }],
      [
        { label: 'Add to Cookbook', icon: BookPlus, onClick: () => setToCookbook(true) },
        { label: 'Add to Planner', icon: CalendarPlus, onClick: () => setDayOpen(true) },
        { label: 'Add to Grocery List', icon: ShoppingCart, onClick: () => setToList(true) },
      ],
      [
        {
          label: 'Duplicate',
          icon: Copy,
          onClick: () => {
            const copy = { ...recipe, id: newId(), title: `${recipe.title} (copy)`, timesMade: 0, createdAt: new Date().toISOString() };
            saveCopy(copy);
          },
        },
        { label: 'Share', icon: Share, onClick: () => navigator.share?.({ title: recipe.title, text: recipe.title }).catch(() => {}) },
      ],
      [{ label: 'Delete', icon: Trash2, danger: true, onClick: remove }],
    ]);
  const saveCopy = (r: Recipe) => {
    saveRecipe(r);
    say('Duplicated');
    router.push(recipePath(tab, r.id), 'forward');
  };

  return (
    <IonPage className="ck-ion-anchor">
      {/* Ionic's fading header: see-through over the photo, solid once the page scrolls */}
      <IonHeader collapse="fade" className="ck-ion-header ck-ion-photo-bar">
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref={`/${tab}`} text="" className="ck-ion-round-back" />
          </IonButtons>
          <IonButtons slot="end">
            <BarButton label="More actions" icon={Ellipsis} onClick={(e) => ((moreButton.current = e.currentTarget), more(e.currentTarget))} />
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen className="ck-ion-recipe">
        <div className="ck-hero-wrap">
        {recipe.photos.length ? (
          <Swiper modules={[Pagination]} pagination={recipe.photos.length > 1} className="ck-ion-hero">
            {recipe.photos.map((p, i) => (
              <SwiperSlide key={p.id}>
                <button type="button" className="ck-hero ck-photo" style={photoStyle(p.src)} aria-label={`Photo ${i + 1} of ${recipe.title}, full screen`} onClick={() => setViewing(i)} />
              </SwiperSlide>
            ))}
          </Swiper>
        ) : (
          <div className="ck-hero ck-photo ck-photo-empty" aria-hidden="true">
            <ChefHat size={40} strokeWidth={1.5} />
          </div>
        )}
        </div>

        <div className="ck-panel">
          <div className="ck-panel-head">
            <h1 className="ck-recipe-title">{recipe.title}</h1>
          </div>
          <div className="ck-stats">
            <div>
              <b>{recipe.rating ? recipe.rating.toFixed(1) : '–'}</b>
              <span className="ck-stars" aria-label={`${recipe.rating} of 5 stars`}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star key={n} size={11} strokeWidth={0} className={n <= recipe.rating ? 'on' : ''} />
                ))}
              </span>
            </div>
            <div>
              <b>{recipe.timesMade}×</b>
              <span>made it</span>
            </div>
            <div>
              <b>{recipe.minutes > 0 ? formatMinutes(recipe.minutes).replace(' hr ', 'h ').replace(' min', 'm').replace(' hr', 'h') : '–'}</b>
              <span>total time</span>
            </div>
          </div>
          <div className="ck-sec">
            <h2>Ingredients</h2>
            <button type="button" className="ck-scale-button ck-ion-pill-button" onClick={() => setScaleOpen(true)} aria-label={`${servingsLabel}, adjust amounts`}>
              <span>{scaled ? `×${friendly(factor)} · ${servingsLabel}` : servingsLabel}</span>
              <ChevronDown size={16} />
            </button>
          </div>
        </div>

        {groupIngredients(recipe.ingredients).map((g) => (
          <div key={g.id} className="ck-ing-group">
            {g.label && <div className="ck-group-label">{g.label}</div>}
            <IonList lines="full" className="ck-ion-plain-list">
              {g.items.map((i) => {
                const linked = linkedRecipe(i, recipes);
                return (
                  <IonItem key={i.id} className={converting?.ing.id === i.id ? 'ck-ing-on' : ''}>
                    <span slot="start" className="ck-bullet" aria-hidden="true" />
                    <IonLabel className="ion-text-wrap">
                      <ConvertibleAmount ing={i} factor={factor} picks={picks} onOpen={(t) => setConverting((cur) => toggleTarget(cur, t))} />{' '}
                      {linked ? (
                        <button type="button" className="ck-ing-linked" onClick={() => router.push(recipePath(tab, linked.id), 'forward')}>
                          {i.name}
                          <ChevronRight size={16} aria-hidden="true" />
                        </button>
                      ) : (
                        i.name
                      )}
                      {footerText(i, factor) && <p className="ck-ion-row-note">{footerText(i, factor)}</p>}
                    </IonLabel>
                  </IonItem>
                );
              })}
            </IonList>
          </div>
        ))}

        <div className="ck-panel ck-panel-rest">
          <div className="ck-sec">
            <h2>Directions</h2>
          </div>
          <div className="ck-steps">
            {recipe.steps.map((s) => {
              if (s.kind === 'header') {
                stepNo = 0;
                return (
                  <div key={s.id} className="ck-group-label">
                    {s.text}
                  </div>
                );
              }
              stepNo += 1;
              return (
                <div key={s.id} className="ck-step">
                  <span className="ck-step-no">{stepNo}</span>
                  <span className="ck-step-text">{s.text}</span>
                </div>
              );
            })}
          </div>
          {recipe.notes && (
            <>
              <div className="ck-sec">
                <h2>Notes</h2>
              </div>
              <div className="ck-notes">{recipe.notes}</div>
            </>
          )}
          {recipe.tags.length > 0 && (
            <>
              <div className="ck-sec">
                <h2>Labels</h2>
              </div>
              <div className="ck-ion-chips ck-ion-chips-wrap">
                {recipe.tags.map((t) => (
                  <IonChip
                    key={t}
                    onClick={() => {
                      setFilter([t]);
                      router.push('/recipes', 'root');
                    }}
                  >
                    {titleCase(t)}
                  </IonChip>
                ))}
              </div>
            </>
          )}
          {places.length > 0 && (
            <>
              <div className="ck-sec">
                <h2>Cookbooks</h2>
              </div>
              <div className="ck-ion-chips ck-ion-chips-wrap">
                {places.map((p) => (
                  <IonChip key={p.key} className={`ck-tint-${colorOf(p.cookbook)}`} onClick={() => router.push(`/cookbooks/${p.cookbook.id}`, 'forward')}>
                    <BookOpen size={16} strokeWidth={1.75} />
                    {p.label}
                  </IonChip>
                ))}
              </div>
            </>
          )}
          {planDays.length > 0 && (
            <>
              <div className="ck-sec">
                <h2>Planned</h2>
              </div>
              <div className="ck-ion-chips ck-ion-chips-wrap">
                {planDays.map((d) => (
                  <IonChip key={d} onClick={() => router.push('/plan', 'root')}>
                    <CalendarDays size={16} strokeWidth={1.75} />
                    {mediumDate(d)}
                  </IonChip>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="ck-ion-toast-anchor" />
      </IonContent>

      <IonFooter className="ck-ion-cta-footer">
        <IonToolbar>
          <div className="ck-ion-cta-row">
            {othersCooking > 0 && (
              <IonButton shape="round" className="ck-ion-cta-back" onClick={() => cook.expand()} aria-label={`Back to cook mode, ${othersCooking} cooking`}>
                <CookingPot size={22} />
                <span>{othersCooking}</span>
              </IonButton>
            )}
            <IonButton expand="block" shape="round" className="ck-ion-cta" onClick={() => cook.start(recipe.id, { factor, picks })}>
              {othersCooking > 0 && <Plus size={22} />}
              {cooked ? 'Resume cooking' : othersCooking > 0 ? 'Add to cooking' : 'Start cooking'}
            </IonButton>
          </div>
        </IonToolbar>
      </IonFooter>

      <ScaleSheet open={scaleOpen} recipe={recipe} factor={factor} onFactor={setFactor} onClose={() => setScaleOpen(false)} />
      <UnitSheet target={converting} factor={factor} picks={picks} onPick={pickUnit} onClosed={() => setConverting(null)} />
      <PhotoViewer photos={recipe.photos} at={viewing} onClose={() => setViewing(null)} />
      <AddToCookbookModal open={toCookbook} recipe={recipe} onClose={() => setToCookbook(false)} />
      <AddToListModal open={toList} recipe={recipe} servings={scaled ? recipe.servings * factor : undefined} onClose={() => setToList(false)} />
      <DaySheet
        open={dayOpen}
        title="Plan for which day?"
        busy={busyDays(planned.filter((p) => p.recipeId === recipe.id))}
        onPick={(day) => {
          setDayOpen(false);
          setTimeout(() => pickMeal(day), 350);
        }}
        onClose={() => setDayOpen(false)}
      />
    </IonPage>
  );
}
