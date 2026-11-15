// JSX types for Swiper's web components (<swiper-container>, <swiper-slide>), which Framework7 v9 registers and uses
// for its own swipeable views. Attributes are passed as strings, as in Swiper's element docs.
import type { DetailedHTMLProps, HTMLAttributes } from 'react';

type SwiperAttrs = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & { class?: string; [attr: `${string}-${string}`]: unknown; pagination?: string };

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'swiper-container': SwiperAttrs;
      'swiper-slide': SwiperAttrs;
    }
  }
}
