import type { CSSProperties } from 'react';

/** Blinking pixel block standing in for content that is still loading. The container sets aria-busy. */
export function Skeleton({ w, h, className = '', style }: { w?: string; h?: string; className?: string; style?: CSSProperties }) {
  return <span className={`skel ${className}`} aria-hidden="true" style={{ width: w, height: h, ...style }} />;
}
