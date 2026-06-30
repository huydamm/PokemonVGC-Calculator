/**
 * Background service worker: a thin Claude proxy. It is the only place the API
 * key lives and the only place api.anthropic.com is called (key off the page,
 * no page-CSP/CORS). The content script drives the tool loop and just asks us to
 * run one `messages.create` at a time — the engine and battle data stay in the
 * content script, so we never duplicate them here.
 */
import Anthropic from '@anthropic-ai/sdk';

async function getKey(): Promise<string | undefined> {
  const { anthropicKey } = await chrome.storage.local.get('anthropicKey');
  return anthropicKey;
}

async function createMessage(body: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> {
  const apiKey = await getKey();
  if (!apiKey) throw new Error('No API key set — open the extension options and paste your Anthropic API key.');
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  return client.messages.create(body);
}

chrome.runtime.onMessage.addListener((req, _sender, sendResponse) => {
  if (req?.type !== 'vgc-llm') return undefined;
  createMessage(req.body)
    .then((message) => sendResponse({ message }))
    .catch((e) => sendResponse({ error: e?.message ?? String(e) }));
  return true; // keep the channel open for the async response
});
