/** Heatmap damage band: 5 flat colours (pixel style) instead of a continuous colour ramp. */
export type HeatBand = 'safe' | 'low' | 'mid' | 'high' | 'ko';

export function heatBand(maxPct: number): HeatBand {
  if (maxPct >= 100) return 'ko';
  if (maxPct >= 75) return 'high';
  if (maxPct >= 50) return 'mid';
  if (maxPct >= 25) return 'low';
  return 'safe';
}
