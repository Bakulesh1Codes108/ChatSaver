/* Chat Saver — export page: renders the saved chat and builds the PDF. */
const api = globalThis.browser ?? globalThis.chrome;
const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.hash.slice(1));
let chat = null;

/* ---------- helpers ---------- */
/* Notice area: banner(text, kind, {progress, links}) — kind: 'busy' | 'ok' | 'err' */
function banner(text, kind, opts = {}) {
  const b = $('#banner');
  b.hidden = !text;
  if (!text) return;
  b.className = `notice ${kind || ''}`;
  const ic = b.querySelector('.notice-icon'); ic.innerHTML = '';
  const name = kind === 'ok' ? 'check-circle' : kind === 'err' ? 'warning-circle' : 'arrows-clockwise';
  const svg = icon(ICONS[name] ? name : 'file-pdf', 20);
  if (kind === 'busy') svg.classList.add('spin');
  ic.append(svg);
  b.querySelector('.notice-text').textContent = text;
  const links = b.querySelector('.notice-links'); links.innerHTML = '';
  for (const l of opts.links || []) links.append(l);
  const bar = b.querySelector('.progress');
  bar.hidden = opts.progress == null;
  if (opts.progress != null) bar.firstElementChild.style.width = `${Math.round(opts.progress * 100)}%`;
}
function link(text, onClick, iconName) {
  const a = document.createElement('button');
  a.className = 'btn'; a.type = 'button';
  if (iconName) a.append(icon(iconName, 16));
  a.append(text);
  a.addEventListener('click', onClick);
  return a;
}
const forceLight = (on) => { if (on) document.documentElement.dataset.theme = 'light'; else delete document.documentElement.dataset.theme; };
window.addEventListener('beforeprint', () => forceLight(true));
window.addEventListener('afterprint', () => forceLight(false));
function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/* Re-sanitise stored HTML: only a small set of tags and safe attributes survive. */
const ALLOWED = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'BLOCKQUOTE',
  'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TH', 'TD', 'HR', 'BR', 'SPAN', 'A', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'DEL',
  'CODE', 'PRE', 'SUP', 'SUB', 'MARK', 'KBD', 'SMALL', 'FIGURE', 'FIGCAPTION', 'DETAILS', 'SUMMARY', 'DL', 'DT', 'DD', 'IMG']);
const ATTRS = { A: ['href'], IMG: ['src', 'alt'], TD: ['colspan', 'rowspan'], TH: ['colspan', 'rowspan'], OL: ['start'], PRE: ['data-lang'] };
function sanitize(html) {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const walk = (node) => {
    for (const el of [...node.children]) {
      if (!ALLOWED.has(el.tagName)) { el.replaceWith(...el.childNodes); walk(node); return; }
      for (const a of [...el.attributes]) if (!(ATTRS[el.tagName] || []).includes(a.name)) el.removeAttribute(a.name);
      if (el.tagName === 'A') {
        if (!/^https?:/i.test(el.getAttribute('href') || '')) el.removeAttribute('href');
        el.target = '_blank'; el.rel = 'noopener noreferrer';
      }
      if (el.tagName === 'IMG' && !/^(https?:|data:image\/)/i.test(el.getAttribute('src') || '')) { el.remove(); continue; }
      if (el.tagName === 'IMG') el.setAttribute('crossorigin', 'anonymous');
      walk(el);
    }
  };
  const root = doc.body.firstElementChild;
  walk(root);
  return root;
}

