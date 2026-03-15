import { post } from './api.js';

let notebookId = null;
let conversationId = null;
let onInsertToEditor = null;

const messagesEl = document.getElementById('chat-messages');
const inputEl = document.getElementById('chat-input');
const sendBtn = document.getElementById('chat-send');

export function init(insertCallback) {
  onInsertToEditor = insertCallback;
  sendBtn.addEventListener('click', send);
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
}

export function setNotebook(id) {
  notebookId = id;
  conversationId = null;
  messagesEl.innerHTML = '';
  if (!id) {
    messagesEl.innerHTML = '<div class="status-msg">No notebook linked</div>';
  }
}

async function send() {
  const query = inputEl.value.trim();
  if (!query || !notebookId) return;
  inputEl.value = '';

  appendMsg(query, 'user');
  const loadingEl = appendMsg('<span class="spinner"></span> Thinking...', 'assistant');

  try {
    const result = await post(`/api/notebooks/${notebookId}/query`, {
      query,
      conversation_id: conversationId,
    });
    const text = result.text || result.answer || result.response || JSON.stringify(result);
    conversationId = result.conversation_id || conversationId;
    loadingEl.remove();
    appendMsg(text, 'assistant', true);
  } catch (e) {
    loadingEl.remove();
    appendMsg(`Error: ${e.message}`, 'assistant');
  }
}

function appendMsg(content, role, showInsert = false) {
  const div = document.createElement('div');
  div.className = `chat-msg ${role}`;
  div.innerHTML = content;

  if (showInsert && onInsertToEditor) {
    const btn = document.createElement('span');
    btn.className = 'insert-btn';
    btn.textContent = '+ Insert into document';
    btn.addEventListener('click', () => onInsertToEditor(content));
    div.appendChild(btn);
  }

  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return div;
}
