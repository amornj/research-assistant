import { post, get } from './api.js';

let agentSelect, modelSelect, messagesEl;
let chatInput, chatSendBtn, versionBar, versionList;
let writeModeBtn, chatModeBtn;

let getEditorFn = null;
let getProjectFn = null;
let saveProjectFn = null;
let currentMode = 'write'; // 'write' | 'chat'

export function init(getEditor, getProject, saveProject) {
  getEditorFn = getEditor;
  getProjectFn = getProject;
  saveProjectFn = saveProject;

  agentSelect  = document.getElementById('ai-agent-select');
  modelSelect  = document.getElementById('ai-model-select');
  messagesEl   = document.getElementById('ai-chat-messages');
  chatInput    = document.getElementById('ai-chat-input');
  chatSendBtn  = document.getElementById('ai-chat-send');
  versionBar   = document.getElementById('ai-version-bar');
  versionList  = document.getElementById('ai-version-list');
  writeModeBtn = document.getElementById('mode-write-btn');
  chatModeBtn  = document.getElementById('mode-chat-btn');

  if (!messagesEl || !chatInput || !chatSendBtn) {
    console.error('aiWriting.init(): missing required DOM elements');
    return;
  }

  setupModeToggle();
  setupChat();
  loadAgents();

  if (agentSelect) agentSelect.addEventListener('change', () => loadModels(agentSelect.value));
}

// ---------------------------------------------------------------------------
// Mode toggle
// ---------------------------------------------------------------------------

function setupModeToggle() {
  if (!writeModeBtn || !chatModeBtn) return;
  writeModeBtn.addEventListener('click', () => setMode('write'));
  chatModeBtn.addEventListener('click', () => setMode('chat'));
}

function setMode(mode) {
  currentMode = mode;
  writeModeBtn.classList.toggle('active', mode === 'write');
  chatModeBtn.classList.toggle('active', mode === 'chat');
  chatInput.placeholder = mode === 'write'
    ? 'Ask AI to edit document... (e.g. "Rewrite in formal tone")'
    : 'Ask anything... (e.g. "What are the side effects of adalimumab?")';
}

// ---------------------------------------------------------------------------
// OpenClaw discovery
// ---------------------------------------------------------------------------

async function loadAgents() {
  if (!agentSelect) return;
  try {
    const agents = await get('/api/ai/openclaw/agents');
    if (!Array.isArray(agents) || agents.length === 0) {
      agentSelect.innerHTML = '<option value="">Default agent</option>';
      loadModels('');
      return;
    }
    agentSelect.innerHTML = agents.map(a =>
      `<option value="${a.id}" ${a.isDefault ? 'selected' : ''}>${a.identityEmoji || ''} ${a.identityName || a.id}</option>`
    ).join('');
    loadModels(agentSelect.value);
  } catch (e) {
    console.error('Failed to load agents', e);
    if (agentSelect) agentSelect.innerHTML = '<option value="">Default agent</option>';
    loadModels('');
  }
}

async function loadModels(agentId) {
  if (!modelSelect) return;
  try {
    const url = agentId ? `/api/ai/openclaw/models?agent_id=${agentId}` : '/api/ai/openclaw/models';
    const models = await get(url);
    if (!Array.isArray(models) || models.length === 0) {
      modelSelect.innerHTML = '<option value="">Default (Claude)</option>';
      return;
    }
    modelSelect.innerHTML = '<option value="">Default (Claude)</option>' +
      models.map(m => `<option value="${m.key}">${m.name}</option>`).join('');
  } catch (e) {
    if (modelSelect) modelSelect.innerHTML = '<option value="">Default (Claude)</option>';
  }
}

// ---------------------------------------------------------------------------
// Versioning (document-level, for Write to Doc mode)
// ---------------------------------------------------------------------------

export function refreshVersions() {
  const project = getProjectFn();
  if (!project || !versionBar || !versionList) return;
  const docVers = project.document_versions || [];
  if (docVers.length > 0) {
    versionBar.classList.remove('hidden');
    versionList.innerHTML = '';
    docVers.forEach((html, i) => {
      const btn = document.createElement('div');
      btn.className = 'version-badge';
      btn.textContent = `V${i + 1}`;
      btn.title = 'Revert to this version';
      btn.onclick = () => revertToDocVersion(i);
      versionList.appendChild(btn);
    });
  } else {
    versionBar.classList.add('hidden');
  }
}

