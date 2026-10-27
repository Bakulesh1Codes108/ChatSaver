const api = globalThis.browser ?? globalThis.chrome;
const statusEl = document.getElementById('status');
const auto = document.getElementById('autoscroll');
const buttons = () => document.querySelectorAll('button[data-format]');

hydrateIcons();

const KNOWN = [
  [/(^|\.)(chatgpt\.com|chat\.openai\.com)$/, 'ChatGPT'], [/(^|\.)claude\.ai$/, 'Claude'],
  [/(^|\.)gemini\.google\.com$/, 'Gemini'], [/(^|\.)copilot\.microsoft\.com$/, 'Copilot'],
  [/(^|\.)poe\.com$/, 'Poe'], [/(^|\.)perplexity\.ai$/, 'Perplexity'], [/(^|\.)chat\.deepseek\.com$/, 'DeepSeek'],
  [/(^|\.)grok\.com$/, 'Grok'], [/(^|\.)(glm5\.app|chat\.z\.ai|chatglm\.cn|z\.ai)$/, 'GLM'],
  [/(^|\.)(chat\.qwen\.ai|tongyi\.aliyun\.com)$/, 'Qwen'], [/(^|\.)(kimi\.com|kimi\.moonshot\.cn)$/, 'Kimi'],
  [/(^|\.)chat\.mistral\.ai$/, 'Mistral'], [/(^|\.)meta\.ai$/, 'Meta AI'], [/(^|\.)huggingface\.co$/, 'HuggingChat'],
  [/(^|\.)character\.ai$/, 'Character.AI'], [/(^|\.)pi\.ai$/, 'Pi'],
];

function setStatus(msg, kind) {
  statusEl.textContent = '';
  statusEl.className = 'status' + (kind === 'err' ? ' err' : '');
  if (!msg) return;
  if (kind) statusEl.append(icon(kind === 'err' ? 'warning-circle' : 'check-circle', 16));
  statusEl.append(document.createTextNode(msg));
}

(async () => {
  try {
    const saved = await api.storage.local.get('autoscroll');
    if (saved && saved.autoscroll === false) auto.checked = false;
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    if (tab?.url && /^https?:/.test(tab.url)) {
      const h = new URL(tab.url).hostname.replace(/^www\./, '');
      document.getElementById('site').textContent = h;
      const hit = KNOWN.find(([re]) => re.test(h));
      const chip = document.getElementById('app');
      chip.textContent = hit ? hit[1] : 'Smart detect';
      chip.title = hit ? `${hit[1]} detected` : 'Unknown site — Chat Saver will find the conversation automatically';
      chip.hidden = false;
    }
  } catch { /* popup still works without these niceties */ }
})();
auto.addEventListener('change', () => api.storage.local.set({ autoscroll: auto.checked }));

async function start(btn) {
  const format = btn.dataset.format;
  buttons().forEach((b) => { b.disabled = true; });
  btn.setAttribute('aria-busy', 'true');
  setStatus('Starting…');
  try {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    if (!tab || !/^https?:/.test(tab.url || 'https:')) throw new Error('Open a chat web page first.');
    await api.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    await api.tabs.sendMessage(tab.id, { type: 'chatsaver:start', format, autoscroll: auto.checked });
    setStatus('Working — progress is shown on the page.', 'ok');
    setTimeout(() => window.close(), 900);
  } catch (e) {
    setStatus(/permission|access|Cannot|denied/i.test(e.message)
      ? 'Safari needs permission for this website. Click the Chat Saver icon, choose “Always Allow on This Website”, then try again.'
      : e.message, 'err');
    buttons().forEach((b) => { b.disabled = false; });
    btn.removeAttribute('aria-busy');
  }
}

buttons().forEach((b) => b.addEventListener('click', () => start(b)));
