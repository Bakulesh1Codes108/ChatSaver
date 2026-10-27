#!/usr/bin/env node
/*
 * Chat Saver Desktop — Windows · Linux · macOS
 * Give it a chat link: it opens the chat in your installed Chrome / Edge / Brave,
 * scrolls the whole conversation, and saves PDF + TXT + Markdown to Downloads/Chat Saver.
 *
 *   chatsaver                       ask for a link
 *   chatsaver <link> [<link> ...]   save one or more chats
 *   chatsaver --browser edge <link> use a specific browser (chrome | edge | brave | chromium)
 *   chatsaver --login               open the Chat Saver browser window to sign in to your chat sites
 *
 * Chat Saver uses its own browser profile (so it never touches your everyday profile).
 * Sign in to ChatGPT / Claude / Gemini / GLM … once in that window; it remembers you.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const VERSION = '1.0.0';

/* ---------------- options ---------------- */
const argv = process.argv.slice(2);
const opt = { browser: process.env.CHATSAVER_BROWSER || '', out: '', headless: false, login: false, links: [], open: true };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--browser' || a === '-b') opt.browser = argv[++i];
  else if (a === '--out' || a === '-o') opt.out = argv[++i];
  else if (a === '--headless') opt.headless = true;
  else if (a === '--login') opt.login = true;
  else if (a === '--no-open') opt.open = false;
  else if (a === '--version' || a === '-v') { console.log(VERSION); process.exit(0); }
  else if (a === '--help' || a === '-h') { printHelp(); process.exit(0); }
  else opt.links.push(a);
}
function printHelp() {
  console.log(`Chat Saver Desktop ${VERSION}
Usage: chatsaver [--browser chrome|edge|brave|chromium] [--out <folder>] [--headless] [--login] [links...]
Saves each chat as PDF + TXT + Markdown in Downloads/Chat Saver (or --out).`);
}

/* ---------------- pretty output ---------------- */
const tty = process.stdout.isTTY;
const c = (code, s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
const teal = (s) => c('36', s); const green = (s) => c('32', s); const red = (s) => c('31', s); const dim = (s) => c('2', s); const bold = (s) => c('1', s);
let lastLen = 0;
function status(msg) { if (!tty) return; const line = `  ${msg}`; process.stdout.write(`\r${line}${' '.repeat(Math.max(0, lastLen - line.length))}`); lastLen = line.length; }
function endStatus() { if (tty && lastLen) { process.stdout.write('\r' + ' '.repeat(lastLen) + '\r'); lastLen = 0; } }

/* ---------------- paths ---------------- */
const HOME = os.homedir();
const DATA_DIR = process.platform === 'win32'
  ? path.join(process.env.LOCALAPPDATA || path.join(HOME, 'AppData', 'Local'), 'ChatSaver')
  : process.platform === 'darwin' ? path.join(HOME, 'Library', 'Application Support', 'ChatSaver') : path.join(HOME, '.local', 'share', 'chatsaver');
const PROFILE = path.join(DATA_DIR, 'browser-profile');
const OUT_DIR = opt.out || path.join(downloadsDir(), 'Chat Saver');
const LOG = path.join(DATA_DIR, 'chatsaver.log');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(OUT_DIR, { recursive: true });
const log = (m) => { try { fs.appendFileSync(LOG, `[${new Date().toISOString()}] ${m}\n`); } catch { /* ignore */ } };

function downloadsDir() {
  if (process.platform === 'linux') {
    try { // honour XDG user dirs
      const cfg = fs.readFileSync(path.join(HOME, '.config', 'user-dirs.dirs'), 'utf8');
      const m = cfg.match(/XDG_DOWNLOAD_DIR="([^"]+)"/);
      if (m) return m[1].replace('$HOME', HOME);
    } catch { /* ignore */ }
  }
  return path.join(HOME, 'Downloads');
}

