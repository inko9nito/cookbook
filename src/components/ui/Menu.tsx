import { useEffect, useRef } from 'react';
import { List, ListItem, Popover } from 'framework7-react';
import { Check, type LucideIcon } from 'lucide-react';

/**
 * Every options menu and choice menu in the app (issue #39): an iOS pull-down menu (a Framework7 Popover) from the
 * button that was tapped. Rows in the text colour with their Lucide icon on the right, a thin line between each, red
 * only for a row that deletes or clears (last), a ✓ on the left of the picked choice. No header on an options menu;
 * a choice menu may say what it's choosing ("Which aisle for eggs?").
 */
export type MenuItem = {
  label: string;
  icon?: LucideIcon;
  onClick?: () => void;
  /** deletes or clears: red, and last */
  danger?: boolean;
  disabled?: boolean;
  /** a choice: true on the one picked now, false on the others */
  checked?: boolean;
};

// The menu opens from what was tapped: the last button, link, chip or swiped row's button pressed outside a menu.
let tapped: Element | null = null;
if (typeof document !== 'undefined') {
  document.addEventListener(
    'pointerdown',
    (e) => {
      const el = (e.target as Element | null)?.closest?.('a, button, .link, .chip');
      if (el && !el.closest('.popover')) tapped = el;
    },
    { capture: true, passive: true },
  );
}
/** what a menu can open from: still on the screen, and not hidden (a swiped row's button once the row closed) */
const onScreen = (el: Element | null) => {
  if (!el || !document.contains(el)) return null;
  const r = el.getBoundingClientRect();
  return r.width && r.height ? el : null;
};

type F7Popover = {
  open: (target?: Element, animate?: boolean) => void;
  close: () => void;
  opened: boolean;
  params: { targetX?: number; targetY?: number };
  $targetEl: unknown;
  targetEl: unknown;
};

type Props = {
  opened: boolean;
  onClosed: () => void;
  /** only for a choice menu: what it's choosing */
  title?: string;
  /** open in the middle of the screen, not from what was tapped (a question after a sheet that's closing) */
  centered?: boolean;
  /** rows in order; groups only keep related rows together, and a destructive row goes last */
  groups: (MenuItem | false | null | undefined)[][];
};

const iconProps = { size: 22, strokeWidth: 1.75, className: 'ck-icon' } as const;

export default function Menu({ opened, onClosed, title, centered, groups }: Props) {
  // Framework7's Popover reads targetEl only when it's made, so it's opened here, from what was tapped
  const popover = useRef<{ f7Popover: () => F7Popover | null } | null>(null);
  useEffect(() => {
    const p = popover.current?.f7Popover();
    if (!p) return;
    if (opened && !p.opened) {
      const target = centered ? null : onScreen(tapped);
      if (target) p.open(target, true);
      else {
        // nothing to open from (a menu opened from another menu): the middle of the screen
        p.$targetEl = null;
        p.targetEl = null;
        p.params.targetX = window.innerWidth / 2;
        p.params.targetY = window.innerHeight / 2;
        p.open(undefined, true);
      }
    }
    if (!opened && p.opened) p.close();
  }, [opened]);

  const rows = groups.flatMap((g) => g.filter((i): i is MenuItem => !!i));
  const anyCheck = rows.some((i) => i.checked !== undefined);

  return (
    <Popover ref={popover as never} onPopoverClosed={onClosed} backdrop closeByBackdropClick className="ck-menu">
      {title && <div className="ck-menu-title">{title}</div>}
      <List dividersIos className="ck-menu-list">
        {rows.map((i, k) => (
          <ListItem
            key={k}
            link
            noChevron
            popoverClose
            title={i.label}
            className={`${i.danger ? 'ck-menu-danger' : ''} ${i.disabled ? 'disabled' : ''}`}
            onClick={i.onClick}
          >
            {anyCheck && <span slot="media" className="ck-menu-check">{i.checked && <Check {...iconProps} />}</span>}
            {i.icon && <span slot="after"><i.icon {...iconProps} /></span>}
          </ListItem>
        ))}
      </List>
    </Popover>
  );
}
