import { useRef, useState } from 'react';
import { Popup, Page, Navbar, NavLeft, NavTitle, NavRight, Link, Block, Button } from 'framework7-react';
import { RotateCcw } from 'lucide-react';
import Cropper from 'cropperjs';
import 'cropperjs/dist/cropper.css';
import type { Photo } from '../lib/recipe';
import { PHOTO_RATIO, rotateLeft } from './ui/photo';
import { inlineIcon } from './ui/icons';

type Box = NonNullable<Photo['crop']>;
type Props = {
  /** the photo being cropped; null when closed */
  photo: Photo | null;
  /** the crop box, and the turned photo when it was rotated (issue #59) */
  onDone: (box: Box, rotated?: string) => void;
  onClose: () => void;
};

/**
 * Crop a recipe photo to 4:3: pinch to zoom, drag to move the photo inside a fixed 4:3 frame. Opens right after
 * picking one photo, and from the crop button on the edit page. Rotate (issue #59) turns the photo a quarter turn to
 * the left, as iOS Photos does; the turned photo is kept as the photo's original once Done is tapped (Cancel drops it).
 *
 * Approved exception (CLAUDE.md): Framework7 has no cropper, so the pinch/drag inside the frame is Cropper.js.
 * The frame is the whole cropper (viewMode 3), so the photo always covers it and there's no box to resize.
 */
export default function PhotoCropper({ photo, onDone, onClose }: Props) {
  const img = useRef<HTMLImageElement>(null);
  const cropper = useRef<Cropper | null>(null);
  // issue #59: the photo turned by Rotate, until Done or Cancel; the cropper starts again on it once it has loaded
  const [rotated, setRotated] = useState<string | null>(null);
  const [turning, setTurning] = useState(false);
  const restart = useRef(false);

  const start = (keepCrop = true) => {
    if (!img.current || !photo) return;
    cropper.current?.destroy();
    cropper.current = new Cropper(img.current, {
      aspectRatio: PHOTO_RATIO,
      viewMode: 3,
      dragMode: 'move',
      autoCropArea: 1,
      cropBoxMovable: false,
      cropBoxResizable: false,
      toggleDragModeOnDblclick: false,
      guides: false,
      center: false,
      highlight: false,
      background: false,
      modal: false,
      restore: false,
      // a turned photo starts centred in the frame
      data: keepCrop ? photo.crop : undefined,
    });
  };

  const rotate = async () => {
    if (!photo || turning) return;
    setTurning(true);
    try {
      const next = await rotateLeft(rotated ?? photo.original ?? photo.src);
      cropper.current?.destroy();
      cropper.current = null;
      restart.current = true;
      setRotated(next);
    } finally {
      setTurning(false);
    }
  };

  const done = () => {
    const box = cropper.current?.getData(true);
    if (box) onDone({ x: box.x, y: box.y, width: box.width, height: box.height }, rotated ?? undefined);
  };

  return (
    <Popup
      className="ck-crop"
      opened={!!photo}
      onPopupOpened={() => start()}
      onPopupClosed={() => {
        cropper.current?.destroy();
        cropper.current = null;
        restart.current = false;
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
        <div className="ck-crop-frame">
          {photo && (
            <img
              ref={img}
              src={rotated ?? photo.original ?? photo.src}
              alt=""
              crossOrigin="anonymous"
              onLoad={() => {
                if (!restart.current) return;
                restart.current = false;
                start(false);
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
        <Block className="ck-note ck-crop-hint">Pinch to zoom, drag to move. What's in the frame is what shows on the recipe.</Block>
      </Page>
    </Popup>
  );
}
