/*
 * Chat Saver — content script.
 * Finds the conversation on the current page, auto-scrolls to load the whole
 * history, extracts every message (with roles, code, lists, tables, math),
 * then downloads TXT / Markdown directly or hands the chat to the export page
 * for PDF.
 */
(() => {
  const CS_VERSION = '1.6';
  if (window.__chatSaverLoaded === CS_VERSION) return;
  window.__chatSaverLoaded = CS_VERSION;

  const api = globalThis.browser ?? globalThis.chrome;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const host = location.hostname.replace(/^www\./, '');

  /* ------------------------------------------------------------------ */
  /* Site adapters: exact selectors for the big chat apps.               */
  /* Anything not listed (or if a site changes its markup) falls back    */
  /* to the generic detector further down.                               */
  /* ------------------------------------------------------------------ */
  const ADAPTERS = [
    {
      name: 'ChatGPT', test: /(^|\.)(chatgpt\.com|chat\.openai\.com)$/,
      sel: '[data-message-author-role]',
      role: (el) => (el.getAttribute('data-message-author-role') === 'user' ? 'user' : 'assistant'),
      content: (el) => el.querySelector('.markdown') || el.querySelector('.whitespace-pre-wrap') || el,
    },
    {
      name: 'Claude', test: /(^|\.)claude\.ai$/,
      sel: '[data-testid="user-message"], .font-claude-response, .font-claude-message, [data-is-streaming] .standard-markdown',
      role: (el) => (el.matches('[data-testid="user-message"]') ? 'user' : 'assistant'),
    },
    {
      name: 'Gemini', test: /(^|\.)gemini\.google\.com$/,
      sel: 'user-query, model-response',
      role: (el) => (el.tagName.toLowerCase() === 'user-query' ? 'user' : 'assistant'),
      content: (el) => el.querySelector('.query-text') || el.querySelector('message-content') || el,
    },
    {
      name: 'Copilot', test: /(^|\.)copilot\.microsoft\.com$/,
      sel: '[data-content="user-message"], [data-content="ai-message"]',
      role: (el) => (el.getAttribute('data-content') === 'user-message' ? 'user' : 'assistant'),
    },
    {
      name: 'Poe', test: /(^|\.)poe\.com$/,
      sel: '[class*="Message_humanMessageBubble"], [class*="Message_botMessageBubble"]',
      role: (el) => (/human/i.test(el.className) ? 'user' : 'assistant'),
    },
    {
      name: 'Perplexity', test: /(^|\.)perplexity\.ai$/,
      sel: '[class*="group/query"], [id^="markdown-content"]',
      role: (el) => (el.matches('[id^="markdown-content"]') ? 'assistant' : 'user'),
    },
    {
      name: 'DeepSeek', test: /(^|\.)chat\.deepseek\.com$/,
      sel: '.ds-message',
      role: (el) => (el.querySelector('.ds-markdown') ? 'assistant' : 'user'),
    },
    { name: 'Grok', test: /(^|\.)grok\.com$/ },
    { name: 'GLM', test: /(^|\.)(glm5\.app|chat\.z\.ai|chatglm\.cn|z\.ai)$/ },
    { name: 'Qwen', test: /(^|\.)(chat\.qwen\.ai|tongyi\.aliyun\.com)$/ },
    { name: 'Kimi', test: /(^|\.)(kimi\.com|kimi\.moonshot\.cn)$/ },
    { name: 'Mistral', test: /(^|\.)chat\.mistral\.ai$/ },
    { name: 'Meta AI', test: /(^|\.)meta\.ai$/ },
    { name: 'HuggingChat', test: /(^|\.)huggingface\.co$/ },
    { name: 'Character.AI', test: /(^|\.)character\.ai$/ },
    { name: 'Pi', test: /(^|\.)pi\.ai$/ },
  ];
  const adapter = ADAPTERS.find((a) => a.test.test(host)) || null;
  const assistantName = adapter ? adapter.name : 'AI';

  /* ------------------------------------------------------------------ */
  /* Progress overlay (styled via CSSOM so strict page CSPs can't block) */
  /* ------------------------------------------------------------------ */
  // Design tokens from design-system/chat-saver/MASTER.md (UI UX Pro Max).
  let cancelled = false;
  let finishEarly = false; // "Save now" — stop scrolling and save what is loaded
  const now = () => Date.now();
  const overlay = (() => {
    let box, step, text, bar, btn, badge;
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const T = dark
      ? { card: '#111C1B', fg: '#E6FFFA', muted: '#9FB3B0', border: '#23403C', track: '#1A2A29', primary: '#2DD4BF', ok: '#34D399', err: '#F87171' }
      : { card: '#FFFFFF', fg: '#134E4A', muted: '#475569', border: '#CDEDE7', track: '#E8F1F4', primary: '#0F766E', ok: '#047857', err: '#DC2626' };
    const css = (el, s) => Object.assign(el.style, s);
    const PATHS = {
      busy: 'M197.67,186.37a8,8,0,0,1,0,11.29C196.58,198.73,170.82,224,128,224c-37.39,0-64.53-22.4-80-39.85V208a8,8,0,0,1-16,0V160a8,8,0,0,1,8-8H88a8,8,0,0,1,0,16H55.44C67.76,183.35,93,208,128,208c36,0,58.14-21.46,58.36-21.68A8,8,0,0,1,197.67,186.37ZM216,40a8,8,0,0,0-8,8V71.85C192.53,54.4,165.39,32,128,32,85.18,32,59.42,57.27,58.34,58.34a8,8,0,0,0,11.3,11.34C69.86,69.46,92,48,128,48c35,0,60.24,24.65,72.56,40H168a8,8,0,0,0,0,16h48a8,8,0,0,0,8-8V48A8,8,0,0,0,216,40Z',
      ok: 'M173.66,98.34a8,8,0,0,1,0,11.32l-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35A8,8,0,0,1,173.66,98.34ZM232,128A104,104,0,1,1,128,24,104.11,104.11,0,0,1,232,128Zm-16,0a88,88,0,1,0-88,88A88.1,88.1,0,0,0,216,128Z',
      err: 'M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm-8-80V80a8,8,0,0,1,16,0v56a8,8,0,0,1-16,0Zm20,36a12,12,0,1,1-12-12A12,12,0,0,1,140,172Z',
    };
    let spinAnim = null;
    function setIcon(kind, color) {
      const ns = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(ns, 'svg');
      for (const [k, v] of Object.entries({ viewBox: '0 0 256 256', width: '20', height: '20', fill: color, 'aria-hidden': 'true' })) svg.setAttribute(k, v);
      const path = document.createElementNS(ns, 'path'); path.setAttribute('d', PATHS[kind]); svg.appendChild(path);
      badge.replaceChildren(svg);
      spinAnim?.cancel(); spinAnim = null;
      if (kind === 'busy' && !still && badge.firstChild.animate) {
        spinAnim = badge.firstChild.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(360deg)' }], { duration: 1100, iterations: Infinity });
      }
    }
    return {
      show() {
        if (box) return;
        box = document.createElement('div');
        box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite');
        box.setAttribute('data-chatsaver-ignore', '');
        css(box, {
          position: 'fixed', top: '16px', right: '16px', zIndex: '2147483647', width: '320px', boxSizing: 'border-box',
          padding: '16px', borderRadius: '14px', background: T.card, color: T.fg, border: `1px solid ${T.border}`,
          font: '14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif', textAlign: 'left',
          boxShadow: '0 1px 3px rgba(15,23,42,.08), 0 12px 32px rgba(15,23,42,.14)',
          opacity: '0', transform: 'translateY(-6px)', transition: still ? 'none' : 'opacity .2s ease, transform .2s ease',
        });
        const top = document.createElement('div');
        css(top, { display: 'flex', alignItems: 'center', gap: '10px' });
        badge = document.createElement('span');
        css(badge, { display: 'inline-flex', flex: 'none' });
        const titles = document.createElement('div');
        css(titles, { display: 'grid', gap: '1px', minWidth: '0' });
        const brand = document.createElement('div');
        brand.textContent = 'CHAT SAVER';
        css(brand, { fontSize: '10.5px', fontWeight: '700', letterSpacing: '.07em', color: T.primary });
        step = document.createElement('div');
        css(step, { fontWeight: '600', fontSize: '14px' });
        titles.append(brand, step);
        top.append(badge, titles);
        text = document.createElement('div');
        css(text, { marginTop: '8px', fontSize: '13px', color: T.muted });
        const track = document.createElement('div');
        css(track, { height: '6px', background: T.track, borderRadius: '999px', marginTop: '12px', overflow: 'hidden' });
        bar = document.createElement('div');
        css(bar, { height: '100%', width: '4%', background: T.primary, borderRadius: '999px', transition: still ? 'none' : 'width .25s ease' });
        track.appendChild(bar);
        btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = 'Cancel';
        css(btn, {
          marginTop: '12px', minHeight: '36px', padding: '0 14px', border: `1px solid ${T.border}`, borderRadius: '9px',
          background: 'transparent', color: T.fg, cursor: 'pointer', font: '500 13px/1 inherit', fontFamily: 'inherit',
        });
        btn.onmouseenter = () => { btn.style.borderColor = T.primary; };
        btn.onmouseleave = () => { btn.style.borderColor = T.border; };
        btn.onclick = () => { if (btn.dataset.done) overlay.hide(); else { cancelled = true; step.textContent = 'Cancelling…'; } };
        const save = document.createElement('button');
        save.type = 'button';
        save.textContent = 'Save now';
        save.title = 'Stop scrolling and save the messages loaded so far';
        css(save, {
          marginTop: '12px', marginLeft: '8px', minHeight: '36px', padding: '0 14px', border: '0', borderRadius: '9px',
          background: T.primary, color: dark ? '#042F2E' : '#fff', cursor: 'pointer', font: '600 13px/1 inherit', fontFamily: 'inherit',
        });
        save.onclick = () => { finishEarly = true; save.remove(); step.textContent = 'Saving what is loaded…'; };
        overlay._save = save;
        box.append(top, text, track, btn, save);
        setIcon('busy', T.primary);
        document.documentElement.appendChild(box);
        requestAnimationFrame(() => { box.style.opacity = '1'; box.style.transform = 'none'; });
      },
      set(stepText, detail, pct) {
        if (!box) return;
        step.textContent = stepText;
        text.textContent = detail || '';
        if (pct != null) bar.style.width = Math.max(4, Math.min(100, pct)) + '%';
      },
      done(stepText, detail) {
        if (!box) return;
        step.textContent = stepText; text.textContent = detail || '';
        bar.style.width = '100%'; bar.style.background = T.ok; setIcon('ok', T.ok);
        btn.textContent = 'Close'; btn.dataset.done = '1'; overlay._save?.remove();
        setTimeout(() => overlay.hide(), 6000);
      },
      fail(stepText, detail) {
        if (!box) return;
        step.textContent = stepText; text.textContent = detail || '';
        bar.style.background = T.err; bar.style.width = '100%'; setIcon('err', T.err);
        btn.textContent = 'Close'; btn.dataset.done = '1'; overlay._save?.remove();
      },
      hide() { spinAnim?.cancel(); box?.remove(); box = null; },
    };
  })();

  /* ------------------------------------------------------------------ */
  /* Scrolling helpers (handle window scroll and column-reverse lists)   */
  /* ------------------------------------------------------------------ */
  const isWindowScroller = (el) => el === document.scrollingElement || el === document.documentElement || el === document.body;

  function isScrollable(el) {
    if (isWindowScroller(el)) {
      const se = document.scrollingElement || document.documentElement;
      return se.scrollHeight > window.innerHeight + 10;
    }
    const s = getComputedStyle(el);
    return /(auto|scroll|overlay)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 10 && el.clientHeight > 80;
  }

  function makeScroller(el) {
    if (!el || isWindowScroller(el)) {
      const se = document.scrollingElement || document.documentElement;
      return {
        el: se, win: true,
        get height() { return se.scrollHeight; },
        get view() { return window.innerHeight; },
        get pos() { return window.scrollY; },
        set pos(v) { window.scrollTo(0, v); },
        rectTop() { return 0; },
      };
    }
    // Detect "column-reverse" lists, where scrollTop is 0 at the bottom and negative at the top.
    const before = el.scrollTop;
    el.scrollTop = -1;
    const reverse = el.scrollTop < 0;
    el.scrollTop = before;
    return {
      el, win: false, reverse,
      get height() { return el.scrollHeight; },
      get view() { return el.clientHeight; },
      get pos() { return reverse ? el.scrollTop + (el.scrollHeight - el.clientHeight) : el.scrollTop; },
      set pos(v) { el.scrollTop = reverse ? v - (el.scrollHeight - el.clientHeight) : v; },
      rectTop() { return el.getBoundingClientRect().top; },
    };
  }

  function nearestScrollable(el) {
    for (let p = el?.parentElement; p; p = p.parentElement) {
      if (p === document.body || p === document.documentElement) break;
      if (isScrollable(p)) return p;
    }
    return document.scrollingElement || document.documentElement;
  }

  function findMainScroller() {
    let best = null; let bestScore = 0;
    for (const el of document.querySelectorAll('body *')) {
      if (el.clientHeight < 150) continue;
      let s;
      try { s = getComputedStyle(el); } catch { continue; }
      if (!/(auto|scroll|overlay)/.test(s.overflowY) || el.scrollHeight <= el.clientHeight + 10) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 200) continue;
      let score = (el.textContent || '').length * Math.min(1, r.width / 600);
      if (el.closest('nav, aside, [role="navigation"]')) score *= 0.05;
      if (score > bestScore) { bestScore = score; best = el; }
    }
    const se = document.scrollingElement || document.documentElement;
    if (!best || (isScrollable(se) && se.scrollHeight > best.scrollHeight * 1.5)) return se;
    return best;
  }

  async function waitForGrowth(sc, prevH, timeout) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      await sleep(120);
      // Only real growth counts: some chat sites wobble by a few pixels forever (animations, typing dots).
      if (sc.height - prevH > 40) { await sleep(350); return true; }
    }
    return false;
  }

  /* Scroll to the very top again and again until no older messages load. */
  async function loadOlderMessages(sc) {
    let stable = 0;
    const deadline = now() + 3 * 60 * 1000; // at most 3 minutes loading history
    for (let i = 0; i < 500 && stable < 2 && !cancelled && !finishEarly && now() < deadline; i++) {
      const h = sc.height;
      sc.pos = 0;
      if (sc.win) window.dispatchEvent(new Event('scroll'));
      const grew = await waitForGrowth(sc, h, 2000);
      stable = grew ? 0 : stable + 1;
      window.__csProgress = -(i + 1); // negative = still loading history (pass number)
      overlay.set('Step 1 of 3 · Loading history', `Scrolling up for older messages… (pass ${i + 1})`, Math.min(45, 5 + i * 2));
    }
  }

  /* ------------------------------------------------------------------ */
  /* Generic message detection (for any chat site)                        */
  /* ------------------------------------------------------------------ */
  const PROSE_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'PRE', 'BLOCKQUOTE', 'TABLE', 'SPAN', 'A', 'STRONG', 'EM', 'B', 'I', 'CODE', 'BR', 'HR', 'TBODY', 'TR', 'TD']);
  const textLen = (el) => (el.textContent || '').replace(/\s+/g, '').length;

  function findMessageList(root) {
    const total = textLen(root);
    if (!total) return null;
    let best = null; let bestScore = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    for (let el = root; el; el = walker.nextNode()) {
      if (el.matches('nav, aside, header, footer, form, textarea, ul, ol, table, pre, [contenteditable="true"]')) continue;
      if (/(^|[\s_-])(prose|markdown)([\s_-]|$)/i.test(el.className?.baseVal ?? el.className ?? '')) continue;
      const kids = [...el.children].filter((c) => textLen(c) > 0 && !c.matches('script, style, textarea, form'));
      if (kids.length < 2) continue;
      const prose = kids.filter((c) => PROSE_TAGS.has(c.tagName)).length;
      if (prose / kids.length > 0.5) continue;
      const covered = kids.reduce((s, c) => s + textLen(c), 0) / total;
      if (covered < 0.5) continue;
      const score = covered * Math.log2(1 + kids.length);
      if (score >= bestScore) { bestScore = score; best = el; }
    }
    return best;
  }

  const USER_TOKENS = new Set(['user', 'human', 'me', 'mine', 'self', 'own', 'question', 'query', 'prompt', 'request', 'sent', 'outgoing', 'outbound', 'sender', 'you']);
  const AI_TOKENS = new Set(['assistant', 'bot', 'ai', 'model', 'response', 'answer', 'reply', 'incoming', 'inbound', 'gpt', 'claude', 'gemini', 'glm', 'llm', 'agent', 'markdown', 'prose', 'chatbot', 'system', 'received', 'receiver']);
  const ROLE_ATTRS = ['data-role', 'data-author', 'data-message-author-role', 'data-testid', 'data-type', 'data-from', 'data-sender', 'aria-label', 'role', 'id'];

  function roleTokens(el) {
    let u = 0; let a = 0;
    const scan = (node, weight) => {
      if (!node || node.nodeType !== 1) return;
      const cls = typeof node.className === 'string' ? node.className : (node.className?.baseVal || '');
      for (const t of cls.toLowerCase().split(/[\s\-_:/[\]]+/)) {
        if (USER_TOKENS.has(t)) u += weight;
        else if (AI_TOKENS.has(t)) a += weight;
      }
      for (const attr of ROLE_ATTRS) {
        const v = node.getAttribute(attr);
        if (!v) continue;
        for (const t of v.toLowerCase().split(/[\s\-_:/]+/)) {
          if (USER_TOKENS.has(t)) u += weight * 3;
          else if (AI_TOKENS.has(t)) a += weight * 3;
        }
      }
    };
    scan(el, 2);
    // a few levels of descendants
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT);
    let n = 0;
    for (let d = walker.nextNode(); d && n < 40; d = walker.nextNode(), n++) scan(d, 1);
    return { u, a };
  }

  function alignedRight(el, listRect) {
    // Find the first visible block with text and check where it sits.
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      if (!t.nodeValue.trim()) continue;
      const box = t.parentElement.closest('div, p, section, article') || t.parentElement;
      const r = box.getBoundingClientRect();
      if (!r.width) continue;
      const rel = (r.left - listRect.left) / (listRect.width || 1);
      return rel > 0.22 && r.right > listRect.right - listRect.width * 0.15 && r.width < listRect.width * 0.85;
    }
    return false;
  }

  /* ------------------------------------------------------------------ */
  /* Cleaning: copy a message into a tiny, safe HTML subset               */
  /* ------------------------------------------------------------------ */
  const PRIV = document.implementation.createHTMLDocument('chatsaver');
  const KEEP = new Set(['p', 'div', 'section', 'article', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'hr', 'br', 'span', 'a', 'strong', 'b', 'em', 'i', 'u', 's', 'del',
    'code', 'sup', 'sub', 'mark', 'kbd', 'small', 'figure', 'figcaption', 'details', 'summary', 'dl', 'dt', 'dd']);
  const DROP = new Set(['script', 'style', 'noscript', 'template', 'svg', 'canvas', 'button', 'input', 'textarea', 'select',
    'option', 'iframe', 'video', 'audio', 'object', 'embed', 'nav', 'link', 'meta', 'form', 'dialog']);
  const DROP_SEL = '[role="button"], [role="toolbar"], [role="menu"], [role="menubar"], [role="tooltip"], .sr-only, .visually-hidden, [data-chatsaver-ignore]';

  function langOf(pre, code) {
    const src = `${code?.className || ''} ${pre.className || ''} ${pre.getAttribute('data-language') || ''} ${code?.getAttribute('data-language') || ''}`;
    const m = src.match(/(?:language|lang)-([\w+#.-]+)/i) || src.match(/^\s*([\w+#.-]+)\s*$/);
    return m ? m[1] : (pre.getAttribute('data-language') || '');
  }

  function cleanInto(src, parent) {
    for (const n of src.childNodes) {
      if (n.nodeType === 3) {
        if (n.nodeValue) parent.appendChild(PRIV.createTextNode(n.nodeValue));
        continue;
      }
      if (n.nodeType !== 1) continue;
      const el = n;
      const tag = el.tagName.toLowerCase();
      if (DROP.has(tag)) continue;
      try { if (el.matches(DROP_SEL)) continue; } catch { /* ignore */ }

      // Math: KaTeX keeps its TeX source in an annotation; MathJax in assistive MathML.
      if (el.classList.contains('katex') || el.classList.contains('katex-display')) {
        const tex = el.querySelector('annotation[encoding="application/x-tex"]')?.textContent?.trim();
        if (tex) {
          const display = el.classList.contains('katex-display') || !!el.closest('.katex-display');
          parent.appendChild(PRIV.createTextNode(display ? `\n$$${tex}$$\n` : `$${tex}$`));
          continue;
        }
      }
      if (tag === 'mjx-container' || tag === 'math') {
        const alt = el.getAttribute('alttext') || el.querySelector('math')?.getAttribute('alttext') || el.textContent.trim();
        if (alt) parent.appendChild(PRIV.createTextNode(`$${alt}$`));
        continue;
      }

      let cs = null;
      try { cs = getComputedStyle(el); } catch { /* detached */ }
      if (cs && (cs.display === 'none' || cs.visibility === 'hidden')) continue;
      if (el.getAttribute('aria-hidden') === 'true') continue;
      if (cs && cs.position === 'absolute') {
        const r = el.getBoundingClientRect();
        if (r.width <= 2 && r.height <= 2) continue; // screen-reader-only text
      }

      if (tag === 'pre') {
        const code = el.querySelector('code');
        const p = PRIV.createElement('pre');
        const lang = langOf(el, code);
        if (lang) p.setAttribute('data-lang', lang);
        p.textContent = (code || el).textContent.replace(/\n$/, '');
        parent.appendChild(p);
        continue;
      }
      if (tag === 'img' || tag === 'picture') {
        const img = tag === 'img' ? el : el.querySelector('img');
        if (!img) continue;
        const src = img.currentSrc || img.src;
        const r = img.getBoundingClientRect();
        if (!src || !/^(https?:|data:image)/.test(src)) continue;
        if (r.width && r.width < 48 && r.height < 48) continue; // avatars / icons
        const o = PRIV.createElement('img');
        o.setAttribute('src', src);
        if (img.alt) o.setAttribute('alt', img.alt);
        parent.appendChild(o);
        continue;
      }

      let outTag = KEEP.has(tag) ? tag : null;
      if (!outTag) outTag = cs && /^(block|flex|grid|list-item|table|flow-root)/.test(cs.display) ? 'div' : 'span';
      const o = PRIV.createElement(outTag);
      if (tag === 'a') {
        const href = el.href;
        if (/^https?:/i.test(href)) o.setAttribute('href', href);
      }
      if ((tag === 'td' || tag === 'th')) {
        for (const a of ['colspan', 'rowspan']) if (el.getAttribute(a)) o.setAttribute(a, el.getAttribute(a));
      }
      if (tag === 'ol' && el.getAttribute('start')) o.setAttribute('start', el.getAttribute('start'));

      if (el.childNodes.length) cleanInto(el, o);
      else if (el.shadowRoot) cleanInto(el.shadowRoot, o);

      if (outTag === 'br' || outTag === 'hr' || o.childNodes.length) parent.appendChild(o);
    }
  }

  function cleanMessage(el) {
    const root = PRIV.createElement('div');
    if (el.childNodes.length) cleanInto(el, root);
    else if (el.shadowRoot) cleanInto(el.shadowRoot, root);
    return root;
  }

  /* ------------------------------------------------------------------ */
  /* Clean HTML -> Markdown / plain text                                   */
  /* ------------------------------------------------------------------ */
  const IND = '\u0001';
  function toMarkdown(root, plain) {
    const codes = [];
    const wrap = (s, m) => {
      const x = s.match(/^(\s*)([\s\S]*?)(\s*)$/);
      return x[2] ? `${x[1]}${m}${x[2]}${m}${x[3]}` : s;
    };
    const kids = (node, ctx) => { let s = ''; for (const c of node.childNodes) s += md(c, ctx); return s; };
    const block = (s) => `\n\n${s.trim()}\n\n`;
    function md(node, ctx) {
      if (node.nodeType === 3) return node.nodeValue.replace(/\s+/g, ' ');
      if (node.nodeType !== 1) return '';
      const tag = node.tagName.toLowerCase();
      switch (tag) {
        case 'br': return '\n';
        case 'hr': return '\n\n---\n\n';
        case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': {
          const t = kids(node, ctx).replace(/\s+/g, ' ').trim();
          return t ? block(plain ? t : `${'#'.repeat(+tag[1])} ${t}`) : '';
        }
        case 'pre': {
          const lang = node.getAttribute('data-lang') || '';
          codes.push('```' + lang + '\n' + node.textContent + '\n```');
          return `\n\n\u0000${codes.length - 1}\u0000\n\n`;
        }
        case 'code': { const t = node.textContent; return plain ? t : '`' + t.replace(/`/g, '\\`') + '`'; }
        case 'strong': case 'b': return plain ? kids(node, ctx) : wrap(kids(node, ctx), '**');
        case 'em': case 'i': return plain ? kids(node, ctx) : wrap(kids(node, ctx), '*');
        case 's': case 'del': return plain ? kids(node, ctx) : wrap(kids(node, ctx), '~~');
        case 'a': {
          const t = kids(node, ctx); const href = node.getAttribute('href');
          if (!href || href === t.trim() || !t.trim()) return t || href || '';
          return plain ? `${t} (${href})` : `[${t.trim()}](${href})`;
        }
        case 'img': {
          const src = node.getAttribute('src') || ''; const alt = node.getAttribute('alt') || 'image';
          const shown = src.startsWith('data:') ? '(embedded image)' : src;
          return plain ? `[Image: ${alt} ${shown}]` : `![${alt}](${src.startsWith('data:') ? '' : src})`;
        }
        case 'ul': case 'ol': {
          const depth = ctx.depth || 0; let i = +(node.getAttribute('start') || 1); let out = '\n\n';
          for (const li of node.childNodes) {
            if (li.nodeType !== 1 || li.tagName !== 'LI') { const x = md(li, ctx); if (x.trim()) out += x + '\n'; continue; }
            const bullet = tag === 'ol' ? `${i++}. ` : '- ';
            const inner = kids(li, { ...ctx, depth: depth + 1 }).replace(/\n{2,}/g, '\n').trim();
            const lines = inner.split('\n');
            const ind = IND.repeat(depth * 2);
            out += ind + bullet + lines[0] + '\n';
            for (const l of lines.slice(1)) out += (l.startsWith(IND) ? l : ind + IND + IND + l) + '\n';
          }
          return out + '\n';
        }
        case 'blockquote': {
          const inner = kids(node, ctx).trim().replace(/\n{3,}/g, '\n\n');
          return block(inner.split('\n').map((l) => '> ' + l).join('\n'));
        }
        case 'table': {
          const rows = [...node.querySelectorAll('tr')].map((tr) => [...tr.children].map((c) =>
            kids(c, ctx).replace(/\s*\n\s*/g, ' ').trim().replace(/\|/g, '\\|')));
          if (!rows.length) return '';
          const width = Math.max(...rows.map((r) => r.length));
          rows.forEach((r) => { while (r.length < width) r.push(''); });
          let out = rows.map((r) => `| ${r.join(' | ')} |`);
          if (!plain) out.splice(1, 0, `| ${Array(width).fill('---').join(' | ')} |`);
          return block(out.join('\n'));
        }
        case 'p': case 'div': case 'section': case 'article': case 'figure': case 'figcaption':
        case 'details': case 'summary': case 'dl': case 'dt': case 'dd': case 'li': case 'tr':
          return block(kids(node, ctx));
        default: return kids(node, ctx);
      }
    }
    let out = md(root, {});
    out = out.split('\n').map((l) => l.replace(/^[ \t]+|[ \t]+$/g, '').replace(new RegExp(IND, 'g'), ' ')).join('\n');
    out = out.replace(/\n{3,}/g, '\n\n').trim();
    out = out.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[+i]);
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Collection                                                           */
  /* ------------------------------------------------------------------ */
  function topLevel(els) {
    const set = new Set(els);
    return els.filter((el) => { for (let p = el.parentElement; p; p = p.parentElement) if (set.has(p)) return false; return true; });
  }

  function adapterItems() {
    if (!adapter?.sel) return [];
    const els = topLevel([...document.querySelectorAll(adapter.sel)]);
    return els.map((el) => ({ el, role: adapter.role(el), content: adapter.content ? adapter.content(el) : el }));
  }

  const STABLE_ATTRS = ['data-message-id', 'data-msg-id', 'data-id', 'data-index', 'data-item-index', 'data-turn-id', 'data-testid', 'id'];
  function stableId(el) {
    for (const a of STABLE_ATTRS) {
      const v = el.getAttribute(a);
      if (v && !/^(user-message|conversation-turn)$/.test(v)) return a + '=' + v;
    }
    return null;
  }
  function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }

  function createCollector(sc) {
    const entries = [];
    const byEl = new WeakMap();
    const byId = new Map();
    let list = null;

    function genericItems() {
      if (!list || !list.isConnected) list = findMessageList(sc.win ? document.body : sc.el);
      if (!list) return [];
      return [...list.children].filter((c) => textLen(c) > 0 || c.querySelector('img'))
        .map((el) => ({ el, role: null, content: el }));
    }

    function collect() {
      let items = adapterItems();
      const usingAdapter = items.length > 0;
      if (!usingAdapter) items = genericItems();
      const listRect = (usingAdapter ? (sc.win ? document.body : sc.el) : list)?.getBoundingClientRect?.() || { left: 0, width: innerWidth, right: innerWidth };
      for (const it of items) {
        const el = it.el;
        const len = (it.content.textContent || '').length;
        let entry = byEl.get(el);
        const sid = stableId(el);
        if (!entry && sid) entry = byId.get(sid);
        const absTop = el.getBoundingClientRect().top - sc.rectTop() + sc.pos;
        if (!entry) {
          // Virtualised lists recreate elements: match on text + approximate position.
          const clean = cleanMessage(it.content);
          const txt = toMarkdown(clean, true);
          if (!txt.trim() && !clean.querySelector('img')) continue;
          const h = hash(txt);
          if (!sid) {
            // Same text at (almost) the same spot = the same message re-rendered.
            const dup = entries.find((e) => e.hash === h && !e.sid && Math.abs(e.top - absTop) < 200);
            if (dup) { byEl.set(el, dup); continue; }
          }
          entry = { hash: h, top: absTop, len, clean, role: it.role, sid };
          if (!it.role) {
            const t = roleTokens(el);
            entry.tok = t;
            entry.right = alignedRight(el, listRect);
          }
          entries.push(entry);
          byEl.set(el, entry);
          if (sid) byId.set(sid, entry);
        } else if (len > entry.len) {
          // Message grew (still streaming / lazily rendered) — re-extract.
          entry.clean = cleanMessage(it.content);
          entry.len = len;
          byEl.set(el, entry);
        }
      }
    }

    function finish() {
      const anyRight = entries.some((e) => e.right);
      for (const e of entries) {
        if (e.role) continue;
        const { u, a } = e.tok || { u: 0, a: 0 };
        if (u > a) e.role = 'user';
        else if (a > u) e.role = 'assistant';
        else if (anyRight) e.role = e.right ? 'user' : 'assistant';
        else e.role = 'unknown';
      }
      return entries;
    }
    return { collect, finish, get count() { return entries.length; }, get usingList() { return list; } };
  }

  async function gather(autoscroll) {
    cancelled = false; finishEarly = false;
    window.__csProgress = 0;
    overlay.show();
    overlay.set('Finding the conversation', `Looking for messages on ${host}…`, 4);

    const first = adapterItems()[0]?.el;
    const scEl = first ? nearestScrollable(first) : findMainScroller();
    const sc = makeScroller(scEl);
    const startPos = sc.pos;
    const collector = createCollector(sc);

    if (autoscroll && sc.height > sc.view + 10) {
      await loadOlderMessages(sc);
      // Walk down the whole conversation so virtualised lists render every message.
      sc.pos = 0;
      await sleep(400);
      let guard = 0; let lastPos = -1;
      const deadline = now() + 8 * 60 * 1000; // at most 8 minutes reading
      while (!cancelled && !finishEarly && now() < deadline && guard++ < 6000) {
        collector.collect();
        window.__csProgress = collector.count;
        const pct = 45 + (50 * sc.pos) / Math.max(1, sc.height - sc.view);
        overlay.set('Step 2 of 3 · Reading messages', `${collector.count} messages found so far`, pct);
        if (sc.pos + sc.view >= sc.height - 4) {
          await sleep(500);
          collector.collect();
          if (sc.pos + sc.view >= sc.height - 4) break;
        }
        sc.pos = sc.pos + Math.max(150, sc.view * 0.7);
        await sleep(220);
        if (Math.abs(sc.pos - lastPos) < 1) { // could not move any further
          await sleep(500);
          if (Math.abs(sc.pos - lastPos) < 1) { collector.collect(); break; }
        }
        lastPos = sc.pos;
      }
      sc.pos = startPos;
    } else {
      collector.collect();
    }
    if (cancelled) throw new Error('Cancelled');
    collector.collect();
    window.__csProgress = collector.count;
    return collector.finish();
  }

  /* ------------------------------------------------------------------ */
  /* Output                                                               */
  /* ------------------------------------------------------------------ */
  function chatTitle() {
    let t = document.title || host;
    t = t.replace(/\s*[-|–—•·]\s*(ChatGPT|Claude|Gemini|Copilot|Poe|Perplexity|DeepSeek|Grok|GLM[\w\s.-]*|Qwen|Kimi|Mistral|Meta AI|HuggingChat)\s*$/i, '').trim();
    return t || host;
  }
  const label = (role) => (role === 'user' ? 'You' : role === 'assistant' ? assistantName : 'Message');
  const safeName = (s) => s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90) || 'chat';

  function buildPayload(entries) {
    const now = new Date();
    return {
      title: chatTitle(), url: location.href, host, site: adapter?.name || host, assistantName,
      savedAt: now.toISOString(), savedAtLocal: now.toLocaleString(),
      fileBase: `${safeName(chatTitle())} - ${now.toISOString().slice(0, 10)}`,
      messages: entries.map((e) => ({
        role: e.role, label: label(e.role),
        html: e.clean.innerHTML,
        md: toMarkdown(e.clean, false),
        txt: toMarkdown(e.clean, true),
      })),
    };
  }

  function renderText(p, kind) {
    const md = kind === 'md';
    const rule = '─'.repeat(48);
    let s = md
      ? `# ${p.title}\n\n- Source: ${p.url}\n- Saved: ${p.savedAtLocal}\n- Messages: ${p.messages.length}\n\n---\n\n`
      : `${p.title}\n${'='.repeat(Math.min(60, Math.max(10, p.title.length)))}\nSource:   ${p.url}\nSaved:    ${p.savedAtLocal}\nMessages: ${p.messages.length}\n\n${rule}\n\n`;
    p.messages.forEach((m, i) => {
      s += md ? `## ${m.label}\n\n${m.md}\n\n---\n\n` : `[${m.label}]\n\n${m.txt}\n\n${i < p.messages.length - 1 ? rule + '\n\n' : ''}`;
    });
    return s.trimEnd() + '\n';
  }

  function download(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.style.display = 'none';
    document.documentElement.appendChild(a);
    a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 4000);
  }

  async function run(format, autoscroll) {
    try {
      const entries = await gather(autoscroll);
      if (!entries.length) {
        overlay.fail('No messages found', 'Open a conversation (not the home screen) and try again.');
        return { ok: false, error: 'no-messages' };
      }
      const p = buildPayload(entries);
      if (format === 'txt' || format === 'md') {
        overlay.set('Step 3 of 3 · Saving', `Writing ${p.messages.length} messages…`, 97);
        download(renderText(p, format), `${p.fileBase}.${format}`, format === 'md' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8');
        overlay.done(`Saved ${p.messages.length} messages`, `${p.fileBase}.${format} is in your Downloads folder.`);
      } else {
        overlay.set('Step 3 of 3 · Building PDF', `Preparing ${p.messages.length} messages…`, 97);
        const id = 'chat_' + Date.now();
        await api.storage.local.set({ [id]: p });
        await api.runtime.sendMessage({ type: 'chatsaver:open', id, action: format });
        overlay.done(`${p.messages.length} messages captured`, format === 'print' ? 'Opened a new tab — choose “Save as PDF” in the print dialog.' : 'Your PDF is being created in the new tab.');
      }
      return { ok: true, count: p.messages.length };
    } catch (err) {
      if (err.message === 'Cancelled') { overlay.hide(); return { ok: false, error: 'cancelled' }; }
      console.error('[Chat Saver]', err);
      overlay.fail('Something went wrong', err.message);
      return { ok: false, error: err.message };
    }
  }

  /* Used by the Mac app (Chat Saver.app), which runs this file in the front Safari tab
     through AppleScript and polls window.__csState until the chat is ready. */
  function startForApp(autoscroll) {
    window.__csState = { status: 'running' };
    gather(autoscroll !== false).then((entries) => {
      if (!entries.length) {
        overlay.fail('No messages found', 'Open a conversation (not the home screen) and try again.');
        window.__csState = { status: 'error', error: 'no-messages' };
        return;
      }
      const p = buildPayload(entries);
      overlay.set('Step 3 of 3 · Saving files', `Writing ${p.messages.length} messages…`, 97);
      window.__csState = { status: 'done', count: p.messages.length, json: JSON.stringify({ p, txt: renderText(p, 'txt'), md: renderText(p, 'md') }) };
    }).catch((err) => {
      if (err.message === 'Cancelled') overlay.hide(); else overlay.fail('Something went wrong', err.message);
      window.__csState = { status: 'error', error: err.message };
    });
    return 'started';
  }

  /* Step mode for the Mac app: the app calls tick() about once a second. Each call does one
     scroll/collect step synchronously, so it keeps working even when Safari pauses timers
     in a page that is not on screen (e.g. a full-screen Space you are not looking at). */
  let job = null;
  function startJob(autoscroll) {
    cancelled = false; finishEarly = false;
    overlay.show();
    overlay.set('Finding the conversation', `Looking for messages on ${host}…`, 4);
    const first = adapterItems()[0]?.el;
    const scEl = first ? nearestScrollable(first) : findMainScroller();
    const sc = makeScroller(scEl);
    job = {
      sc, collector: createCollector(sc), startPos: sc.pos, t0: now(),
      phase: autoscroll && sc.height > sc.view + 10 ? 'load' : 'done',
      passes: 0, stable: 0, lastH: sc.height, lastPos: -1, stuck: 0, bottom: 0,
    };
    job.collector.collect(); // grab everything already on the page right away
    window.__csProgress = job.collector.count;
    window.__csState = { status: 'running' };
    return 'started';
  }
  function finishJob() {
    const { sc, collector } = job;
    collector.collect();
    try { sc.pos = job.startPos; } catch (e) { /* ignore */ }
    const entries = collector.finish();
    job = null;
    if (!entries.length) {
      overlay.fail('No messages found', 'Open a conversation (not the home screen) and try again.');
      window.__csState = { status: 'error', error: 'no-messages' };
      return;
    }
    const p = buildPayload(entries);
    overlay.set('Step 3 of 3 · Saving files', `Writing ${p.messages.length} messages…`, 97);
    window.__csState = { status: 'done', count: p.messages.length, json: JSON.stringify({ p, txt: renderText(p, 'txt'), md: renderText(p, 'md') }) };
  }
  function tick() {
    try {
      if (!job) return JSON.stringify({ s: window.__csState ? window.__csState.status : 'missing', n: window.__csProgress || 0 });
      if (cancelled) { overlay.hide(); job = null; window.__csState = { status: 'error', error: 'cancelled' }; return tick(); }
      const { sc, collector } = job;
      const elapsed = now() - job.t0;
      if (job.phase === 'load') {
        const h = sc.height;
        if (job.passes > 0) {
          if (h - job.lastH > 40) job.stable = 0; else job.stable++;
        }
        job.lastH = h;
        job.passes++;
        if (job.stable >= 3 || job.passes > 150 || finishEarly || elapsed > 3 * 60 * 1000) {
          job.phase = 'walk'; sc.pos = 0; collector.collect();
        } else {
          sc.pos = 0;
          if (sc.win) window.dispatchEvent(new Event('scroll'));
          overlay.set('Step 1 of 3 · Loading history', `Scrolling up for older messages… (pass ${job.passes})`, Math.min(45, 5 + job.passes * 2));
        }
      } else if (job.phase === 'walk') {
        collector.collect();
        window.__csProgress = collector.count;
        const pct = 45 + (50 * sc.pos) / Math.max(1, sc.height - sc.view);
        overlay.set('Step 2 of 3 · Reading messages', `${collector.count} messages found so far`, pct);
        const atBottom = sc.pos + sc.view >= sc.height - 4;
        if (atBottom) job.bottom++; else job.bottom = 0;
        if (Math.abs(sc.pos - job.lastPos) < 1) job.stuck++; else job.stuck = 0;
        job.lastPos = sc.pos;
        if (job.bottom >= 2 || job.stuck >= 3 || finishEarly || elapsed > 11 * 60 * 1000) job.phase = 'done';
        else if (!atBottom) { sc.pos = sc.pos + Math.max(150, sc.view * 0.85); sc.el.dispatchEvent?.(new Event('scroll')); }
      }
      if (job.phase === 'done') finishJob();
    } catch (err) {
      job = null;
      overlay.fail('Something went wrong', err.message);
      window.__csState = { status: 'error', error: err.message };
    }
    return JSON.stringify({ s: window.__csState ? window.__csState.status : 'missing', n: window.__csProgress || 0 });
  }

  // Exposed for the Mac app and for testing.
  window.__chatSaver = { run, gather, buildPayload, renderText, toMarkdown, cleanMessage, startForApp, startJob, tick, overlay, finishNow: () => { finishEarly = true; } };

  api?.runtime?.onMessage?.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== 'chatsaver:start') return;
    run(msg.format, msg.autoscroll !== false);
    sendResponse({ started: true });
  });
})();
