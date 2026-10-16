# 09 · Quality, Risks & Release

## Test strategy

| Layer | Tool | What it covers | When it runs |
|---|---|---|---|
| Unit | Vitest (Node) | `resolveSpec`, compatibility rules, tyre curves, surface lookup, economy, build codes, save migrations | Every commit |
| Data | zod schemas | Every file in `data/` and `world/`; cross-references (a part's socket exists, unlock regions exist) | Every commit |
| Physics regression | Vitest + headless Rapier | Acceptance targets from [03](03-vehicles-and-physics.md); recorded input replays compared against golden telemetry with tolerances | Every commit |
| Save compatibility | Vitest + fixtures | Every past save version loads and migrates; export → import round-trips | Every commit |
| End-to-end | Playwright (Chromium, Firefox, WebKit) | Boot, new game, scripted drive, garage purchase, save and reload, **offline reload** (`context.setOffline(true)`), garage screenshot diffs | Every PR |
| Performance | Benchmark route on the target laptop | Frame-time percentiles, draw calls, heap after 30 minutes, load times, against the [06](06-technical-architecture.md) budgets | Weekly from M3 |
| Playtests | Humans | "Relaxing" and "driving feel" scores, think-aloud sessions, where people get lost or bored | Weekly from M1 |

Determinism note: physics replays are compared on the same platform and build. Use tolerances, not exact equality, across machines.

## Browser & hardware matrix

| Browser | OS | GPU class | Priority |
|---|---|---|---|
| Chrome (latest 2) | Windows 11 | Intel Iris Xe (integrated) | P0 |
| Edge (latest) | Windows 11 | NVIDIA GTX 1650-class | P0 |
| Firefox (latest 2) | Windows 11 | Intel Iris Xe | P0 |
| Safari (latest 2) | macOS | Apple M1 | P0 |
| Chrome | macOS | Apple M1 | P1 |
| Chrome / Firefox | Linux | Mixed | P1 |
| Chrome | ChromeOS (mid-range) | Integrated | P2 |
| Safari | iPadOS | Apple | P2 (post-1.0 touch) |

## CI pipeline

```
push/PR → install → lint (Biome) → typecheck → unit + data + physics + save tests
        → build (incl. asset manifest + external-URL check + licence check)
        → Playwright e2e on 3 engines → deploy preview
tag v*  → all of the above → deploy to production (itch.io via butler + static host)
```

## Bug severity

| Severity | Definition | Rule |
|---|---|---|
| **A** | Crash, boot failure (online or offline), save loss or corruption, progression blocker | Fix before any new work |
| **B** | Major feature broken with a workaround; < 30 fps at Medium on target hardware | Fix within the milestone |
| **C** | Minor visual, audio or UI issue | Batch fixes |
| **D** | Polish idea | Backlog |

## Definition of done (per feature)

- Works with keyboard **and** gamepad.
- Works offline after a fresh install.
- Tests added for pure logic; data validated; no new console errors or warnings.
- Within the frame and memory budgets on target hardware at Medium.
- Strings in `en.json`; respects comfort and accessibility settings.
- Saves round-trip if the feature stores state, with a migration fixture if the schema changed.
- Docs or decision records updated if behaviour or architecture changed.

## Risk register

L = likelihood, I = impact (H/M/L).

| # | Risk | L | I | Mitigation | Early warning |
|---|---|---|---|---|---|
| 1 | Driving doesn't feel good | M | H | M1 feel gate, tuning and telemetry tools, proving ground, buffer weeks | Playtesters say "floaty", "twitchy" or "boring" |
| 2 | Scope too big for one person | H | H | Scope ladder, M4 re-plan, cut list, shared parts by size class | One region or car costs > 1.5× the estimate in M4 |
| 3 | Integrated-GPU performance | M | H | Budgets from M0, instancing, LODs, presets, dynamic resolution | M3 benchmark misses budget by > 20 % |
| 4 | WebGPU vs WebGL2 differences, driver bugs | M | M | M0 decision gate, weekly matrix runs, shaders in TSL | Browser-specific visual bugs keep appearing |
| 5 | Safari quirks (audio, storage eviction, WebGPU) | H | M | Test Safari weekly from M0, install prompt, save export | Safari-only bug count growing |
| 6 | Save loss or corruption | L | H | Versioned schema, migration fixtures, checksums, backups, export | Any save bug is severity A |
| 7 | Art volume (8 cars, ~300 parts, 6 regions) | H | H | Palette atlas, modular kits, CC0 filler, commission chassis early | A car takes > 2 weeks of art |
| 8 | Streaming hitches or memory leaks | M | M | Workers, per-frame budget, pools, 30-minute leak test | Heap grows during the leak test |
| 9 | Physics instability (seams, tunnelling, high speed) | M | M | Shape casts, CCD, overlapping seams, clamps, 120 Hz | Random flips or bounces in replay tests |
| 10 | Licensing problems (music, models, fonts) | L | H | Licence record from day 1, CI check, generated credits | Assets without licence entries |
| 11 | Motion sickness | M | M | Comfort options, modest top speed, smooth camera | Playtest reports of nausea |
| 12 | three.js breaking changes | M | L | Pinned versions, one upgrade per milestone on a branch | Upgrade takes > 2 days |
| 13 | Storage quota or download size | L | M | Progressive download, ≤ 200 MB install, `storage.estimate()` checks | Quota errors in local logs |
| 14 | Solo-dev burnout | M | H | Sustainable hours, weekly visible progress, buffer, smaller scope rung | Two missed weekly builds in a row |

Review the register at every milestone exit. Add new risks as they appear.

## Feedback without telemetry

The game never phones home, so bug reports must be easy to make by hand:

- **"Copy bug report"** in Settings collects the build version, browser, GPU info, quality settings and the last 200 log lines. It copies them to the clipboard or downloads a file. Attaching the save file is optional.
- Players paste it into itch.io comments, email or a form you link from the menu.
- Playtesters can export anonymous **session logs** (Acorns per hour, time per region, how often they got stuck) for balancing.

## Release checklist

- [ ] Version bumped (semantic versioning). The save format version is tracked separately
- [ ] Changelog written. An in-game "What's new" postcard appears once after an update
- [ ] Production build passes CI, including the external-URL and licence checks
- [ ] Hosting headers verified: `application/wasm`, long cache for hashed files, no-cache for `index.html` and `sw.js`
- [ ] Fresh-profile test in every P0 browser: first load, then airplane mode, then reload, then play 10 minutes
- [ ] Update test: install the previous version, play, update, and confirm the save survives
- [ ] Export → import round-trip on the release build
- [ ] Credits screen and `CREDITS.md` match the licence record
- [ ] Store page assets: screenshots, trailer, description, system requirements, privacy note ("no data leaves your device")
- [ ] Hotfix branch ready; a patch process for A bugs within 48 hours
