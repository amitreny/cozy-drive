# 02 · Game Design

## Core loops

```
Moment (seconds):    steer · feel the surface · hear the engine · enjoy the view
Session (15-45 min): pick a direction → discover (place / collectible / errand)
                     → earn Acorns + unlocks → garage → tweak the car → go further
Long term (hours):   find barn cars → restore them → reach harder terrain
                     → reveal the whole island → complete the scrapbook
```

**The key link:** terrain is a soft gate, customization is the key. Dunes want sand tyres and low pressure. The snow pass wants studded tyres. The canyon wants lift, 4×4 and diff locks. Every gated area also has a slower paved detour, so nobody is ever locked out.

## Premise (light narrative)

You inherit your aunt's dusty garage on a small island, plus her old hatchback. Letters she left around the island lead you to places, people and forgotten cars. No cutscenes. Story arrives as letters, postcards and short NPC chats with gibberish "blip" voices.

## The island (1.0 world: 4 × 4 km)

| Region | Terrain types | Landmarks | Signature activity | Recommended setup |
|---|---|---|---|---|
| **Home Valley** (start) | Asphalt, dirt, grass, cobble in village | Home garage, village, farm, windmill | Tutorial errands | Anything |
| **Pinewood & Lakes** | Gravel logging roads, dirt, mud after rain, shallow fords | Ranger tower, lakeside campsite, waterfall | Green/blue trails | AT tyres, some lift |
| **Coast & Dunes** | Sand, wet sand, boardwalk planks | Lighthouse, beach café, shipwreck | Dune trails, sunset photos | Sand tyres, low pressure, light car |
| **Red Rock Canyon** | Rock, packed dirt, sand washes | Arch, abandoned mine, desert garage | Rock crawling trails (black) | 4×4, low range, lockers, big tyres |
| **Alpine Pass** | Snow (fresh/packed), ice (frozen lake), asphalt switchbacks | Mountain cabin, observatory, frozen lake | Snow trails, night stargazing | Snow/studded tyres, AWD |
| **Wetlands** | Mud, deep water, reed grass | Stilt houses, bird hide, old ferry | Fords, mud trails | Mud tyres, snorkel |

World design rules:

- **Density over size.** A point of interest at least every ~300 m of road. From every viewpoint you can see the next landmark.
- **Roads first.** ~40 km of roads and trails. A paved loop around the island, gravel spokes inland, trails branching off those.
- **Readable terrain.** The surface type is legible from colour and texture at 50 m.
- **Vistas.** Each region has one "wow" overlook placed for golden hour.

## Activities

| Activity | How it works | Reward | Priority |
|---|---|---|---|
| **Collectibles** | ~150 hidden items: garden gnomes, lost hubcaps, sticker sheets. Sparkle visible within 40 m | Acorns; hubcaps unlock rims; stickers unlock decals | P0 |
| **Viewpoints** | Drive to an overlook marker → reveals the map around it → postcard to scrapbook | Map reveal, Acorns | P0 |
| **Errands** | An NPC asks you to carry something from A to B. Fragile cargo (eggs, cake, a cat) has a "jostle meter" that only affects a bonus, never fails | Acorns, friendship, part unlocks | P1 |
| **Trails** | Marked off-road routes rated green / blue / black. Finish at any speed. Optional personal-best timer, off by default | Trail badges, parts | P1 |
| **Photo requests** | "Photograph the lighthouse at sunset." Photo mode checks subject in frame, its size, and time of day | Acorns, decals, frames | P1 |
| **Camping** | At campsites (camper van: any flat spot) set up camp: campfire, skip time, save, change music | Time skip, save point | P1 |
| **Barn finds** | Letters point to hidden barns. Each holds a dusty car type. Drive it home to restore it in the garage | New car types | P1 |
| **Car wash** | Mud and dust build up visually. Wash at the village, or drive through rain or rivers | Cosmetic joy | P1 |
| **Car meets** | Saturday evening in the village square. NPC cars show off builds and you can "vote" | Rare cosmetics | P2 |

## Progression & economy

Currency: **Acorns** (placeholder name). One soft currency, no premium currency.

| Source | Typical amount | Sink | Typical price |
|---|---|---|---|
| Collectible | 10–25 | Paint finishes | 50–150 |
| Viewpoint | 50 | Rims, body parts | 100–400 |
| Errand | 40–120 | Performance parts | 200–800 |
| Trail (first clear) | 150–400 | Barn car restoration | 500–1500 |
| Photo request | 80–200 | Trinkets, horns | 20–100 |

Pacing targets:

- First garage purchase within 5 minutes. First new tyre type by minute 20.
- All P0 parts affordable by ~10 hours. Completion at ~20–25 hours.
- **Creative mode** in settings unlocks everything for players who only want to build and cruise. Saves keep working.
- Unlock rules are data-driven. A part can require Acorns, a discovered region, or a found collectible.

