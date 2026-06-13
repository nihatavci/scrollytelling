// Generates assets/mock/object.glb — a clean sculptural torus-knot, our default 3D mock.
// Self-contained (no deps): builds geometry, packs a binary glTF (GLB). CC0 (our own).
import { writeFileSync, mkdirSync } from 'node:fs';

// ── Torus-knot geometry (p=2, q=3) ──────────────────────────────
const P = 2, Q = 3, R = 1.0, tube = 0.34, tubularSegments = 240, radialSegments = 32;
const positions = [], normals = [], indices = [];

function curve(t, out) {
  const cu = Math.cos(t * P), su = Math.sin(t * P);
  const qOverP = (Q / P) * t, cs = Math.cos(qOverP);
  out.x = (R + R * 0.5 * cs) * cu * 0.5;
  out.y = (R + R * 0.5 * cs) * su * 0.5;
  out.z = R * 0.5 * Math.sin(qOverP) * 0.5;
}
const cur = { x: 0, y: 0, z: 0 }, nxt = { x: 0, y: 0, z: 0 };
const TAU = Math.PI * 2;
for (let i = 0; i <= tubularSegments; i++) {
  const u = (i / tubularSegments) * TAU;
  curve(u, cur);
  curve(u + 0.01, nxt);
  // Frenet-ish frame
  const T = { x: nxt.x - cur.x, y: nxt.y - cur.y, z: nxt.z - cur.z };
  let tl = Math.hypot(T.x, T.y, T.z) || 1; T.x /= tl; T.y /= tl; T.z /= tl;
  // normal N = T x (approx up), binormal B = T x N
  let N = { x: -T.y, y: T.x, z: 0 }; let nl = Math.hypot(N.x, N.y, N.z) || 1; N.x /= nl; N.y /= nl; N.z /= nl;
  const B = { x: T.y * N.z - T.z * N.y, y: T.z * N.x - T.x * N.z, z: T.x * N.y - T.y * N.x };
  for (let j = 0; j <= radialSegments; j++) {
    const v = (j / radialSegments) * TAU;
    const cx = -tube * Math.cos(v), cy = tube * Math.sin(v);
    const nx = cx * N.x + cy * B.x, ny = cx * N.y + cy * B.y, nz = cx * N.z + cy * B.z;
    positions.push(cur.x + nx, cur.y + ny, cur.z + nz);
    const nlen = Math.hypot(nx, ny, nz) || 1;
    normals.push(nx / nlen, ny / nlen, nz / nlen);
  }
}
const stride = radialSegments + 1;
for (let i = 0; i < tubularSegments; i++) {
  for (let j = 0; j < radialSegments; j++) {
    const a = i * stride + j, b = (i + 1) * stride + j, c = (i + 1) * stride + j + 1, d = i * stride + j + 1;
    indices.push(a, b, d, b, c, d);
  }
}

// ── Pack buffers ────────────────────────────────────────────────
const pos = new Float32Array(positions), nor = new Float32Array(normals), idx = new Uint32Array(indices);
const posBytes = Buffer.from(pos.buffer), norBytes = Buffer.from(nor.buffer), idxBytes = Buffer.from(idx.buffer);
const pad = (b) => (b.length % 4 === 0 ? b : Buffer.concat([b, Buffer.alloc(4 - (b.length % 4))]));
const bin = Buffer.concat([pad(posBytes), pad(norBytes), pad(idxBytes)]);
let off = 0;
const posView = { off, len: posBytes.length }; off += pad(posBytes).length;
const norView = { off, len: norBytes.length }; off += pad(norBytes).length;
const idxView = { off, len: idxBytes.length };

let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
for (let i = 0; i < pos.length; i += 3) {
  minX = Math.min(minX, pos[i]); maxX = Math.max(maxX, pos[i]);
  minY = Math.min(minY, pos[i + 1]); maxY = Math.max(maxY, pos[i + 1]);
  minZ = Math.min(minZ, pos[i + 2]); maxZ = Math.max(maxZ, pos[i + 2]);
}

const gltf = {
  asset: { version: '2.0', generator: 'scrolli-mock' },
  scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
  materials: [{
    name: 'scrolli-indigo',
    pbrMetallicRoughness: { baseColorFactor: [0.36, 0.30, 0.96, 1], metallicFactor: 0.85, roughnessFactor: 0.28 },
  }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
  buffers: [{ byteLength: bin.length }],
  bufferViews: [
    { buffer: 0, byteOffset: posView.off, byteLength: posView.len, target: 34962 },
    { buffer: 0, byteOffset: norView.off, byteLength: norView.len, target: 34962 },
    { buffer: 0, byteOffset: idxView.off, byteLength: idxView.len, target: 34963 },
  ],
  accessors: [
    { bufferView: 0, componentType: 5126, count: pos.length / 3, type: 'VEC3', min: [minX, minY, minZ], max: [maxX, maxY, maxZ] },
    { bufferView: 1, componentType: 5126, count: nor.length / 3, type: 'VEC3' },
    { bufferView: 2, componentType: 5125, count: idx.length, type: 'SCALAR' },
  ],
};

const jsonBuf = pad(Buffer.from(JSON.stringify(gltf), 'utf8'));
const binChunk = pad(bin);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0); // 'glTF'
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + binChunk.length, 8);
const jsonHeader = Buffer.alloc(8); jsonHeader.writeUInt32LE(jsonBuf.length, 0); jsonHeader.writeUInt32LE(0x4e4f534a, 4); // 'JSON'
const binHeader = Buffer.alloc(8); binHeader.writeUInt32LE(binChunk.length, 0); binHeader.writeUInt32LE(0x004e4942, 4); // 'BIN\0'
const glb = Buffer.concat([header, jsonHeader, jsonBuf, binHeader, binChunk]);

mkdirSync('assets/mock', { recursive: true });
writeFileSync('assets/mock/object.glb', glb);
console.log('wrote assets/mock/object.glb', glb.length, 'bytes; verts', pos.length / 3, 'tris', idx.length / 3);
