/** Options page: store/load the Anthropic API key in chrome.storage.local. */
const keyInput = document.getElementById('key') as HTMLInputElement;
const status = document.getElementById('status')!;

chrome.storage.local.get('anthropicKey').then(({ anthropicKey }) => {
  if (anthropicKey) keyInput.value = anthropicKey;
});

document.getElementById('save')!.addEventListener('click', async () => {
  await chrome.storage.local.set({ anthropicKey: keyInput.value.trim() });
  status.textContent = 'Saved';
  setTimeout(() => (status.textContent = ''), 1500);
});
