import { useSyncExternalStore, type ReactNode } from 'react';
import { Button, Link } from 'framework7-react';
import { Plus, type LucideIcon } from 'lucide-react';

/**
 * An empty screen (issue #118; rules in DESIGN.md → Empty states): a picture, a few words and one button, the screen's
 * main action, opening the same choices as its + in the bar. Three looks for the user to pick from on the phone
 * (Settings → Style Guide → Empty states); the one picked is kept on this phone until it's settled:
 * - plates: three soft-coloured plates with the screen's things on them, like a cookbook's card
 * - icon: one big icon on a white circle
 * - tile: no picture; a dashed tile that is itself the button
 */
export type EmptyLook = 'plates' | 'icon' | 'tile';
export const EMPTY_LOOKS: { look: EmptyLook; name: string }[] = [
  { look: 'plates', name: 'Plates' },
  { look: 'icon', name: 'Icon' },
  { look: 'tile', name: 'Add tile' },
];

const KEY = 'cookbook.emptyLook';
const listeners = new Set<() => void>();
const read = (): EmptyLook => {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'icon' || v === 'tile' ? v : 'plates';
  } catch {
    return 'plates';
  }
};
export const setEmptyLook = (look: EmptyLook) => {
  try {
    localStorage.setItem(KEY, look);
  } catch {
    /* private mode: only this visit */
  }
  current = look;
  listeners.forEach((f) => f());
};
let current: EmptyLook | null = null;
export const useEmptyLook = () =>
  useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => (current ??= read()),
  );

// the plates' colours, left to right: the cookbooks' soft colours
const TINTS = ['ck-tint-sage', 'ck-tint-butter', 'ck-tint-blush'];

export default function EmptyState({
  icons,
  title,
  text,
  action,
  look: forced,
}: {
  /** what the screen holds, three of them (the icon look shows the first) */
  icons: [LucideIcon, LucideIcon, LucideIcon];
  /** a few words: what isn't here yet (“Nothing to buy yet”) */
  title: string;
  /** one short line, at most; never a path through the app */
  text?: string;
  /** the screen's main action, worded as its + menu's title */
  action: { label: string; onClick: () => void };
  /** the Style Guide shows each look; screens use the one picked */
  look?: EmptyLook;
}) {
  const picked = useEmptyLook();
  const look = forced ?? picked;
  const [First, Middle, Last] = icons;

  if (look === 'tile') {
    return (
      <div className="ck-empty ck-empty-look-tile">
        <Link className="ck-empty-tile" onClick={action.onClick}>
          <span className="ck-empty-tile-plus" aria-hidden="true">
            <Plus size={26} strokeWidth={2.5} />
          </span>
          <span className="ck-empty-tile-label">{action.label}</span>
        </Link>
        <p className="ck-empty-text">{title}</p>
      </div>
    );
  }

  let art: ReactNode;
  if (look === 'icon') {
    art = (
      <span className="ck-empty-icon" aria-hidden="true">
        <First size={40} strokeWidth={1.75} />
      </span>
    );
  } else {
    // the middle plate is last in the markup so it's in front, as on a cookbook's card (`order` places it)
    art = (
      <div className="ck-plates ck-empty-plates" aria-hidden="true">
        <span className={`ck-plate ck-plate-left ${TINTS[0]}`}>
          <First size={28} strokeWidth={1.75} />
        </span>
        <span className={`ck-plate ck-plate-right ${TINTS[2]}`}>
          <Last size={28} strokeWidth={1.75} />
        </span>
        <span className={`ck-plate ck-plate-middle ${TINTS[1]}`}>
          <Middle size={38} strokeWidth={1.75} />
        </span>
      </div>
    );
  }

  return (
    <div className={`ck-empty ck-empty-look-${look}`}>
      {art}
      <h2 className="ck-empty-title">{title}</h2>
      {text && <p className="ck-empty-text">{text}</p>}
      <Button large fill round className="ck-main ck-empty-button" onClick={action.onClick}>
        <Plus size={20} strokeWidth={2.5} aria-hidden="true" />
        {action.label}
      </Button>
    </div>
  );
}
