/** Options page: the user's plan (paid / trial / locked) and the ExtensionPay buy, manage and log-in pages. */
import { access, type License } from '../src/services/license';
import { installFonts, themeSheet } from './theme';
import optionsCss from './options.css';

installFonts();
document.adoptedStyleSheets = [...document.adoptedStyleSheets, themeSheet(optionsCss)];

const status = document.getElementById('status')!;
document.getElementById('pay')!.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'vgc-pay' }));
document.getElementById('login')!.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'vgc-login' }));

chrome.runtime.sendMessage({ type: 'vgc-license' }, (l: License | null) => {
  if (chrome.runtime.lastError || !l) {
    status.textContent = 'Could not check your plan. Try again later.';
    return;
  }
  const a = access(l, Date.now());
  status.textContent =
    a.kind === 'paid' ? 'Unlocked. Thanks for supporting VGC Live Calc!'
    : a.kind === 'trial' ? `Free trial: ${a.daysLeft} day${a.daysLeft === 1 ? '' : 's'} left.`
    : 'Your free trial has ended. Buy to keep live damage numbers in every battle.';
});
