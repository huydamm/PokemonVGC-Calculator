/**
 * Background service worker: paid access through ExtensionPay's HTTP API (called directly;
 * its client library is AGPL). The only place ExtensionPay is contacted. Messages:
 * `vgc-license` answers with a License, `vgc-pay` opens checkout (or subscription management),
 * `vgc-login` opens the log-in page for a purchase made on another browser.
 */
import { EXTPAY_ID, licenseFromUser, type License } from '../src/services/license';

const EXT_URL = `https://extensionpay.com/extension/${EXTPAY_ID}`;

/**
 * This install's ExtensionPay key, in sync storage so it follows the user's Chrome profile.
 * Only created when the user opens checkout or log-in; until then there is nothing to ask.
 */
async function apiKey(create: boolean): Promise<string | null> {
  const { extpayKey } = await chrome.storage.sync.get('extpayKey');
  if (extpayKey || !create) return (extpayKey as string | undefined) ?? null;
  // Unpacked (no update_url) installs get a test-mode key: Stripe test cards, no real charges.
  const development = !('update_url' in chrome.runtime.getManifest());
  const res = await fetch(`${EXT_URL}/api/new-key`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(development ? { development: true } : {}),
  });
  if (!res.ok) throw new Error(`ExtensionPay new-key: HTTP ${res.status}`);
  const key: string = await res.json();
  await chrome.storage.sync.set({ extpayKey: key });
  return key;
}

/**
 * Paid status, cached so a payer keeps access while ExtensionPay is unreachable. The trial
 * runs from this install's first check.
 */
async function license(): Promise<License> {
  const { license: cached, installedAt = Date.now() } = await chrome.storage.local.get(['license', 'installedAt']);
  await chrome.storage.local.set({ installedAt });
  const trial: License = { paid: false, trialStartedAt: installedAt };
  const key = await apiKey(false);
  if (!key) return trial;
  try {
    const res = await fetch(`${EXT_URL}/api/v2/user?api_key=${encodeURIComponent(key)}`, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const fresh = licenseFromUser(await res.json(), installedAt);
    await chrome.storage.local.set({ license: fresh });
    return fresh;
  } catch (e) {
    console.warn('[vgc-calc] license check failed', e);
    return (cached as License | undefined) ?? trial;
  }
}

async function openPage(path: 'choose-plan' | 'reactivate'): Promise<void> {
  const key = encodeURIComponent((await apiKey(true))!);
  const url = path === 'choose-plan' ? `${EXT_URL}/choose-plan?api_key=${key}` : `${EXT_URL}/reactivate?api_key=${key}&back=choose-plan&v2`;
  await chrome.tabs.create({ url, active: true });
}

chrome.runtime.onMessage.addListener((req, _sender, sendResponse) => {
  if (req?.type === 'vgc-license') {
    license().then(sendResponse, () => sendResponse(null));
    return true; // keep the channel open for the async response
  }
  if (req?.type === 'vgc-pay' || req?.type === 'vgc-login') {
    openPage(req.type === 'vgc-pay' ? 'choose-plan' : 'reactivate').catch((e) => console.warn('[vgc-calc] ExtensionPay page', e));
  }
  return undefined;
});