/* ---------------- browser ---------------- */
let pw;
try { pw = await import('playwright-core'); } catch {
  console.error(red('Missing dependency. Run "npm install" in the desktop folder first (or use the installer).'));
  process.exit(1);
}
const { chromium } = pw;

const CANDIDATES = {
  win32: {
    edge: ['%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe', '%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe'],
    chrome: ['%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe', '%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe', '%LOCALAPPDATA%\\Google\\Chrome\\Application\\chrome.exe'],
    brave: ['%ProgramFiles%\\BraveSoftware\\Brave-Browser\\Application\\brave.exe', '%LOCALAPPDATA%\\BraveSoftware\\Brave-Browser\\Application\\brave.exe'],
  },
  darwin: {
    chrome: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
    edge: ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
    brave: ['/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'],
  },
  linux: {
    chrome: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'],
    edge: ['/usr/bin/microsoft-edge', '/usr/bin/microsoft-edge-stable'],
    brave: ['/usr/bin/brave-browser', '/usr/bin/brave'],
    chromium: ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'],
  },
};
const expand = (p) => p.replace(/%([^%]+)%/g, (_, v) => process.env[v] || '');
function findBrowser(pref) {
  const table = CANDIDATES[process.platform] || {};
  const order = pref ? [pref] : (process.platform === 'win32' ? ['edge', 'chrome', 'brave'] : ['chrome', 'edge', 'brave', 'chromium']);
  for (const name of order) {
    for (const p of (table[name] || []).map(expand)) if (p && fs.existsSync(p)) return { name, executablePath: p };
  }
  if (pref && fs.existsSync(pref)) return { name: 'custom', executablePath: pref };
  try { // Playwright's own Chromium, if it was installed with `npx playwright install chromium`
    const p = chromium.executablePath();
    if (p && fs.existsSync(p)) return { name: 'chromium', executablePath: p };
  } catch { /* ignore */ }
  return null;
}

