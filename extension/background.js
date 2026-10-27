const api = globalThis.browser ?? globalThis.chrome;

// The content script stores the extracted chat, then asks us to open the export page.
api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== 'chatsaver:open') return;
  const url = api.runtime.getURL(`export.html#id=${encodeURIComponent(msg.id)}&action=${encodeURIComponent(msg.action || 'pdf')}`);
  const opts = { url };
  if (sender?.tab?.index != null) opts.index = sender.tab.index + 1;
  Promise.resolve(api.tabs.create(opts)).then(() => sendResponse({ ok: true }), (e) => sendResponse({ ok: false, error: String(e) }));
  return true;
});
