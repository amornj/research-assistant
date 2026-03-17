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
  console.log('App booting...');
  try {
    // Init editor (isolated — failure here doesn't block buttons/project UI)
    try {
      await editor.init();
    } catch (err) {
      console.error('Editor init failed:', err);
    }

    // Listen for block changes to trigger auto-save
    document.addEventListener('blocks-changed', () => autoSave());

    // Init notebook pane — push creates a new block
    notebook.init((text) => editor.addBlock(`<p>${text}</p>`));

    // Init references pane
    refs.init((citation) => editor.insertCitation(citation));

    // Init AI writing pane
    try {
      aiWriting.init(
        () => editor.getEditor(),
        () => currentProject,
        () => autoSave()
      );
    } catch (err) {
      console.error('AI writing init failed:', err);
    }

    // Init pane dividers
    initDividers();

    // Init tabs
    initTabs();

    // Load project list
    await refreshProjects();

    // Wire buttons
    if (newProjectBtn) {
        newProjectBtn.addEventListener('click', showNewProjectModal);
    }
    
    if (exportBtnMain) {
        exportBtnMain.addEventListener('click', (e) => {
            e.stopPropagation();
            exportOptions.classList.toggle('hidden');
        });
    }

    document.addEventListener('click', () => {
        if (exportOptions) exportOptions.classList.add('hidden');
    });

    if (exportOptions) {
        exportOptions.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', () => {
                exportDoc(btn.dataset.format);
                exportOptions.classList.add('hidden');
            });
        });
    }

    if (projectSelect) {
        projectSelect.addEventListener('change', () => loadProject(projectSelect.value));
    }

    // Restore last project
    const lastPid = localStorage.getItem('last-project-id');
    if (lastPid && projectSelect) {
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
    console.log('App boot complete');
  } catch (err) {
    console.error('App boot failed:', err);
  }
}

function initDividers() {
  // Vertical divider
  const vDivider = document.getElementById('pane-divider');
  const main = document.querySelector('.main');
  if (!vDivider || !main) return;

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
  if (!hDivider || !paneBottom) return;

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
      if (!paneRight) return;
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
      const target = document.getElementById(`tab-${btn.dataset.tab}`);
      if (target) target.classList.remove('hidden');
    });
  });
}

async function refreshProjects() {
  if (!projectSelect) return;
  try {
    const projects = await get('/api/projects');
    projectSelect.innerHTML = '<option value="">Select project...</option>';
    for (const p of projects) {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        projectSelect.appendChild(opt);
    }
  } catch (err) {
    console.error('Failed to refresh projects:', err);
  }
}

async function loadProject(pid) {
  if (!pid) return;
  try {
    currentProject = await get(`/api/projects/${pid}`);
    if (projectName) projectName.textContent = currentProject.name;
    localStorage.setItem('last-project-id', pid);

    // Load document — prefer blocks array, fall back to HTML migration
    if (currentProject.blocks && currentProject.blocks.length > 0) {
      editor.setBlocks(currentProject.blocks);
    } else {
      editor.setContent(currentProject.document_html || '');
    }

    // Refresh AI versions
    aiWriting.refreshVersions();

    // Set notebook
    notebook.setNotebook(currentProject.notebook_id);
    if (currentProject.chat_history) {
        notebook.setHistory(currentProject.chat_history, currentProject.conversation_id);
    }

    // Load Zotero references
    if (currentProject.zotero_collection) {
        refs.loadCollection(currentProject.zotero_collection);
    }
  } catch (err) {
    console.error('Failed to load project:', err);
  }
}

async function autoSave() {
  if (!currentProject) return;
  const blocks = editor.getBlocks();
  const html = editor.getHTML();
  const chatHistory = notebook.getHistory();
  const convId = notebook.getConversationId();
  const docVersions = currentProject.document_versions || [];

  currentProject.blocks = blocks;
  currentProject.document_html = html;
  currentProject.chat_history = chatHistory;
  currentProject.conversation_id = convId;

  try {
    await put(`/api/projects/${currentProject.id}/document`, {
      html,
      blocks,
      chat_history: chatHistory,
      conversation_id: convId,
      document_versions: docVersions,
    });
  } catch (e) {
    console.warn('Auto-save failed:', e);
  }
}

async function exportDoc(format) {
  if (!currentProject) { alert('Select a project first.'); return; }
  const html = editor.getHTML();
  if (!html || html === '<p></p>') { alert('Document is empty — nothing to export.'); return; }
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
      if (projectSelect) {
          projectSelect.value = project.id;
          await loadProject(project.id);
      }
    } catch (e) {
      alert(`Failed to create project: ${e.message}`);
    }
  });

  const nameInput = overlay.querySelector('#modal-name');
  if (nameInput) nameInput.focus();
}

boot().catch(console.error);
