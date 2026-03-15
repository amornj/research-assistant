import { post, get } from './api.js';

const modelSelect = document.getElementById('ai-model-select');
const logEl = document.getElementById('ai-writing-log');
const contextMenu = document.getElementById('ai-context-menu');
const instructionInput = document.getElementById('ai-rewrite-instruction');
const rewriteBtn = document.getElementById('ai-rewrite-go');
const oauthBtn = document.getElementById('ai-oauth-btn');
const oauthStatus = document.getElementById('ai-oauth-status');
const chatInput = document.getElementById('ai-chat-input');
const chatSendBtn = document.getElementById('ai-chat-send');

let getEditorFn = null;
let selectedText = '';
let selectionFrom = 0;
let selectionTo = 0;

export function init(getEditor) {
  getEditorFn = getEditor;
  setupContextMenu();
  setupMiniMaxOAuth();
  checkOAuthStatus();
  setupAIChat();
}

// ---------------------------------------------------------------------------
// MiniMax OAuth
// ---------------------------------------------------------------------------

async function checkOAuthStatus() {
  try {
    const { connected } = await get('/api/ai/minimax/oauth/status');
    setConnectedUI(connected);
  } catch {
    setConnectedUI(false);
  }
}

function setConnectedUI(connected) {
  if (connected) {
    oauthBtn.classList.add('hidden');
    oauthStatus.classList.remove('hidden');
  } else {
    oauthBtn.classList.remove('hidden');
    oauthBtn.disabled = false;
    oauthBtn.textContent = 'Connect';
    oauthStatus.classList.add('hidden');
  }
}

function setupMiniMaxOAuth() {
  oauthBtn.addEventListener('click', startMiniMaxOAuth);

  // Disconnect link on the status badge
  oauthStatus.style.cursor = 'default';
  const disconnectBtn = document.createElement('button');
  disconnectBtn.textContent = '✕';
  disconnectBtn.title = 'Disconnect';
  disconnectBtn.className = 'ai-oauth-disconnect';
  disconnectBtn.addEventListener('click', async () => {
    await fetch('/api/ai/minimax/oauth/disconnect', { method: 'DELETE' });
    setConnectedUI(false);
    addLog('Disconnected from MiniMax');
  });
  oauthStatus.appendChild(disconnectBtn);

  // Listen for OAuth result from popup window
  window.addEventListener('message', (e) => {
    if (e.data?.type !== 'minimax-oauth') return;
    if (e.data.status === 'success') {
      setConnectedUI(true);
      addLog('Successfully connected to MiniMax 2.5', false, true);
    } else {
      setConnectedUI(false);
      addLog(`OAuth failed: ${e.data.status}`, true);
    }
  });
}

async function startMiniMaxOAuth() {
  oauthBtn.disabled = true;
  oauthBtn.textContent = 'Connecting...';
  addLog('Opening MiniMax authorization...');

  try {
    const { auth_url } = await get('/api/ai/minimax/oauth/start');
    const popup = window.open(
      auth_url,
      'minimax-oauth',
      'width=520,height=680,toolbar=no,menubar=no,scrollbars=yes,resizable=yes'
    );

    if (!popup) {
      addLog('Popup blocked — please allow popups for this site.', true);
      oauthBtn.disabled = false;
      oauthBtn.textContent = 'Connect';
      return;
    }

    // Poll in case postMessage is missed (popup closed manually)
    const poll = setInterval(async () => {
      if (popup.closed) {
        clearInterval(poll);
        const { connected } = await get('/api/ai/minimax/oauth/status');
        setConnectedUI(connected);
        if (!connected) {
          addLog('Authorization window closed without completing.', true);
        }
      }
    }, 800);
  } catch (e) {
    addLog(`Error starting OAuth: ${e.message}`, true);
    oauthBtn.disabled = false;
    oauthBtn.textContent = 'Connect';
  }
}

// ---------------------------------------------------------------------------
// AI Chat (whole document edit)
// ---------------------------------------------------------------------------

function setupAIChat() {
  chatSendBtn.addEventListener('click', doAIChat);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); doAIChat(); }
  });
}

async function doAIChat() {
  const instruction = chatInput.value.trim();
  if (!instruction) return;
  chatInput.value = '';

  const editor = getEditorFn();
  if (!editor) return;

  addLog(`AI Edit: "${instruction}"...`);
  chatSendBtn.disabled = true;

  try {
    const result = await post('/api/ai/chat', {
      html: editor.getHTML(),
      instruction,
      model: modelSelect.value,
    });

    if (result.html) {
      editor.commands.setContent(result.html);
      addLog('Document updated by AI', false, true);
    } else {
      addLog('No changes returned by AI', true);
    }
  } catch (e) {
    addLog(`Error: ${e.message}`, true);
  } finally {
    chatSendBtn.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Context menu rewrite
// ---------------------------------------------------------------------------

function setupContextMenu() {
  const editorMount = document.getElementById('editor-mount');
  editorMount.addEventListener('contextmenu', (e) => {
    const editor = getEditorFn();
    if (!editor) return;

    const { from, to } = editor.state.selection;
    const text = editor.state.doc.textBetween(from, to, ' ');
    if (!text.trim()) return;

    e.preventDefault();
    selectedText = text;
    selectionFrom = from;
    selectionTo = to;

    contextMenu.style.left = `${e.clientX}px`;
    contextMenu.style.top = `${e.clientY}px`;
    contextMenu.classList.remove('hidden');
    instructionInput.value = '';
    instructionInput.focus();
  });

  document.addEventListener('click', (e) => {
    if (!contextMenu.contains(e.target)) contextMenu.classList.add('hidden');
  });

  instructionInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); doRewrite(); }
    if (e.key === 'Escape') contextMenu.classList.add('hidden');
  });

  rewriteBtn.addEventListener('click', doRewrite);
}

async function doRewrite() {
  const instruction = instructionInput.value.trim();
  if (!instruction || !selectedText) return;

  contextMenu.classList.add('hidden');
  addLog(`Rewriting: "${instruction}"...`);
  rewriteBtn.disabled = true;

  try {
    const result = await post('/api/ai/rewrite', {
      text: selectedText,
      instruction,
      model: modelSelect.value,
    });

    const rewritten = result.text || result.rewritten || '';
    if (!rewritten) { addLog('No rewrite returned', true); return; }

    const editor = getEditorFn();
    if (editor) {
      editor.chain()
        .focus()
        .deleteRange({ from: selectionFrom, to: selectionTo })
        .insertContentAt(selectionFrom, rewritten)
        .run();
    }
    addLog(`Done — replaced ${selectedText.length} chars`, false, true);
  } catch (e) {
    addLog(`Error: ${e.message}`, true);
  } finally {
    rewriteBtn.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Log
// ---------------------------------------------------------------------------

function addLog(msg, isError = false, isSuccess = false) {
  const div = document.createElement('div');
  div.className = 'ai-log-entry';
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isError) {
    div.innerHTML = `<span style="color:#f87171">${time} ${msg}</span>`;
  } else if (isSuccess) {
    div.innerHTML = `<span class="success">${time} ${msg}</span>`;
  } else {
    div.textContent = `${time} ${msg}`;
  }
  logEl.appendChild(div);
  logEl.scrollTop = logEl.scrollHeight;
}
