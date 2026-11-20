import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { IonButton, IonFab, IonFooter, IonPopover, IonContent, IonList, IonItem, IonLabel, createAnimation, useIonAlert, useIonRouter, useIonToast, type Animation } from '@ionic/react';
import { BookOpen, CalendarDays, Check, ChefHat, Settings, ShoppingCart, Star, type LucideIcon } from 'lucide-react';
import { coverPhoto, type Recipe } from '../lib/recipe';
import { photoStyle } from '../components/ui/photo';
import { formatMinutes } from '../components/ui/RecipeCard';
import { useCook } from '../data/cook';
import { useStore } from '../data/store';

/**
 * Issue #141, the Ionic trial: the app's own pieces on Ionic's components. Motion, gestures and layering are Ionic's;
 * these only give its components the agreed design (round bar buttons, the menus, the toast, the plates).
 */

// ── where a screen lives: the tab a page was opened from keeps it (a recipe from Cookbooks stays in Cookbooks) ──

export type TabName = 'recipes' | 'cookbooks' | 'plan' | 'groceries' | 'settings';
export function useTab(): TabName {
  const first = useLocation().pathname.split('/')[1];
  return (['recipes', 'cookbooks', 'plan', 'groceries', 'settings'].includes(first) ? first : 'recipes') as TabName;
}
export const recipePath = (tab: TabName, id: string) => `/${tab === 'settings' || tab === 'groceries' ? 'recipes' : tab}/recipe/${id}`;

export const TABS: { tab: TabName; label: string; icon: LucideIcon }[] = [
  { tab: 'recipes', label: 'Recipes', icon: ChefHat },
  { tab: 'cookbooks', label: 'Cookbooks', icon: BookOpen },
  { tab: 'plan', label: 'Plan', icon: CalendarDays },
  { tab: 'groceries', label: 'Groceries', icon: ShoppingCart },
  { tab: 'settings', label: 'Settings', icon: Settings },
];

/**
 * The tab bar, drawn by each tab's first page (a footer of the page), so a page pushed over it covers it as iOS does.
 * Its buttons press Ionic's own (hidden) tab buttons, which switch tabs and keep each tab's stack. Tapping the tab
 * you're on scrolls its page to the top.
 */
export function TabBar({ current }: { current: TabName }) {
  return (
    <IonFooter className="ck-ion-tabbar">
      <nav className="ck-ion-tabbar-row" aria-label="Tabs">
        {TABS.map(({ tab, label, icon: Icon }) => (
          <button
            key={tab}
            type="button"
            className={`ck-ion-tab${tab === current ? ' ck-ion-tab-on' : ''}`}
            aria-label={label}
            aria-current={tab === current ? 'page' : undefined}
            onClick={(e) => {
              if (tab === current) {
                (e.currentTarget.closest('.ion-page')?.querySelector(':scope > ion-content') as HTMLIonContentElement | null)?.scrollToTop(300);
                return;
              }
              document.querySelector<HTMLElement>(`ion-tab-bar.ck-ion-tabbar-engine ion-tab-button[aria-label="${label}"]`)?.click();
            }}
          >
            <Icon size={26} strokeWidth={1.75} />
          </button>
        ))}
      </nav>
    </IonFooter>
  );
}

// ── bar buttons: separate round buttons (the agreed design), Ionic's buttons underneath ──

export function BarButton({ label, icon: Icon, onClick, primary = false, id, className = '' }: { label: string; icon: LucideIcon; onClick?: (e: React.MouseEvent<HTMLIonButtonElement>) => void; primary?: boolean; id?: string; className?: string }) {
  return (
    <IonButton id={id} className={`ck-ion-bar-button${primary ? ' ck-ion-bar-primary' : ''} ${className}`} aria-label={label} onClick={onClick}>
      <Icon size={22} strokeWidth={2} />
    </IonButton>
  );
}

// ── menus (#39): an iOS pull-down from the button tapped (Ionic's popover, no arrow), icons on the right ──

