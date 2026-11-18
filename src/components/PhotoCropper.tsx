import { useEffect, useRef, useState } from 'react';
import { Popup, Page, Navbar, NavLeft, NavTitle, NavRight, Link, Block, Button } from 'framework7-react';
import { RotateCcw } from 'lucide-react';
import Cropper from 'cropperjs';
import 'cropperjs/dist/cropper.css';
import type { Photo } from '../lib/recipe';
import { rotateLeft, squareIn } from './ui/photo';
import { inlineIcon } from './ui/icons';

type Box = NonNullable<Photo['crop']>;
type Rect = { left: number; top: number; width: number; height: number };
type Props = {
  /** the photo being cropped; null when closed */
  photo: Photo | null;
  /** the crop box, and the turned photo when it was rotated (issue #59) */
  onDone: (box: Box, rotated?: string) => void;
  onClose: () => void;
};

/** the square's distance from the frame's sides (--ck-edge-inset): the dimmed photo shows around it */
const INSET = 16;
/** how long Rotate's quarter turn takes (issue #51) */
const TURN_MS = 280;

/** Where the photo goes in the cropper so that `crop` (a box on the photo, in its pixels) fills the square. */
const photoAt = (square: Rect, natural: { width: number; height: number }, crop?: Box): Rect => {
  // no crop yet: the photo fills the square, centred
  const box = crop ? squareIn(crop) : null;
  const k = square.width / (box ? box.width : Math.min(natural.width, natural.height));
  const width = natural.width * k;
  const height = natural.height * k;
  return box
    ? { left: square.left - box.x * k, top: square.top - box.y * k, width, height }
    : { left: square.left + (square.width - width) / 2, top: square.top + (square.height - height) / 2, width, height };
};

/**
 * Crop a recipe photo to a square (issue #51: every recipe photo shows square, so the square here is exactly what the
 * recipe, its card and the plates show): pinch to zoom, drag to move the photo under a fixed square. The rest of the
 * photo shows dimmed around the square, so what's left out is plain to see. Opens right after picking one photo, and
 * from the crop button on the edit page. Rotate (issue #59) turns the photo a quarter turn to the left, as iOS Photos
 * does, with a smooth turn (#51); the turned photo is kept as the photo's original once Done is tapped (Cancel drops it).
 *
 * Approved exception (CLAUDE.md): Framework7 has no cropper, so the pinch/drag is Cropper.js. viewMode 1 keeps the
 * photo covering the square: it can't be zoomed out or dragged past the square's edges. The square can't be moved or
 * resized; the photo moves under it.
 */
