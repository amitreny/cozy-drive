/**
 * Body shape data per car type. Pure data, no three.js.
 * Coordinates: z forward (metres from car centre), y up from the ground at rest.
 */
export type ProfileOp =
  | ['m', number, number]                   // move to (z, y)
  | ['l', number, number]                   // line to (z, y)
  | ['q', number, number, number, number]   // quadratic curve: control (z, y), end (z, y)
  | ['arch', 'front' | 'rear'];             // wheel arch cut-out, travelling rear → front along the sill

export interface BodyDef {
  width: number;          // overall width
  bottom: number;         // sill height
  belt: number;           // window line height
  roof: number;           // roof height
  archClearance: number;  // arch radius minus wheel radius
  tumblehome: number;     // how much narrower the roof is than the body (fraction)
  roundness: number;      // how much the nose and tail narrow in plan view (fraction)
  profile: ProfileOp[];   // closed outline, counter-clockwise starting at the front bottom
  windows: [number, number][][];          // side window panes (z, y)
  twoTone?: number;       // above this height the body uses the accent colour
  accentRoof?: boolean;   // roof panel in the accent colour
  open?: boolean;         // no roof or glass (buggy)
  doors: number[];        // z positions of door seams
  headlights: { z: number; y: number; x: number; round: boolean; size: number };
  taillights: { z: number; y: number; x: number; w: number; h: number };
  grille: { z: number; y: number; w: number; h: number };
  bumpers: { front: number; rear: number; y: number; h: number };
  mirrors: { z: number; y: number };
  seats: { z: number; y: number }[];
  exhaust: { z: number; x: number; y: number };
}

