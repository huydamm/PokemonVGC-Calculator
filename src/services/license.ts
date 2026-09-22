/**
 * Paid access for the extension. The background asks ExtensionPay's HTTP API whether the
 * user paid; this turns the answer into what the panel shows. Pure, so the trial arithmetic
 * is testable without the browser.
 */

/** The ExtensionPay extension id, registered at extensionpay.com. */
export const EXTPAY_ID = 'vgc-live-calc';
export const TRIAL_DAYS = 7;
const DAY = 86_400_000;

/** Plain, cloneable license (it crosses `chrome.runtime` messaging): times in epoch ms. */
export interface License {
  paid: boolean;
  /** Trial start: the ExtensionPay trial or install time; null when unknown. */
  trialStartedAt: number | null;
}

export type Access = { kind: 'paid' } | { kind: 'trial'; daysLeft: number } | { kind: 'locked' };

export function access(l: License, now: number, trialDays = TRIAL_DAYS): Access {
  if (l.paid) return { kind: 'paid' };
  if (l.trialStartedAt == null) return { kind: 'locked' };
  const left = trialDays - (now - l.trialStartedAt) / DAY;
  return left > 0 ? { kind: 'trial', daysLeft: Math.ceil(left) } : { kind: 'locked' };
}

/**
 * ExtensionPay's user record (`GET /api/v2/user`) as a License. The trial runs from install
 * unless ExtensionPay started one (dates arrive as ISO strings).
 */
export function licenseFromUser(user: { paid?: unknown; trialStartedAt?: unknown }, installedAt: number): License {
  const trial = typeof user.trialStartedAt === 'string' ? Date.parse(user.trialStartedAt) : NaN;
  return { paid: user.paid === true, trialStartedAt: Number.isFinite(trial) ? trial : installedAt };
}
