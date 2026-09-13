import { describe, it, expect } from 'vitest';
import { hpState } from './hp';

describe('hpState', () => {
  it('colours by HP left after the max roll at the 50% / 20% thresholds', () => {
    expect(hpState([48, 49]).band).toBe('green'); // 51 left
    expect(hpState([49, 50]).band).toBe('yellow'); // 50 left
    expect(hpState([78, 79]).band).toBe('yellow'); // 21 left
    expect(hpState([79, 80]).band).toBe('red'); // 20 left
  });

  it('reports the roll range as HP left after min and max rolls', () => {
    expect(hpState([6, 7.2])).toMatchObject({ leftMax: 92.8, leftMin: 94, ko: 'none', noDamage: false });
  });

  it('clamps overkill to 0 and tells guaranteed from possible KOs', () => {
    expect(hpState([120, 150])).toMatchObject({ leftMax: 0, leftMin: 0, ko: 'guaranteed', band: 'red' });
    expect(hpState([90, 110])).toMatchObject({ leftMax: 0, leftMin: 10, ko: 'possible' });
  });

  it('keeps a full bar when the move does no damage', () => {
    expect(hpState(null)).toMatchObject({ leftMax: 100, leftMin: 100, noDamage: true, ko: 'none' });
    expect(hpState([0, 0]).noDamage).toBe(true);
  });
});
