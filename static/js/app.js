import { get, post, put, downloadPost } from './api.js';
import * as editor from './editor-pane.js';
import * as notebook from './notebook-pane.js';
import * as refs from './references-pane.js';

let currentProject = null;
let autoSaveTimer = null;

// DOM
const projectSelect = document.getElementById('project-select');
const newProjectBtn = document.getElementById('btn-new-project');
const exportDocxBtn = document.getElementById('btn-export-docx');
const exportPdfBtn = document.getElementById('btn-export-pdf');
const projectName = document.getElementById('project-name');

async function boot() {
  // Init editor
  await editor.init();

  // Init notebook pane
  notebook.init((text) => editor.insertText(text));

  // Init references pane
  refs.init((citation) => editor.insertCitation(citation));

  // Load project list
  await refreshProjects();

  // Wire buttons
  newProjectBtn.addEventListener('click', showNewProjectModal);
  exportDocxBtn.addEventListener('click', () => exportDoc('docx'));
  exportPdfBtn.addEventListener('click', () => exportDoc('pdf'));
  projectSelect.addEventListener('change', () => loadProject(projectSelect.value));

  // Auto-save every 30s
  autoSaveTimer = setInterval(autoSave, 30000);
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

  // Load document
  editor.setContent(currentProject.document_html || '');

  // Set notebook
  notebook.setNotebook(currentProject.notebook_id);

  // Load Zotero references
  if (currentProject.zotero_collection) {
    refs.loadCollection(currentProject.zotero_collection);
  }
}

async function autoSave() {
  if (!currentProject) return;
  const html = editor.getHTML();
  if (html === currentProject.document_html) return;
  currentProject.document_html = html;
  try {
    await put(`/api/projects/${currentProject.id}/document`, { html });
  } catch (e) {
    console.warn('Auto-save failed:', e);
  }
}

async function exportDoc(format) {
  if (!currentProject) return;
  const html = editor.getHTML();
  const filename = currentProject.name.replace(/\s+/g, '_');
  try {
    await downloadPost(`/api/export/${format}`, { html, filename }, `${filename}.${format}`);
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