/* ---------- render ---------- */
function render(p) {
  document.title = `${p.title} — Chat Saver`;
  $('#bar-chat-title').textContent = p.title;
  const main = $('#chat');
  main.innerHTML = '';
  const head = document.createElement('header');
  head.className = 'chat-head';
  const h1 = document.createElement('h1'); h1.textContent = p.title;
  const meta = document.createElement('div'); meta.className = 'meta';
  const item = (iconName, ...content) => { const s = document.createElement('span'); s.append(icon(iconName, 14), ...content); return s; };
  const src = document.createElement('a'); src.href = p.url; src.textContent = p.url.replace(/^https?:\/\//, ''); src.target = '_blank'; src.rel = 'noopener noreferrer';
  meta.append(item('chat-circle-dots', `${p.site} · ${p.messages.length} messages`), item('check-circle', `Saved ${p.savedAtLocal}`), item('arrow-square-out', src));
  head.append(h1, meta);
  main.appendChild(head);

  for (const m of p.messages) {
    const sec = document.createElement('section');
    sec.className = `msg ${m.role}`;
    const mh = document.createElement('div'); mh.className = 'msg-head';
    const dot = document.createElement('span'); dot.className = 'avatar'; dot.setAttribute('aria-hidden', 'true');
    dot.textContent = m.role === 'user' ? 'Y' : (m.label || 'A').slice(0, 1).toUpperCase();
    mh.append(dot, m.label);
    const body = sanitize(m.html);
    body.className = 'msg-body';
    sec.append(mh, body);
    main.appendChild(sec);
  }
}

function asText(p, kind) {
  const md = kind === 'md'; const rule = '─'.repeat(48);
  let s = md
    ? `# ${p.title}\n\n- Source: ${p.url}\n- Saved: ${p.savedAtLocal}\n- Messages: ${p.messages.length}\n\n---\n\n`
    : `${p.title}\n${'='.repeat(Math.min(60, Math.max(10, p.title.length)))}\nSource:   ${p.url}\nSaved:    ${p.savedAtLocal}\nMessages: ${p.messages.length}\n\n${rule}\n\n`;
  p.messages.forEach((m, i) => {
    s += md ? `## ${m.label}\n\n${m.md}\n\n---\n\n` : `[${m.label}]\n\n${m.txt}\n\n${i < p.messages.length - 1 ? rule + '\n\n' : ''}`;
  });
  return s.trimEnd() + '\n';
}

/* ---------- one-click PDF ---------- */
function waitImages() {
  const imgs = [...document.querySelectorAll('#chat img')];
  return Promise.all(imgs.map((img) => (img.complete ? null : new Promise((r) => {
    img.addEventListener('load', r, { once: true }); img.addEventListener('error', () => { img.remove(); r(); }, { once: true });
    setTimeout(r, 8000);
  }))));
}

// Find a row with no ink (all pixels the same colour) near `y`, searching upwards.
function findCleanCut(canvas, y, searchPx) {
  const ctx = canvas.getContext('2d');
  const top = Math.max(0, y - searchPx);
  const h = y - top;
  if (h <= 0) return y;
  const data = ctx.getImageData(0, top, canvas.width, h).data;
  const w = canvas.width;
  for (let row = h - 1; row >= 0; row--) {
    const base = row * w * 4;
    const r0 = data[base], g0 = data[base + 1], b0 = data[base + 2];
    let clean = true;
    for (let x = 0; x < w; x += 3) {
      const i = base + x * 4;
      if (Math.abs(data[i] - r0) + Math.abs(data[i + 1] - g0) + Math.abs(data[i + 2] - b0) > 24) { clean = false; break; }
    }
    if (clean) return top + row;
  }
  return y;
}

async function makePdf() {
  const { jsPDF } = window.jspdf;
  const btn = $('#btn-pdf'); btn.disabled = true;
  banner('Creating PDF…', 'busy', { progress: 0 });
  await document.fonts?.ready;
  await waitImages();
  forceLight(true);
  document.body.classList.add('pdf-mode');
  window.scrollTo(0, 0);

  try {
    const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
    const PW = pdf.internal.pageSize.getWidth(); const PH = pdf.internal.pageSize.getHeight();
    const M = 34; const FOOT = 16;
    const CW = PW - 2 * M; const CH = PH - 2 * M - FOOT;
    const article = $('#chat');
    const k = CW / article.offsetWidth; // pt per CSS px
    const pageCss = CH / k;
    const SCALE = 2;

    // Break the chat into units that we never split (unless a single unit is taller than a page).
    const units = [];
    const add = (el) => { el.dataset.unit = String(units.length); units.push(el); };
    add(article.querySelector('.chat-head'));
    const heads = new Set();
    for (const msg of article.querySelectorAll('.msg')) {
      // AI answers flow across pages block by block; short user bubbles stay whole.
      let body = msg.querySelector('.msg-body');
      // Step through single wrapper <div>s to reach the real paragraphs/lists/code blocks.
      while (body.children.length === 1 && /^(DIV|SECTION|ARTICLE)$/.test(body.firstElementChild.tagName)
        && body.firstElementChild.textContent.trim() === body.textContent.trim()) body = body.firstElementChild;
      if (body.children.length > 1 && (!msg.classList.contains('user') || msg.offsetHeight > pageCss * 0.85)) {
        msg.dataset.group = '1';
        heads.add(units.length);
        add(msg.querySelector('.msg-head'));
        for (const c of body.children) add(c);
      } else add(msg);
    }
    const tops = units.map((u) => u.getBoundingClientRect().top);
    const lastRect = units[units.length - 1].getBoundingClientRect();
    tops.push(lastRect.bottom + 8);
    const heights = units.map((_, i) => tops[i + 1] - tops[i]);

    const pages = []; let cur = []; let h = 0;
    units.forEach((_, i) => {
      // Keep a message's name label together with its first block.
      const need = heads.has(i) && i + 1 < units.length ? heights[i] + Math.min(heights[i + 1], pageCss * 0.3) : heights[i];
      if (cur.length && h + need > pageCss) { pages.push(cur); cur = []; h = 0; }
      cur.push(i); h += heights[i];
    });
    if (cur.length) pages.push(cur);

    let pageNo = 0;
    const addCanvasToPdf = (cv) => {
      if (pageNo++ > 0) pdf.addPage();
      const jpg = cv.toDataURL('image/jpeg', 0.82);
      pdf.addImage(jpg, 'JPEG', M, M, CW, (cv.height / SCALE) * k, undefined, 'FAST');
    };

    for (let pi = 0; pi < pages.length; pi++) {
      banner(`Creating PDF · page ${pi + 1} of ${pages.length}`, 'busy', { progress: pi / pages.length });
      const inRange = new Set(pages[pi]);
      const groupHas = (g) => [...g.querySelectorAll('[data-unit]')].some((u) => inRange.has(+u.dataset.unit));
      const canvas = await html2canvas(article, {
        scale: SCALE, backgroundColor: '#ffffff', useCORS: true, logging: false, imageTimeout: 8000,
        windowWidth: document.documentElement.clientWidth, scrollX: 0, scrollY: 0,
        ignoreElements: (el) => {
          if (el.id === 'toolbar' || el.id === 'banner') return true;
          const u = el.dataset?.unit;
          if (u !== undefined) return !inRange.has(+u);
          if (el.dataset?.group) return !groupHas(el);
          return false;
        },
      });

      const pagePx = Math.floor(pageCss * SCALE);
      if (canvas.height <= pagePx + 2) { addCanvasToPdf(canvas); continue; }
      // A single unit taller than a page (very long code block, table, …): slice it at blank rows.
      let y = 0;
      while (y < canvas.height - 2) {
        let end = Math.min(canvas.height, y + pagePx);
        if (end < canvas.height) end = findCleanCut(canvas, end, Math.floor(pagePx * 0.15));
        if (end <= y + 20) end = Math.min(canvas.height, y + pagePx);
        const slice = document.createElement('canvas');
        slice.width = canvas.width; slice.height = end - y;
        const sctx = slice.getContext('2d');
        sctx.fillStyle = '#fff'; sctx.fillRect(0, 0, slice.width, slice.height);
        sctx.drawImage(canvas, 0, y, canvas.width, end - y, 0, 0, canvas.width, end - y);
        addCanvasToPdf(slice);
        y = end;
      }
    }

    const total = pdf.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      pdf.setPage(i);
      pdf.setFontSize(8); pdf.setTextColor(150);
      pdf.text(`${chat.host}`, M, PH - M + 6);
      pdf.text(`Page ${i} of ${total}`, PW - M, PH - M + 6, { align: 'right' });
    }
    pdf.setProperties({ title: chat.title, subject: chat.url, creator: 'Chat Saver' });

    const blob = pdf.output('blob');
    const name = `${chat.fileBase}.pdf`;
    saveBlob(blob, name);
    banner(`PDF downloaded · ${total} pages. Check your Downloads folder.`, 'ok', { links: [
      link('Download again', () => saveBlob(blob, name), 'download-simple'),
      link('Open PDF', () => window.open(URL.createObjectURL(blob), '_blank'), 'arrow-square-out'),
    ] });
  } catch (e) {
    console.error(e);
    banner(`PDF failed: ${e.message}`, 'err', { links: [link('Use selectable PDF instead', () => window.print(), 'printer')] });
  } finally {
    document.body.classList.remove('pdf-mode');
    forceLight(false);
    btn.disabled = false;
  }
}

