// A small reader for Blender .blend files (uncompressed, as Blender 2.7x writes them), enough to pull out
// objects, meshes, materials and modifiers. A .blend file describes its own structs (the "SDNA" block), so
// fields are found by name. It only reads data: nothing in the file is ever run.
import { readFileSync } from 'node:fs';

export function openBlend(path) {
  const buf = readFileSync(path);
  const magic = buf.toString('latin1', 0, 7);
  if (magic !== 'BLENDER') throw new Error(`${path}: not an uncompressed .blend file`);
  const ptr = buf[7] === 0x2d ? 8 : 4, le = buf[8] === 0x76, version = buf.toString('latin1', 9, 12);
  const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
  const i32 = (o) => (le ? buf.readInt32LE(o) : buf.readInt32BE(o));
  const u16 = (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
  const readPtr = (o) => (ptr === 8 ? (le ? buf.readBigUInt64LE(o) : buf.readBigUInt64BE(o)) : BigInt(u32(o)));

  // File blocks.
  const blocks = [];
  let o = 12;
  for (;;) {
    const code = buf.toString('latin1', o, o + 4).replace(/\0/g, '');
    const size = u32(o + 4), old = readPtr(o + 8), sdna = u32(o + 8 + ptr), count = u32(o + 12 + ptr), data = o + 16 + ptr;
    blocks.push({ code, size, old, sdna, count, data });
    o = data + size;
    if (code === 'ENDB' || o >= buf.length) break;
  }

  // The struct dictionary.
  const dna = blocks.find((b) => b.code === 'DNA1');
  let p = dna.data + 4;
  const align4 = () => { p = (p + 3) & ~3; };
  const strings = (n) => { const out = []; for (let i = 0; i < n; i++) { const e = buf.indexOf(0, p); out.push(buf.toString('latin1', p, e)); p = e + 1; } return out; };
  if (buf.toString('latin1', p, p + 4) !== 'NAME') throw new Error('bad SDNA');
  p += 4; const nNames = u32(p); p += 4; const names = strings(nNames); align4();
  p += 4; const nTypes = u32(p); p += 4; const types = strings(nTypes); align4();
  p += 4; const tlen = []; for (let i = 0; i < nTypes; i++) { tlen.push(u16(p)); p += 2; } align4();
  p += 4; const nStructs = u32(p); p += 4;
  const structs = [];
  for (let s = 0; s < nStructs; s++) {
    const type = u16(p), nf = u16(p + 2); p += 4;
    const fields = {}; let off = 0;
    for (let f = 0; f < nf; f++) {
      const ft = u16(p), fn = names[u16(p + 2)]; p += 4;
      const isPtr = fn.startsWith('*') || fn.startsWith('(*');
      const dims = [...fn.matchAll(/\[(\d+)\]/g)].map((m) => +m[1]);
      const n = dims.reduce((a, b) => a * b, 1), size = (isPtr ? ptr : tlen[ft]) * n;
      const key = fn.replace(/^[*(]+/, '').replace(/[)(]+.*$/, '').replace(/\[.*$/, '');
      fields[key] = { type: types[ft], off, size, isPtr, dims, n };
      off += size;
    }
    structs.push({ name: types[type], size: tlen[type], fields });
  }
  const byName = Object.fromEntries(structs.map((s) => [s.name, s]));
  const byPtr = new Map(blocks.map((b) => [b.old, b]));

  /** A view of one struct at a byte offset: get('field') reads by name. */
  const view = (structName, at) => {
    const st = byName[structName];
    if (!st) throw new Error(`no struct ${structName}`);
    const get = (name) => {
      const f = st.fields[name];
      if (!f) throw new Error(`${structName}.${name} missing`);
      const a = at + f.off;
      if (f.isPtr) return f.n > 1 ? Array.from({ length: f.n }, (_, i) => readPtr(a + i * ptr)) : readPtr(a);
      const one = (q) => {
        switch (f.type) {
          case 'float': return le ? buf.readFloatLE(q) : buf.readFloatBE(q);
          case 'double': return le ? buf.readDoubleLE(q) : buf.readDoubleBE(q);
          case 'int': return i32(q);
          case 'short': return le ? buf.readInt16LE(q) : buf.readInt16BE(q);
          case 'char': case 'uchar': return buf[q];
          default: return view(f.type, q);
        }
      };
      if (f.type === 'char' && f.n > 1) { const e = buf.indexOf(0, a); return buf.toString('latin1', a, Math.min(e < 0 ? a + f.n : e, a + f.n)); }
      if (f.n > 1) { const step = f.size / f.n; return Array.from({ length: f.n }, (_, i) => one(a + i * step)); }
      return one(a);
    };
    return { struct: st, at, get, has: (n) => !!st.fields[n] };
  };
  /** The block a pointer points into, and views of the structs in it. */
  const deref = (pointer, structName) => {
    if (!pointer) return [];
    const b = byPtr.get(pointer);
    if (!b) return [];
    const st = byName[structName ?? structs[b.sdna].name];
    return Array.from({ length: b.count }, (_, i) => view(st.name, b.data + i * st.size));
  };
  const pointers = (pointer, n) => { const b = byPtr.get(pointer); return b ? Array.from({ length: n }, (_, i) => readPtr(b.data + i * ptr)) : []; };
  /** Every struct in blocks of this code (e.g. 'OB' objects, 'ME' meshes). */
  const all = (code) => blocks.filter((b) => b.code === code).map((b) => view(structs[b.sdna].name, b.data));
  /** Walk a ListBase (first/next linked list), as views of the struct each element is stored as. */
  const list = (lb) => {
    const out = []; let q = lb.get('first');
    while (q) {
      const [v] = deref(q); if (!v) break;
      out.push(v);
      // Subtypes (e.g. MirrorModifierData) keep the link in their first member (a ModifierData).
      const head = v.has('next') ? v : view(Object.values(v.struct.fields)[0].type, v.at);
      q = head.get('next');
    }
    return out;
  };
  return { version, ptr, blocks, structs: byName, all, deref, pointers, list, view };
}
