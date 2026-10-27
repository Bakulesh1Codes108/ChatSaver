/*
 * Chat Saver — background (Chrome / Edge / Brave / Opera service worker, Firefox event page).
 * Drives a whole save from here, exactly like the Mac and desktop apps:
 *   open/find the chat → inject the extractor → call tick() until done →
 *   save TXT + Markdown + PDF into Downloads/Chat Saver → check → notify.
 * Driving tick() from the background keeps working even when the chat tab is in the background.
 */
const api = globalThis.browser ?? globalThis.chrome;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FOLDER = 'Chat Saver';
const jobs = new Map(); // tabId -> state

/* ---------- helpers ---------- */
async function run(tabId, func, args = []) {
  const [res] = await api.scripting.executeScript({ target: { tabId }, func, args });
  return res ? res.result : undefined;
}
function badge(tabId, text, color) {
  try {
    api.action.setBadgeText({ tabId, text: String(text) });
    if (color) api.action.setBadgeBackgroundColor({ tabId, color });
  } catch { /* ignore */ }
}
function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = ''; const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(bin);
}
async function download(content, filename, mime) {
  // Firefox (event page) has Blob URLs; Chrome's service worker does not, so use a data: URL there.
  let url;
  if (typeof content !== 'string') url = URL.createObjectURL(content);
  else if (typeof URL.createObjectURL === 'function' && typeof document !== 'undefined') url = URL.createObjectURL(new Blob([content], { type: mime }));
  else url = `data:${mime};base64,${utf8ToBase64(content)}`;
  const id = await api.downloads.download({ url, filename: `${FOLDER}/${filename}`, conflictAction: 'uniquify', saveAs: false });
  return waitDownload(id);
}
function waitDownload(id) {
  return new Promise((resolve) => {
    const done = async () => {
      const [item] = await api.downloads.search({ id });
      if (item && (item.state === 'complete' || item.state === 'interrupted')) { api.downloads.onChanged.removeListener(onChange); resolve(item); return true; }
      return false;
    };
    const onChange = (d) => { if (d.id === id) done(); };
    api.downloads.onChanged.addListener(onChange);
    done();
    setTimeout(() => { api.downloads.onChanged.removeListener(onChange); api.downloads.search({ id }).then(([i]) => resolve(i)); }, 30000);
  });
}
function notify(title, message) {
  try { api.notifications.create({ type: 'basic', iconUrl: api.runtime.getURL('icons/icon-128.png'), title, message }); } catch { /* ignore */ }
}
function waitTabComplete(tabId, timeout = 60000) {
  return new Promise((resolve) => {
    const t = setTimeout(() => { api.tabs.onUpdated.removeListener(on); resolve(); }, timeout);
    const on = (id, info) => { if (id === tabId && info.status === 'complete') { clearTimeout(t); api.tabs.onUpdated.removeListener(on); resolve(); } };
    api.tabs.onUpdated.addListener(on);
    api.tabs.get(tabId).then((tab) => { if (tab.status === 'complete') { clearTimeout(t); api.tabs.onUpdated.removeListener(on); resolve(); } });
  });
}
const norm = (u) => String(u || '').replace(/#.*$/, '').replace(/\/+$/, '').toLowerCase();

/* ---------- PDF ---------- */
async function makePdf(id, fileBase) {
  // Render the chat in the extension's reading view, then print it.
  const tab = await api.tabs.create({ url: api.runtime.getURL(`export.html#id=${encodeURIComponent(id)}&action=${api.debugger ? 'job' : 'jobpdf'}`), active: false });
  await waitTabComplete(tab.id, 30000);
  for (let i = 0; i < 40; i++) { // wait for render + images
    const ready = await run(tab.id, () => document.body && document.body.dataset.ready).catch(() => null);
    if (ready) break;
    await sleep(250);
  }
  let item = null; let pages = 0;
  if (api.debugger) {
    // Chrome / Edge / Brave: the browser's own print engine → real, selectable-text PDF.
    const target = { tabId: tab.id };
    await api.debugger.attach(target, '1.3');
    try {
      const res = await api.debugger.sendCommand(target, 'Page.printToPDF', {
        printBackground: true, paperWidth: 8.27, paperHeight: 11.69,
        marginTop: 0.55, marginBottom: 0.65, marginLeft: 0.47, marginRight: 0.47,
        displayHeaderFooter: true, headerTemplate: '<span></span>',
        footerTemplate: '<div style="width:100%;font:8px sans-serif;color:#94a3b8;padding:0 12mm;display:flex;justify-content:space-between"><span class="title"></span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>',
      });
      pages = (atob(res.data).match(/\/Type\s*\/Page(?!s)/g) || []).length;
      const did = await api.downloads.download({ url: `data:application/pdf;base64,${res.data}`, filename: `${FOLDER}/${fileBase}.pdf`, conflictAction: 'uniquify', saveAs: false });
      item = await waitDownload(did);
    } finally { try { await api.debugger.detach(target); } catch { /* ignore */ } }
  } else {
    // Firefox: the reading view builds the PDF itself (jsPDF) and reports back.
    const r = await new Promise((resolve) => {
      const on = (msg, sender) => { if (msg?.type === 'chatsaver:pdfDone' && sender.tab?.id === tab.id) { api.runtime.onMessage.removeListener(on); resolve(msg); } };
      api.runtime.onMessage.addListener(on);
      setTimeout(() => { api.runtime.onMessage.removeListener(on); resolve({ ok: false }); }, 5 * 60 * 1000);
    });
    pages = r.pages || 0;
    if (r.downloadId) item = await waitDownload(r.downloadId);
  }
  api.tabs.remove(tab.id).catch(() => {});
  return { item, pages };
}

/* ---------- one save ---------- */
async function saveTab(tabId) {
  if (jobs.has(tabId)) return;
  jobs.set(tabId, true);
  const t0 = Date.now();
  try {
    badge(tabId, '…', '#0F766E');
    await api.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    await run(tabId, () => window.__chatSaver.startJob(true));
    let st = { s: 'running', n: 0 }; let asked = false;
    while (Date.now() - t0 < 15 * 60 * 1000) {
      await sleep(600);
      st = JSON.parse(await run(tabId, () => window.__chatSaver.tick()));
      if (st.s !== 'running') break;
      badge(tabId, st.n < 0 ? '↑' : String(st.n));
      if (!asked && Date.now() - t0 > 12 * 60 * 1000) { asked = true; await run(tabId, () => window.__chatSaver.finishNow()); }
    }
    if (st.s !== 'done') {
      const err = await run(tabId, () => (window.__csState && window.__csState.error) || '');
      if (err === 'cancelled') { badge(tabId, ''); return; }
      throw new Error(err === 'no-messages' ? 'No chat messages found. Open a conversation (sign in if needed) and try again.' : `Could not read this chat (${err || st.s}).`);
    }
    const data = JSON.parse(await run(tabId, () => window.__csState.json));
    const p = data.p;
    await run(tabId, (n) => window.__chatSaver.overlay.set('Step 3 of 3 · Saving files', `Writing ${n} messages…`, 97), [p.messages.length]);

    const txt = await download(data.txt, `${p.fileBase}.txt`, 'text/plain;charset=utf-8');
    const md = await download(data.md, `${p.fileBase}.md`, 'text/markdown;charset=utf-8');
    const id = 'chat_' + Date.now();
    await api.storage.local.set({ [id]: p });
    const pdf = await makePdf(id, p.fileBase);
    api.storage.local.remove(id);

    // check the work
    const items = [pdf.item, txt, md].filter(Boolean);
    const problems = [];
    for (const it of items) if (it.state !== 'complete' || (it.fileSize ?? it.totalBytes ?? 1) < 50) problems.push(`${(it.filename || '').split(/[\\/]/).pop()} did not save`);
    if (!pdf.pages) problems.push('the PDF has no pages');
    const you = p.messages.filter((m) => m.role === 'user').length;
    const ai = p.messages.length - you;
    const summary = `${p.messages.length} messages — ${you} from you, ${ai} from ${p.assistantName}` + (pdf.pages ? ` · PDF ${pdf.pages} page${pdf.pages === 1 ? '' : 's'}` : '');
    await run(tabId, (a, b) => window.__chatSaver.overlay.done(a, b), [`Saved ${p.messages.length} messages`, problems.length ? `Check: ${problems.join('; ')}` : `${summary.split(' · ')[1] || ''} · Downloads ▸ Chat Saver`.replace(/^ · /, '')]);
    badge(tabId, problems.length ? '!' : '✓', problems.length ? '#DC2626' : '#047857');
    notify(problems.length ? 'Chat Saver — check the files' : `Saved “${p.title}”`, problems.length ? problems.join('; ') : `${summary}\nDownloads ▸ Chat Saver`);
    await api.storage.local.set({ lastResult: { title: p.title, summary, problems, at: Date.now(), file: pdf.item?.id ?? txt?.id } });
  } catch (e) {
    console.error('[Chat Saver]', e);
    badge(tabId, '!', '#DC2626');
    try { await run(tabId, (m) => window.__chatSaver?.overlay?.fail('Something went wrong', m), [e.message]); } catch { /* ignore */ }
    notify('Chat Saver', e.message);
  } finally {
    jobs.delete(tabId);
  }
}

async function saveLink(url) {
  const tabs = await api.tabs.query({});
  let tab = tabs.find((t) => norm(t.url) === norm(url));
  if (tab) await api.tabs.update(tab.id, { active: true });
  else tab = await api.tabs.create({ url, active: true });
  await waitTabComplete(tab.id);
  let last = -1; // chat apps render after load: wait until the text stops growing
  for (let i = 0; i < 10; i++) {
    await sleep(1000);
    const n = await run(tab.id, () => (document.body ? document.body.innerText.length : 0)).catch(() => 0);
    if (n > 200 && n === last) break;
    last = n;
  }
  return saveTab(tab.id);
}

/* ---------- messages ---------- */
api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'chatsaver:saveTab') { saveTab(msg.tabId); sendResponse({ started: true }); return; }
  if (msg?.type === 'chatsaver:saveLink') { saveLink(msg.url); sendResponse({ started: true }); return; }
  if (msg?.type === 'chatsaver:open') {
    // Reading view (manual export) requested by the content script.
    const url = api.runtime.getURL(`export.html#id=${encodeURIComponent(msg.id)}&action=${encodeURIComponent(msg.action || 'view')}`);
    const opts = { url };
    if (sender?.tab?.index != null) opts.index = sender.tab.index + 1;
    Promise.resolve(api.tabs.create(opts)).then(() => sendResponse({ ok: true }), (e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
});

// Keyboard shortcut (Alt+Shift+S) is the popup; right-click menu saves the current page directly.
api.runtime.onInstalled?.addListener(() => {
  try { api.contextMenus.create({ id: 'chatsaver-save', title: 'Save this chat (PDF + TXT + MD)', contexts: ['page'] }); } catch { /* ignore */ }
});
api.contextMenus?.onClicked.addListener((info, tab) => { if (info.menuItemId === 'chatsaver-save' && tab?.id) saveTab(tab.id); });
