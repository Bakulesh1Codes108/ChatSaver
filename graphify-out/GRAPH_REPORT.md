# Graph Report - repo  (2026-10-27)

## Corpus Check
- 16 files · ~19,229 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 11 file(s) not represented in the graph (top: (none) 4, .css 4, .cmd 2)

## Summary
- 259 nodes · 395 edges · 14 communities (12 shown, 2 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 25 edges (avg confidence: 0.89)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `49eeb47f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- content.js
- chatsaver.js
- Chat Saver: Architecture
- manifest.json
- Design System Master File
- export.js
- chatsaver.mjs
- popup.js
- launcher.sh
- icons.js
- build-app.sh
- background.js
- package.json
- chatsaver.sh script

## God Nodes (most connected - your core abstractions)
1. `main()` - 16 edges
2. `main()` - 10 edges
3. `gather()` - 10 edges
4. `Chat Saver: Architecture` - 10 edges
5. `saveChat()` - 9 edges
6. `collect()` - 9 edges
7. `saveTab()` - 8 edges
8. `tick()` - 8 edges
9. `icons` - 8 edges
10. `log()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `8. Knowledge graph (Graphify)` --references--> `createCollector()`  [INFERRED]
  docs/ARCHITECTURE.md → extension/content.js
- `8. Knowledge graph (Graphify)` --references--> `collect()`  [INFERRED]
  docs/ARCHITECTURE.md → extension/content.js
- `8. Knowledge graph (Graphify)` --references--> `gather()`  [INFERRED]
  docs/ARCHITECTURE.md → extension/content.js
- `9. Windows, Linux and every browser` --references--> `startJob()`  [INFERRED]
  docs/ARCHITECTURE.md → extension/content.js
- `3. Why step mode ("tick")?` --references--> `tick()`  [INFERRED]
  docs/ARCHITECTURE.md → extension/content.js

## Import Cycles
- None detected.

## Communities (14 total, 2 thin omitted)

### Community 0 - "content.js"
Cohesion: 0.11
Nodes (33): adapterItems(), alignedRight(), buildPayload(), chatTitle(), cleanInto(), cleanMessage(), createCollector(), collect() (+25 more)

### Community 1 - "chatsaver.js"
Cohesion: 0.14
Nodes (27): 8. Knowledge graph (Graphify), app, buildHtml(), dialog(), ensureDir(), esc(), explainJsError(), fail() (+19 more)

### Community 2 - "Chat Saver: Architecture"
Cohesion: 0.07
Nodes (28): 1. Components, 2. One save, step by step, 3. Why step mode ("tick")?, 4. Inside the extractor, 5. Install and update flow (no Xcode), 6. Permissions, 7. Folder map, 9. Windows, Linux and every browser (+20 more)

### Community 3 - "manifest.json"
Cohesion: 0.05
Nodes (36): action, default_icon, default_popup, default_title, background, scripts, service_worker, browser_specific_settings (+28 more)

### Community 4 - "Design System Master File"
Cohesion: 0.11
Nodes (17): Additional Forbidden Patterns, Anti-Patterns (Do NOT Use), Buttons, Cards, Color Palette, Component Specs, Design System Master File, Global Rules (+9 more)

### Community 5 - "export.js"
Cohesion: 0.21
Nodes (13): ALLOWED, ATTRS, banner(), findCleanCut(), forceLight(), link(), load(), makePdf() (+5 more)

### Community 6 - "chatsaver.mjs"
Cohesion: 0.08
Nodes (29): argv, bold(), buildHtml(), c(), CANDIDATES, CONTENT_JS, dim(), endStatus() (+21 more)

### Community 7 - "popup.js"
Cohesion: 0.40
Nodes (5): done(), KNOWN, linkEl, setStatus(), statusEl

### Community 8 - "launcher.sh"
Cohesion: 0.80
Nodes (4): fail(), note(), launcher.sh script, ver_ge()

### Community 9 - "icons.js"
Cohesion: 0.67
Nodes (3): hydrateIcons(), icon(), ICONS

### Community 11 - "background.js"
Cohesion: 0.33
Nodes (13): badge(), download(), jobs, makePdf(), norm(), notify(), run(), saveLink() (+5 more)

### Community 12 - "package.json"
Cohesion: 0.13
Nodes (14): bin, chatsaver, dependencies, playwright-core@1.48.2, description, engines, node, license (+6 more)

## Knowledge Gaps
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `8. Knowledge graph (Graphify)` connect `chatsaver.js` to `content.js`, `Chat Saver: Architecture`?**
  _High betweenness centrality (0.090) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `gather()` (e.g. with `8. Knowledge graph (Graphify)` and `content.js`) actually correct?**
  _`gather()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Should `content.js` be split into smaller, more focused modules?**
  _Cohesion score 0.10810810810810811 - nodes in this community are weakly interconnected._
- **Why does `tick()` connect `Chat Saver: Architecture` to `content.js`, `chatsaver.js`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **Should `chatsaver.js` be split into smaller, more focused modules?**
  _Cohesion score 0.13636363636363635 - nodes in this community are weakly interconnected._
- **Why does `show()` connect `content.js` to `background.js`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **Should `Chat Saver: Architecture` be split into smaller, more focused modules?**
  _Cohesion score 0.07126436781609195 - nodes in this community are weakly interconnected._