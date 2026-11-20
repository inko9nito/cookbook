import { useEffect, useState } from 'react';
import {
  IonModal, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent, IonSegment, IonSegmentButton, IonLabel,
  IonList, IonItem, IonRadioGroup, IonRadio, IonChip, IonNote, useIonAlert,
} from '@ionic/react';
import { Minus, Plus } from 'lucide-react';
import type { Ingredient, Recipe } from '../lib/recipe';
import { titleCase } from '../lib/recipe';
import { amountValue, friendly, scaleAmount, unitFor } from '../lib/ingredients';
import { conversions, formatConverted, neaterAmount } from '../lib/units';
import { originalAmount, type UnitPicks } from '../components/ui/ingredientLine';
import type { ConvertTarget } from '../components/UnitChoices';
import { say } from '../components/ui/toast';

const amountText = (i: Ingredient, factor: number) => {
  const a = scaleAmount(i.amount, factor);
  return [a, unitFor(i.unit, a)].filter(Boolean).join(' ');
};

/**
 * Adjust amounts as Ionic's sheet: it opens halfway and can be dragged up to full height or down to close (Ionic's snap
 * points, its spring and its dimming). Servings (− / + and ×½ ×1 ×2 ×3) or What I have (#3: tap an ingredient, say how
 * much you have, everything scales to match).
 */
