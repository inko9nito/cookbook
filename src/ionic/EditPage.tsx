import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent, IonList, IonItem, IonLabel, IonInput,
  IonTextarea, IonReorderGroup, IonReorder, IonItemSliding, IonItemOptions, IonItemOption, IonModal, IonNote,
  useIonActionSheet, useIonRouter,
} from '@ionic/react';
import { Plus } from 'lucide-react';
import { useStore } from '../data/store';
import { emptyRecipe, newId, withRaw, type Ingredient, type Recipe, type Step } from '../lib/recipe';
import { say } from './toast';
import { recipePath, useTab } from './ui';

const lineOf = (i: Ingredient) => (i.kind === 'header' ? 'Group' : [i.amount, i.unit, i.name].filter(Boolean).join(' ') || 'New ingredient');

/**
 * The editor on Ionic: fields in inset lists; ingredients and steps reorder with Ionic's handle and swipe left to delete;
 * tapping an ingredient opens its sheet (R4: Amount, Unit, Ingredient, Note, changes apply as you type, one Done).
 * Cancel with changes asks Discard Changes (an action sheet, the one confirmation that is one).
 */
export default function EditPage() {
  const { id = '' } = useParams();
  const tab = useTab();
  const router = useIonRouter();
  const { recipes, saveRecipe } = useStore();
  const [sheet] = useIonActionSheet();
  const original = id === 'new' ? null : recipes.find((r) => r.id === id);
  const [draft, setDraft] = useState<Recipe>(() => original ?? emptyRecipe());
  const [editing, setEditing] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const change = (patch: Partial<Recipe>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };
  const setIng = (ingId: string, patch: Partial<Ingredient>) => change({ ingredients: draft.ingredients.map((i) => (i.id === ingId ? { ...i, ...patch } : i)) });
  const setStep = (stepId: string, text: string) => change({ steps: draft.steps.map((s) => (s.id === stepId ? { ...s, text } : s)) });
  const ing = draft.ingredients.find((i) => i.id === editing);

  const leave = () => router.goBack();
  const cancel = () =>
    dirty
      ? sheet({
          header: 'Discard your changes?',
          buttons: [
            { text: 'Discard Changes', role: 'destructive', handler: leave },
            { text: 'Keep Editing', role: 'cancel' },
          ],
        })
      : leave();
  const save = () => {
    const r: Recipe = {
      ...draft,
      title: draft.title.trim() || 'Untitled recipe',
      ingredients: draft.ingredients.filter((i) => i.kind === 'header' || i.name.trim() || i.amount.trim()).map(withRaw),
      steps: draft.steps.filter((s) => s.text.trim()),
    };
    saveRecipe(r);
    if (original) leave();
    else router.push(recipePath(tab, r.id), 'forward', 'replace');
    say(original ? 'Saved' : 'Recipe added');
  };

  return (
    <IonPage>
      <IonHeader className="ck-ion-header">
        <IonToolbar>
          <IonButtons slot="start">
            <IonButton className="ck-ion-text-button" onClick={cancel}>
              Cancel
            </IonButton>
          </IonButtons>
          <IonTitle className="ck-ion-title-small ck-ion-center">{original ? 'Edit Recipe' : 'New Recipe'}</IonTitle>
          <IonButtons slot="end">
            <IonButton className="ck-ion-text-button ck-ion-strong" onClick={save}>
              Save
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <IonList inset lines="full" className="ck-ion-inset">
          <IonItem>
            <IonInput label="Title" labelPlacement="stacked" value={draft.title} placeholder="What is it?" onIonInput={(e) => change({ title: e.detail.value ?? '' })} />
          </IonItem>
          <IonItem>
            <IonInput label="Servings" labelPlacement="stacked" type="number" inputmode="numeric" value={draft.servings} onIonInput={(e) => change({ servings: Math.max(1, Number(e.detail.value) || 1) })} />
          </IonItem>
          <IonItem>
            <IonInput label="Total time (minutes)" labelPlacement="stacked" type="number" inputmode="numeric" value={draft.minutes || ''} onIonInput={(e) => change({ minutes: Math.max(0, Number(e.detail.value) || 0) })} />
          </IonItem>
        </IonList>

        <div className="ck-group-label ck-ion-meal">Ingredients</div>
        <IonList inset lines="full" className="ck-ion-inset">
          <IonReorderGroup disabled={false} onIonReorderEnd={(e) => change({ ingredients: e.detail.complete(draft.ingredients) as Ingredient[] })}>
            {draft.ingredients.map((i) => (
              <IonItemSliding key={i.id}>
                <IonItem button detail={false} onClick={() => setEditing(i.id)} className={i.kind === 'header' ? 'ck-ion-organize-heading' : ''}>
                  <IonLabel className="ion-text-wrap">
                    {i.kind === 'header' ? (
                      i.name
                    ) : (
                      <>
                        <span className="ck-amount">{[i.amount, i.unit].filter(Boolean).join(' ')}</span> {i.name || <IonNote>New ingredient</IonNote>}
                        {i.note && <p>{i.note}</p>}
                      </>
                    )}
                  </IonLabel>
                  <IonReorder slot="end" />
                </IonItem>
                <IonItemOptions side="end">
                  <IonItemOption color="danger" expandable onClick={() => change({ ingredients: draft.ingredients.filter((x) => x.id !== i.id) })}>
                    Delete
                  </IonItemOption>
                </IonItemOptions>
              </IonItemSliding>
            ))}
          </IonReorderGroup>
          <IonItem
            button
            detail={false}
            onClick={() => {
              const n: Ingredient = { id: newId(), amount: '', unit: '', name: '', note: '' };
              change({ ingredients: [...draft.ingredients, n] });
              setEditing(n.id);
            }}
          >
            <Plus slot="start" size={20} className="ck-ion-accent-text" />
            <IonLabel className="ck-ion-accent-text">Add ingredient</IonLabel>
          </IonItem>
        </IonList>

        <div className="ck-group-label ck-ion-meal">Directions</div>
        <IonList inset lines="full" className="ck-ion-inset">
          <IonReorderGroup disabled={false} onIonReorderEnd={(e) => change({ steps: e.detail.complete(draft.steps) as Step[] })}>
            {draft.steps.map((s, n) => (
              <IonItemSliding key={s.id}>
                <IonItem>
                  <span slot="start" className="ck-step-no ck-ion-step-no">
                    {s.kind === 'header' ? '' : n + 1}
                  </span>
                  <IonTextarea autoGrow rows={1} value={s.text} placeholder="Describe this step" onIonInput={(e) => setStep(s.id, e.detail.value ?? '')} />
                  <IonReorder slot="end" />
                </IonItem>
                <IonItemOptions side="end">
                  <IonItemOption color="danger" expandable onClick={() => change({ steps: draft.steps.filter((x) => x.id !== s.id) })}>
                    Delete
                  </IonItemOption>
                </IonItemOptions>
              </IonItemSliding>
            ))}
          </IonReorderGroup>
          <IonItem button detail={false} onClick={() => change({ steps: [...draft.steps, { id: newId(), text: '' }] })}>
            <Plus slot="start" size={20} className="ck-ion-accent-text" />
            <IonLabel className="ck-ion-accent-text">Add step</IonLabel>
          </IonItem>
        </IonList>

        <div className="ck-group-label ck-ion-meal">Notes</div>
        <IonList inset lines="full" className="ck-ion-inset">
          <IonItem>
            <IonTextarea autoGrow rows={3} value={draft.notes} placeholder="Tips, swaps, what you’d change" onIonInput={(e) => change({ notes: e.detail.value ?? '' })} />
          </IonItem>
        </IonList>
      </IonContent>

      {/* R4: one ingredient's four fields, changes apply as you type, one Done */}
      <IonModal isOpen={!!ing} onDidDismiss={() => setEditing(null)} breakpoints={[0, 1]} initialBreakpoint={1} className="ck-ion-sheet ck-ion-auto-sheet">
        <div className="ck-ion-auto-inner">
          <IonToolbar className="ck-ion-sheet-bar">
            <IonTitle className="ck-ion-title-small">{ing ? lineOf(ing) : ''}</IonTitle>
            <IonButtons slot="end">
              <IonButton className="ck-ion-text-button ck-ion-strong" onClick={() => setEditing(null)}>
                Done
              </IonButton>
            </IonButtons>
          </IonToolbar>
          {ing?.kind === 'header' && (
            <IonList inset lines="full" className="ck-ion-inset">
              <IonItem>
                <IonInput label="Group" labelPlacement="fixed" value={ing.name} placeholder="For the sauce" onIonInput={(e) => setIng(ing.id, { name: e.detail.value ?? '' })} />
              </IonItem>
            </IonList>
          )}
          {ing && ing.kind !== 'header' && (
            <IonList inset lines="full" className="ck-ion-inset">
              <IonItem>
                <IonInput label="Amount" labelPlacement="fixed" value={ing.amount} placeholder="1½" onIonInput={(e) => setIng(ing.id, { amount: e.detail.value ?? '' })} />
              </IonItem>
              <IonItem>
                <IonInput label="Unit" labelPlacement="fixed" value={ing.unit} placeholder="cups" onIonInput={(e) => setIng(ing.id, { unit: e.detail.value ?? '' })} />
              </IonItem>
              <IonItem>
                <IonInput label="Ingredient" labelPlacement="fixed" value={ing.name} placeholder="flour" onIonInput={(e) => setIng(ing.id, { name: e.detail.value ?? '' })} />
              </IonItem>
              <IonItem>
                <IonInput label="Note" labelPlacement="fixed" value={ing.note} placeholder="sifted" onIonInput={(e) => setIng(ing.id, { note: e.detail.value ?? '' })} />
              </IonItem>
            </IonList>
          )}
        </div>
      </IonModal>
    </IonPage>
  );
}
