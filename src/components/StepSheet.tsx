import { Sheet, Toolbar, Link, PageContent, List, ListInput, Block, Button } from 'framework7-react';

type Props = {
  /** The step or group being edited; null when closed */
  value: { id: string; text: string; kind?: 'header' } | null;
  onChange: (text: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  /** "Group" or "Step" naming for the title and delete button */
  noun: string;
  multiline?: boolean;
};

/** Edits one direction step or one group name. Changes apply live; one Done (same pattern as the ingredient sheet, R4). */
export default function StepSheet({ value, onChange, onDelete, onClose, noun, multiline = true }: Props) {
  return (
    <Sheet opened={!!value} onSheetClosed={onClose} swipeToClose backdrop closeByBackdropClick style={{ height: 'auto' }} className="ck-edit-sheet">
      <Toolbar>
        <div className="left">
          <b>Edit {noun}</b>
        </div>
        <div className="right">
          <Link sheetClose>Done</Link>
        </div>
      </Toolbar>
      <PageContent>
        {value && (
          <>
            <List className="ck-fields">
              <ListInput
                label={noun === 'Group' ? 'Group name' : 'Step'}
                type={multiline ? 'textarea' : 'text'}
                resizable={multiline}
                value={value.text}
                onInput={(e) => onChange(e.target.value)}
              />
            </List>
            <Block>
              <Button large color="red" onClick={() => onDelete(value.id)}>
                Delete {noun}
              </Button>
            </Block>
          </>
        )}
      </PageContent>
    </Sheet>
  );
}
