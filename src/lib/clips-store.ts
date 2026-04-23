// IndexedDB-backed store for recorded clips. Local-only, no upload.

export type Clip = {
  id: string;
  createdAt: number;
  durationMs: number;
  size: number;
  type: string;
  blob: Blob;
};

export type ClipMeta = Omit<Clip, "blob">;

const DB_NAME = "ping-pong-highlights";
const DB_VERSION = 1;
const STORE = "clips";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T = unknown>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | void> {
  return openDb().then(
    (db) =>
      new Promise<T | void>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const store = t.objectStore(STORE);
        const req = fn(store);
        t.oncomplete = () => resolve(req ? (req.result as T) : undefined);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

export async function saveClip(input: {
  blob: Blob;
  durationMs: number;
}): Promise<Clip> {
  const clip: Clip = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    durationMs: input.durationMs,
    size: input.blob.size,
    type: input.blob.type || "video/webm",
    blob: input.blob,
  };
  await tx("readwrite", (s) => s.put(clip));
  return clip;
}

export async function listClips(): Promise<ClipMeta[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, "readonly");
    const store = t.objectStore(STORE);
    const out: ClipMeta[] = [];
    const req = store.openCursor(null, "prev");
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        const v = cursor.value as Clip;
        out.push({
          id: v.id,
          createdAt: v.createdAt,
          durationMs: v.durationMs,
          size: v.size,
          type: v.type,
        });
        cursor.continue();
      }
    };
    t.oncomplete = () => {
      out.sort((a, b) => b.createdAt - a.createdAt);
      resolve(out);
    };
    t.onerror = () => reject(t.error);
  });
}

export async function getClip(id: string): Promise<Clip | null> {
  const result = (await tx("readonly", (s) => s.get(id))) as Clip | undefined;
  return result ?? null;
}

export async function deleteClip(id: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(id));
}
