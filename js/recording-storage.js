const DATABASE_NAME = "leanon-local-recordings";
const DATABASE_VERSION = 1;
const RECORDINGS_STORE = "recordings";
const AUTO_SAVE_KEY = "leanon-auto-save-recordings";

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(RECORDINGS_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open local recording storage"));
    request.onblocked = () => reject(new Error("Local recording storage is blocked by another open page"));
  });
}

async function withStore(mode, operation) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(RECORDINGS_STORE, mode);
    const store = transaction.objectStore(RECORDINGS_STORE);
    let result;
    transaction.oncomplete = () => {
      database.close();
      resolve(result);
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error("Local recording storage failed"));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error || new Error("Local recording storage was interrupted"));
    };
    try {
      operation(store, (value) => {
        result = value;
      });
    } catch (error) {
      transaction.abort();
      database.close();
      reject(error);
    }
  });
}

export function isAutoSaveEnabled() {
  return localStorage.getItem(AUTO_SAVE_KEY) !== "false";
}

export function setAutoSaveEnabled(enabled) {
  localStorage.setItem(AUTO_SAVE_KEY, String(Boolean(enabled)));
}

export function saveRecording(recording) {
  return withStore("readwrite", (store) => {
    store.put(recording);
  });
}

export async function getRecordings() {
  const recordings = await withStore("readonly", (store, setResult) => {
    const request = store.getAll();
    request.onsuccess = () => setResult(request.result);
  });
  return recordings.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function deleteRecording(id) {
  return withStore("readwrite", (store) => {
    store.delete(id);
  });
}
