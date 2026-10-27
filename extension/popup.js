const api = globalThis.browser ?? globalThis.chrome;
const statusEl = document.getElementById('status');
const linkEl = document.getElementById('link');

hydrateIcons();

const KNOWN = [
  [/(^|\.)(chatgpt\.com|chat\.openai\.com)$/, 'ChatGPT'], [/(^|\.)claude\.ai$/, 'Claude'],
  [/(^|\.)gemini\.google\.com$/, 'Gemini'], [/(^|\.)copilot\.microsoft\.com$/, 'Copilot'],
  [/(^|\.)poe\.com$/, 'Poe'], [/(^|\.)perplexity\.ai$/, 'Perplexity'], [/(^|\.)chat\.deepseek\.com$/, 'DeepSeek'],
  [/(^|\.)grok\.com$/, 'Grok'], [/(^|\.)(glm5\.app|chat\.z\.ai|chatglm\.cn|z\.ai)$/, 'GLM'],
  [/(^|\.)(chat\.qwen\.ai|tongyi\.aliyun\.com)$/, 'Qwen'], [/(^|\.)(kimi\.com|kimi\.moonshot\.cn)$/, 'Kimi'],
  [/(^|\.)chat\.mistral\.ai$/, 'Mistral'], [/(^|\.)meta\.ai$/, 'Meta AI'], [/(^|\.)huggingface\.co$/, 'HuggingChat'],
  [/(^|\.)character\.ai$/, 'Character.AI'], [/(^|\.)pi\.ai$/, 'Pi'], [/(^|\.)manus\.im$/, 'Manus'],
];

function setStatus(msg, kind) {
  statusEl.textContent = '';
  statusEl.className = 'status' + (kind === 'err' ? ' err' : '');
  if (!msg) return;
  if (kind) statusEl.append(icon(kind === 'err' ? 'warning-circle' : 'check-circle', 16));
  statusEl.append(document.createTextNode(msg));
}
const done = (msg) => { setStatus(msg, 'ok'); setTimeout(() => window.close(), 1100); };

let tab = null;
(async () => {
  try {
    [tab] = await api.tabs.query({ active: true, currentWindow: true });
    if (tab?.url && /^https?:/.test(tab.url)) {
      const h = new URL(tab.url).hostname.replace(/^www\./, '');
      document.getElementById('site').textContent = h;
      const hit = KNOWN.find(([re]) => re.test(h));
      const chip = document.getElementById('app');
      chip.textContent = hit ? hit[1] : 'Smart detect';
      chip.hidden = false;
    }
    // Pre-fill the link box from the clipboard when it holds a link (needs a user gesture in some browsers).
    try { const c = (await navigator.clipboard.readText()).trim(); if (/^https?:\/\/\S+$/.test(c) && c !== tab?.url) linkEl.value = c; } catch { /* ignore */ }
  } catch { /* popup still works without these niceties */ }
})();

document.getElementById('save-tab').addEventListener('click', async () => {
  if (!tab || !/^https?:/.test(tab.url || '')) return setStatus('Open a chat page first, or paste a chat link below.', 'err');
  await api.runtime.sendMessage({ type: 'chatsaver:saveTab', tabId: tab.id });
  done('Saving — watch the progress card on the page.');
});

document.getElementById('link-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = linkEl.value.trim();
  if (!/^https?:\/\//i.test(url)) return setStatus('Paste a full link that starts with https://', 'err');
  await api.runtime.sendMessage({ type: 'chatsaver:saveLink', url });
  done('Opening the chat and saving it…');
});

// Single-format buttons use the in-page flow (downloads one file / opens the reading view).
document.querySelectorAll('button[data-format]').forEach((b) => b.addEventListener('click', async () => {
  try {
    if (!tab || !/^https?:/.test(tab.url || '')) throw new Error('Open a chat page first.');
    await api.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    await api.tabs.sendMessage(tab.id, { type: 'chatsaver:start', format: b.dataset.format === 'view' ? 'pdf' : b.dataset.format, autoscroll: true, view: b.dataset.format === 'view' });
    done('Working — progress is shown on the page.');
  } catch (err) {
    setStatus(/permission|access|Cannot/i.test(err.message) ? 'This browser blocked access to this page. Allow Chat Saver for this site and try again.' : err.message, 'err');
  }
}));