export type MenuItem = { label: string; icon?: LucideIcon; danger?: boolean; checked?: boolean; onClick?: () => void };
type MenuRequest = { el: Element; groups: MenuItem[][] };
let showMenu: ((m: MenuRequest) => void) | null = null;

/** open a menu under the element tapped */
export const openMenu = (el: Element, groups: MenuItem[][]) => showMenu?.({ el, groups: groups.filter((g) => g.length) });

/**
 * How a menu comes and goes (#39, the app's tuned popover): it grows straight out of the button tapped and shrinks back
 * into it, quickly, with iOS's ease. Ionic's animation API (an overlay's enter/leave animation), placed under the button
 * when it fits (else above), lined up with the button's side of the screen.
 */
const IOS_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
let menuOrigin = 'right top';
function menuEnter(baseEl: HTMLElement, opts?: { event?: { target?: Element } }): Animation {
  const root = baseEl.shadowRoot ?? baseEl;
  const content = root.querySelector<HTMLElement>('.popover-content')!;
  const wrapper = root.querySelector<HTMLElement>('.popover-wrapper')!;
  const target = opts?.event?.target;
  if (target) {
    const r = target.getBoundingClientRect();
    const w = content.offsetWidth;
    const h = content.offsetHeight;
    const below = r.bottom + 6 + h <= window.innerHeight - 12;
    const right = r.left + r.width / 2 > window.innerWidth / 2;
    content.style.top = `${below ? r.bottom + 6 : Math.max(12, r.top - 6 - h)}px`;
    content.style.left = `${right ? Math.max(8, r.right - w) : Math.min(r.left, window.innerWidth - 8 - w)}px`;
    menuOrigin = `${right ? 'right' : 'left'} ${below ? 'top' : 'bottom'}`;
  }
  return createAnimation()
    .addElement(baseEl)
    .duration(reduceMotion() ? 0 : 260)
    .easing(IOS_EASE)
    .addAnimation([
      createAnimation().addElement(wrapper).fromTo('opacity', '0', '1'),
      createAnimation()
        .addElement(content)
        .beforeStyles({ 'transform-origin': menuOrigin })
        .keyframes([
          { offset: 0, transform: 'scale(0.2)', opacity: '0' },
          { offset: 0.35, opacity: '1' },
          { offset: 1, transform: 'scale(1)', opacity: '1' },
        ]),
    ]);
}
function menuLeave(baseEl: HTMLElement): Animation {
  const root = baseEl.shadowRoot ?? baseEl;
  return createAnimation()
    .addElement(baseEl)
    .duration(reduceMotion() ? 0 : 180)
    .easing('cubic-bezier(0.4, 0, 1, 1)')
    .addAnimation([
      createAnimation().addElement(root.querySelector<HTMLElement>('.popover-wrapper')!).fromTo('opacity', '1', '0'),
      createAnimation()
        .addElement(root.querySelector<HTMLElement>('.popover-content')!)
        .keyframes([
          { offset: 0, transform: 'scale(1)', opacity: '1' },
          { offset: 1, transform: 'scale(0.2)', opacity: '0' },
        ]),
    ]);
}

export function MenuHost() {
  const [menu, setMenu] = useState<MenuRequest | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    showMenu = (m) => {
      setMenu(m);
      setOpen(true);
    };
    return () => {
      showMenu = null;
    };
  }, []);
  return (
    <IonPopover
      isOpen={open}
      event={menu ? { target: menu.el } : undefined}
      arrow={false}
      enterAnimation={menuEnter}
      leaveAnimation={menuLeave}
      className="ck-ion-menu"
      onDidDismiss={() => setOpen(false)}
    >
      <IonContent scrollY={false}>
        {menu?.groups.map((g, gi) => (
          <IonList key={gi} lines="full" className="ck-ion-menu-group">
            {g.map((item) => (
              <IonItem
                key={item.label}
                button
                detail={false}
                className={item.danger ? 'ck-ion-danger' : ''}
                onClick={() => {
                  setOpen(false);
                  item.onClick?.();
                }}
              >
                {item.checked !== undefined && <span className="ck-ion-menu-check" slot="start">{item.checked && <Check size={18} strokeWidth={2.5} />}</span>}
                <IonLabel>{item.label}</IonLabel>
                {item.icon && <item.icon slot="end" size={20} strokeWidth={1.5} />}
              </IonItem>
            ))}
          </IonList>
        ))}
      </IonContent>
    </IonPopover>
  );
}

