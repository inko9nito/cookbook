import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, type LucideIcon } from 'lucide-react';
import { back } from './router';

/**
 * Issue #141: the app's pieces without Framework7. Dialogs and menus use the browser's own top layer (<dialog> and
 * popover), so nothing needs a z-index to sit above the page; the bars are ordinary sticky or fixed elements over a
 * page that scrolls like any website.
 */

// ── Dialogs: an iOS-style alert, as a promise ───────────────────────────────────────────────────────────────────────

type Ask = { title: string; text?: string; ok: string; danger?: boolean; field?: string; done: (v: string | null) => void };
let openAsk: ((a: Ask) => void) | null = null;

/** "Delete “Soups”?" → true when OK is tapped */
export const confirm = (title: string, text: string, ok = 'OK', danger = false) =>
  new Promise<boolean>((done) => openAsk?.({ title, text, ok, danger, done: (v) => done(v !== null) }));

/** a dialog with one text field → its text, or null for Cancel */
export const prompt = (title: string, text: string, value = '') =>
  new Promise<string | null>((done) => openAsk?.({ title, text, ok: 'OK', field: value, done }));

export function Dialogs() {
  const [ask, setAsk] = useState<Ask | null>(null);
  const [value, setValue] = useState('');
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    openAsk = (a) => {
      setAsk(a);
      setValue(a.field ?? '');
    };
    return () => {
      openAsk = null;
    };
  }, []);
  useEffect(() => {
    if (!ask) return;
    ref.current?.showModal();
    if (ask.field !== undefined) input.current?.focus();
  }, [ask]);
  const close = (v: string | null) => {
    ref.current?.close();
    ask?.done(v);
    setAsk(null);
  };
  return (
    <dialog ref={ref} className="nx-dialog" onCancel={(e) => (e.preventDefault(), close(null))}>
      {ask && (
        <form
          method="dialog"
          onSubmit={(e) => {
            e.preventDefault();
            close(ask.field !== undefined ? value.trim() || null : '');
          }}
        >
          <h2 className="nx-dialog-title">{ask.title}</h2>
          {ask.text && <p className="nx-dialog-text">{ask.text}</p>}
          {ask.field !== undefined && <input ref={input} className="nx-dialog-field" value={value} onChange={(e) => setValue(e.target.value)} enterKeyHint="done" />}
          <div className="nx-dialog-buttons">
            <button type="button" className="nx-button nx-soft" onClick={() => close(null)}>
              Cancel
            </button>
            <button type="submit" className={`nx-button ${ask.danger ? 'nx-danger' : 'nx-primary'}`}>
              {ask.ok}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}

// ── Toast: the dark pill above the tab bar ─────────────────────────────────────────────────────────────────────────

type ToastEvent = { html: string; closeTimeout: number; undo?: () => void };

/** the same toasts as the app (say() and tell() in components/ui/toast.ts dispatch 'ck-toast' here) */
export function Toasts() {
  const [toast, setToast] = useState<(ToastEvent & { key: number }) | null>(null);
  useEffect(() => {
    let timer = 0;
    const on = (e: Event) => {
      const t = (e as CustomEvent<ToastEvent>).detail;
      clearTimeout(timer);
      setToast({ ...t, key: Date.now() });
      timer = window.setTimeout(() => setToast(null), t.closeTimeout);
    };
    window.addEventListener('ck-toast', on);
    return () => window.removeEventListener('ck-toast', on);
  }, []);
  if (!toast) return null;
  return createPortal(
    <div className="nx-toast" role="status" key={toast.key}>
      {/* the toast's markup is built and escaped by toast.ts */}
      <span dangerouslySetInnerHTML={{ __html: toast.html }} />
      {toast.undo && (
        <button type="button" className="nx-toast-undo" onClick={() => (toast.undo?.(), setToast(null))}>
          Undo
        </button>
      )}
    </div>,
    document.body,
  );
}

// ── Menu: an iOS pull-down from the button tapped, in the browser's top layer (popover) ────────────────────────────

export type MenuItem = { label: string; icon?: LucideIcon; danger?: boolean; onClick: () => void };

export function MenuButton({ label, icon: Icon, groups, className = '' }: { label: string; icon: LucideIcon; groups: MenuItem[][]; className?: string }) {
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const open = () => {
    const b = button.current!.getBoundingClientRect();
    const m = menu.current!;
    m.style.top = `${b.bottom + 6}px`;
    m.style.right = `${Math.max(8, innerWidth - b.right)}px`;
    m.showPopover();
  };
  return (
    <>
      <button ref={button} type="button" className={`nx-bar-button ${className}`} aria-label={label} onClick={open}>
        <Icon size={22} strokeWidth={2} />
      </button>
      <div ref={menu} popover="auto" className="nx-menu">
        {groups.map((g, gi) => (
          <div key={gi} className="nx-menu-group">
            {g.map((item) => (
              <button
                key={item.label}
                type="button"
                className={`nx-menu-row${item.danger ? ' nx-danger-ink' : ''}`}
                onClick={() => {
                  menu.current?.hidePopover();
                  item.onClick();
                }}
              >
                <span>{item.label}</span>
                {item.icon && <item.icon size={20} strokeWidth={1.5} />}
              </button>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

// ── Bars ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

export const BarButton = ({ label, icon: Icon, onClick, primary = false }: { label: string; icon: LucideIcon; onClick: () => void; primary?: boolean }) => (
  <button type="button" className={`nx-bar-button${primary ? ' nx-bar-primary' : ''}`} aria-label={label} onClick={onClick}>
    <Icon size={22} strokeWidth={2} />
  </button>
);

export const BackButton = () => (
  <button type="button" className="nx-bar-button nx-back" aria-label="Back" onClick={back}>
    <ChevronLeft size={24} strokeWidth={2} />
  </button>
);

/** a tab's header: sticky at the top of the page, the title on the left, buttons on the right, more (search, chips) below */
export function Header({ title, left, right, children }: { title?: string; left?: ReactNode; right?: ReactNode; children?: ReactNode }) {
  return (
    <header className="nx-header">
      <div className="nx-header-row">
        {left}
        {title && <h1 className={`nx-title${left ? ' nx-title-small' : ''}`}>{title}</h1>}
        <div className="nx-header-buttons">{right}</div>
      </div>
      {children}
    </header>
  );
}
