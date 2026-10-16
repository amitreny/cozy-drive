# Sunday Drive: Development Plan

*Working title. A cozy, offline, open-world driving game for desktop browsers, with fully customizable cars, eight car types and twelve terrain surfaces.*

You restore old cars found in barns, customize every part, and wander a small island of meadows, forests, dunes, canyons, snowy passes and wetlands. There are no timers, no damage and no fail states. Terrain is the gentle puzzle: the right tyres, suspension and drivetrain open up new places.

## Documents

| # | Document | What's inside |
|---|---|---|
| 01 | [Vision & Scope](01-vision-and-scope.md) | Pitch, planning assumptions, pillars, anti-goals, scope ladder, prioritized features, success criteria |
| 02 | [Game Design](02-game-design.md) | Core loops, island regions, activities, economy, cozy systems, recovery, photo mode, map, HUD, onboarding, accessibility |
| 03 | [Car Types & Vehicle Physics](03-vehicles-and-physics.md) | Eight-car roster, suspension, tyre and drivetrain model, assists, tuning tools, handling acceptance targets |
| 04 | [Car Customization](04-customization.md) | 15 customization layers, ~300 items, data model, build-to-spec pipeline, paint and sticker rendering, garage UX |
| 05 | [World, Terrain & Surfaces](05-world-and-terrain.md) | 12 surface types, tyre × surface grip matrix, world data layers, streaming, terrain, water, vegetation, weather |
| 06 | [Technical Architecture](06-technical-architecture.md) | Stack and decision gates, module rules, main loop, workers, offline/PWA, saves, input, audio, budgets, presets, folder layout |
| 07 | [Art, Audio & Content Pipeline](07-art-audio-pipeline.md) | Art direction, polygon budgets, Blender conventions, asset build, world baker, dev editor, audio, localization, legal |
| 08 | [Roadmap & Milestones](08-roadmap.md) | M0–M7 with task checklists and exit criteria, timeline, team-size variants, week-1 start |
| 09 | [Quality, Risks & Release](09-quality-risks-release.md) | Test strategy, browser matrix, CI, bug severity, definition of done, risk register, release checklist |

**Suggested reading order:** 01 → 08 for the big picture, then 03, 04 and 05 for the heart of the game, then 06 and 07 before writing code.

## Key decisions at a glance

- **Stack:** TypeScript + Vite, three.js (WebGPU with automatic WebGL2 fallback), Rapier physics (WASM), Preact for menus, IndexedDB for saves, a service worker for offline play.
- **Vehicle physics:** custom ray/shape-cast wheels on a Rapier rigid body, fixed 120 Hz step, forgiving tyre curves, assists on by default.
- **World:** 4 × 4 km island, 6 regions, 12 surface types, streamed in 128 m chunks. Vegetation is generated at runtime from rules, not downloaded.
- **Customization:** data-driven parts attached to sockets. A pure `resolveSpec` function turns a build into physics values. Paint, patterns and stickers are shader- and texture-driven.
- **Cozy rules:** no fail states, no damage, no default timers. Terrain is a soft gate, and every gated area has a slower paved detour.
- **Offline:** no network needed after the first visit; installable; saves stay local with export and import.
- **Schedule:** ~11 months of planned work for one full-time developer, ~13 months with buffer. The vertical slice at week 24 is the key go/no-go gate.

## Biggest risks

1. **Driving feel.** Gated at the end of M1, before anything else is built on top.
2. **Scope versus one person.** Handled by the scope ladder and a re-plan after the vertical slice.
3. **Art volume.** Handled by the palette-atlas approach, parts shared by size class, and commissioning car chassis early.

## Open questions for week 1

- How many people, and how many hours per week? This changes every estimate.
- Which scope rung: Lite, Standard or Dream?
- Free or paid release? This affects music licensing and store choice.
- Final name, after a trademark check.
- Is touch/mobile support really post-1.0?