function revertToDocVersion(index) {
  const project = getProjectFn();
  const editor = getEditorFn();
  if (!project || !editor) return;
  const docVers = project.document_versions || [];
  const targetHtml = docVers[index];
  if (!targetHtml) return;
  const currentHtml = editor.getHTML();
  docVers[index] = currentHtml;
  editor.commands.setContent(targetHtml);
  addMessage('status', `Reverted to version V${index + 1}`);
  saveProjectFn();
  refreshVersions();
}

function addDocVersion(html) {
  const project = getProjectFn();
  if (!project) return;
  if (!project.document_versions) project.document_versions = [];
  project.document_versions.push(html);
  if (project.document_versions.length > 5) project.document_versions.shift();
  refreshVersions();
}

// ---------------------------------------------------------------------------
// Chat send handler
// ---------------------------------------------------------------------------

function setupChat() {
  chatSendBtn.addEventListener('click', doSend);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
  });
}

async function doSend() {
  const text = chatInput.value.trim();
  if (!text) return;
  chatInput.value = '';
  if (currentMode === 'write') {
    await doWriteToDoc(text);
  } else {
    await doChat(text);
  }
}

// Mode 1: Write to Doc — AI edits the entire document (re-parses into blocks)
async function doWriteToDoc(instruction) {
  const editor = getEditorFn();
  if (!editor) {
    addMessage('status', 'No document open — create or select a project first', false, true);
    return;
  }
  const currentHtml = editor.getHTML();
  addMessage('user', instruction);
  const statusEl = addMessage('status', '✦ Editing document...');
  chatSendBtn.disabled = true;

  try {
    const result = await post('/api/ai/chat', {
      html: currentHtml,
      instruction,
      agent_id: agentSelect?.value || '',
      model_id: modelSelect?.value || '',
    });
    if (result.html) {
      addDocVersion(currentHtml);
      editor.commands.setContent(result.html);
      statusEl.textContent = '✓ Document updated';
      statusEl.classList.add('success');
      saveProjectFn();
    } else {
      statusEl.textContent = 'No changes returned by AI';
    }
  } catch (e) {
    statusEl.textContent = `Error: ${e.message}`;
    statusEl.classList.add('error');
  } finally {
    chatSendBtn.disabled = false;
  }
}

// Mode 2: Chat — general Q&A, response shown with "Push to Editor" button
async function doChat(message) {
  addMessage('user', message);
  const replyEl = addMessage('assistant', '...');
  chatSendBtn.disabled = true;

  try {
    const result = await post('/api/ai/general', {
      message,
      agent_id: agentSelect?.value || '',
      model_id: modelSelect?.value || '',
    });
    const text = result.text || '(no response)';

    // Set text content
    replyEl.textContent = '';
    const textSpan = document.createElement('span');
    textSpan.textContent = text;
    replyEl.appendChild(textSpan);

    // Add push-to-editor button
    const editor = getEditorFn();
    if (editor?.addBlock) {
      const pushBtn = document.createElement('button');
      pushBtn.className = 'ai-msg-push-btn';
      pushBtn.textContent = '↗ Push to Editor';
      pushBtn.addEventListener('click', () => {
        editor.addBlock(`<p>${text.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`);
        pushBtn.textContent = '✓ Added';
        pushBtn.disabled = true;
      });
      replyEl.appendChild(pushBtn);
    }
  } catch (e) {
    replyEl.textContent = `Error: ${e.message}`;
    replyEl.classList.add('error');
  } finally {
    chatSendBtn.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Message rendering
// ---------------------------------------------------------------------------

function addMessage(role, text, isSuccess = false, isError = false) {
  if (!messagesEl) return null;
  const div = document.createElement('div');
  if (role === 'status') {
    div.className = 'ai-msg status' +
      (isSuccess ? ' success' : '') +
      (isError ? ' error' : '');
  } else {
    div.className = `ai-msg ${role}`;
  }
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return div;
}
