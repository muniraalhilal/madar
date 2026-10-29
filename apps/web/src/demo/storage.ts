/**
 * Demo persistence, all inside the visitor's browser:
 *   - the small relational state (projects, scenarios, runs, reports…) as one
 *     JSON document in localStorage;
 *   - bulky run outputs (time series, per-road results, playback frames) in
 *     IndexedDB.
 * Either store can be unavailable (private windows, blocked site data). Then
 * everything lives in memory and is gone when the tab closes; the UI says so.
 */
const STATE_KEY = 'madar.demo.v1';
const DB_NAME = 'madar-demo';
const STORE = 'blobs';

let stateBackend: 'local' | 'memory' | null = null;
let memoryState: string | null = null;

function probeLocal(): boolean {
  try {
    const k = '__madar_probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

export function stateIsPersistent(): boolean {
  stateBackend ??= probeLocal() ? 'local' : 'memory';
  return stateBackend === 'local';
}

export function readState<T>(): T | null {
  try {
    const raw = stateIsPersistent() ? localStorage.getItem(STATE_KEY) : memoryState;
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeState(value: unknown): void {
  const raw = JSON.stringify(value);
  if (stateIsPersistent()) {
    try {
      localStorage.setItem(STATE_KEY, raw);
      return;
    } catch {
      stateBackend = 'memory'; // quota or revoked access: keep working in memory
    }
  }
  memoryState = raw;
}

export function clearState(): void {
  memoryState = null;
  try {
    localStorage.removeItem(STATE_KEY);
  } catch {
    /* unavailable */
  }
}

/* ───── IndexedDB blobs (with in-memory fallback) ───── */

const memoryBlobs = new Map<string, unknown>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  dbPromise ??= new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise<T | undefined>((resolve) => {
        if (!db) return resolve(undefined);
        try {
          const req = run(db.transaction(STORE, mode).objectStore(STORE));
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(undefined);
        } catch {
          resolve(undefined);
        }
      }),
  );
}

export async function blobsArePersistent(): Promise<boolean> {
  return (await openDb()) !== null;
}

export async function putBlob(key: string, value: unknown): Promise<void> {
  memoryBlobs.set(key, value);
  await tx('readwrite', (s) => s.put(value, key));
}

export async function getBlob<T>(key: string): Promise<T | undefined> {
  if (memoryBlobs.has(key)) return memoryBlobs.get(key) as T;
  const v = await tx<T>('readonly', (s) => s.get(key) as IDBRequest<T>);
  if (v !== undefined) memoryBlobs.set(key, v);
  return v;
}

export async function deleteBlob(key: string): Promise<void> {
  memoryBlobs.delete(key);
  await tx('readwrite', (s) => s.delete(key));
}

export async function clearBlobs(): Promise<void> {
  memoryBlobs.clear();
  await tx('readwrite', (s) => s.clear());
}
