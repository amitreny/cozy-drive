# 0007 · Aircraft, airports, towns and delivery jobs

**Status:** accepted

## Aircraft (`src/flight/`)

Nine aircraft, each modelled on a real type. The CC BY 3.0 and CC0 models are credited in CREDITS.md and in the hangar. The Heron's model is a CC0 An-24-style twin turboprop, converted from its .blend by `tools/blend2glb.mjs` (a small .blend reader in `tools/blendfile.mjs`).

| Aircraft | Real type | Notes |
|---|---|---|
| Wren | Cessna 172 class | free starter, tricycle gear, flaps |
| Poppy | Stearman-style biplane | taildragger |
| Puffin | Super Cub on amphibious floats | water or runway |
| Kestrel | Extra 300-class aerobatic | taildragger, full-span ailerons |
| Hummingbird | Bell 206 class | skids |
| Pelican | Sea King / S-61 class | wheels, 19 m four-blade rotor, twin turbines: climbs ~10 m/s, past 6 km |
| Dandelion | 2,200 m³ hot-air balloon | basket |
| Heron | Dash 8-100-class regional turboprop | 14 t, twin turboprops, needs an 800 m runway |
| Peregrine | Eurofighter Typhoon-class supersonic jet | 14 t, two afterburning turbofans, retractable gear, needs an 800 m runway |

**The Heron is a regional turboprop rather than a jet** because a narrow-body jet needs about 1.8–2 km of runway and the island's longest was 900 m. It flies from Island Airfield (now 1.2 km) on its real numbers. Airliners have since got a home: Longreach International's 3.2 km code E runway (see [0009](0009-archipelago.md)).
- Two 1,490 kW engines with 3.96 m four-blade constant-speed propellers. Static thrust fades more slowly with speed than a fixed-pitch prop's.
- The turbines take 2.5 s to light (no thrust until then), and their power lags the lever. The HUD shows torque.
- The centre of gravity sits near the wing's quarter chord, as on an airliner, so the tail does the stabilising.
- The relaxed assist commands an airliner's pitch and roll rates (`handling`). On the ground, its attitude hold has an integral term so the heavy tail can rotate the aircraft.

**Airbrakes and spoilers (Space), only where the real type has them** (`airbrake` in the spec):
- **Peregrine:** a dorsal airbrake (drag only).
- **Heron:** two spoilers per wing outboard of the nacelles, as on the Dash 8. They add 2.4 m² of drag and spoil 55 % of the wing's lift, so the stall speed rises while they're out. As ground spoilers they pop up by themselves on the runway at idle power above 15 m/s: the weight goes onto the wheels and the brakes bite, shortening the landing roll.
- The panels are drawn on the airframe, hinged at their front edge, and open as they deploy. The airflow noise rises with them.
- The light aircraft (Wren, Poppy, Puffin, Kestrel) have none, as their real types don't. Pilots slow them with idle power (a windmilling propeller is a strong brake), flaps or a sideslip.

