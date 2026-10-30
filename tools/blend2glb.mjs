// Converts the Heron's airframe from its source .blend to the game's .glb (see CREDITS.md):
//   node tools/blend2glb.mjs <twin_turboprop_rigged.blend> public/models/aircraft/turboprop.glb
// Source: "Twin turboprop rigged airplane. Low poly." by mfonasd, CC0 (opengameart.org/content/twin-turboprop-rigged-airplane-low-poly).
// The mesh is taken in its rest pose (gear down, flaps up), turned into the game's axes (+z nose, +y up, +x left),
// its propellers left out (the game draws working ones) and its flaps split off as their own nodes so they can move.
// Faces are coloured in the Heron's livery by the source material they use.
import { writeFileSync } from 'node:fs';
import { openBlend } from './blendfile.mjs';

const [, , src, out, flag] = process.argv;
const DEBUG = flag === '--debug'; // a loud colour per source material, to see which is which
if (!src || !out) { console.error('usage: node tools/blend2glb.mjs <in.blend> <out.glb>'); process.exit(1); }

/** Livery by source material (sRGB): white over teal, as the Heron has always worn. */
const LIVERY = {
  'fus.010': 0xf2f2f0,  // upper fuselage and nose
  'fus.000': 0x2a6f8f,  // lower fuselage and fin
  'eng.000': 0xf2f2f0,  // nacelles
  'wing.000': 0xdfe2e6, // wings and tailplane
  'wint.000': 0x232527, // tyres, nose radome, intakes
  'cock.000': 0x9aa0a6, // gear legs
  'fus.1': 0xc8ccd2,    // doors
  'tail.000': 0xe07a5f, // ventral strake
  Glass: 0x1d2733,      // windows
};
const DROP = ['propL', 'propR'];
const SPLIT = { flapsL: 'FlapL', flapsR: 'FlapR' };

const bf = openBlend(src);
const ob = bf.all('OB').find((o) => o.get('id').get('name') === 'OBan24');
const [me] = bf.deref(ob.get('data'));
const groups = bf.list(ob.get('defbase')).map((g) => g.get('name'));
const m = ob.get('obmat');
// Blender world (x right, y forward, z up) → game (x left, y up, z forward).
const verts = bf.deref(me.get('mvert'), 'MVert').map((v) => {
  const c = v.get('co'), w = [0, 1, 2].map((r) => m[r] * c[0] + m[4 + r] * c[1] + m[8 + r] * c[2] + m[12 + r]);
  return [-w[0], w[2], w[1]];
});
const vgroup = bf.deref(me.get('dvert'), 'MDeformVert').map((dv) => {
  let best = null, bw = 0.5;
  for (const w of bf.deref(dv.get('dw'), 'MDeformWeight')) if (w.get('weight') > bw) { bw = w.get('weight'); best = groups[w.get('def_nr')]; }
  return best;
});
const loops = bf.deref(me.get('mloop'), 'MLoop').map((l) => l.get('v'));
const mats = bf.pointers(me.get('mat'), me.get('totcol')).map((p) => (p ? bf.deref(p)[0].get('id').get('name').slice(2) : 'none'));

// Faces → node → material → triangles (fans).
const nodes = new Map(); // node name → Map(material → number[] of vertex indices)
let dropped = 0;
for (const p of bf.deref(me.get('mpoly'), 'MPoly')) {
  const start = p.get('loopstart'), n = p.get('totloop'), idx = loops.slice(start, start + n);
  const gs = new Set(idx.map((i) => vgroup[i]));
  const only = gs.size === 1 ? [...gs][0] : null;
  if (only && DROP.includes(only)) { dropped++; continue; }
  const node = (only && SPLIT[only]) || 'Airframe', mat = mats[p.get('mat_nr')];
  if (!nodes.has(node)) nodes.set(node, new Map());
  const byMat = nodes.get(node);
  if (!byMat.has(mat)) byMat.set(mat, []);
  for (let k = 1; k < n - 1; k++) byMat.get(mat).push(idx[0], idx[k], idx[k + 1]);
}

