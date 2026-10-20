# 0007 · Aircraft, airports, towns and delivery jobs

**Status:** accepted

## Aircraft (`src/flight/`)

Six aircraft, each modelled on a real type. The CC BY 3.0 models are credited in CREDITS.md and in the hangar.

| Aircraft | Real type | Notes |
|---|---|---|
| Wren | Cessna 172 class | free starter, tricycle gear, flaps |
| Poppy | Stearman-style biplane | taildragger |
| Puffin | Super Cub on amphibious floats | water or runway |
| Kestrel | Extra 300-class aerobatic | taildragger, full-span ailerons |
| Hummingbird | Bell 206 class | skids |
| Dandelion | 2,200 m³ hot-air balloon | basket |

**Fixed-wing physics is built from the airframe, not from a table of stability derivatives.**
- Each wing has four panels: inner panels with flaps and outer panels with ailerons. With the tailplane and fin, each panel computes its own local airflow, including the body's rotation, plus wind and propeller slipstream on the tail.
- Each panel uses a finite-wing lift slope (Helmholtz) and induced drag, with a rounded stall that breaks to flat-plate lift. Wings also get ground effect.
- Stability, damping, adverse yaw, wing drop and weathervaning all emerge from the geometry.
- Thrust is limited by power and falls off from its static value as speed rises. A windmilling propeller adds drag at idle.
- Gear forces act along the ground normal. Tailwheels steer the opposite way to nosewheels. Float hulls have buoyancy, a drag "hump" and planing lift.

**Helicopter:**
- Thrust comes from momentum theory: the hover limit is set by power, with figure of merit 0.7.
- Translational lift, ground effect and heave damping are included.
- The cyclic tilts the rotor disc. The hub moment and rotor damping act on the body, and main-rotor torque is balanced by the tail rotor.

**Balloon:**
- Envelope temperature follows a heat balance: a 3 MW burner against losses, about a 5-minute time constant.
- Buoyancy uses (ρ_air − ρ_hot)·V·g.
- The envelope is a sphere of drag in the wind. Pitch and roll are locked so the basket hangs plumb.
- The wind veers about 70° and doubles in strength by 600 m, so altitude is the steering.

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
| Dandelion | holds level near its equilibrium temperature, climbs on the burner, sinks on the vent |
| All | a crash is detected |

## Airports (`src/world/airports.ts`, `airportsRender.ts`, `network.ts`)

**The bases:**
- **Island Airfield:** a 900 m asphalt runway with markings and edge lights, apron, taxiway, three hangars, a tower, an office and a windsock.
- **Dune Strip:** 550 m of grass with edge boards.
- **Helipads:** Hearthwick, and the summit pad.
- **Piers:** Harbour and Northshore, both on the open sea. The lake is too small for floatplanes to get off safely (about 300 m of water), so it has no pier, but you can land on it.

**Siting and access:**
- Runway sites were picked by a search for the least earthwork with clear 1:20 approaches. They are levelled onto a fitted plane with at most 0.8% slope.
- Each base gets an access road to the nearest road.
- You take an aircraft from the hangar (E). Land anywhere, stop and press E to park. At a base, your car is in the car park; elsewhere the ground crew drives it to the nearest road. A crash brings you back to where you took off.

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
