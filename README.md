# Chat Saver

Chat Saver saves a whole AI chat from Safari as a **PDF**, a **text file** and a **Markdown file**. Give it a link, or let it find a chat that's already open. It scrolls through the entire conversation, saves all three files, checks them and tells you what it saved.

It works with:
- ChatGPT, Claude, Gemini, Copilot, Perplexity, DeepSeek, Poe, Grok and GLM (glm5.app, chat.z.ai)
- Qwen, Kimi, Mistral, Meta AI, HuggingChat and Manus
- most other chat sites, through automatic message detection

## Mac app (recommended, no Xcode needed)

`mac-app/` holds a small macOS app written in JavaScript for Automation (JXA). It works the same way as [TabVault](https://github.com/Bakulesh1Codes108/TabVault): it controls Safari directly, so it doesn't need a Safari extension or Xcode.

### Install
```bash
./mac-app/build-app.sh          # creates build/Chat Saver.app
open "build/Chat Saver.app"     # first run compiles + installs ~/Applications/Chat Saver.app
```
The first run uses macOS's built-in `osacompile` to compile a real applet, installs it to `~/Applications` with its icon, and signs it ad-hoc. After that, opening any copy just opens the installed app.

### One-time setup
- In Safari, go to **Settings ▸ Advanced** and tick **Show features for web developers**.
- Then go to **Settings ▸ Developer** and tick **Allow JavaScript from Apple Events**.
- The first time it runs, macOS asks whether Chat Saver can control Safari. Click **OK**.

### Use
1. Copy the chat's link and open **Chat Saver**. The link is filled in for you; click **Save Chat**. If you leave the box empty, it saves a chat that's already open.
2. It opens the chat, or reuses the tab if it's already open, and waits for the page to load.
3. A progress card appears on the chat page while it reads every message. Click **Save now** to stop early and keep what has loaded so far.
4. Your files are saved in `~/Downloads/Chat Saver/` as `<chat title> - <date>.pdf`, `.txt` and `.md`. A summary shows the message count, the PDF page count and the result of the file check.

### How it works
- `extension/content.js` is the extractor. It runs inside the page and has:
  - per-site adapters, plus a generic message-list detector
  - role detection (You or the AI)
  - cleanup that keeps code blocks, tables, lists, links, images and math (KaTeX/MathJax become TeX)
  - Markdown and plain-text rendering
- **Step mode:** the app calls `tick()` about once a second, and each call scrolls and collects one step synchronously. This keeps working even when Safari pauses a page that isn't on screen, such as a full-screen Space you aren't looking at.
- **Time limits:** loading history stops after 3 minutes and reading after 11 minutes, with a 12-minute safety net, so a run can't hang.
- **PDF:** made by macOS WebKit (`NSPrintOperation`), on A4 pages with selectable text. Speaker labels stay on the same page as their messages.
- **Log:** written to `~/Downloads/Chat Saver/.chatsaver.log`. The setup log is in `~/Library/Logs/Chat Saver setup.log`.

## Safari / Chrome extension

`extension/` is the same extractor packaged as a Manifest V3 web extension, with a toolbar menu and an export page. Click its toolbar button on any chat to save it as:
- a one-click PDF (jsPDF + html2canvas)
- a PDF with selectable text (through the print dialog)
- a TXT file
- a Markdown file

- **Chrome, Edge or Brave:** go to `chrome://extensions`, turn on Developer mode, click **Load unpacked** and choose `extension/`.
- **Safari:** run `extension-safari-installer.command`. This needs Xcode, because Safari only accepts extensions built with it. You can also use Safari's **Develop ▸ Developer Settings ▸ Add Temporary Extension**.

## Design

The UI follows the design system in `design-system/chat-saver/MASTER.md`, generated with the UI UX Pro Max skill:
- Minimal / Swiss style
- teal palette
- Inter font
- Phosphor icons
- light and dark mode, 44 px tap targets, visible keyboard focus, reduced-motion support

## Third-party code (all bundled locally)
- jsPDF (MIT)
- html2canvas (MIT)
- Phosphor Icons (MIT)
- Inter font (SIL OFL)
