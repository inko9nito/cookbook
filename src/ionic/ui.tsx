import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { IonButton, IonFab, IonPopover, IonContent, IonList, IonItem, IonLabel, useIonAlert, useIonRouter, useIonToast } from '@ionic/react';
import { BookOpen, Check, ChefHat, Star, type LucideIcon } from 'lucide-react';
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
      side="bottom"
      alignment="end"
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

/** the toast sits just above what's at the bottom: cook mode's recipe tabs, a page's footer (Start cooking), the tab bar */
function toastAnchor(): HTMLElement | undefined {
  const cook = document.querySelector<HTMLElement>('ion-modal.ck-ion-cook.show-modal');
  if (cook) return cook.querySelector<HTMLElement>('ion-footer') ?? undefined;
  const pages = [...document.querySelectorAll<HTMLElement>('ion-router-outlet > .ion-page:not(.ion-page-hidden)')];
  return pages.at(-1)?.querySelector<HTMLElement>(':scope > ion-footer') ?? document.querySelector<HTMLElement>('ion-tab-bar') ?? undefined;
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
        cssClass: `ck-ion-toast${t.html.includes('<svg') ? ' ck-ion-toast-done' : ''}`,
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
