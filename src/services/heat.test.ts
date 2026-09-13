import { describe, it, expect } from 'vitest';
import { heatBand } from './heat';

describe('heatBand', () => {
  it('buckets max damage % into five bands at 25/50/75/100', () => {
    expect([0, 24.9, 25, 49.9, 50, 74.9, 75, 99.9, 100, 180].map(heatBand)).toEqual([
      'safe', 'safe', 'low', 'low', 'mid', 'mid', 'high', 'high', 'ko', 'ko',
    ]);
  });
});
