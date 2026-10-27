/*
 * Chat Saver for Mac — saves the AI chat in the front Safari tab as PDF, TXT and Markdown.
 * No Xcode and no Safari extension needed: this drives Safari through AppleScript (JXA),
 * runs Chat Saver's extractor in the page, then writes the files with macOS's own WebKit.
 */
ObjC.import('Foundation');
ObjC.import('AppKit');
ObjC.import('WebKit');

const app = Application.currentApplication();
app.includeStandardAdditions = true;

const RES = $.NSBundle.mainBundle.resourcePath.js;
const HOME = $.NSHomeDirectory().js;
const OUT_DIR = `${HOME}/Downloads/Chat Saver`;
const ICON = Path(`${RES}/AppIcon.icns`);

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  const path = `${OUT_DIR}/.chatsaver.log`;
  const fm = $.NSFileManager.defaultManager;
  if (!fm.fileExistsAtPath(path)) $(line).writeToFileAtomicallyEncodingError(path, true, $.NSUTF8StringEncoding, null);
  else {
    const h = $.NSFileHandle.fileHandleForWritingAtPath(path);
    h.seekToEndOfFile; h.writeData($(line).dataUsingEncoding($.NSUTF8StringEncoding)); h.closeFile;
  }
}
function readFile(path) { return $.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, null).js; }
function writeFile(path, text) {
  const ok = $(text).writeToFileAtomicallyEncodingError(path, true, $.NSUTF8StringEncoding, null);
  if (!ok) throw new Error(`Could not write ${path}`);
}
function ensureDir(path) { $.NSFileManager.defaultManager.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(path, true, $(), null); }
function uniquePath(base, ext) {
  const fm = $.NSFileManager.defaultManager;
  let p = `${base}.${ext}`; let i = 2;
  while (fm.fileExistsAtPath(p)) p = `${base} (${i++}).${ext}`;
  return p;
}
function dialog(text, buttons, opts = {}) {
  app.activate();
  return app.displayDialog(text, Object.assign({ withTitle: 'Chat Saver', buttons, defaultButton: buttons[buttons.length - 1], withIcon: ICON }, opts)).buttonReturned;
}
function fail(text) { log('shown to user: ' + String(text).split('\n')[0]); try { dialog(text, ['OK']); } catch (e) { log('dialog error: ' + e); } }

/* ---------------- Safari side ---------------- */
const safari = Application('Safari');