export const BODIES: Record<string, BodyDef> = {
  pip: {
    width: 1.72, bottom: 0.22, belt: 0.93, roof: 1.42, archClearance: 0.06, tumblehome: 0.14, roundness: 0.12,
    profile: [
      ['m', 1.8, 0.22], ['q', 1.94, 0.24, 1.93, 0.45], ['l', 1.91, 0.62], ['q', 1.88, 0.75, 1.62, 0.79],
      ['l', 1.0, 0.91], ['l', 0.25, 1.38], ['q', -0.5, 1.47, -1.4, 1.39], ['q', -1.72, 1.36, -1.8, 1.17],
      ['l', -1.9, 0.86], ['l', -1.93, 0.55], ['q', -1.96, 0.24, -1.8, 0.22], ['arch', 'rear'], ['arch', 'front'],
    ],
    windows: [[[0.86, 0.96], [0.27, 1.33], [-0.3, 1.36], [-0.3, 0.96]], [[-0.42, 0.96], [-0.42, 1.36], [-1.36, 1.34], [-1.62, 1.13], [-1.66, 0.96]]],
    accentRoof: true, doors: [0.95, -0.36],
    headlights: { z: 1.9, y: 0.66, x: 0.56, round: false, size: 0.32 },
    taillights: { z: -1.93, y: 0.78, x: 0.64, w: 0.26, h: 0.2 },
    grille: { z: 1.93, y: 0.46, w: 0.75, h: 0.16 },
    bumpers: { front: 1.9, rear: -1.92, y: 0.36, h: 0.2 },
    mirrors: { z: 0.82, y: 1.0 }, seats: [{ z: 0.0, y: 0.55 }, { z: -0.9, y: 0.55 }],
    exhaust: { z: -1.9, x: -0.45, y: 0.26 },
  },
  badger: {
    width: 1.88, bottom: 0.47, belt: 1.22, roof: 1.92, archClearance: 0.08, tumblehome: 0.05, roundness: 0.05,
    profile: [
      ['m', 2.02, 0.47], ['l', 2.13, 0.53], ['l', 2.16, 0.98], ['l', 2.1, 1.1], ['l', 1.15, 1.16], ['l', 0.95, 1.22],
      ['l', 0.62, 1.84], ['l', 0.5, 1.9], ['l', -1.98, 1.92], ['l', -2.12, 1.84], ['l', -2.16, 1.1], ['l', -2.15, 0.56],
      ['l', -2.06, 0.47], ['arch', 'rear'], ['arch', 'front'],
    ],
    windows: [[[0.86, 1.26], [0.57, 1.8], [-0.36, 1.82], [-0.36, 1.26]], [[-0.48, 1.26], [-0.48, 1.82], [-1.95, 1.82], [-1.95, 1.26]]],
    doors: [0.97, -0.42],
    headlights: { z: 2.16, y: 0.9, x: 0.62, round: true, size: 0.24 },
    taillights: { z: -2.16, y: 1.0, x: 0.78, w: 0.16, h: 0.3 },
    grille: { z: 2.17, y: 0.86, w: 0.8, h: 0.34 },
    bumpers: { front: 2.2, rear: -2.18, y: 0.58, h: 0.24 },
    mirrors: { z: 0.88, y: 1.32 }, seats: [{ z: 0.05, y: 0.85 }, { z: -1.05, y: 0.85 }],
    exhaust: { z: -2.1, x: -0.55, y: 0.5 },
  },
  biscuit: {
    width: 1.92, bottom: 0.32, belt: 1.2, roof: 2.03, archClearance: 0.06, tumblehome: 0.06, roundness: 0.1,
    profile: [
      ['m', 2.2, 0.32], ['q', 2.33, 0.34, 2.33, 0.6], ['l', 2.3, 1.18], ['l', 2.12, 1.84], ['q', 2.02, 2.03, 1.7, 2.03],
      ['l', -2.05, 2.03], ['q', -2.3, 2.01, -2.32, 1.75], ['l', -2.33, 0.52], ['q', -2.33, 0.32, -2.2, 0.32],
      ['arch', 'rear'], ['arch', 'front'],
    ],
    windows: [[[2.05, 1.26], [1.96, 1.8], [1.3, 1.82], [1.3, 1.26]], [[1.16, 1.26], [1.16, 1.82], [-0.3, 1.82], [-0.3, 1.26]], [[-0.44, 1.26], [-0.44, 1.82], [-1.98, 1.82], [-1.98, 1.26]]],
    twoTone: 1.17, doors: [2.1, 1.22],
    headlights: { z: 2.32, y: 0.86, x: 0.66, round: true, size: 0.22 },
    taillights: { z: -2.33, y: 0.92, x: 0.78, w: 0.14, h: 0.32 },
    grille: { z: 2.33, y: 0.55, w: 0.9, h: 0.12 },
    bumpers: { front: 2.36, rear: -2.36, y: 0.42, h: 0.16 },
    mirrors: { z: 2.0, y: 1.3 }, seats: [{ z: 1.45, y: 0.8 }, { z: -0.6, y: 0.8 }],
    exhaust: { z: -2.3, x: 0.5, y: 0.3 },
  },
  skipper: {
    width: 1.62, bottom: 0.42, belt: 0.96, roof: 0.96, archClearance: 0.1, tumblehome: 0, roundness: 0.22, open: true,
    profile: [
      ['m', 1.58, 0.42], ['l', 1.76, 0.6], ['l', 1.72, 0.76], ['l', 0.9, 0.86], ['l', 0.48, 0.96], ['l', -0.92, 0.96],
      ['l', -1.42, 0.9], ['l', -1.62, 0.7], ['l', -1.56, 0.45], ['arch', 'rear'], ['arch', 'front'],
    ],
    windows: [], doors: [],
    headlights: { z: 1.72, y: 0.72, x: 0.45, round: true, size: 0.17 },
    taillights: { z: -1.62, y: 0.75, x: 0.5, w: 0.12, h: 0.1 },
    grille: { z: 1.74, y: 0.55, w: 0.5, h: 0.1 },
    bumpers: { front: 1.78, rear: -1.62, y: 0.5, h: 0.1 },
    mirrors: { z: 0.4, y: 1.15 }, seats: [{ z: -0.35, y: 0.62 }],
    exhaust: { z: -1.6, x: 0.3, y: 0.7 },
  },
};
