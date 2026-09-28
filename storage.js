// storage.js — Save and load folders, chats, uploaded files

const Storage = {
  sources: {},
  db: null,
  async init() {
    this.db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('bookbot', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('sources');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('Document storage could not open. Check browser storage settings.'));
    });
    this.sources = await new Promise((resolve, reject) => {
      const values = {};
      const tx = this.db.transaction('sources', 'readonly');
      const request = tx.objectStore('sources').openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) { values[cursor.key] = cursor.value; cursor.continue(); }
      };
      tx.oncomplete = () => resolve(values);
      tx.onerror = () => reject(new Error('Saved documents could not be read.'));
    });
    const legacy = JSON.parse(localStorage.getItem(this.KEYS.sources) || '{}');
    for (const [id, source] of Object.entries(legacy)) {
      if (!this.sources[id]) await this.saveSource(id, source);
    }
    localStorage.removeItem(this.KEYS.sources);
  },
  KEYS: {
    folders: 'bc_folders',
    chats: 'bc_chats',
    sources: 'bc_sources',
    apiKey: 'bc_groq_key'
  },

  getFolders() {
    return JSON.parse(localStorage.getItem(this.KEYS.folders) || '[]');
  },
  saveFolders(folders) {
    localStorage.setItem(this.KEYS.folders, JSON.stringify(folders));
  },

  getChats() {
    return JSON.parse(localStorage.getItem(this.KEYS.chats) || '{}');
  },
  saveChats(chats) {
    localStorage.setItem(this.KEYS.chats, JSON.stringify(chats));
  },

  getSources() {
    return this.sources;
  },
  async saveSource(folderId, sourceData) {
    await new Promise((resolve, reject) => {
      const tx = this.db.transaction('sources', 'readwrite');
      tx.objectStore('sources').put(sourceData, folderId);
      tx.oncomplete = resolve;
      tx.onabort = tx.onerror = () => reject(new Error('Not enough browser storage to save this book. Free space and try again.'));
    });
    this.sources[folderId] = sourceData;
  },
  getSource(folderId) {
    return this.getSources()[folderId] || null;
  },

  getApiKey() {
    return localStorage.getItem(this.KEYS.apiKey) || '';
  },
  saveApiKey(key) {
    localStorage.setItem(this.KEYS.apiKey, key);
  }
};
