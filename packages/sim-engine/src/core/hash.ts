/**
 * Deterministic serialization and checksums.
 *
 * `stableStringify` sorts object keys so semantically equal inputs serialize
 * identically. `checksum` is a 64-bit FNV-1a digest — a reproducibility
 * fingerprint, not a cryptographic hash.
 */

export function stableStringify(value: unknown): string {
  return JSON.stringify(normalize(value));
}

function normalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return null;
      // Round to 12 significant digits so float noise from different
      // (but equivalent) evaluation orders cannot leak into fingerprints.
      return Number(value.toPrecision(12));
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(normalize);
  if (ArrayBuffer.isView(value)) return Array.from(value as unknown as ArrayLike<number>);
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    const v = (value as Record<string, unknown>)[key];
    if (v !== undefined) out[key] = normalize(v);
  }
  return out;
}

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

export function checksum(input: string): string {
  let hash = FNV_OFFSET;
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * FNV_PRIME) & MASK_64;
  }
  return hash.toString(16).padStart(16, '0');
}

export function fingerprint(value: unknown): string {
  return checksum(stableStringify(value));
}
