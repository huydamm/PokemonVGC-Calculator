/** Defender HP bar state after one hit, from the move's damage % range (min roll, max roll). */
export type HpBand = 'green' | 'yellow' | 'red';

export interface HpState {
  /** % HP left after the max roll (worst case), 0..100. */
  leftMax: number;
  /** % HP left after the min roll (best case), 0..100. */
  leftMin: number;
  /** Bar colour from leftMax, Showdown thresholds: > 50 green, > 20 yellow, else red. */
  band: HpBand;
  /** guaranteed: even the min roll KOs; possible: only high rolls do. */
  ko: 'guaranteed' | 'possible' | 'none';
  noDamage: boolean;
}

const clampRound = (n: number): number => Math.round(Math.max(0, Math.min(100, n)) * 10) / 10;

export function hpState(percent: [number, number] | null): HpState {
  if (!percent || percent[1] <= 0) {
    return { leftMax: 100, leftMin: 100, band: 'green', ko: 'none', noDamage: true };
  }
  const leftMax = clampRound(100 - percent[1]);
  const leftMin = clampRound(100 - percent[0]);
  return {
    leftMax,
    leftMin,
    band: leftMax > 50 ? 'green' : leftMax > 20 ? 'yellow' : 'red',
    ko: leftMin === 0 ? 'guaranteed' : leftMax === 0 ? 'possible' : 'none',
    noDamage: false,
  };
}
