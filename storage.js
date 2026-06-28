// storage.js — Save and load folders, chats, uploaded files

const Storage = {
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
    return JSON.parse(localStorage.getItem(this.KEYS.sources) || '{}');
  },
  saveSource(folderId, sourceData) {
    const sources = this.getSources();
    sources[folderId] = sourceData;
    localStorage.setItem(this.KEYS.sources, JSON.stringify(sources));
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