const AI_HOSTS = /(^|\.)(chatgpt\.com|chat\.openai\.com|claude\.ai|gemini\.google\.com|copilot\.microsoft\.com|poe\.com|perplexity\.ai|chat\.deepseek\.com|grok\.com|glm5\.app|z\.ai|chatglm\.cn|chat\.qwen\.ai|tongyi\.aliyun\.com|kimi\.com|kimi\.moonshot\.cn|chat\.mistral\.ai|meta\.ai|huggingface\.co|character\.ai|pi\.ai|you\.com|phind\.com|aistudio\.google\.com|notebooklm\.google\.com|chat\.lmsys\.org|lmarena\.ai|manus\.im|genspark\.ai|chat\.minimax\.io|doubao\.com|yiyan\.baidu\.com|t3\.chat|openrouter\.ai)$/i;
const hostOf = (u) => String(u || '').replace(/^https?:\/\/(www\.)?/, '').split(/[/?#]/)[0];

/* Find the chat automatically, the way a person would:
   AI site + a conversation URL scores highest; sign-in / settings pages score low.
   If one tab clearly wins it is used without asking; otherwise the best guess is pre-selected. */
const CONVO_PATH = /\/(c|chat|chats|conversation|conversations|thread|threads|share|s|app|t|session|sessions)\/[A-Za-z0-9_-]{6,}/i;
const NOT_CHAT = /sign ?in|log ?in|sign ?up|api ?keys?|settings|pricing|billing|account/i;
function scoreTab(url, name, isFront) {
  const host = hostOf(url);
  let s = 0;
  if (AI_HOSTS.test(host)) s += 50;
  if (CONVO_PATH.test(url.replace(/^https?:\/\/[^/]+/, ''))) s += 40;
  if (NOT_CHAT.test(name) || NOT_CHAT.test(url)) s -= 70;
  if (/huggingface\.co$/.test(host) && !/\/chat\//.test(url)) s -= 45; // model pages, not chats
  if (isFront) s += 15;
  return s;
}
function pickTab() {
  if (!safari.running()) throw new Error('Safari is not open. Open your chat in Safari, then run Chat Saver again.');
  if (!safari.windows.length) throw new Error('No Safari window is open. Open your chat in Safari, then run Chat Saver again.');
  const front = safari.windows[0].currentTab();
  const all = [];
  safari.windows().forEach((w, wi) => {
    let tabs = [];
    try { tabs = w.tabs(); } catch (e) { return; }
    let cur = null;
    try { cur = w.currentTab().index(); } catch (e) { /* ignore */ }
    tabs.forEach((t) => {
      let u = ''; let n = '';
      try { u = String(t.url() || ''); n = String(t.name() || ''); } catch (e) { return; }
      if (!/^https?:/.test(u)) return;
      const isFront = wi === 0 && cur !== null && t.index() === cur;
      all.push({ tab: t, win: w, url: u, name: n || hostOf(u), score: scoreTab(u, n, isFront) });
    });
  });
  if (!all.length) throw new Error('No web pages are open in Safari. Open your chat, then run Chat Saver again.');
  all.sort((a, b) => b.score - a.score);
  const chats = all.filter((x) => x.score >= 90);
  let sel = null;
  if (chats.length === 1) sel = chats[0];
  else if (chats.length > 1 && chats[0].score - chats[1].score >= 15) sel = chats[0]; // the front chat wins
  if (sel) { log(`auto-picked: ${sel.name} (${hostOf(sel.url)}), score ${sel.score}`); }
  else {
    const labels = all.map((x, i) => `${i + 1}. ${x.score >= 90 ? '💬 ' : ''}${x.name.slice(0, 70)} — ${hostOf(x.url)}`);
    app.activate();
    const picked = app.chooseFromList(labels, { withTitle: 'Chat Saver', withPrompt: chats.length ? 'Several chats are open. Which one should I save?' : 'Which Safari tab has the chat you want to save?', defaultItems: [labels[0]], okButtonName: 'Save This Chat' });
    if (!picked) return null;
    sel = all[labels.indexOf(picked[0])];
  }
  // Bring that tab to the front so the page renders while it is read.
  try { sel.win.currentTab = sel.tab; sel.win.index = 1; } catch (e) { log('could not focus tab: ' + e); }
  return sel;
}

/* Open a chat link in Safari (or reuse the tab if it's already open) and wait until it has loaded. */
const normUrl = (u) => String(u || '').replace(/#.*$/, '').replace(/\/+$/, '').toLowerCase();
function openLink(link) {
  if (!safari.running()) { safari.activate(); delay(2); }
  let tab = null; let win = null;
  safari.windows().forEach((w) => {
    if (tab) return;
    try { w.tabs().forEach((t) => { if (!tab && normUrl(t.url()) === normUrl(link)) { tab = t; win = w; } }); } catch (e) { /* ignore */ }
  });
  if (tab) { log('link already open in a tab'); try { win.currentTab = tab; win.index = 1; } catch (e) { /* ignore */ } }
  else {
    if (!safari.windows.length) { safari.Document().make(); delay(1); }
    win = safari.windows[0];
    const t = safari.Tab({ url: link });
    win.tabs.push(t);
    tab = win.tabs[win.tabs.length - 1];
    try { win.currentTab = tab; } catch (e) { /* ignore */ }
    log('opened link in a new tab');
  }
  safari.activate();
  // Wait for the page to load (up to 60 s), then give the chat app a moment to draw its messages.
  const until = Date.now() + 60000;
  let ready = '';
  while (Date.now() < until) {
    delay(1);
    try { ready = js(tab, 'document.readyState'); } catch (e) {
      if (/Apple ?Events|JavaScript from|-1743/i.test(String(e))) { fail(explainJsError(e)); return null; }
      continue;
    }
    if (ready === 'complete') break;
  }
  let last = -1;
  for (let i = 0; i < 8; i++) { // wait until the page text stops growing (chat apps render after load)
    delay(1);
    let n = 0; try { n = js(tab, 'document.body ? document.body.innerText.length : 0'); } catch (e) { /* ignore */ }
    if (n > 200 && n === last) break;
    last = n;
  }
  log(`page ready (${ready})`);
  return tab;
}

function js(tab, code) { return safari.doJavaScript(code, { in: tab }); }

function explainJsError(e) {
  const m = String(e && e.message || e);
  if (/Apple ?Events|JavaScript from/i.test(m)) {
    return 'Safari is blocking Chat Saver.\n\nTurn on one setting (only needed once):\nSafari ▸ Settings ▸ Advanced ▸ tick “Show features for web developers”, then\nSafari ▸ Settings ▸ Developer ▸ tick “Allow JavaScript from Apple Events”.\n\nThen run Chat Saver again.';
  }
  if (/-1743|not allowed|Not authori[sz]ed/i.test(m)) {
    return 'macOS needs your OK for Chat Saver to control Safari.\n\nOpen System Settings ▸ Privacy & Security ▸ Automation, find Chat Saver and switch on Safari. Then run Chat Saver again.';
  }
  return m;
}

/* ---------------- Output: HTML + PDF ---------------- */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');


/* Split message HTML after its first top-level block so the label can stay glued to it. */
function splitFirst(html) {
  let h = html.trim();
  while (/^<div>/i.test(h) && /<\/div>$/i.test(h) && h.slice(5, -6).indexOf('<div') === -1) h = h.slice(5, -6).trim();
  const m = h.match(/^(<(p|pre|ul|ol|h[1-6]|blockquote|table)\b[\s\S]*?<\/\2>)([\s\S]*)$/i);
  return m ? [m[1], m[3]] : ['', h];
}
const firstBlock = (h) => splitFirst(h)[0];
const restBlocks = (h) => splitFirst(h)[1];

function buildHtml(p) {
  const css = readFile(`${RES}/print.css`);
  let body = `<header class="chat-head"><h1>${esc(p.title)}</h1><div class="meta">${esc(p.site)} · ${p.messages.length} messages · saved ${esc(p.savedAtLocal)}<br><a href="${esc(p.url)}">${esc(p.url)}</a></div></header>`;
  for (const m of p.messages) {
    const initial = m.role === 'user' ? 'Y' : esc((m.label || 'A').slice(0, 1).toUpperCase());
    // Keep the name label together with the start of its message (no stranded labels at page ends).
    const head = `<div class="msg-head"><span class="avatar">${initial}</span>${esc(m.label)}</div>`;
    const short = m.html.length < 1800 || m.role === 'user';
    body += short
      ? `<section class="msg ${esc(m.role)} keep">${head}<div class="msg-body">${m.html}</div></section>`
      : `<section class="msg ${esc(m.role)}"><div class="keep">${head}<div class="msg-body lead">${firstBlock(m.html)}</div></div><div class="msg-body">${restBlocks(m.html)}</div></section>`;
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(p.title)}</title><style>${css}</style></head><body><main id="chat">${body}</main></body></html>`;
}

function spin(seconds) { $.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(seconds)); }

function makePdf(htmlPath, pdfPath) {
  const W = 760;
  const win = $.NSWindow.alloc.initWithContentRectStyleMaskBackingDefer($.NSMakeRect(-10000, -10000, W, 1000), 0, $.NSBackingStoreBuffered, false);
  const wv = $.WebView.alloc.initWithFrameFrameNameGroupName($.NSMakeRect(0, 0, W, 1000), $(), $());
  wv.preferences.setShouldPrintBackgrounds(true);
  wv.preferences.setJavaScriptEnabled(false);
  win.setContentView(wv);
  wv.mainFrame.loadRequest($.NSURLRequest.requestWithURL($.NSURL.fileURLWithPath(htmlPath)));
  const until = Date.now() + 45000;
  spin(0.3);
  while (wv.isLoading && Date.now() < until) spin(0.15);
  spin(1.2); // let images and fonts settle

  const pi = $.NSPrintInfo.sharedPrintInfo.copy;
  pi.setPaperSize($.NSMakeSize(595.28, 841.89)); // A4
  pi.setTopMargin(40); pi.setBottomMargin(40); pi.setLeftMargin(36); pi.setRightMargin(36);
  pi.setHorizontalPagination(1); // fit to page width
  pi.setVerticalPagination(0); // automatic page breaks
  pi.setHorizontallyCentered(false); pi.setVerticallyCentered(false);
  pi.setJobDisposition($.NSPrintSaveJob);
  pi.dictionary.setObjectForKey($.NSURL.fileURLWithPath(pdfPath), $.NSPrintJobSavingURL);

  const op = $.NSPrintOperation.printOperationWithViewPrintInfo(wv.mainFrame.frameView.documentView, pi);
  op.setShowsPrintPanel(false);
  op.setShowsProgressPanel(false);
  const ok = op.runOperation;
  win.close;
  if (!ok || !$.NSFileManager.defaultManager.fileExistsAtPath(pdfPath)) throw new Error('macOS could not create the PDF');
}

/* Self-test: builds a sample PDF without touching Safari (triggered by a ".selftest" marker file). */
function selfTest() {
  const p = {
    title: 'Chat Saver self-test', url: 'https://example.com/chat', host: 'example.com', site: 'Self-test',
    savedAtLocal: new Date().toLocaleString(), fileBase: 'selftest', messages: [],
  };
  for (let i = 1; i <= 12; i++) {
    p.messages.push({ role: 'user', label: 'You', html: `<p>Question ${i}: how does this work? नमस्ते 你好</p>` });
    p.messages.push({ role: 'assistant', label: 'AI', html: `<p>Answer <strong>${i}</strong> with <em>formatting</em> and <a href="https://example.com">a link</a>.</p><ul><li>Point one</li><li>Point two<ul><li>Nested</li></ul></li></ul><pre data-lang="python">def f(x):\n    return x * ${i}</pre><table><tr><th>Col A</th><th>Col B</th></tr><tr><td>1</td><td>${i}</td></tr></table><p>${'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(4)}</p>` });
  }
  const html = `${OUT_DIR}/.selftest.html`; const pdf = `${OUT_DIR}/.selftest.pdf`;
  $.NSFileManager.defaultManager.removeItemAtPathError(pdf, null);
  writeFile(html, buildHtml(p));
  try { makePdf(html, pdf); log('selftest ok: ' + pdf); } catch (e) { log('selftest FAILED: ' + e); }
  try { app.displayDialog('Chat Saver self-test finished.', { withTitle: 'Chat Saver', buttons: ['OK'], defaultButton: 'OK', withIcon: ICON, givingUpAfter: 4 }); log('selftest dialog ok'); } catch (e) { log('selftest dialog FAILED: ' + e); }
}

/* ---------------- Main ---------------- */
function run() {
  try { main(); } catch (e) {
    try { log('CRASH: ' + e + (e && e.stack ? ' | ' + e.stack : '')); } catch (x) { /* ignore */ }
    fail('Chat Saver hit an unexpected problem: ' + (e && e.message || e) + '\n\nThe details were saved to Downloads ▸ Chat Saver ▸ .chatsaver.log');
  }
}

function main() {
  ensureDir(OUT_DIR);
  const fm = $.NSFileManager.defaultManager;
  // Self-test only when the marker explicitly says so (a stray marker must never replace a real save).
  const marker = `${OUT_DIR}/.selftest`;
  if (fm.fileExistsAtPath(marker)) {
    let isTest = false;
    try { isTest = readFile(marker).trim() === 'selftest-now'; } catch (e) { /* ignore */ }
    fm.removeItemAtPathError(marker, null);
    if (isTest) { selfTest(); return; }
  }
  log('start');
  let tab;
  try {
    // 1) Ask for a link (pre-filled from the clipboard). Empty = use a chat that's already open.
    let clip = '';
    try { const c = String(app.theClipboard() || '').trim(); if (/^https?:\/\/\S+$/.test(c)) clip = c; } catch (e) { /* ignore */ }
    app.activate();
    let r;
    try {
      r = app.displayDialog('Paste the link of the chat to save:\n\nLeave it empty to save a chat that is already open in Safari.', {
        withTitle: 'Chat Saver', defaultAnswer: clip, buttons: ['Cancel', 'Save Chat'], defaultButton: 'Save Chat', cancelButton: 'Cancel', withIcon: ICON,
      });
    } catch (e) { log('cancelled at link prompt'); return; }
    const link = String(r.textReturned || '').trim();
    if (link) {
      if (!/^https?:\/\//i.test(link)) { fail(`That doesn't look like a web link:\n${link}\n\nCopy the full address from the browser (starting with https://) and try again.`); return; }
      log('link: ' + link);
      tab = openLink(link);
      if (!tab) return;
    } else {
      const sel = pickTab();
      if (!sel) { log('cancelled at tab picker'); return; }
      tab = sel.tab;
    }
  } catch (e) { fail(e.message); return; }

  const url = String(tab.url() || '');
  if (!/^https?:/.test(url)) { fail('That Safari tab is not a web page. Open your AI chat in Safari, then run Chat Saver again.'); return; }
  const host = hostOf(url);
  log('tab: ' + host);

  // Check Safari lets us run the reader before asking anything else.
  try { js(tab, '1'); } catch (e) {
    log('probe failed: ' + e);
    const msg = explainJsError(e);
    if (/Allow JavaScript from Apple Events/.test(msg)) {
      try {
        const b = dialog(msg, ['Cancel', 'Open Safari']);
        if (b === 'Open Safari') safari.activate();
      } catch (x) { /* cancelled */ }
    } else fail(msg);
    return;
  }

  // Always save all three formats — no questions.
  const wantPdf = true; const wantTxt = true; const wantMd = true;
  try { app.displayNotification(`Reading the chat on ${host}…`, { withTitle: 'Chat Saver', subtitle: 'Saving PDF, TXT and Markdown' }); } catch (e) { /* ignore */ }

  // Run the extractor inside the page.
  // Bring Safari (and the chat's window/Space) to the front first: Safari slows down pages that aren't visible.
  try { safari.activate(); delay(1.2); } catch (e) { log('activate: ' + e); }
  try {
    const content = readFile(`${RES}/content.js`);
    js(tab, `${content};\nwindow.__chatSaver.startJob(true);`);
  } catch (e) { log('inject failed: ' + e); fail(explainJsError(e)); return; }
  log('reading chat…');

  // Wait for it (it auto-scrolls the whole chat; long chats take a while).
  let status = 'running';
  const t0 = Date.now();
  let askedToFinish = false; let lastLog = 0;
  while (Date.now() - t0 < 15 * 60 * 1000) {
    delay(0.6);
    let st;
    // Each tick does one scroll/collect step inside the page (works even if Safari has paused the page).
    try { st = JSON.parse(js(tab, 'window.__chatSaver && window.__chatSaver.tick ? window.__chatSaver.tick() : JSON.stringify({s: "missing", n: 0})')); }
    catch (e) { log('poll failed: ' + e); fail(explainJsError(e)); return; }
    status = st.s;
    if (status !== 'running') break;
    const secs = Math.round((Date.now() - t0) / 1000);
    if (secs - lastLog >= 15) { lastLog = secs; log(st.n < 0 ? `loading history… pass ${-st.n} after ${secs}s` : `still reading… ${st.n} messages after ${secs}s`); }
    // Safety net: after 12 minutes, save whatever has been loaded instead of waiting forever.
    if (!askedToFinish && secs > 12 * 60) { askedToFinish = true; log('time limit reached — saving what is loaded'); try { js(tab, 'window.__chatSaver.finishNow()'); } catch (e) { /* ignore */ } }
  }
  log('reader finished: ' + status);
  if (status !== 'done') {
    let err = status;
    try { err = js(tab, 'window.__csState && window.__csState.error || ""') || status; } catch (e) { /* ignore */ }
    log('extract failed: ' + err);
    if (err === 'no-messages') fail('No chat messages were found on that page.\n\nIf it asks you to sign in, sign in once in Safari, open the chat there, and run Chat Saver again.');
    else if (err !== 'cancelled' && err !== 'Cancelled') fail(`Chat Saver could not read this chat (${err}).`);
    return;
  }

  // Fetch the result in chunks.
  const len = js(tab, 'window.__csState.json.length');
  let json = '';
  for (let i = 0; i < len; i += 400000) json += js(tab, `window.__csState.json.slice(${i}, ${i + 400000})`);
  const data = JSON.parse(json);
  const p = data.p;
  log(`got ${p.messages.length} messages from ${p.host}`);

  const base = `${OUT_DIR}/${p.fileBase}`;
  const saved = [];
  try {
    if (wantTxt) { const f = uniquePath(base, 'txt'); writeFile(f, data.txt); saved.push(f); }
    if (wantMd) { const f = uniquePath(base, 'md'); writeFile(f, data.md); saved.push(f); }
    if (wantPdf) {
      const htmlPath = uniquePath(base, 'html');
      writeFile(htmlPath, buildHtml(p));
      const pdfPath = uniquePath(base, 'pdf');
      try { makePdf(htmlPath, pdfPath); saved.unshift(pdfPath); } catch (e) {
        log('pdf failed: ' + e);
        saved.push(htmlPath);
        fail(`The PDF could not be created (${e.message}). A formatted HTML copy was saved instead — open it and press ⌘P ▸ Save as PDF.`);
      }
      if (saved[0] && saved[0].endsWith('.pdf')) $.NSFileManager.defaultManager.removeItemAtPathError(htmlPath, null);
    }
  } catch (e) { log('save failed: ' + e); fail('Could not save the files: ' + e.message); return; }

  const names = saved.map((f) => f.split('/').pop());
  try { js(tab, `window.__chatSaver.overlay.done(${JSON.stringify(`Saved ${p.messages.length} messages`)}, ${JSON.stringify('Downloads ▸ Chat Saver ▸ ' + names[0])})`); } catch (e) { /* ignore */ }
  log('saved: ' + names.join(', '));

  // Check the work, like a person would: files exist and aren't empty, PDF has pages, counts add up.
  const fm2 = $.NSFileManager.defaultManager;
  const sizeOf = (f) => { const a = fm2.attributesOfItemAtPathError(f, null); return a ? Number(a.fileSize) : 0; };
  const problems = [];
  for (const f of saved) if (sizeOf(f) < 50) problems.push(`${f.split('/').pop()} is empty`);
  let pages = 0;
  const pdfFile = saved.find((f) => f.endsWith('.pdf'));
  if (pdfFile) {
    try { try { ObjC.import('PDFKit'); } catch (x) { ObjC.import('Quartz'); } const doc = $.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath(pdfFile)); pages = doc ? Number(doc.pageCount) : 0; } catch (e) { log('pdf check: ' + e); }
    if (!pages) problems.push('the PDF has no pages');
  }
  const you = p.messages.filter((m) => m.role === 'user').length;
  const ai = p.messages.length - you;
  log(`check: ${p.messages.length} messages (${you} you, ${ai} ${p.assistantName}), pdf pages ${pages}, problems: ${problems.join('; ') || 'none'}`);

  // Show the result.
  $.NSWorkspace.sharedWorkspace.activateFileViewerSelectingURLs($.NSArray.arrayWithObject($.NSURL.fileURLWithPath(saved[0])));
  try {
    const summary = `Saved “${p.title}”\n\n${p.messages.length} messages — ${you} from you, ${ai} from ${p.assistantName}` +
      (pages ? `\nPDF: ${pages} pages` : '') + `\n\n${names.join('\n')}\n\nFolder: Downloads ▸ Chat Saver` +
      (problems.length ? `\n\n⚠️ Check: ${problems.join('; ')}` : '\n\n✓ All files checked');
    const b = dialog(summary, ['Done', 'Open ' + (saved[0].endsWith('.pdf') ? 'PDF' : 'file')]);
    if (/^Open/.test(b)) $.NSWorkspace.sharedWorkspace.openURL($.NSURL.fileURLWithPath(saved[0]));
  } catch (e) { log('result dialog: ' + e); }
}
