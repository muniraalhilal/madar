import type { Frame } from '../core/types.js';

/**
 * Binary playback codec. Layout (little-endian):
 *   header  : u32 magic 'MDR1', u32 frameCount, u32 linkCount
 *   frame   : f32 t, u32 count, then count × (u32 id, u16 link, u16 posDm, u8 flags, 3 pad)
 * 12 bytes per vehicle per frame — roughly 8× smaller than JSON before compression.
 */
const MAGIC = 0x3152444d; // 'MDR1'

export function encodeFrames(frames: Frame[], linkCount: number): Uint8Array {
  let size = 12;
  for (const f of frames) size += 8 + f.count * 12;
  const buf = new ArrayBuffer(size);
  const view = new DataView(buf);
  view.setUint32(0, MAGIC, true);
  view.setUint32(4, frames.length, true);
  view.setUint32(8, linkCount, true);
  let o = 12;
  for (const f of frames) {
    view.setFloat32(o, f.t, true);
    view.setUint32(o + 4, f.count, true);
    o += 8;
    for (let i = 0; i < f.count; i++) {
      view.setUint32(o, f.data[i * 4] as number, true);
      view.setUint16(o + 4, Math.min(65535, f.data[i * 4 + 1] as number), true);
      view.setUint16(o + 6, Math.min(65535, f.data[i * 4 + 2] as number), true);
      view.setUint8(o + 8, (f.data[i * 4 + 3] as number) & 0xff);
      o += 12;
    }
  }
  return new Uint8Array(buf);
}

export function decodeFrames(bytes: Uint8Array): { linkCount: number; frames: Frame[] } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 12 || view.getUint32(0, true) !== MAGIC) throw new Error('Not a MADAR playback buffer');
  const n = view.getUint32(4, true);
  const linkCount = view.getUint32(8, true);
  const frames: Frame[] = [];
  let o = 12;
  for (let k = 0; k < n; k++) {
    const t = view.getFloat32(o, true);
    const count = view.getUint32(o + 4, true);
    o += 8;
    if (o + count * 12 > bytes.byteLength) throw new Error('Truncated playback buffer');
    const data = new Uint32Array(count * 4);
    for (let i = 0; i < count; i++) {
      data[i * 4] = view.getUint32(o, true);
      data[i * 4 + 1] = view.getUint16(o + 4, true);
      data[i * 4 + 2] = view.getUint16(o + 6, true);
      data[i * 4 + 3] = view.getUint8(o + 8);
      o += 12;
    }
    frames.push({ t, count, data });
  }
  return { linkCount, frames };
}