// ── toasts and alerts from the shared code (toast.ts and cook.tsx send events when there's no Framework7) ──

type ToastEvent = { html: string; closeTimeout: number; undo?: () => void };
const CHECK_ICON = `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>')}`;

/** the toast sits just above what's at the bottom: cook mode's recipe tabs, a page's footer (Start cooking), the tab bar */
function toastAnchor(): HTMLElement | undefined {
  const cook = document.querySelector<HTMLElement>('ion-modal.ck-ion-cook.show-modal');
  if (cook) return cook.querySelector<HTMLElement>('ion-footer') ?? undefined;
  const page = document.querySelector<HTMLElement>('ion-tabs ion-router-outlet > .ion-page:not(.ion-page-hidden)');
  return page?.querySelector<HTMLElement>(':scope > ion-footer') ?? undefined;
}

export function Bridge() {
  const [toast, dismissToast] = useIonToast();
  const [alert] = useIonAlert();
  useEffect(() => {
    const onToast = (e: Event) => {
      const t = (e as CustomEvent<ToastEvent>).detail;
      const text = new DOMParser().parseFromString(t.html, 'text/html').body.textContent ?? '';
      dismissToast().catch(() => {});
      toast({
        message: text,
        duration: t.closeTimeout,
        position: 'bottom',
        positionAnchor: toastAnchor(),
        cssClass: 'ck-ion-toast',
        // something done has the app's Tomato check (Lucide's), as say() draws it
        icon: t.html.includes('<svg') ? CHECK_ICON : undefined,
        swipeGesture: 'vertical',
        buttons: t.undo ? [{ text: 'Undo', handler: t.undo }] : [],
      });
    };
    const onAlert = (e: Event) => {
      const a = (e as CustomEvent<{ title: string; text: string }>).detail;
      alert({ header: a.title, message: a.text, buttons: ['OK'] });
    };
    window.addEventListener('ck-toast', onToast);
    window.addEventListener('ck-alert', onAlert);
    return () => {
      window.removeEventListener('ck-toast', onToast);
      window.removeEventListener('ck-alert', onAlert);
    };
  }, [toast, dismissToast, alert]);
  return null;
}

/** Ionic's alert with one text field, as a promise: its text, or null for Cancel */
export function usePrompt() {
  const [alert] = useIonAlert();
  return (header: string, message: string, value = '', ok = 'OK') =>
    new Promise<string | null>((done) => {
      alert({
        header,
        message: message || undefined,
        inputs: [{ name: 'v', value, attributes: { autocapitalize: 'sentences', enterkeyhint: 'done' } }],
        buttons: [
          { text: 'Cancel', role: 'cancel', handler: () => done(null) },
          { text: ok, handler: (v: { v: string }) => done(v.v.trim() || null) },
        ],
        onDidDismiss: (e) => e.detail.role === 'backdrop' && done(null),
      });
    });
}

/** Ionic's alert as a yes/no question */
export function useConfirm() {
  const [alert] = useIonAlert();
  return (header: string, message: string, ok: string, danger = false) =>
    new Promise<boolean>((done) => {
      alert({
        header,
        message: message || undefined,
        buttons: [
          { text: 'Cancel', role: 'cancel', handler: () => done(false) },
          { text: ok, role: danger ? 'destructive' : undefined, handler: () => done(true) },
        ],
        onDidDismiss: (e) => e.detail.role === 'backdrop' && done(false),
      });
    });
}

