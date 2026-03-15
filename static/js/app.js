import { get, post, put, downloadPost } from './api.js';
import * as editor from './editor-pane.js';
import * as notebook from './notebook-pane.js';
import * as refs from './references-pane.js';
import * as aiWriting from './ai-writing-pane.js';

let currentProject = null;
let autoSaveTimer = null;

// DOM
const projectSelect = document.getElementById('project-select');
const newProjectBtn = document.getElementById('btn-new-project');
const exportBtnMain = document.getElementById('btn-export-main');
const exportOptions = document.getElementById('export-options');
const projectName = document.getElementById('project-name');

async function boot() {
  // Init editor
  await editor.init();

  // Init notebook pane
  notebook.init((text) => editor.insertText(text));

  // Init references pane
  refs.init((citation) => editor.insertCitation(citation));

  // Init AI writing pane
  aiWriting.init(() => editor.getEditor());

  // Init pane dividers
  initDividers();

  // Init tabs
  initTabs();

  // Load project list
  await refreshProjects();

  // Wire buttons
  newProjectBtn.addEventListener('click', showNewProjectModal);
  
  exportBtnMain.addEventListener('click', (e) => {
    e.stopPropagation();
    exportOptions.classList.toggle('hidden');
  });

  document.addEventListener('click', () => {
    exportOptions.classList.add('hidden');
  });

  exportOptions.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      exportDoc(btn.dataset.format);
      exportOptions.classList.add('hidden');
    });
  });

  projectSelect.addEventListener('change', () => loadProject(projectSelect.value));

  // Restore last project
  const lastPid = localStorage.getItem('last-project-id');
  if (lastPid) {
    // Small delay to ensure the projectSelect is populated by refreshProjects
    setTimeout(() => {
      projectSelect.value = lastPid;
      if (projectSelect.value === lastPid) {
        loadProject(lastPid);
      }
    }, 200);
  }

  // Auto-save every 10s
  autoSaveTimer = setInterval(autoSave, 10000);
}

function initDividers() {
  // Vertical divider
  const vDivider = document.getElementById('pane-divider');
  const main = document.querySelector('.main');
  let vDragging = false;

  vDivider.addEventListener('mousedown', (e) => {
    e.preventDefault();
    vDragging = true;
    vDivider.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  // Horizontal divider
  const hDivider = document.getElementById('pane-divider-h');
  const paneEditor = document.querySelector('.pane-editor');
  const paneBottom = document.querySelector('.pane-bottom');
  let hDragging = false;

  hDivider.addEventListener('mousedown', (e) => {
    e.preventDefault();
    hDragging = true;
    hDivider.classList.add('dragging');
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (vDragging) {
      const mainRect = main.getBoundingClientRect();
      let newWidth = e.pageX - mainRect.left;
      newWidth = Math.max(240, Math.min(newWidth, mainRect.width - 400));
      main.style.gridTemplateColumns = `${newWidth}px 4px 1fr`;
    }
    
    if (hDragging) {
      const paneRight = document.querySelector('.pane-right');
      const rect = paneRight.getBoundingClientRect();
      const offset = rect.bottom - e.pageY;
      if (offset > 100 && offset < rect.height - 100) {
        paneBottom.style.flex = `0 0 ${offset}px`;
      }
    }
  });

  document.addEventListener('mouseup', () => {
    vDragging = false;
    hDragging = false;
    vDivider.classList.remove('dragging');
    hDivider.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });
}

function initTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-content').forEach(tc => tc.classList.add('hidden'));
      document.getElementById(`tab-${btn.dataset.tab}`).classList.remove('hidden');
    });
  });
}

async function refreshProjects() {
  const projects = await get('/api/projects');
  projectSelect.innerHTML = '<option value="">Select project...</option>';
  for (const p of projects) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    projectSelect.appendChild(opt);
  }
}

async function loadProject(pid) {
  if (!pid) return;
  currentProject = await get(`/api/projects/${pid}`);
  projectName.textContent = currentProject.name;
  localStorage.setItem('last-project-id', pid);

  // Load document
  editor.setContent(currentProject.document_html || '');

  // Set notebook
  notebook.setNotebook(currentProject.notebook_id);
  if (currentProject.chat_history) {
    notebook.setHistory(currentProject.chat_history, currentProject.conversation_id);
  }

  // Load Zotero references
  if (currentProject.zotero_collection) {
    refs.loadCollection(currentProject.zotero_collection);
  }
}

async function autoSave() {
  if (!currentProject) return;
  const html = editor.getHTML();
  const chatHistory = notebook.getHistory();
  const convId = notebook.getConversationId();
  
  // Basic check if changed
  if (html === currentProject.document_html && 
      JSON.stringify(chatHistory) === JSON.stringify(currentProject.chat_history)) return;
      
  currentProject.document_html = html;
  currentProject.chat_history = chatHistory;
  currentProject.conversation_id = convId;
  
  try {
    await put(`/api/projects/${currentProject.id}/document`, { 
      html, 
      chat_history: chatHistory,
      conversation_id: convId
    });
  } catch (e) {
    console.warn('Auto-save failed:', e);
  }
}

async function exportDoc(format) {
  if (!currentProject) return;
  const html = editor.getHTML();
  const filename = currentProject.name.replace(/\s+/g, '_');
  const ext = format === 'md' ? 'md' : (format === 'pdf' ? 'pdf' : 'docx');
  try {
    await downloadPost(`/api/export/${format}`, { html, filename }, `${filename}.${ext}`);
  } catch (e) {
    alert(`Export failed: ${e.message}`);
  }
}

function showNewProjectModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h2>New Research Project</h2>
      <label>Project Name</label>
      <input id="modal-name" placeholder="My Research Paper">
      <label>NotebookLM Notebook Name</label>
      <input id="modal-notebook" placeholder="Notebook name (exact match)">
      <label>Zotero Collection / Search Term</label>
      <input id="modal-zotero" placeholder="Collection name or search query">
      <div class="modal-actions">
        <button id="modal-cancel">Cancel</button>
        <button id="modal-create" class="primary">Create</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('#modal-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector('#modal-create').addEventListener('click', async () => {
    const name = overlay.querySelector('#modal-name').value.trim();
    const notebookName = overlay.querySelector('#modal-notebook').value.trim();
    const zoteroCollection = overlay.querySelector('#modal-zotero').value.trim();
    if (!name) return;

    try {
      const project = await post('/api/projects', {
        name,
        notebook_name: notebookName,
        zotero_collection: zoteroCollection,
      });
      overlay.remove();
      await refreshProjects();
      projectSelect.value = project.id;
      await loadProject(project.id);
    } catch (e) {
      alert(`Failed to create project: ${e.message}`);
    }
  });

  overlay.querySelector('#modal-name').focus();
}

boot().catch(console.error);