## Cozy systems

- **Day/night:** 24 real minutes per in-game day by default (adjustable 12–60 min, or freeze time). The sun curve slows around sunrise and sunset, so golden hour lasts longer.
- **Weather:** per-region state machine (clear → cloudy → light rain → clear). Morning fog in the valley. Snowfall only in the alpine region. Rainbows after rain.
- **Companion:** a dog or cat in the passenger seat. It sticks its head out of the window at speed, reacts to bumps and can be petted at stops. Customizable collar or bandana.
- **Radio:** 3 stations (lo-fi, acoustic folk, ambient) plus "engine & nature only".
- **Wildlife:** deer, sheep, birds, beach crabs. Animals always move out of the way and cannot be hit.
- **NPC traffic (P2):** a few slow cars on the paved loop. They stop politely if blocked.

## Recovery & travel (no punishment)

| Situation | Response |
|---|---|
| Upside down or on its side for > 2 s | Prompt "Hold R to flip"; gentle lift-and-rotate animation |
| Stuck in mud or snow | Rocking assist, lower tyre pressure, winch (P2), or "Call tow" → fade to the nearest road |
| Deep water | Engine sputters, fade to the nearest bank. No damage, no loss |
| Far from anywhere | Fast travel between discovered garages and campsites from the map |
| Out of bounds | Soft invisible boundary at the coast. The car is gently steered back |

**Cruise mode (P1):** on any road, press C and the car drives itself along the road network, to a chosen destination or at random. The player can look around, take photos or change the radio. It uses the same road graph as the GPS.

## Photo mode

- Free camera within 30 m of the car, collision-aware. Roll, FOV, depth of field, exposure.
- Time-of-day and weather scrub for the shot only. It does not change the world state.
- Filters (film, warm, B&W, polaroid), frames, hide the companion or HUD.
- Saves to an in-game **scrapbook** in IndexedDB (thumbnail + full image), plus a "Download PNG" button.
- Photo requests check the camera frustum, the subject's screen-space bounding box and the clock.

## Map & navigation

- A stylized painted map baked from terrain and biome data at build time.
- Fog of war is revealed as you drive and from viewpoints. The reveal mask is saved.
- Markers: discovered POIs, found collectibles, errands, campsites, garages.
- Custom waypoint → shortest route on the road graph → a soft ribbon of arrows on the road ahead.
- HUD compass strip shows nearby discovered POIs. No mini-map by default; optional in settings.

## HUD & screens

**In-drive HUD** (minimal, fades when idle): speed, gear, compass strip, prompt area, radio toast on station change. Optional: tachometer, surface indicator, tyre pressure and drivetrain mode when those parts are fitted.

**Screens:** Title (Continue has default focus), Pause, Garage (see [04-customization.md](04-customization.md)), Map, Scrapbook & collections, Photo mode, Letters/journal, Settings.

## Onboarding (first 10 minutes)

| Minute | Beat | Teaches |
|---|---|---|
| 0 | Title → Continue/New. The car is already idling outside the garage at sunrise | Driving within seconds |
| 0–2 | Aunt's letter: "Fetch eggs from the farm." Road arrows guide you | Steering, errands, fragile cargo |
| 2–4 | The farmer mentions the view from the hill. Dirt track, then grass | Surfaces feel different |
| 4–5 | Viewpoint reveals the valley map; a gnome sits nearby | Map reveal, collectibles |
| 5–8 | Back home: buy a paint colour and new rims | Garage, economy |
| 8–10 | A letter hints at a barn in Pinewood; the gravel road calls | Open world, first long-term goal |

No tutorial pop-ups that pause the game. Contextual one-line prompts only, dismissable, never repeated.

## Accessibility & comfort

- Fully remappable keys and gamepad buttons; hold-or-toggle options.
- Driving assist presets: **Relaxed** (default), **Standard**, **Sim-lite**, with individual toggles below them.
- Comfort: camera shake off, FOV slider, horizon-locked camera, motion blur off, slow camera recentre.
- Visual: UI scale 80–150%, high-contrast UI, colour-blind safe markers (shape + colour), text size.
- Audio: separate volumes for master, music, engine, ambience, UI; mono option.
- Units km/h or mph; 12 h or 24 h clock.
- Pause anywhere, including during errands. Save anywhere outside menus.

## Settings

- **Graphics:** preset (Auto/Low/Medium/High/Ultra), render scale, dynamic resolution, view distance, shadows, vegetation density, post-processing, frame cap (30/60/unlimited).
- **Controls, assists, comfort, audio:** as above.
- **Gameplay:** time speed, creative mode, units.
- **Data:** export/import save, delete save, "download full world for offline", storage usage, error log export.
