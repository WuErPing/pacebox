/**
 * Web 端录音持久化：Blob 存 IndexedDB（手写包装，避免新增依赖）。
 * ref 形如 "idb:<sessionId>"；播放时经 loadRecordingBlob → createObjectURL。
 */

export interface RecordingSource {
  uri?: string;
  blob?: Blob;
  mime?: string;
}

const DB_NAME = "pacebox";
const DB_VERSION = 1;
const STORE = "audio";
const IDB_PREFIX = "idb:";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getDb(): Promise<IDBDatabase> {
  dbPromise ??= openDb();
  return dbPromise;
}

function runRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function runTransaction(db: IDBDatabase, write: (store: IDBObjectStore) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    write(tx.objectStore(STORE));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function keyFromRef(ref: string): string {
  return ref.startsWith(IDB_PREFIX) ? ref.slice(IDB_PREFIX.length) : ref;
}

export async function persistRecording(
  id: string,
  source: RecordingSource | null,
): Promise<{ ref: string; mime: string } | null> {
  try {
    let blob = source?.blob ?? null;
    if (!blob && source?.uri) {
      const response = await fetch(source.uri);
      blob = await response.blob();
    }
    if (!blob) return null;
    const db = await getDb();
    await runTransaction(db, (store) => store.put(blob, id));
    return { ref: `${IDB_PREFIX}${id}`, mime: source?.mime ?? blob.type };
  } catch {
    return null;
  }
}

export async function deleteRecording(ref: string): Promise<void> {
  try {
    const db = await getDb();
    await runTransaction(db, (store) => store.delete(keyFromRef(ref)));
  } catch {
    // 忽略删除失败
  }
}

export async function listRecordingRefs(): Promise<string[]> {
  try {
    const db = await getDb();
    const store = db.transaction(STORE, "readonly").objectStore(STORE);
    const keys = await runRequest(store.getAllKeys());
    return keys.map((key) => `${IDB_PREFIX}${String(key)}`);
  } catch {
    return [];
  }
}

export async function loadRecordingBlob(ref: string): Promise<Blob | null> {
  try {
    const db = await getDb();
    const store = db.transaction(STORE, "readonly").objectStore(STORE);
    const value = await runRequest(store.get(keyFromRef(ref)));
    return value instanceof Blob ? value : null;
  } catch {
    return null;
  }
}