/* ---------- boot ---------- */
async function load() {
  const id = params.get('id');
  if (!id) { banner('Nothing to show yet. Open a chat and click the Chat Saver button.', 'err'); return null; }
  const got = await api.storage.local.get(id);
  const p = got?.[id];
  if (!p) { banner('This saved chat is no longer available. Save it again from the chat page.', 'err'); return null; }
  // Keep only the 5 most recent saved chats.
  const all = await api.storage.local.get(null);
  const old = Object.keys(all).filter((key) => key.startsWith('chat_')).sort().slice(0, -5);
  if (old.length) api.storage.local.remove(old);
  return p;
}

(async () => {
  hydrateIcons();
  try {
    chat = await load();
    if (!chat) return;
    render(chat);
    $('#btn-pdf').onclick = makePdf;
    $('#btn-print').onclick = () => window.print();
    $('#btn-txt').onclick = () => saveBlob(new Blob([asText(chat, 'txt')], { type: 'text/plain;charset=utf-8' }), `${chat.fileBase}.txt`);
    $('#btn-md').onclick = () => saveBlob(new Blob([asText(chat, 'md')], { type: 'text/markdown;charset=utf-8' }), `${chat.fileBase}.md`);
    $('#btn-copy').onclick = async () => {
      await navigator.clipboard.writeText(asText(chat, 'txt'));
      banner('Copied the whole chat to the clipboard.', 'ok');
    };
    const action = params.get('action');
    if (action === 'pdf') makePdf();
    else if (action === 'print') { await waitImages(); setTimeout(() => window.print(), 300); }
  } catch (e) {
    console.error(e);
    banner('Error: ' + e.message, 'err');
  }
})();
