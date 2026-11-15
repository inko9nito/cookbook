import { useRef } from 'react';
import { PhotoBrowser } from 'framework7-react';
import { ChefHat } from 'lucide-react';
import type { DemoPhoto } from '../demo/data';
import { photoStyle } from './ui/photo';

type Props = { photos: DemoPhoto[]; title: string };

/**
 * The photos at the top of the recipe page. One photo shows as is; several swipe sideways with page dots
 * (Framework7's Swiper). Tapping one opens Framework7's Photo Browser there: swipe through them, pinch or
 * double-tap to zoom, swipe down to close.
 */
export default function RecipePhotos({ photos, title }: Props) {
  const browser = useRef<{ f7PhotoBrowser: () => { open: (index?: number) => void } } | null>(null);
  const open = (i: number) => browser.current?.f7PhotoBrowser().open(i);

  if (!photos.length) {
    return (
      <div className="ck-hero ck-photo ck-photo-empty" aria-hidden="true">
        <ChefHat size={40} strokeWidth={1.5} />
      </div>
    );
  }

  const slide = (p: DemoPhoto, i: number) => (
    <button
      type="button"
      className="ck-hero ck-photo"
      style={photoStyle(p.src)}
      onClick={() => open(i)}
      aria-label={photos.length > 1 ? `${title}, photo ${i + 1} of ${photos.length}. Open full screen` : `${title} photo. Open full screen`}
    />
  );

  return (
    <>
      {photos.length === 1 ? (
        slide(photos[0], 0)
      ) : (
        <div className="ck-hero-wrap">
          {/* edge-swipe-detection leaves the left edge to the iOS swipe back */}
          <swiper-container class="ck-hero-swiper" pagination="true" edge-swipe-detection="prevent" edge-swipe-threshold="24">
            {photos.map((p, i) => (
              <swiper-slide key={p.id}>{slide(p, i)}</swiper-slide>
            ))}
          </swiper-container>
        </div>
      )}
      {/* recreated when the photos change (Framework7 reads its photo list when it's created) */}
      <PhotoBrowser
        key={photos.map((p) => p.id).join()}
        ref={browser as never}
        photos={photos.map((p) => p.src)}
        type="popup"
        theme="dark"
        toolbar={false}
        swipeToClose
        popupCloseLinkText="Close"
        navbarOfText="of"
      />
    </>
  );
}