// glTF: one mesh per node, one primitive per material, flat (unindexed) so faces stay flat-shaded.
const lin = (c) => ((c / 255) <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
const matNames = [...new Set([...nodes.values()].flatMap((b) => [...b.keys()]))];
const gltf = { asset: { version: '2.0', generator: 'cozy-drive blend2glb' }, scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [], materials: [], accessors: [], bufferViews: [], buffers: [] };
for (const name of matNames) {
  const hex = DEBUG ? [0xe6194b, 0x3cb44b, 0xffe119, 0x4363d8, 0xf58231, 0x911eb4, 0x46f0f0, 0xf032e6, 0x808000][matNames.indexOf(name) % 9] : LIVERY[name] ?? 0xff00ff;
  gltf.materials.push({ name, pbrMetallicRoughness: { baseColorFactor: [lin(hex >> 16), lin((hex >> 8) & 255), lin(hex & 255), 1], metallicFactor: name === 'Glass' ? 0.3 : name === 'cock.000' ? 0.5 : 0, roughnessFactor: name === 'Glass' ? 0.25 : 0.6 } });
}
const chunks = [];
let offset = 0;
for (const [node, byMat] of nodes) {
  const prims = [];
  for (const [mat, tri] of byMat) {
    const pos = new Float32Array(tri.length * 3);
    tri.forEach((vi, i) => pos.set(verts[vi], i * 3));
    const min = [0, 1, 2].map((k) => Math.min(...tri.map((vi) => verts[vi][k]))), max = [0, 1, 2].map((k) => Math.max(...tri.map((vi) => verts[vi][k])));
    gltf.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: pos.byteLength, target: 34962 });
    gltf.accessors.push({ bufferView: gltf.bufferViews.length - 1, componentType: 5126, count: tri.length, type: 'VEC3', min, max });
    prims.push({ attributes: { POSITION: gltf.accessors.length - 1 }, material: matNames.indexOf(mat) });
    chunks.push(Buffer.from(pos.buffer)); offset += pos.byteLength;
  }
  gltf.meshes.push({ name: node, primitives: prims });
  gltf.nodes.push({ name: node, mesh: gltf.meshes.length - 1 });
  gltf.scenes[0].nodes.push(gltf.nodes.length - 1);
}
const bin = Buffer.concat(chunks);
gltf.buffers.push({ byteLength: bin.length });
const pad = (b, fill) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4, fill)]);
const json = pad(Buffer.from(JSON.stringify(gltf)), 0x20), body = pad(bin, 0);
const header = Buffer.alloc(12); header.write('glTF', 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + json.length + 8 + body.length, 8);
const chunk = (b, type) => { const h = Buffer.alloc(8); h.writeUInt32LE(b.length, 0); h.write(type, 4); return Buffer.concat([h, b]); };
writeFileSync(out, Buffer.concat([header, chunk(json, 'JSON'), chunk(body, 'BIN\0')]));

const all = [...nodes.values()].flatMap((b) => [...b.values()].flat());
const bb = (ix) => [0, 1, 2].map((k) => [Math.min(...ix.map((i) => verts[i][k])), Math.max(...ix.map((i) => verts[i][k]))]);
console.log(`wrote ${out}: ${[...nodes.keys()].join(', ')}; ${all.length / 3} triangles; ${dropped} propeller faces left out`);
console.log('bounds (x, y, z):', JSON.stringify(bb(all).map((r) => r.map((v) => +v.toFixed(3)))));
for (const g of [...DROP, 'gearF', 'gearL', 'gearR', ...Object.keys(SPLIT)]) {
  const ix = verts.map((_, i) => i).filter((i) => vgroup[i] === g);
  console.log(`  ${g}:`, JSON.stringify(bb(ix).map((r) => r.map((v) => +v.toFixed(3)))));
}
for (const name of ['wing.000', 'tail.000']) {
  const ix = [...nodes.values()].flatMap((b) => b.get(name) ?? []);
  console.log(`  material ${name}:`, JSON.stringify(bb(ix).map((r) => r.map((v) => +v.toFixed(3)))));
}
