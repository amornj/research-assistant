/**
 * Block-based editor — replaces TipTap.
 * Uses contenteditable divs with HTML5 drag-and-drop.
 * No external libraries — pure vanilla JS.
 */

let blocks = []; // { id, type, versions: [{html, ts, instruction}], activeVersion }
let focusedBlockId = null;
let aiPopupEl = null;
let aiPopupBlockId = null;
let dragSrcId = null;
let dropTargetId = null;
let dropPosition = null; // 'before' | 'after'

function genId() {
  return Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 5);
}

function makeBlock(html) {
  return {
    id: genId(),
    type: 'text',
    versions: [{ html: html || '<p><br></p>', ts: Date.now(), instruction: null }],
    activeVersion: 0,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function init() {
  const mount = document.getElementById('editor-mount');
  if (!mount) return;
  mount.innerHTML = '<div class="block-list" id="block-list"></div>';

  const list = document.getElementById('block-list');
  list.addEventListener('dragover', onDragOver, { passive: false });
  list.addEventListener('drop', onDrop);
  list.addEventListener('dragleave', onDragLeave);

  buildAIPopup();
  wireToolbar();

  // Close popup on outside click
  document.addEventListener('mousedown', (e) => {
    if (!aiPopupEl || aiPopupEl.classList.contains('hidden')) return;
    if (!aiPopupEl.contains(e.target) && !e.target.closest('.block-handle')) {
      hideAIPopup();
    }
  });

  if (blocks.length === 0) blocks.push(makeBlock());
  renderBlocks();
}

export function getBlocks() {
  if (focusedBlockId) syncBlock(focusedBlockId);
  return blocks;
}

export function setBlocks(newBlocks) {
  if (!Array.isArray(newBlocks) || newBlocks.length === 0) {
    blocks = [makeBlock()];
  } else {
    blocks = newBlocks;
  }
  focusedBlockId = null;
  renderBlocks();
}

export function addBlock(html) {
  if (focusedBlockId) syncBlock(focusedBlockId);
  const block = makeBlock(html || '<p><br></p>');
  blocks.push(block);

  const list = document.getElementById('block-list');
  if (list) {
    const el = renderBlock(block);
    list.appendChild(el);
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  document.dispatchEvent(new CustomEvent('blocks-changed'));
  return block;
}

export function getHTML() {
  if (focusedBlockId) syncBlock(focusedBlockId);
  return blocks.map(b => b.versions[b.activeVersion]?.html || '').filter(Boolean).join('\n');
}

export function setContent(html) {
  if (!html || html.trim() === '' || html === '<p></p>') {
    blocks = [makeBlock()];
  } else {
    blocks = parseHTMLToBlocks(html);
    if (blocks.length === 0) blocks = [makeBlock()];
  }
  focusedBlockId = null;
  renderBlocks();
}

export function insertCitation({ label, citekey }) {
  if (!focusedBlockId) return;
  const span = `<span data-citation class="citation-node" data-label="${label}" data-citekey="${citekey}">[${label}]</span>`;
  document.execCommand('insertHTML', false, span);
  syncBlock(focusedBlockId);
}

export function insertText(text) {
  addBlock(`<p>${text}</p>`);
}

// Shim for backwards-compat with ai-writing-pane
export function getEditor() {
  return {
    getHTML,
    addBlock,
    commands: {
      setContent: (html) => setContent(html),
    },
  };
}

// ---------------------------------------------------------------------------
// HTML → Blocks migration
// ---------------------------------------------------------------------------

function parseHTMLToBlocks(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const blockTags = new Set(['p','h1','h2','h3','h4','h5','h6','ul','ol','blockquote','pre','div','figure','table','hr']);
  const result = [];

  for (const child of Array.from(tmp.children)) {
    const tag = child.tagName.toLowerCase();
    if (blockTags.has(tag)) {
      result.push(makeBlock(child.outerHTML));
    }
  }

  if (result.length === 0 && tmp.innerHTML.trim()) {
    result.push(makeBlock(`<p>${tmp.innerHTML.trim()}</p>`));
  }

  return result;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderBlocks() {
  const list = document.getElementById('block-list');
  if (!list) return;
  list.innerHTML = '';
  for (const block of blocks) {
    list.appendChild(renderBlock(block));
  }
}

function renderBlock(block) {
  const active = block.versions[block.activeVersion] || block.versions[0];

  const wrap = document.createElement('div');
  wrap.className = 'block-wrap';
  wrap.dataset.blockId = block.id;

  // Main row: handle + content
  const mainRow = document.createElement('div');
  mainRow.className = 'block-main-row';

  // Drag handle (6-dot grid)
  const handle = document.createElement('div');
  handle.className = 'block-handle';
  handle.draggable = true;
  handle.title = 'Drag to reorder • Click for AI rewrite';
  handle.innerHTML = `<svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
    <circle cx="3" cy="2.5" r="1.2"/><circle cx="7" cy="2.5" r="1.2"/>
    <circle cx="3" cy="7" r="1.2"/><circle cx="7" cy="7" r="1.2"/>
    <circle cx="3" cy="11.5" r="1.2"/><circle cx="7" cy="11.5" r="1.2"/>
  </svg>`;

  // Content (contenteditable)
  const content = document.createElement('div');
  content.className = 'block-content';
  content.contentEditable = 'true';
  content.dataset.blockId = block.id;
  content.innerHTML = active.html;

  mainRow.appendChild(handle);
  mainRow.appendChild(content);
  wrap.appendChild(mainRow);

  // Version pills (only when >1 versions)
  if (block.versions.length > 1) {
    const pillsRow = document.createElement('div');
    pillsRow.className = 'block-version-pills';
    block.versions.forEach((v, i) => {
      const pill = document.createElement('span');
      pill.className = 'block-version-pill' + (i === block.activeVersion ? ' active' : '');
      pill.textContent = `v${i + 1}`;
      if (v.instruction) pill.title = v.instruction;
      pill.addEventListener('click', (e) => {
        e.stopPropagation();
        switchVersion(block.id, i);
      });
      pillsRow.appendChild(pill);
    });
    wrap.appendChild(pillsRow);
  }

  // Focus / blur
  content.addEventListener('focus', () => {
    focusedBlockId = block.id;
    wrap.classList.add('focused');
  });
  content.addEventListener('blur', () => {
    wrap.classList.remove('focused');
    syncBlock(block.id);
  });
  content.addEventListener('keydown', handleBlockKeydown);

  // Handle: click = AI popup
  handle.addEventListener('click', (e) => {
    e.stopPropagation();
    showAIPopup(block.id, wrap);
  });

  // Handle: drag start / end
  handle.addEventListener('dragstart', (e) => {
    dragSrcId = block.id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', block.id);
    setTimeout(() => wrap.classList.add('dragging'), 0);
  });

  handle.addEventListener('dragend', () => {
    wrap.classList.remove('dragging');
    clearDropIndicators();
    dragSrcId = null;
    dropTargetId = null;
    dropPosition = null;
  });

  return wrap;
}

function syncBlock(blockId) {
  const block = blocks.find(b => b.id === blockId);
  if (!block) return;
  const el = document.querySelector(`.block-content[data-block-id="${blockId}"]`);
  if (!el) return;
  if (block.versions[block.activeVersion]) {
    block.versions[block.activeVersion].html = el.innerHTML;
  }
}

function switchVersion(blockId, versionIndex) {
  const block = blocks.find(b => b.id === blockId);
  if (!block || !block.versions[versionIndex]) return;
  syncBlock(blockId);
  block.activeVersion = versionIndex;

  const list = document.getElementById('block-list');
  const oldWrap = list?.querySelector(`.block-wrap[data-block-id="${blockId}"]`);
  if (oldWrap) {
    const newWrap = renderBlock(block);
    oldWrap.replaceWith(newWrap);
  }

  document.dispatchEvent(new CustomEvent('blocks-changed'));
}

function handleBlockKeydown(e) {
  const blockId = e.currentTarget.dataset.blockId;
  const el = e.currentTarget;

  // Enter at end of block → create new block
  if (e.key === 'Enter' && !e.shiftKey) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const endRange = document.createRange();
    endRange.selectNodeContents(el);
    endRange.collapse(false);

    if (range.compareBoundaryPoints(Range.END_TO_END, endRange) >= 0) {
      e.preventDefault();
      syncBlock(blockId);

      const idx = blocks.findIndex(b => b.id === blockId);
      const newBlock = makeBlock('<p><br></p>');
      blocks.splice(idx + 1, 0, newBlock);

      const list = document.getElementById('block-list');
      const currentWrap = list?.querySelector(`.block-wrap[data-block-id="${blockId}"]`);
      if (currentWrap) {
        const newWrap = renderBlock(newBlock);
        currentWrap.insertAdjacentElement('afterend', newWrap);
        setTimeout(() => {
          const newContent = newWrap.querySelector('.block-content');
          if (newContent) { newContent.focus(); placeCaretAtStart(newContent); }
        }, 0);
      }
    }
  }

  // Backspace on empty block → delete block
  if (e.key === 'Backspace') {
    const isEmpty = ['', '<br>', '<p><br></p>', '<p></p>'].includes(el.innerHTML);
    if (isEmpty && blocks.length > 1) {
      e.preventDefault();
      const idx = blocks.findIndex(b => b.id === blockId);
      blocks.splice(idx, 1);

      const list = document.getElementById('block-list');
      const currentWrap = list?.querySelector(`.block-wrap[data-block-id="${blockId}"]`);
      currentWrap?.remove();

      const targetBlock = blocks[Math.max(0, idx - 1)];
      if (targetBlock) {
        const targetContent = list?.querySelector(`.block-content[data-block-id="${targetBlock.id}"]`);
        if (targetContent) { targetContent.focus(); placeCaretAtEnd(targetContent); }
      }

      document.dispatchEvent(new CustomEvent('blocks-changed'));
    }
  }
}

function placeCaretAtStart(el) {
  try {
    const range = document.createRange();
    const sel = window.getSelection();
    range.setStart(el, 0);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  } catch (_) {}
}

function placeCaretAtEnd(el) {
  try {
    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// Drag and Drop (event delegation on #block-list)
// ---------------------------------------------------------------------------

function onDragOver(e) {
  if (!dragSrcId) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';

  const target = e.target.closest('.block-wrap');
  if (!target) return;
  const targetId = target.dataset.blockId;
  if (targetId === dragSrcId) return;

  const rect = target.getBoundingClientRect();
  const pos = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';

  if (targetId !== dropTargetId || pos !== dropPosition) {
    clearDropIndicators();
    dropTargetId = targetId;
    dropPosition = pos;
    target.classList.add(pos === 'before' ? 'drop-before' : 'drop-after');
  }
}

function onDragLeave(e) {
  const list = document.getElementById('block-list');
  if (list && !list.contains(e.relatedTarget)) {
    clearDropIndicators();
    dropTargetId = null;
    dropPosition = null;
  }
}

function onDrop(e) {
  e.preventDefault();
  if (!dragSrcId || !dropTargetId) return;

  const srcIdx = blocks.findIndex(b => b.id === dragSrcId);
  if (srcIdx === -1) return;

  // Remove src from array
  const [removed] = blocks.splice(srcIdx, 1);

  // Find target after removal
  const newTgtIdx = blocks.findIndex(b => b.id === dropTargetId);
  if (newTgtIdx === -1) { blocks.splice(srcIdx, 0, removed); return; }

  const insertIdx = dropPosition === 'before' ? newTgtIdx : newTgtIdx + 1;
  blocks.splice(insertIdx, 0, removed);

  // Move DOM node without full re-render
  const list = document.getElementById('block-list');
  const srcWrap = list?.querySelector(`.block-wrap[data-block-id="${dragSrcId}"]`);
  const tgtWrap = list?.querySelector(`.block-wrap[data-block-id="${dropTargetId}"]`);

  if (srcWrap && tgtWrap) {
    srcWrap.classList.remove('dragging');
    if (dropPosition === 'before') {
      tgtWrap.before(srcWrap);
    } else {
      tgtWrap.after(srcWrap);
    }
  }

  clearDropIndicators();
  dragSrcId = null;
  dropTargetId = null;
  dropPosition = null;

  document.dispatchEvent(new CustomEvent('blocks-changed'));
}

function clearDropIndicators() {
  document.querySelectorAll('.drop-before, .drop-after').forEach(el => {
    el.classList.remove('drop-before', 'drop-after');
  });
}

// ---------------------------------------------------------------------------
// AI Popup
// ---------------------------------------------------------------------------

function buildAIPopup() {
  if (aiPopupEl) return;
  aiPopupEl = document.createElement('div');
  aiPopupEl.className = 'block-ai-popup hidden';
  aiPopupEl.innerHTML = `
    <div class="block-ai-header">✦ AI Rewrite</div>
    <input class="block-ai-input" type="text" placeholder="How should I change this block?">
    <div class="block-ai-presets">
      <button data-preset="Make more formal">More formal</button>
      <button data-preset="Simplify the language">Simplify</button>
      <button data-preset="Expand with more detail">Expand</button>
      <button data-preset="Make shorter and more concise">Shorten</button>
      <button data-preset="Rewrite in academic style">Academic</button>
    </div>
    <button class="block-ai-send">Rewrite →</button>
    <div class="block-ai-status hidden"></div>
  `;
  document.body.appendChild(aiPopupEl);

  const input = aiPopupEl.querySelector('.block-ai-input');
  const sendBtn = aiPopupEl.querySelector('.block-ai-send');
  const statusEl = aiPopupEl.querySelector('.block-ai-status');

  aiPopupEl.querySelectorAll('[data-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      input.value = btn.dataset.preset;
      input.focus();
    });
  });

  async function doRewrite() {
    const instruction = input.value.trim();
    if (!instruction || !aiPopupBlockId) return;

    const block = blocks.find(b => b.id === aiPopupBlockId);
    if (!block) return;

    syncBlock(aiPopupBlockId);
    const currentHTML = block.versions[block.activeVersion]?.html || '';

    sendBtn.disabled = true;
    statusEl.textContent = '✦ Rewriting...';
    statusEl.className = 'block-ai-status';

    const agentId = document.getElementById('ai-agent-select')?.value || '';
    const modelId = document.getElementById('ai-model-select')?.value || '';

    try {
      const res = await fetch('/api/ai/rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: currentHTML, instruction, agent_id: agentId, model_id: modelId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = await res.json();
      const rewrittenHTML = result.text || result.rewritten || '';
      if (!rewrittenHTML) throw new Error('No rewrite returned');

      // Add new version (max 5, drop oldest if needed)
      if (block.versions.length >= 5) block.versions.shift();
      block.versions.push({ html: rewrittenHTML, ts: Date.now(), instruction });
      block.activeVersion = block.versions.length - 1;

      statusEl.textContent = '✓ Done';
      statusEl.className = 'block-ai-status success';
      input.value = '';

      // Re-render only this block
      const list = document.getElementById('block-list');
      const oldWrap = list?.querySelector(`.block-wrap[data-block-id="${aiPopupBlockId}"]`);
      if (oldWrap) oldWrap.replaceWith(renderBlock(block));

      document.dispatchEvent(new CustomEvent('blocks-changed'));
      setTimeout(() => hideAIPopup(), 1000);
    } catch (err) {
      statusEl.textContent = `Error: ${err.message}`;
      statusEl.className = 'block-ai-status error';
    } finally {
      sendBtn.disabled = false;
    }
  }

  sendBtn.addEventListener('click', doRewrite);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); doRewrite(); }
    if (e.key === 'Escape') hideAIPopup();
  });
}