export function ScaleSheet({ open, recipe, factor, onFactor, onClose }: { open: boolean; recipe: Recipe; factor: number; onFactor: (f: number) => void; onClose: () => void }) {
  const [mode, setMode] = useState<'servings' | 'have'>('servings');
  const [matched, setMatched] = useState<{ id: string; have: string } | null>(null);
  const [alert] = useIonAlert();
  const scalable = recipe.ingredients.filter((i) => i.kind !== 'header' && amountValue(i.amount) !== null);
  const servings = recipe.servings * factor;
  const scaled = Math.abs(factor - 1) > 0.001;
  const matchedIng = matched ? scalable.find((i) => i.id === matched.id) : undefined;
  const byServings = (f: number) => {
    setMatched(null);
    onFactor(f);
  };
  const askHave = (i: Ingredient) => {
    const base = amountValue(i.amount);
    if (!base) return;
    const unit = unitFor(i.unit, '2');
    alert({
      header: titleCase(i.name),
      message: `The recipe uses ${amountText(i, 1)}. How much do you have${unit ? ` (in ${unit})` : ''}?`,
      inputs: [{ name: 'n', type: 'number', attributes: { inputmode: 'decimal', step: 'any' }, value: matched?.id === i.id ? scaleAmount(i.amount, factor).split('–')[0] : '' }],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'OK',
          handler: (v: { n: string }) => {
            const n = Number(String(v.n).trim().replace(',', '.'));
            if (!(n > 0)) return;
            const have = [friendly(n), unitFor(i.unit, String(n))].filter(Boolean).join(' ');
            setMatched({ id: i.id, have });
            onFactor(n / base);
            say(`Scaled ×${friendly(n / base)} to match ${have} ${i.name}`);
          },
        },
      ],
    });
  };
  return (
    <IonModal isOpen={open} onDidDismiss={onClose} breakpoints={[0, 0.55, 0.92]} initialBreakpoint={0.55} className="ck-ion-sheet">
      <IonHeader className="ck-ion-sheet-header">
        <IonToolbar>
          <IonTitle className="ck-ion-title-small">Adjust amounts</IonTitle>
          <IonButtons slot="end">
            <IonButton className="ck-ion-text-button" onClick={onClose}>
              Done
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ck-ion-sheet-content">
        <IonSegment value={mode} onIonChange={(e) => setMode(e.detail.value as 'servings' | 'have')}>
          <IonSegmentButton value="servings">
            <IonLabel>Servings</IonLabel>
          </IonSegmentButton>
          <IonSegmentButton value="have">
            <IonLabel>What I have</IonLabel>
          </IonSegmentButton>
        </IonSegment>
        <div className="ck-ion-scale-result">
          <span className="ck-note">
            {!scaled
              ? 'Showing the original amounts'
              : matchedIng
                ? `Matched to ${matched?.have} ${matchedIng.name} · ×${friendly(factor)} · about ${friendly(servings)} servings`
                : `Showing ×${friendly(factor)} · ${friendly(servings)} servings`}
          </span>
          {scaled && (
            <IonButton fill="clear" size="small" className="ck-ion-text-button" onClick={() => byServings(1)}>
              Reset
            </IonButton>
          )}
        </div>
        {mode === 'servings' ? (
          <>
            <div className="ck-ion-stepper-row">
              <b>Servings</b>
              <div className="ck-ion-stepper">
                <IonButton shape="round" className="ck-ion-step" aria-label="Fewer servings" disabled={Math.round(servings) <= 1} onClick={() => byServings(Math.max(1, Math.round(servings) - 1) / recipe.servings)}>
                  <Minus size={20} />
                </IonButton>
                <span className="ck-ion-step-value">{Math.max(1, Math.round(servings))}</span>
                <IonButton shape="round" className="ck-ion-step" aria-label="More servings" onClick={() => byServings((Math.round(servings) + 1) / recipe.servings)}>
                  <Plus size={20} />
                </IonButton>
              </div>
            </div>
            <div className="ck-ion-chips ck-ion-chips-wrap">
              {[0.5, 1, 2, 3].map((m) => (
                <IonChip key={m} className={Math.abs(factor - m) < 0.001 ? 'ck-ion-chip-on' : ''} onClick={() => byServings(m)}>
                  ×{m === 0.5 ? '½' : m}
                </IonChip>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="ck-ion-footnote">Tap the ingredient you have a different amount of. Everything else scales to match.</p>
            <IonList inset lines="full" className="ck-ion-inset">
              {scalable.map((i) => (
                <IonItem key={i.id} button detail onClick={() => askHave(i)}>
                  <IonLabel className="ion-text-wrap">
                    <span className="ck-amount">{amountText(i, 1)}</span> {i.name}
                  </IonLabel>
                  {matched?.id === i.id && <IonNote slot="end">You have {matched.have}</IonNote>}
                </IonItem>
              ))}
            </IonList>
          </>
        )}
      </IonContent>
    </IonModal>
  );
}

/**
 * The unit choices (#6) as Ionic's sheet without a backdrop: the page stays usable behind it (tap another amount and it
 * switches; tap anywhere else and it closes). The tapped row is scrolled up out from under it.
 */
export function UnitSheet({ target, factor, picks, onPick, onClosed }: { target: ConvertTarget | null; factor: number; picks: UnitPicks; onPick: (ingredientId: string, unit: string | null) => void; onClosed: () => void }) {
  useEffect(() => {
    if (!target) return;
    const row = (target.el.closest('ion-item, li') ?? target.el) as HTMLElement;
    const keepInView = () => {
      const sheetTop = window.innerHeight * 0.55;
      const overlap = row.getBoundingClientRect().bottom + 8 - sheetTop;
      if (overlap <= 0) return;
      const pane = row.closest('.ck-pane');
      if (pane) pane.scrollBy({ top: overlap, behavior: 'smooth' });
      else (row.closest('ion-content') as HTMLIonContentElement | null)?.scrollByPoint(0, overlap, 300);
    };
    const t = setTimeout(keepInView, 60);
    // a tap anywhere but the sheet or an underlined amount closes it
    const close = (e: Event) => {
      const el = e.target as Element;
      if (!el.closest('.ck-ion-unit-sheet, .ck-convertible')) onClosed();
    };
    document.addEventListener('click', close, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener('click', close, true);
    };
  }, [target]); // eslint-disable-line react-hooks/exhaustive-deps

  const ing = target?.ing;
  const scaled = ing ? scaleAmount(ing.amount, factor) : '';
  const simpler = ing ? neaterAmount(scaled, ing.unit)?.id : undefined;
  return (
    <IonModal
      isOpen={!!target}
      onDidDismiss={onClosed}
      breakpoints={[0, 0.45]}
      initialBreakpoint={0.45}
      backdropBreakpoint={0.5}
      className="ck-ion-sheet ck-ion-unit-sheet"
    >
      <IonHeader className="ck-ion-sheet-header">
        <IonToolbar>
          <IonTitle className="ck-ion-title-small">{ing ? titleCase(ing.name) : ''}</IonTitle>
          <IonButtons slot="end">
            <IonButton className="ck-ion-text-button" onClick={onClosed}>
              Done
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ck-ion-sheet-content">
        {ing && (
          <IonRadioGroup
            value={picks[ing.id] ?? ''}
            onIonChange={(e) => {
              onPick(ing.id, (e.detail.value as string) || null);
              onClosed();
            }}
          >
            <IonList inset lines="full" className="ck-ion-inset">
              <IonItem>
                <IonRadio value="" justify="start" labelPlacement="end">
                  <span className="ck-ion-radio-label">
                    {originalAmount(ing, factor)}
                    <IonNote>Original</IonNote>
                  </span>
                </IonRadio>
              </IonItem>
              {conversions(scaled, ing.unit).map((c) => (
                <IonItem key={c.id}>
                  <IonRadio value={c.id} justify="start" labelPlacement="end">
                    <span className="ck-ion-radio-label">
                      {formatConverted(c)}
                      {simpler === c.id && <IonNote>Simpler</IonNote>}
                    </span>
                  </IonRadio>
                </IonItem>
              ))}
            </IonList>
          </IonRadioGroup>
        )}
      </IonContent>
    </IonModal>
  );
}
