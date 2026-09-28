// app.js — Main application logic

const App = {
  state: {
    folders: [],
    chats: {},
    activeFolderId: null,
    activeChatId: null,
    isLoading: false,
    isUploading: false
  },

  async init() {
    await Storage.init();
    this.state.folders = Storage.getFolders();
    this.state.chats = Storage.getChats();

    // Load saved API key
    const savedKey = Storage.getApiKey();
    if (savedKey) document.getElementById('apiKeyInput').value = savedKey;

    if (this.state.folders.length === 0) {
      this.createFolder('My First Book');
    }

    this.render();
    this.bindEvents();

    const firstFolder = this.state.folders[0];
    if (firstFolder) {
      const folderChats = this.state.chats[firstFolder.id] || [];
      if (folderChats.length > 0) {
        this.selectChat(firstFolder.id, folderChats[0].id);
      } else {
        this.addChat(firstFolder.id);
      }
    }
  },

  bindEvents() {
    document.getElementById('msgInput').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendMessage(); }
    });
    document.getElementById('msgInput').addEventListener('input', e => {
      const el = e.target;
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 120) + 'px';
      document.getElementById('sendBtn').disabled =
        !el.value.trim() || !this.state.activeChatId || this.state.isLoading || this.state.isUploading;
    });
    document.getElementById('fileInput').addEventListener('change', e => {
      const file = e.target.files[0];
      if (file) this.handleFileUpload(file);
      e.target.value = '';
    });
    document.getElementById('apiKeyInput').addEventListener('change', e => {
      Storage.saveApiKey(e.target.value.trim());
      this.showToast('API key saved!');
    });
  },

  // --- FOLDERS ---
  createFolder(name) {
    const id = 'f' + crypto.randomUUID();
    const folder = { id, name, open: true };
    this.state.folders.push(folder);
    this.state.chats[id] = [];
    Storage.saveFolders(this.state.folders);
    Storage.saveChats(this.state.chats);
    this.render();
    return folder;
  },

  toggleFolder(id) {
    const f = this.state.folders.find(x => x.id === id);
    if (f) f.open = !f.open;
    Storage.saveFolders(this.state.folders);
    this.render();
  },

  // --- CHATS ---
  addChat(folderId) {
    if (!folderId) { this.showToast('Select a folder first.', true); return; }
    const id = 'c' + crypto.randomUUID();
    const chat = { id, title: 'New chat', messages: [], sourceVersion: Storage.getSource(folderId)?.uploadedAt || null };
    if (!this.state.chats[folderId]) this.state.chats[folderId] = [];
    this.state.chats[folderId].unshift(chat);
    const f = this.state.folders.find(x => x.id === folderId);
    if (f) f.open = true;
    Storage.saveFolders(this.state.folders);
    Storage.saveChats(this.state.chats);
    this.render();
    this.selectChat(folderId, id);
    document.getElementById('msgInput').focus();
  },

  selectChat(folderId, chatId) {
    this.state.activeFolderId = folderId;
    this.state.activeChatId = chatId;
    this.render();
    this.renderChatArea();
    document.getElementById('sendBtn').disabled = !chatId || this.state.isLoading || this.state.isUploading;
  },

  getActiveChat() {
    if (!this.state.activeFolderId || !this.state.activeChatId) return null;
    return (this.state.chats[this.state.activeFolderId] || [])
      .find(c => c.id === this.state.activeChatId);
  },

  getActiveFolder() {
    return this.state.folders.find(f => f.id === this.state.activeFolderId) || null;
  },

  // --- FILE UPLOAD ---
  async handleFileUpload(file) {
    if (this.state.isLoading || this.state.isUploading) { this.showToast('Please wait for the current operation to finish.', true); return; }
    if (!this.state.activeFolderId) { this.showToast('Select a folder first.', true); return; }
    const folderId = this.state.activeFolderId;
    const topic = document.getElementById('topicInput').value.trim() || 'General';
    this.state.isUploading = true;
    this.showToast('Reading file...');
    try {
      const extracted = await FileHandler.extractDocument(file);
      const sourceData = { ...extracted, name: file.name, topic, uploadedAt: crypto.randomUUID() };
      Retrieval.index(sourceData);
      await Storage.saveSource(folderId, sourceData);
      const folder = this.state.folders.find(f => f.id === folderId);
      if (folder) { folder.sourceName = file.name; Storage.saveFolders(this.state.folders); }
      this.render();
      this.renderChatArea();
      this.showToast(`"${file.name}" uploaded! ${extracted.warnings.join(' ')}`);
      // Old conversations remain readable, but cannot be used with a replacement book.
      if (this.state.activeFolderId === folderId) this.addChat(folderId);
    } catch (err) {
      this.showToast('Error: ' + err.message, true);
    } finally {
      this.state.isUploading = false;
      document.getElementById('sendBtn').disabled = !document.getElementById('msgInput').value.trim() || this.state.isLoading;
    }
  },

  // --- SEND MESSAGE ---
  async sendMessage() {
    const input = document.getElementById('msgInput');
    const text = input.value.trim();
    if (!text || this.state.isLoading || this.state.isUploading || !this.state.activeChatId) return;

    const apiKey = document.getElementById('apiKeyInput').value.trim();
    if (!apiKey) { this.showToast('Enter your Groq API key first!', true); return; }

    const chat = this.getActiveChat();
    if (!chat) return;
    const sourceData = Storage.getSource(this.state.activeFolderId);
    if (!sourceData) { this.showToast('Upload a document first.', true); return; }
    if (chat.messages.length && chat.sourceVersion !== sourceData.uploadedAt) {
      this.showToast('This chat belongs to an earlier document. Start a new chat for the current book.', true); return;
    }
    chat.sourceVersion = sourceData.uploadedAt;
    try { Retrieval.index(sourceData); } catch (err) { this.showToast(err.message, true); return; }

    chat.messages.push({ role: 'user', content: text });
    if (chat.title === 'New chat') chat.title = text.slice(0, 30) + (text.length > 30 ? '…' : '');

    input.value = '';
    input.style.height = '';
    document.getElementById('sendBtn').disabled = true;
    this.state.isLoading = true;

    this.renderMessages(chat.messages);
    this.showTyping();
    this.render();

    try {
      Storage.saveChats(this.state.chats);
      const reply = await API.sendMessage(chat.messages, sourceData, apiKey);
      chat.messages.push({ role: 'assistant', content: reply });
      Storage.saveChats(this.state.chats);
    } catch (err) {
      this.showToast(err.message, true);
    }

    this.removeTyping();
    if (this.getActiveChat() === chat) this.renderMessages(chat.messages);
    this.state.isLoading = false;
    document.getElementById('sendBtn').disabled = false;
    document.getElementById('msgInput').focus();
    this.render();
  },

  // --- RENDER ---
  render() {
    this.renderSidebar();
    this.updateSourceBadge();
  },

  renderSidebar() {
    const sb = document.getElementById('sidebarBody');
    sb.innerHTML = '';
    this.state.folders.forEach(f => {
      const chats = this.state.chats[f.id] || [];
      const source = Storage.getSource(f.id);
      const div = document.createElement('div');
      div.className = 'folder';
      div.innerHTML = `
        <div class="folder-header ${f.open ? 'open' : ''}" onclick="App.toggleFolder('${f.id}')">
          <i class="ti ti-chevron-right"></i>
          <i class="ti ti-folder${f.open ? '-open' : ''}"></i>
          <span class="folder-name">${this.escHtml(f.name)}</span>
          ${source ? `<span class="source-pill">${this.escHtml(source.name.slice(0,14))}…</span>` : ''}
        </div>
        <div class="folder-chats ${f.open ? 'open' : ''}">
          ${chats.map(c => `
            <div class="chat-item ${c.id === this.state.activeChatId ? 'active' : ''}"
              onclick="App.selectChat('${f.id}','${c.id}')">
              <i class="ti ti-message"></i>
              <span>${this.escHtml(c.title)}</span>
            </div>`).join('')}
          <div class="chat-item add-chat" onclick="App.addChat('${f.id}')">
            <i class="ti ti-plus"></i><span>New chat</span>
          </div>
        </div>`;
      sb.appendChild(div);
    });
  },

  renderChatArea() {
    const chat = this.getActiveChat();
    const folder = this.getActiveFolder();
    const source = this.state.activeFolderId ? Storage.getSource(this.state.activeFolderId) : null;
    if (!chat) {
      document.getElementById('chatTitle').textContent = 'Select a chat';
      document.getElementById('chatSubtitle').textContent = 'Upload a document and start chatting';
      document.getElementById('messages').innerHTML = `
        <div class="empty-state">
          <i class="ti ti-book-2"></i>
          <div class="empty-title">No chat selected</div>
          <div>Create a folder, upload a book, then start chatting</div>
        </div>`;
      return;
    }
    document.getElementById('chatTitle').textContent = chat.title;
    document.getElementById('chatSubtitle').textContent =
      `${folder?.name || ''} ${source ? '· ' + source.name : '· No document uploaded'}${source?.warnings?.length ? ' · ' + source.warnings.join(' ') : ''}${chat.messages.length && chat.sourceVersion !== source?.uploadedAt ? ' · Earlier document: start a new chat' : ''}`;
    this.renderMessages(chat.messages);
  },

  renderMessages(msgs) {
    const el = document.getElementById('messages');
    el.innerHTML = '';
    if (msgs.length === 0) {
      el.innerHTML = `
        <div class="empty-state">
          <i class="ti ti-message-question"></i>
          <div class="empty-title">Ask your first question</div>
          <div>AI will answer from your uploaded document only</div>
        </div>`;
      return;
    }
    msgs.forEach(m => this.appendBubble(m.role, m.content));
    el.scrollTop = el.scrollHeight;
  },

  appendBubble(role, content) {
    const el = document.getElementById('messages');
    const div = document.createElement('div');
    div.className = `msg ${role}`;
    div.innerHTML = `
      <div class="msg-avatar">${role === 'assistant' ? 'AI' : 'U'}</div>
      <div class="msg-bubble">${this.escHtml(content).replace(/\n/g, '<br>')}</div>`;
    el.appendChild(div);
    el.scrollTop = el.scrollHeight;
  },

  showTyping() {
    const el = document.getElementById('messages');
    const div = document.createElement('div');
    div.className = 'msg assistant'; div.id = 'typing';
    div.innerHTML = `<div class="msg-avatar">AI</div>
      <div class="msg-bubble"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>`;
    el.appendChild(div);
    el.scrollTop = el.scrollHeight;
  },

  removeTyping() { const t = document.getElementById('typing'); if (t) t.remove(); },

  updateSourceBadge() {
    const source = this.state.activeFolderId ? Storage.getSource(this.state.activeFolderId) : null;
    const badge = document.getElementById('sourceBadge');
    if (badge) {
      badge.textContent = source ? '📄 ' + source.name : 'No document';
      badge.style.color = source ? 'var(--accent-text)' : 'var(--text-3)';
    }
  },

  showToast(msg, isError = false) {
    let toast = document.getElementById('toast');
    if (!toast) { toast = document.createElement('div'); toast.id = 'toast'; document.body.appendChild(toast); }
    toast.textContent = msg;
    toast.className = 'toast ' + (isError ? 'error' : 'success');
    toast.style.opacity = '1';
    setTimeout(() => toast.style.opacity = '0', 3000);
  },

  escHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  },

  openFolderModal() {
    document.getElementById('folderModal').classList.add('open');
    setTimeout(() => document.getElementById('folderNameInput').focus(), 50);
  },
  closeFolderModal() {
    document.getElementById('folderModal').classList.remove('open');
    document.getElementById('folderNameInput').value = '';
  },
  submitFolder() {
    const name = document.getElementById('folderNameInput').value.trim();
    if (!name) return;
    const folder = this.createFolder(name);
    this.addChat(folder.id);
    this.closeFolderModal();
  }
};
