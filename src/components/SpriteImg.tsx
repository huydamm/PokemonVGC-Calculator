import { useState } from 'react';
import { SUBSTITUTE_SPRITE } from '../services/sprites';
import { Skeleton } from './Skeleton';

/**
 * Pixel sprite with a skeleton until it has loaded; falls back to the substitute
 * sprite on error. Tracks the loaded src, so a new sprite shows the skeleton again.
 */
export function SpriteImg({ src, alt, size, className = '' }: { src: string; alt: string; size: number; className?: string }) {
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const loaded = loadedSrc === src;
  return (
    <span className={`sprite ${className}`} style={{ width: size, height: size }} aria-busy={loaded ? undefined : true}>
      {!loaded && <Skeleton className="sprite-skel" />}
      <img
        src={src}
        alt={alt}
        width={size}
        height={size}
        loading="lazy"
        className={loaded ? 'loaded' : ''}
        onLoad={() => setLoadedSrc(src)}
        onError={(e) => {
          const img = e.currentTarget;
          if (img.src !== SUBSTITUTE_SPRITE) img.src = SUBSTITUTE_SPRITE;
          else setLoadedSrc(src);
        }}
      />
    </span>
  );
}