// ── recipe cards and plates ──

export function RecipeCard({ recipe, href }: { recipe: Recipe; href: string }) {
  const router = useIonRouter();
  const photo = coverPhoto(recipe);
  return (
    <a
      href={`/ionic${href}`}
      className="ck-card ck-ion-card"
      onClick={(e) => {
        e.preventDefault();
        router.push(href, 'forward');
      }}
    >
      {photo ? (
        <span className="ck-card-photo ck-photo" style={photoStyle(photo)} aria-hidden="true" />
      ) : (
        <span className="ck-card-photo ck-photo ck-photo-empty" aria-hidden="true">
          <ChefHat size={28} strokeWidth={1.5} />
        </span>
      )}
      <span className="ck-card-body">
        <span className="ck-card-title">{recipe.title}</span>
        {recipe.minutes > 0 && <span className="ck-card-meta">{formatMinutes(recipe.minutes)}</span>}
        {recipe.rating > 0 && (
          <span className="ck-stars" aria-label={`${recipe.rating} of 5 stars`}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Star key={n} size={10} strokeWidth={0} className={n <= recipe.rating ? 'on' : ''} />
            ))}
          </span>
        )}
      </span>
    </a>
  );
}

export function Plates({ photos }: { photos: string[] }) {
  const plate = (cls: string, src?: string, icon?: boolean) => (
    <span className={`ck-plate ${cls}${src ? ' ck-photo' : ' ck-plate-empty'}`} style={photoStyle(src)}>
      {icon && <BookOpen size={24} strokeWidth={1.5} />}
    </span>
  );
  return (
    <span className="ck-plates" aria-hidden="true">
      {plate('ck-plate-left', photos[1])}
      {plate('ck-plate-right', photos[2])}
      {plate('ck-plate-middle', photos[0], !photos.some(Boolean))}
    </span>
  );
}

// ── the Cooking pill (#85, #124): Ionic's FAB, fixed on each tab page above the tab bar, slides with its page ──

export function CookingPill() {
  const cook = useCook();
  const { recipes } = useStore();
  const s = cook.session;
  const count = s ? s.open.filter((id) => recipes.some((r) => r.id === id)).length : 0;
  if (!s || !count) return null;
  return (
    <IonFab slot="fixed" vertical="bottom" horizontal="center" className="ck-ion-pill-fab">
      <IonButton shape="round" className="ck-ion-pill" onClick={() => cook.expand()} aria-label={`Back to cook mode, ${count} ${count === 1 ? 'recipe' : 'recipes'}`}>
        <span className="ck-cooking-fab-body" aria-hidden="true">
          <BoilingPot />
          <span>Cooking</span>
          <span className="ck-cooking-fab-dot">•</span>
          <span className="ck-cooking-fab-count">{count}</span>
        </span>
      </IonButton>
    </IonFab>
  );
}

/** the pill's pot, the same markup as the app's (its boil-over is the app's CSS, cookbook.css .ck-pill-pot) */
function BoilingPot() {
  const svg = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  return (
    <span className="ck-pill-pot">
      <svg {...svg} className="ck-pill-pot-body">
        <path d="M2 12h20" />
        <path d="M20 12v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8" />
      </svg>
      <span className="ck-pill-pot-open">
        <span className="ck-pill-pot-lid">
          <span>
            <svg {...svg}>
              <g transform="translate(0 3.4) rotate(14.04 12 6)">
                <path d="m4 8 16-4" />
                <path d="m8.86 6.78-.45-1.81a2 2 0 0 1 1.45-2.43l1.94-.48a2 2 0 0 1 2.43 1.46l.45 1.8" />
              </g>
            </svg>
          </span>
        </span>
      </span>
    </span>
  );
}

/** a section heading on a page, with an optional action on the right */
export const Section = ({ title, children }: { title: string; children?: ReactNode }) => (
  <div className="ck-ion-sec">
    <h2>{title}</h2>
    {children}
  </div>
);
