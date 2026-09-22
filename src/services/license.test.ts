import { describe, it, expect } from 'vitest';
import { access, licenseFromUser } from './license';

const DAY = 86_400_000;
const start = Date.UTC(2026, 8, 1);

describe('access', () => {
  it('paid wins, even with an expired trial', () => {
    expect(access({ paid: true, trialStartedAt: start }, start + 30 * DAY)).toEqual({ kind: 'paid' });
  });

  it('counts the trial down in whole days, then locks', () => {
    expect(access({ paid: false, trialStartedAt: start }, start)).toEqual({ kind: 'trial', daysLeft: 7 });
    expect(access({ paid: false, trialStartedAt: start }, start + 6.5 * DAY)).toEqual({ kind: 'trial', daysLeft: 1 });
    expect(access({ paid: false, trialStartedAt: start }, start + 7 * DAY)).toEqual({ kind: 'locked' });
  });

  it('locks when the trial start is unknown', () => {
    expect(access({ paid: false, trialStartedAt: null }, start)).toEqual({ kind: 'locked' });
  });

  it('reads ExtensionPay user records, trial from install unless one was started', () => {
    expect(licenseFromUser({ paid: true, trialStartedAt: null }, start)).toEqual({ paid: true, trialStartedAt: start });
    expect(licenseFromUser({ paid: false, trialStartedAt: '2026-09-03T10:00:00.000Z' }, start))
      .toEqual({ paid: false, trialStartedAt: Date.UTC(2026, 8, 3, 10) });
    expect(licenseFromUser({ paid: 'yes', trialStartedAt: 'garbage' }, start)).toEqual({ paid: false, trialStartedAt: start });
  });
});
