/* ============================================================================
 * storage.js  —  IndexedDB persistence
 * ----------------------------------------------------------------------------
 * Saves things locally so the app remembers across sessions:
 *   pieces      loaded scores ({id, name, format, content, addedAt})
 *   settings    key/value app settings (last piece, view toggles, etc.)
 *   profiles    hardware/keyboard profiles
 *   scores      best score per piece
 *   fingerings  per-piece manual fingering overrides
 *   sessions    one record per practice run (for the practice log)
 *
 * Promisified thin wrapper. Everything degrades gracefully if IndexedDB is
 * unavailable (private mode etc.): calls resolve to null instead of throwing.
 * ========================================================================== */
(function (root) {
  "use strict";

  const DB_NAME = "piano-trainer";
  const DB_VERSION = 2;
  const STORES = ["pieces", "settings", "profiles", "scores", "fingerings", "sessions"];

  class Storage {
    constructor() { this.db = null; this._failed = false; }

    open() {
      if (this.db) return Promise.resolve(this.db);
      if (this._failed || typeof indexedDB === "undefined") return Promise.resolve(null);
      return new Promise((resolve) => {
        let req;
        try { req = indexedDB.open(DB_NAME, DB_VERSION); }
        catch (e) { this._failed = true; return resolve(null); }
        req.onupgradeneeded = () => {
          // Version 2 adds "sessions"; the loop below is additive, so upgrading
          // an existing database never touches the stores already there.
          const db = req.result;
          for (const s of STORES) {
            if (!db.objectStoreNames.contains(s)) {
              // settings keyed by explicit key; others keep their own id field
              db.createObjectStore(s, { keyPath: s === "settings" ? "key" : "id" });
            }
          }
        };
        req.onsuccess = () => { this.db = req.result; resolve(this.db); };
        req.onerror = () => { this._failed = true; resolve(null); };
      });
    }

    async _tx(store, mode, fn) {
      const db = await this.open();
      if (!db) return null;
      return new Promise((resolve) => {
        let result = null;
        const tx = db.transaction(store, mode);
        const os = tx.objectStore(store);
        const r = fn(os);
        if (r) r.onsuccess = () => { result = r.result; };
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => resolve(null);
        tx.onabort = () => resolve(null);
      });
    }

    put(store, value) { return this._tx(store, "readwrite", (os) => os.put(value)); }
    get(store, id) { return this._tx(store, "readonly", (os) => os.get(id)); }
    delete(store, id) { return this._tx(store, "readwrite", (os) => os.delete(id)); }
    getAll(store) { return this._tx(store, "readonly", (os) => os.getAll()); }

    // settings convenience (store uses keyPath 'key')
    setSetting(key, value) { return this.put("settings", { key, value }); }
    async getSetting(key, dflt) {
      const row = await this.get("settings", key);
      return row && "value" in row ? row.value : dflt;
    }
  }

  root.PT = root.PT || {};
  root.PT.Storage = Storage;
})(typeof window !== "undefined" ? window : globalThis);
