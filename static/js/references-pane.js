import { get } from './api.js';

let allRefs = [];
let onInsertCallback = null;

const listEl = document.getElementById('ref-list');
const filterEl = document.getElementById('ref-filter');

export function init(onInsert) {
  onInsertCallback = onInsert;
  filterEl.addEventListener('input', () => render(filterEl.value));
}

export async function loadCollection(collectionName) {
  listEl.innerHTML = '<div class="status-msg">Loading references...</div>';
  try {
    const items = await get(`/api/zotero/search?q=${encodeURIComponent(collectionName)}`);
    allRefs = Array.isArray(items) ? items : [];
    render('');
  } catch (e) {
    listEl.innerHTML = `<div class="status-msg">Zotero unavailable: ${e.message}</div>`;
  }
}

function formatAuthors(item) {
  const authors = item.author || item.creators || [];
  if (!authors.length) return 'Unknown';
  const names = authors.slice(0, 3).map(a => a.family || a.lastName || a.name || '?');
  return names.join(', ') + (authors.length > 3 ? ' et al.' : '');
}

function formatYear(item) {
  if (item.issued?.['date-parts']?.[0]?.[0]) return item.issued['date-parts'][0][0];
  if (item.date) return item.date.slice(0, 4);
  return '';
}

function getCiteLabel(item) {
  const author = (item.author?.[0]?.family || item.creators?.[0]?.lastName || 'Ref');
  const year = formatYear(item);
  return `${author}, ${year}`;
}

function render(filter) {
  const q = filter.toLowerCase();
  const filtered = q
    ? allRefs.filter(r => {
        const text = `${r.title || ''} ${formatAuthors(r)}`.toLowerCase();
        return text.includes(q);
      })
    : allRefs;

  if (!filtered.length) {
    listEl.innerHTML = `<div class="status-msg">${allRefs.length ? 'No matches' : 'No references loaded'}</div>`;
    return;
  }

  listEl.innerHTML = filtered.map((item, i) => `
    <div class="ref-item" data-idx="${i}">
      <div class="ref-info">
        <div class="ref-title">${item.title || 'Untitled'}</div>
        <div class="ref-meta">${formatAuthors(item)} ${formatYear(item) ? '(' + formatYear(item) + ')' : ''}</div>
      </div>
      <button class="ref-insert" data-idx="${i}">Insert</button>
    </div>
  `).join('');

  listEl.querySelectorAll('.ref-insert').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx);
      const item = filtered[idx];
      if (onInsertCallback && item) {
        onInsertCallback({
          label: getCiteLabel(item),
          citekey: item['citation-key'] || item.citationKey || item.id || '',
          item,
        });
      }
    });
  });
}

export function getRefs() { return allRefs; }
