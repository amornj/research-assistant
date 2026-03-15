import { post } from './api.js';

const modelSelect = document.getElementById('ai-model-select');
const logEl = document.getElementById('ai-writing-log');
const contextMenu = document.getElementById('ai-context-menu');
const instructionInput = document.getElementById('ai-rewrite-instruction');
const rewriteBtn = document.getElementById('ai-rewrite-go');

let getEditorFn = null;
let selectedText = '';
let selectionFrom = 0;
let selectionTo = 0;

export function init(getEditor) {
  getEditorFn = getEditor;
  setupContextMenu();
}

function setupContextMenu() {
  // Listen for contextmenu on the editor
  const editorMount = document.getElementById('editor-mount');
  editorMount.addEventListener('contextmenu', (e) => {
    const editor = getEditorFn();
    if (!editor) return;

    const { from, to } = editor.state.selection;
    const text = editor.state.doc.textBetween(from, to, ' ');
    if (!text.trim()) return; // no selection, let default menu show

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

  // Close context menu on outside click
  document.addEventListener('click', (e) => {
    if (!contextMenu.contains(e.target)) {
      contextMenu.classList.add('hidden');
    }
  });

  // Enter key in instruction input triggers rewrite
  instructionInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); doRewrite(); }
    if (e.key === 'Escape') contextMenu.classList.add('hidden');
  });

  rewriteBtn.addEventListener('click', doRewrite);
}

async function doRewrite() {
  const instruction = instructionInput.value.trim();
  if (!instruction || !selectedText) return;

  const model = modelSelect.value;
  contextMenu.classList.add('hidden');

  addLog(`Rewriting with ${model}: "${instruction}"...`);
  rewriteBtn.disabled = true;

  try {
    const result = await post('/api/ai/rewrite', {
      text: selectedText,
      instruction,
      model,
    });

    const rewritten = result.text || result.rewritten || '';
    if (!rewritten) {
      addLog('No rewrite returned', true);
      return;
    }

    // Replace the selected text in the editor
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