/* ---------------- shared files ---------------- */
const CONTENT_JS = fs.readFileSync(path.join(ROOT, 'extension', 'content.js'), 'utf8');
const PRINT_CSS = fs.readFileSync(path.join(ROOT, 'mac-app', 'print.css'), 'utf8');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function splitFirst(html) {
  let h = html.trim();
  while (/^<div>/i.test(h) && /<\/div>$/i.test(h) && h.slice(5, -6).indexOf('<div') === -1) h = h.slice(5, -6).trim();
  const m = h.match(/^(<(p|pre|ul|ol|h[1-6]|blockquote|table)\b[\s\S]*?<\/\2>)([\s\S]*)$/i);
  return m ? [m[1], m[3]] : ['', h];
}
function buildHtml(p) {
  let body = `<header class="chat-head"><h1>${esc(p.title)}</h1><div class="meta">${esc(p.site)} · ${p.messages.length} messages · saved ${esc(p.savedAtLocal)}<br><a href="${esc(p.url)}">${esc(p.url)}</a></div></header>`;
  for (const m of p.messages) {
    const initial = m.role === 'user' ? 'Y' : esc((m.label || 'A').slice(0, 1).toUpperCase());
    const head = `<div class="msg-head"><span class="avatar">${initial}</span>${esc(m.label)}</div>`;
    const short = m.html.length < 1800 || m.role === 'user';
    const [first, rest] = splitFirst(m.html);
    body += short
      ? `<section class="msg ${esc(m.role)} keep">${head}<div class="msg-body">${m.html}</div></section>`
      : `<section class="msg ${esc(m.role)}"><div class="keep">${head}<div class="msg-body lead">${first}</div></div><div class="msg-body">${rest}</div></section>`;
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(p.title)}</title><style>${PRINT_CSS}
@page { size: A4; margin: 14mm 12mm 16mm; } #chat { width: auto; }</style></head><body><main id="chat">${body}</main></body></html>`;
}
function uniquePath(base, ext) {
  let p = `${base}.${ext}`; let i = 2;
  while (fs.existsSync(p)) p = `${base} (${i++}).${ext}`;
  return p;
}
const pdfPages = (buf) => (buf.toString('latin1').match(/\/Type\s*\/Page(?!s)/g) || []).length;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- one chat ---------------- */
async function saveChat(ctx, pdfBrowser, link) {
  const t0 = Date.now();
  log('link: ' + link);
  const page = await ctx.newPage();
  status(`Opening ${new URL(link).hostname} …`);
  await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 90000 });
  try { await page.waitForLoadState('load', { timeout: 30000 }); } catch { /* slow sites: carry on */ }
  // chat apps render after load: wait until the page text stops growing
  let last = -1;
  for (let i = 0; i < 10; i++) {
    await sleep(1000);
    const n = await page.evaluate(() => (document.body ? document.body.innerText.length : 0)).catch(() => 0);
    if (n > 200 && n === last) break;
    last = n;
  }
  await page.evaluate(`${CONTENT_JS};\nwindow.__chatSaver.startJob(true);`);
  let st = { s: 'running', n: 0 };
  const until = Date.now() + 15 * 60 * 1000; let asked = false;
  while (Date.now() < until) {
    await sleep(600);
    st = JSON.parse(await page.evaluate(() => window.__chatSaver.tick()));
    if (st.s !== 'running') break;
    const secs = Math.round((Date.now() - t0) / 1000);
    status(st.n < 0 ? `Loading history … pass ${-st.n}` : `Reading … ${st.n} messages (${secs}s)`);
    if (!asked && Date.now() - t0 > 12 * 60 * 1000) { asked = true; await page.evaluate(() => window.__chatSaver.finishNow()); }
  }
  endStatus();
  if (st.s !== 'done') {
    const err = await page.evaluate(() => (window.__csState && window.__csState.error) || '').catch(() => '');
    await page.close();
    if (err === 'no-messages') throw new Error('No chat messages found on that page. If it asks you to sign in, run "chatsaver --login", sign in, and try again.');
    throw new Error(`Could not read this chat (${err || st.s}).`);
  }
  const data = JSON.parse(await page.evaluate(() => window.__csState.json));
  const p = data.p;
  const base = path.join(OUT_DIR, p.fileBase);
  const files = [];
  const txt = uniquePath(base, 'txt'); fs.writeFileSync(txt, data.txt, 'utf8'); files.push(txt);
  const md = uniquePath(base, 'md'); fs.writeFileSync(md, data.md, 'utf8'); files.push(md);

  status('Making the PDF …');
  const pdfPath = uniquePath(base, 'pdf');
  const pp = await pdfBrowser.newPage();
  await pp.setContent(buildHtml(p), { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await pp.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  const buf = await pp.pdf({
    format: 'A4', printBackground: true, margin: { top: '14mm', bottom: '16mm', left: '12mm', right: '12mm' },
    displayHeaderFooter: true, headerTemplate: '<span></span>',
    footerTemplate: `<div style="width:100%;font:8px -apple-system,Segoe UI,sans-serif;color:#94a3b8;padding:0 12mm;display:flex;justify-content:space-between"><span>${esc(p.host)}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
  });
  await pp.close();
  fs.writeFileSync(pdfPath, buf); files.unshift(pdfPath);
  endStatus();

  try { await page.evaluate((n) => window.__chatSaver.overlay.done(`Saved ${n} messages`, 'Downloads ▸ Chat Saver'), p.messages.length); } catch { /* ignore */ }
  setTimeout(() => page.close().catch(() => {}), 2500);

  // check the work
  const problems = files.filter((f) => fs.statSync(f).size < 50).map((f) => `${path.basename(f)} is empty`);
  const pages = pdfPages(buf);
  if (!pages) problems.push('the PDF has no pages');
  const you = p.messages.filter((m) => m.role === 'user').length;
  const ai = p.messages.length - you;
  log(`saved ${p.messages.length} msgs (${you}/${ai}) pdf ${pages}p: ${files.map((f) => path.basename(f)).join(', ')}; problems: ${problems.join('; ') || 'none'}`);
  return { p, files, pages, you, ai, problems, secs: Math.round((Date.now() - t0) / 1000) };
}

function openFolder(file) {
  try {
    if (process.platform === 'win32') spawn('explorer.exe', ['/select,', file], { detached: true, stdio: 'ignore' }).unref();
    else if (process.platform === 'darwin') spawn('open', ['-R', file], { detached: true, stdio: 'ignore' }).unref();
    else spawn('xdg-open', [path.dirname(file)], { detached: true, stdio: 'ignore' }).unref();
  } catch { /* ignore */ }
}

/* ---------------- main ---------------- */
async function main() {
  console.log(`\n  ${bold(teal('Chat Saver'))} ${dim('Desktop ' + VERSION)}\n`);
  const found = findBrowser(opt.browser);
  if (!found) {
    console.error(red('  No Chrome, Edge or Brave found.') + '\n  Install one of them, or run: npx playwright install chromium');
    process.exit(1);
  }
  log(`start ${VERSION} browser=${found.name}`);

  if (!opt.links.length && !opt.login) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ans = (await rl.question(`  Paste the chat link ${dim('(several: separate with spaces)')}:\n  > `)).trim();
    rl.close();
    opt.links = ans.split(/\s+/).filter(Boolean);
    console.log('');
  }
  const bad = opt.links.filter((l) => !/^https?:\/\//i.test(l));
  if (bad.length) { console.error(red(`  Not a web link: ${bad.join(', ')}`)); process.exit(1); }

  const ctx = await chromium.launchPersistentContext(PROFILE, {
    executablePath: found.executablePath, headless: opt.headless, viewport: null,
    args: ['--no-first-run', '--no-default-browser-check', '--window-size=1280,900'],
  });
  if (opt.login) {
    const pg = ctx.pages()[0] || await ctx.newPage();
    await pg.goto('about:blank');
    console.log(`  A ${found.name} window opened with Chat Saver's own profile.\n  Sign in to your chat sites there (ChatGPT, Claude, Gemini, GLM …), then close the window.\n`);
    await new Promise((r) => ctx.on('close', r));
    console.log(green('  ✓ Saved. Chat Saver will stay signed in.\n'));
    return;
  }
  const pdfBrowser = await chromium.launch({ executablePath: found.executablePath, headless: true });
  let ok = 0;
  for (const link of opt.links) {
    console.log(`  ${dim('→')} ${link}`);
    try {
      const r = await saveChat(ctx, pdfBrowser, link);
      ok++;
      console.log(`  ${green('✓')} ${bold(r.p.title)}`);
      console.log(`    ${r.p.messages.length} messages — ${r.you} from you, ${r.ai} from ${r.p.assistantName} · PDF ${r.pages} page${r.pages === 1 ? "" : "s"} · ${r.secs}s`);
      for (const f of r.files) console.log(`    ${dim(path.basename(f))}`);
      console.log(r.problems.length ? `    ${red('⚠ ' + r.problems.join('; '))}` : `    ${green('✓ All files checked')}`);
      console.log('');
      if (opt.open && ok === 1) openFolder(r.files[0]);
    } catch (e) {
      endStatus();
      log('error: ' + (e.stack || e));
      console.log(`  ${red('✗')} ${e.message}\n`);
    }
  }
  await pdfBrowser.close();
  await ctx.close();
  console.log(`  ${ok}/${opt.links.length} saved to ${OUT_DIR}\n`);
  process.exitCode = ok === opt.links.length ? 0 : 1;
}

main().catch((e) => {
  endStatus();
  log('fatal: ' + (e.stack || e));
  const msg = String(e.message || e);
  if (/ProcessSingleton|profile.*in use|lock/i.test(msg)) console.error(red('  The Chat Saver browser window is already open — close it and try again.'));
  else console.error(red('  ' + msg));
  process.exit(1);
});
