# Graph Report - repo  (2026-10-27)

## Corpus Check
- 12 files · ~14,223 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: .css 4, (none) 2, .command 1)

## Summary
- 178 nodes · 266 edges · 12 communities (10 shown, 2 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 13 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `22ad2c2d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- content.js
- chatsaver.js
- Chat Saver: Architecture
- manifest.json
- Design System Master File
- export.js
- default_icon
- popup.js
- launcher.sh
- icons.js
- build-app.sh

## God Nodes (most connected - your core abstractions)
1. `main()` - 16 edges
2. `gather()` - 9 edges
3. `collect()` - 8 edges
4. `icons` - 8 edges
5. `Chat Saver: Architecture` - 8 edges
6. `makePdf()` - 7 edges
7. `log()` - 7 edges
8. `buildHtml()` - 7 edges
9. `Design System Master File` - 7 edges
10. `createCollector()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `3. Why step mode ("tick")?` --references--> `tick()`  [INFERRED]
  docs/ARCHITECTURE.md → extension/content.js
- `How it works` --references--> `tick()`  [INFERRED]
  README.md → extension/content.js

## Import Cycles
- None detected.

## Communities (12 total, 2 thin omitted)

### Community 0 - "content.js"
Cohesion: 0.11
Nodes (33): adapterItems(), alignedRight(), buildPayload(), chatTitle(), cleanInto(), cleanMessage(), createCollector(), collect() (+25 more)

### Community 1 - "chatsaver.js"
Cohesion: 0.14
Nodes (26): app, buildHtml(), dialog(), ensureDir(), esc(), explainJsError(), fail(), firstBlock() (+18 more)

### Community 2 - "Chat Saver: Architecture"
Cohesion: 0.08
Nodes (23): 1. Components, 2. One save, step by step, 3. Why step mode ("tick")?, 4. Inside the extractor, 5. Install and update flow (no Xcode), 6. Permissions, 7. Folder map, Chat Saver: Architecture (+15 more)

### Community 3 - "manifest.json"
Cohesion: 0.09
Nodes (22): background, service_worker, commands, _execute_action, description, description, suggested_key, icons (+14 more)

### Community 4 - "Design System Master File"
Cohesion: 0.11
Nodes (17): Additional Forbidden Patterns, Anti-Patterns (Do NOT Use), Buttons, Cards, Color Palette, Component Specs, Design System Master File, Global Rules (+9 more)

### Community 5 - "export.js"
Cohesion: 0.21
Nodes (13): ALLOWED, ATTRS, banner(), findCleanCut(), forceLight(), link(), load(), makePdf() (+5 more)

### Community 6 - "default_icon"
Cohesion: 0.25
Nodes (8): action, default_icon, default_popup, default_title, 16, 19, 32, 38

### Community 7 - "popup.js"
Cohesion: 0.38
Nodes (6): auto, buttons(), KNOWN, setStatus(), start(), statusEl

### Community 8 - "launcher.sh"
Cohesion: 0.80
Nodes (4): fail(), note(), launcher.sh script, ver_ge()

### Community 9 - "icons.js"
Cohesion: 0.67
Nodes (3): hydrateIcons(), icon(), ICONS

## Knowledge Gaps
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `tick()` connect `Chat Saver: Architecture` to `content.js`?**
  _High betweenness centrality (0.059) - this node is a cross-community bridge._
- **Should `content.js` be split into smaller, more focused modules?**
  _Cohesion score 0.10810810810810811 - nodes in this community are weakly interconnected._
- **Should `chatsaver.js` be split into smaller, more focused modules?**
  _Cohesion score 0.13911290322580644 - nodes in this community are weakly interconnected._
- **Should `Chat Saver: Architecture` be split into smaller, more focused modules?**
  _Cohesion score 0.08333333333333333 - nodes in this community are weakly interconnected._
- **Should `manifest.json` be split into smaller, more focused modules?**
  _Cohesion score 0.08695652173913043 - nodes in this community are weakly interconnected._
- **Should `Design System Master File` be split into smaller, more focused modules?**
  _Cohesion score 0.1111111111111111 - nodes in this community are weakly interconnected._