**The Peregrine is a fighter-class jet**, which (unlike an airliner) fits the 900 m runway: in afterburner it has more thrust than weight. Its model is a CC BY twin-finned delta from Poly Pizza, scaled to the Typhoon's 11 m span. The under-wing stores are left off, and it stands on fitted tricycle gear.
- **Engines:** two EJ200-class turbofans, 2 × 60 kN dry and 2 × 90 kN wet. The last 15 % of the throttle goes through the gate into afterburner, which lights once the core is near full power. The core spools up in about four seconds. Thrust falls with density (σ^0.9) and gains with ram pressure (1 + 0.2 M²).
- **Wave drag:** zero-lift drag grows from Mach 0.8 to 2.6× at Mach 1.05, then eases to 1.8× by Mach 2. So it is subsonic on dry power low down and supersonic in afterburner (Mach 1.05–1.3 at sea level), and the thin, cold air at 11 km lets it reach Mach 1.7–2.1. The speed of sound follows ISA temperature (340 m/s at sea level, 295 m/s above the tropopause).
- **Fly-by-wire:** above the corner speed (where full stick at the stall angle pulls the g limit), the control surfaces are scaled back with dynamic pressure, so the stick commands g rather than deflection. The relaxed assist also caps the pitch rate at the 9 g limit (the Typhoon's).
- **Agile flight computer** (`handling.agile`): on the relaxed assist the jet has no bank limit (it rolls right round, about 230°/s, and loops), levels its wings whenever you let go of the roll (even from inverted), and has stiffer pitch and roll loops, so the g comes on at once. The light aircraft and the Heron keep the gentle trainer-style assist. Without this, at Mach 1 the surfaces would be ten times too strong and the control loops would oscillate.
- **Retractable gear (G):** it won't come up with weight on the wheels, won't move above 540 km/h, takes 5 s to travel, and adds 0.6 m² of drag while down. Touching down with it up is a crash (a belly landing). On the relaxed assist it lowers itself when you descend below 200 m at approach speeds.
- **Airbrake:** Space puts out its dorsal airbrake behind the canopy (1.3 m² of drag).
- **Rapier's speed cap:** Rapier caps a body's speed at 400 m/s per length unit. While a jet flies, the world's length unit is 2 (800 m/s). It is raised only then, because it also scales the contact tolerances the cars are tuned with.
- **Effects:** afterburner flames, a vapour cone near Mach 1 in the damp air low down, and a double sonic boom as you cross Mach 1. The fog and the camera's far plane open out with height, and the sea follows the camera, so from 12 km you see the island as a speck in an ocean that reaches the horizon.

**Fixed-wing physics is built from the airframe, not from a table of stability derivatives.**
- Each wing has four panels: inner panels with flaps and outer panels with ailerons. With the tailplane and fin, each panel computes its own local airflow, including the body's rotation, plus wind and propeller slipstream on the tail.
- Each panel uses a finite-wing lift slope (Helmholtz) and induced drag, with a rounded stall that breaks to flat-plate lift. Wings also get ground effect.
- Stability, damping, adverse yaw, wing drop and weathervaning all emerge from the geometry.
- Thrust is limited by power and falls off from its static value as speed rises. A windmilling propeller adds drag at idle.
- Gear forces act along the ground normal. Tailwheels steer the opposite way to nosewheels. Float hulls have buoyancy, a drag "hump" and planing lift.

**Helicopter:**
- Thrust comes from momentum theory: the hover limit is set by power, with figure of merit 0.7.
- Translational lift, ground effect and heave damping are included.
- Turboshaft power falls with air density, which sets each helicopter's ceiling: the Hummingbird hovers to about 3.6 km (4.8 km in forward flight), the Pelican to about 6 km (7.2 km).
- The cyclic tilts the rotor disc. The hub moment and rotor damping act on the body, and main-rotor torque is balanced by the tail rotor.

**Balloon:**
- Envelope temperature follows a heat balance: a 3 MW burner against losses, about a 5-minute time constant.
- Buoyancy uses (ρ_air − ρ_hot)·V·g.
- The envelope is a sphere of drag in the wind. Pitch and roll are locked so the basket hangs plumb.
- The prevailing surface wind is a sea breeze along the runways (blowing towards 320°, drifting up to about 30° through the day), so take-offs are mostly into wind. It veers about 70° and doubles in strength by 600 m, so altitude is the steering.

**Assists change what the stick commands, never the physics.**
- **Relaxed:**
  - Planes: rate-command and attitude-hold in the air, with wing levelling, stall protection and a turn coordinator. On the ground, the stick moves a held attitude of up to 10° (no tail strikes or float digs), and the heading is held when you're not steering.
  - Helicopter: attitude command, a climb-rate collective and heading hold.
- **Standard:** auto-trim and a turn coordinator.
- **Sim-lite:** raw controls.

**Checks** (`tests/flight.test.ts`, flat ground and still air):

| Aircraft | Checked |
|---|---|
| Wren | lift-off at 25–33 m/s after 180–480 m; top speed 55–68 m/s; clean stall 20–29 m/s; best-climb 3–5 m/s; glide 8–11.5:1; hands-off stable; roll sense correct |
| Poppy / Kestrel | Poppy lifts off slower than the Wren, the Kestrel faster |
| Puffin | floats at a sensible draft; off the water in under 330 m |
| Hummingbird | hovers hands-off and climbs |
| Pelican | hovers hands-off; climbs above 8.5 m/s (the Hummingbird under 4.5); the Hummingbird can't climb at 5.5 km, the Pelican still can at 6.5 km and can't at 8 km |
| Dandelion | holds level near its equilibrium temperature, climbs on the burner, sinks on the vent |
| Airbrakes (`tests/airbrake.test.ts`) | only the jet and the airliner have them; the jet's airbrake at least 1.4× the speed loss at idle; spoilers out make the Heron sink 3 m/s faster on the same stick; ground spoilers deploy on the landing roll and shorten it |
| Peregrine (`tests/jet.test.ts`) | lift-off at 280–390 km/h after 300–700 m in afterburner; subsonic on full dry power at sea level, Mach 1.05–1.3 in afterburner; Mach 1.7–2.1 at 11 km; full stick at 300 m/s pulls 5–8.5 g (6.5+ within 2 s); rolls past 200°/s with no bank limit and levels its wings hands-off; gear only comes up in the air and below its speed limit; a wheels-up landing is a crash; approach speed 250–310 km/h |
| Heron | no thrust until the turbines light; with a notch of flap, lift-off at 46–57 m/s after 350–650 m; 430–490 km/h low down; clean stall 44–52 m/s; brakes to a stop from 45 m/s in under 450 m; hands-off stable, airliner roll and pitch rates; offered only at runways of 800 m or more |
| All | a crash is detected |

## Landing guide (`src/flight/approach.ts`, `landingGates.ts`; on by default, L toggles it in the air)

An aeroplane flying towards a runway end (within 12 km, roughly along it, inside its approach funnel) is given an approach to it, as an instrument landing system would:
- **Approach instrument** on the HUD: a centreline needle (full scale ±2.5°) and a glide-path needle (3°, full scale ±0.7°), each a diamond showing where the path is. Plain cues: the heading to steer to rejoin the centreline, how many metres high or low and the descent rate to fly, the approach speed (1.3 × the clean stall speed), when to set each notch of flap (by 7, 3.5 and 1.5 km), and when to flare.
- **Gates** every 600 m along the glide path out to 6 km, widening with distance; the next one turns green while you're inside it.
- **Maps** (the minimap zooms out to 3 km while flying a plane): every runway's extended centreline, the active one in coral with a dot each kilometre, and a line along your track.
- **At the runways:** PAPI lights beside each aim point (four lights, white above and red below 3.5°/3.17°/2.83°/2.5°: two of each on the path), and at the airfield approach lights with a crossbar and, at night, a sequenced flasher.
- The cockpit view hides the airframe (the models have no interiors), leaving the propellers and rotor discs.

## Airports (`src/world/airports.ts`, `airportsRender.ts`, `network.ts`)

**The bases:**
- **Island Airfield:** a 900 m asphalt runway with markings and edge lights, a parallel taxiway the length of the runway (joined to it at both ends and to the apron in the middle, with rounded junctions, centrelines that curve through the turns and onto the runway centreline, hold-short lines and blue edge lights), apron, three hangars, a tower, an office and a windsock.
- **Dune Strip:** 550 m of grass with edge boards.
- **Helipads:** Hearthwick, and the summit pad.
- **Piers:** Harbour and Northshore, both on the open sea. The lake is too small for floatplanes to get off safely (about 300 m of water), so it has no pier, but you can land on it.

**Siting and access:**
- Runway sites were picked by a search for the least earthwork with clear 1:20 approaches. They are levelled onto a fitted plane with at most 0.8% slope.
- Each base gets an access road to the nearest road.
- You take an aircraft from the hangar (E). Land anywhere, stop and press E to park. At a base, your car is in the car park; elsewhere the ground crew drives it to the nearest road. A crash brings you back to your base: an aeroplane is lined up at the start of the runway, into the wind, with the engine running and take-off flap set; anything else returns to where it took off.

## Homes and businesses (`src/world/lots.ts`, `town.ts`)

- Plots are placed in the world worker, after roads, beside a road and facing it. Each one must be clear of every road, not too steep, dry, and away from airports and other plots. Its pad is levelled without touching any road.
- Hearthwick has six plaza shops. Eight hamlets have their own businesses (fish, café, woodworks, farm, ice cream, honey, stores). That's 56 homes and 13 businesses in all.
- Buildings come from Kenney's City Kits (CC0), instanced by model and roof colour, with solid colliders. Homes get fenced gardens, planters, driveways and numbered letterboxes. Shops get painted name boards, awnings, and parasols for the cafés.
- Each home has a name and its residents, such as the Larks at Bramble Cottage.
- A keep-clear mask stops trees and rocks growing on runways or in gardens.

## Delivery jobs (`src/gameplay/jobs.ts`, `deliveries.ts`)

**Job boards:**
- Each business's board offers work suited to its trade. Fragile goods include cakes, flowers, eggs and honey. Perishables include fish, ice cream and lunches. Heavy loads include timber, tools and furniture.
- Supply runs go between businesses: the farm supplies the bakery, the café and the stores.
- Air-cargo offices offer runway-to-runway runs, which any aeroplane can fly, plus helipad and pier runs for the helicopter and the seaplane.
- Jobs are deterministic per board and batch, and saved.

**Capacity:** loads are limited by the vehicle. The coupe or buggy carries 1, the van 6, the pickup 8, the trainer 4.

**Delivering:**
- By car, stop at the letterbox.
- By helicopter, land by the house; this earns a doorstep bonus.
- By plane, stop at the base.
- By balloon, land within 120 m.

**Pay** is in Acorns, by distance and load. Fragile goods earn a care bonus, from a jostle meter fed by the vehicle's acceleration spikes. Perishables earn an on-time bonus. Nothing ever fails; you only miss a bonus.

## Also in this change

- The map shows the whole island (the fog of war was removed).
- Roads near the lake stay above its water.
- `WORLD_VERSION` is 10.
