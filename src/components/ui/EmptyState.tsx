import { Button } from 'framework7-react';
import { Plus, type LucideIcon } from 'lucide-react';

/**
 * An empty screen (issue #118; rules in DESIGN.md → Empty states): one icon on a white circle, a few words and one
 * button, the screen's main action, opening the same choices as its + in the bar.
 */
export default function EmptyState({
  icon: Icon,
  title,
  text,
  action,
}: {
  /** what the screen holds (Groceries: a carrot) */
  icon: LucideIcon;
  /** a few plain words: what isn't here yet (“Your list is empty”) */
  title: string;
  /** one short line, at most; never a path through the app */
  text?: string;
  /** the screen's main action, worded as its + menu's title */
  action: { label: string; onClick: () => void };
}) {
  return (
    <div className="ck-empty">
      <span className="ck-empty-icon" aria-hidden="true">
        <Icon size={40} strokeWidth={1.75} />
      </span>
      <h2 className="ck-empty-title">{title}</h2>
      {text && <p className="ck-empty-text">{text}</p>}
      <Button large fill round className="ck-main ck-empty-button" onClick={action.onClick}>
        <Plus size={20} strokeWidth={2.5} aria-hidden="true" />
        {action.label}
      </Button>
    </div>
  );
}