function showAIPopup(blockId, blockWrap) {
  if (!aiPopupEl) return;
  aiPopupBlockId = blockId;
  aiPopupEl.classList.remove('hidden');

  const rect = blockWrap.getBoundingClientRect();
  const popupW = 280;
  const popupH = 230; // approximate

  let left = rect.right + 8;
  let top = rect.top;

  // Flip left if off-screen right
  if (left + popupW > window.innerWidth - 10) {
    left = rect.left - popupW - 8;
  }
  // Clamp vertically
  if (top + popupH > window.innerHeight - 10) {
    top = window.innerHeight - popupH - 10;
  }
  top = Math.max(8, top);
  left = Math.max(8, left);

  aiPopupEl.style.left = `${left}px`;
  aiPopupEl.style.top = `${top}px`;

  const input = aiPopupEl.querySelector('.block-ai-input');
  const status = aiPopupEl.querySelector('.block-ai-status');
  if (input) { input.value = ''; input.focus(); }
  if (status) { status.textContent = ''; status.className = 'block-ai-status hidden'; }
}

function hideAIPopup() {
  if (aiPopupEl) {
    aiPopupEl.classList.add('hidden');
    aiPopupBlockId = null;
  }
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

function wireToolbar() {
  const actions = {
    'btn-bold':      () => document.execCommand('bold'),
    'btn-italic':    () => document.execCommand('italic'),
    'btn-underline': () => document.execCommand('underline'),
    'btn-h1':        () => document.execCommand('formatBlock', false, 'h1'),
    'btn-h2':        () => document.execCommand('formatBlock', false, 'h2'),
    'btn-h3':        () => document.execCommand('formatBlock', false, 'h3'),
    'btn-ul':        () => document.execCommand('insertUnorderedList'),
    'btn-ol':        () => document.execCommand('insertOrderedList'),
    'btn-quote':     () => document.execCommand('formatBlock', false, 'blockquote'),
  };

  for (const [id, fn] of Object.entries(actions)) {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('mousedown', (e) => {
        e.preventDefault(); // keep focus in contenteditable
        fn();
        if (focusedBlockId) syncBlock(focusedBlockId);
      });
    }
  }
}