export default function PhotoCropper({ photo, onDone, onClose }: Props) {
  const frame = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const cropper = useRef<Cropper | null>(null);
  // issue #59: the photo turned by Rotate, until Done or Cancel; the cropper starts again on it once it has loaded
  const [rotated, setRotated] = useState<string | null>(null);
  const turning = useRef(false);
  // after Rotate: where the turned photo goes (where the turn left it), and the still copy covering the frame meanwhile
  const turned = useRef<{ at: Rect; still: HTMLElement; turn: Animation } | null>(null);
  // counts closes, so a turn that finishes after Cancel is dropped
  const opening = useRef(0);

  const start = () => {
    if (!img.current || !photo) return;
    cropper.current?.destroy();
    cropper.current = new Cropper(img.current, {
      aspectRatio: 1,
      viewMode: 1,
      dragMode: 'move',
      // starts small, so the photo can be put anywhere around it before the square is set (see ready)
      autoCropArea: 0.1,
      cropBoxMovable: false,
      cropBoxResizable: false,
      toggleDragModeOnDblclick: false,
      guides: false,
      center: false,
      highlight: false,
      background: false,
      modal: true,
      restore: false,
      ready() {
        const c = cropper.current;
        if (!c) return;
        const frameSize = c.getContainerData();
        const side = Math.round(Math.min(frameSize.width, frameSize.height) - 2 * INSET);
        const square = { left: (frameSize.width - side) / 2, top: (frameSize.height - side) / 2, width: side, height: side };
        const after = turned.current;
        c.setCanvasData(after ? after.at : photoAt(square, c.getImageData(), photo.crop));
        c.setCropBoxData(square);
        if (after) {
          turned.current = null;
          // the turned photo is in place under the still copy: take the copy away once the turn has finished
          const done = () => {
            after.still.remove();
            turning.current = false;
          };
          after.turn.finished.then(done, done);
        }
      },
    });
  };

  // the cropper starts as the popup starts to open, so the photo is there while it slides up (Framework7's open event
  // can't be used: it fires before the popup has this photo's handler)
  useEffect(() => {
    if (photo) start();
  }, [photo]); // eslint-disable-line react-hooks/exhaustive-deps

  const rotate = async () => {
    const c = cropper.current;
    const shown = frame.current?.querySelector<HTMLElement>('.cropper-container');
    if (!photo || !c || !shown || turning.current) return;
    turning.current = true;
    const opened = opening.current;
    // the photo after a quarter turn to the left about the frame's middle (the square's middle too, so the square
    // stays where it is): x becomes y, and y becomes -x
    const f = c.getContainerData();
    const p = c.getCanvasData();
    const at = { left: f.width / 2 + p.top - f.height / 2, top: f.height / 2 + f.width / 2 - p.left - p.width, width: p.height, height: p.width };
    // a still copy of the cropper as it is, turned smoothly while the turned photo is drawn, then swapped for it
    const still = shown.cloneNode(true) as HTMLElement;
    still.classList.add('ck-crop-still');
    frame.current!.append(still);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const turn = still.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(-90deg)' }], {
      duration: reduce ? 0 : TURN_MS,
      easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
      fill: 'forwards',
    });
    c.destroy();
    cropper.current = null;
    try {
      const next = await rotateLeft(rotated ?? photo.original ?? photo.src);
      if (opened !== opening.current) return; // closed meanwhile (the close took the copy away)
      turned.current = { at, still, turn };
      setRotated(next); // the img loads it, then the cropper starts again on it (onLoad)
    } catch {
      still.remove();
      if (opened !== opening.current) return;
      turning.current = false;
      start();
    }
  };

  const done = () => {
    if (turning.current) return;
    const box = cropper.current?.getData(true);
    if (box) onDone({ x: box.x, y: box.y, width: box.width, height: box.height }, rotated ?? undefined);
  };

  return (
    <Popup
      className="ck-crop"
      opened={!!photo}
      onPopupClosed={() => {
        opening.current += 1;
        cropper.current?.destroy();
        cropper.current = null;
        frame.current?.querySelectorAll('.ck-crop-still').forEach((e) => e.remove());
        turned.current = null;
        turning.current = false;
        setRotated(null);
        onClose();
      }}
    >
      <Page>
        <Navbar innerClassName="navbar-inner-centered-title">
          <NavLeft>
            <Link popupClose>Cancel</Link>
          </NavLeft>
          <NavTitle>Crop Photo</NavTitle>
          <NavRight>
            <Link className="ck-nav-primary" onClick={done}>
              Done
            </Link>
          </NavRight>
        </Navbar>
        <div className="ck-crop-frame" ref={frame}>
          {photo && (
            <img
              ref={img}
              src={rotated ?? photo.original ?? photo.src}
              alt=""
              crossOrigin="anonymous"
              onLoad={() => {
                if (turned.current) start();
              }}
            />
          )}
        </div>
        <Block className="ck-crop-tools">
          <Button round className="ck-crop-rotate" onClick={() => void rotate()} aria-label="Rotate left">
            <RotateCcw {...inlineIcon} />
            <span>Rotate</span>
          </Button>
        </Block>
        <Block className="ck-note ck-crop-hint">Pinch to zoom, drag to move. What's in the square is what shows on the recipe.</Block>
      </Page>
    </Popup>
  );
}
