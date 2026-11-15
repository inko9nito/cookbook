import { useRef } from 'react';
import { Popup, Page, Navbar, NavLeft, NavTitle, NavRight, Link, Block } from 'framework7-react';
import Cropper from 'cropperjs';
import 'cropperjs/dist/cropper.css';
import type { DemoPhoto } from '../demo/data';
import { PHOTO_RATIO } from './ui/photo';

type Box = NonNullable<DemoPhoto['crop']>;
type Props = {
  /** the photo being cropped; null when closed */
  photo: DemoPhoto | null;
  onDone: (box: Box) => void;
  onClose: () => void;
};

/**
 * Crop a recipe photo to 4:3: pinch to zoom, drag to move the photo inside a fixed 4:3 frame. Opens right after
 * picking one photo, and from the crop button on the edit page.
 *
 * Approved exception (CLAUDE.md): Framework7 has no cropper, so the pinch/drag inside the frame is Cropper.js.
 * The frame is the whole cropper (viewMode 3), so the photo always covers it and there's no box to resize.
 */
export default function PhotoCropper({ photo, onDone, onClose }: Props) {
  const img = useRef<HTMLImageElement>(null);
  const cropper = useRef<Cropper | null>(null);

  const start = () => {
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
      data: photo.crop,
    });
  };

  const done = () => {
    const box = cropper.current?.getData(true);
    if (box) onDone({ x: box.x, y: box.y, width: box.width, height: box.height });
  };

  return (
    <Popup
      className="ck-crop"
      opened={!!photo}
      onPopupOpened={start}
      onPopupClosed={() => {
        cropper.current?.destroy();
        cropper.current = null;
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
        <div className="ck-crop-frame">{photo && <img ref={img} src={photo.original ?? photo.src} alt="" crossOrigin="anonymous" />}</div>
        <Block className="ck-note ck-crop-hint">Pinch to zoom, drag to move. What's in the frame is what shows on the recipe.</Block>
      </Page>
    </Popup>
  );
}
