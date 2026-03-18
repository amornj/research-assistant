import { Citation } from '@/types';

export type CitationStyle = 'vancouver' | 'apa' | 'mla' | 'chicago';

function getAuthors(citation: Citation) {
  return citation.data.creators || [];
}

function getYear(citation: Citation): string {
  return citation.data.date ? citation.data.date.substring(0, 4) : '';
}

function getTitle(citation: Citation): string {
  return citation.data.title || 'Untitled';
}

function getJournal(citation: Citation): string {
  return citation.data.publicationTitle || '';
}

function getDOI(citation: Citation): string {
  return citation.data.DOI ? `https://doi.org/${citation.data.DOI}` : '';
}

// Vancouver: 1. LastName AB, LastName CD. Title. Journal. Year;Volume:Pages.
export function formatVancouver(citation: Citation, num: number): string {
  const authors = getAuthors(citation);
  const authorStr = authors.length === 0
    ? ''
    : authors.slice(0, 6).map(a => {
        const last = a.lastName || a.name || '';
        const initials = (a.firstName || '').split(/\s+/).map(w => w[0] || '').join('');
        return `${last} ${initials}`.trim();
      }).join(', ') + (authors.length > 6 ? ' et al' : '') + '.';

  const year = getYear(citation);
  const title = getTitle(citation);
  const journal = getJournal(citation);
  const vol = citation.data.volume || '';
  const pages = citation.data.pages || '';
  const doi = getDOI(citation);

  let entry = `${num}. ${authorStr}`;
  entry += ` ${title}.`;
  if (journal) entry += ` ${journal}.`;
  if (year) entry += ` ${year}`;
  if (vol) entry += `;${vol}`;
  if (pages) entry += `:${pages}`;
  entry += '.';
  if (doi) entry += ` ${doi}`;
  return entry;
}

// APA: LastName, F. M. (Year). Title. Journal, Volume(Issue), Pages. https://doi.org/...
export function formatAPA(citation: Citation, num: number): string {
  const authors = getAuthors(citation);
  const authorStr = authors.length === 0
    ? ''
    : authors.slice(0, 20).map(a => {
        const last = a.lastName || a.name || '';
        const initials = (a.firstName || '').split(/\s+/).map(w => w[0] ? `${w[0]}.` : '').join(' ');
        return `${last}, ${initials}`.trim().replace(/,\s*$/, '');
      }).join(', ');

  const year = getYear(citation);
  const title = getTitle(citation);
  const journal = getJournal(citation);
  const vol = citation.data.volume || '';
  const pages = citation.data.pages || '';
  const doi = getDOI(citation);

  let entry = authorStr ? `${authorStr}.` : '';
  if (year) entry += ` (${year}).`;
  entry += ` ${title}.`;
  if (journal) {
    entry += ` *${journal}*`;
    if (vol) entry += `, *${vol}*`;
    if (pages) entry += `, ${pages}`;
    entry += '.';
  }
  if (doi) entry += ` ${doi}`;
  return entry.trim();
}

// MLA: LastName, FirstName. "Title." Journal, vol. Volume, Year, pp. Pages.
export function formatMLA(citation: Citation, num: number): string {
  const authors = getAuthors(citation);
  let authorStr = '';
  if (authors.length === 1) {
    const a = authors[0];
    authorStr = `${a.lastName || a.name || ''}, ${a.firstName || ''}`.trim().replace(/,\s*$/, '');
  } else if (authors.length > 1) {
    const first = authors[0];
    authorStr = `${first.lastName || first.name || ''}, ${first.firstName || ''}, et al`.trim();
  }

  const year = getYear(citation);
  const title = getTitle(citation);
  const journal = getJournal(citation);
  const vol = citation.data.volume || '';
  const pages = citation.data.pages || '';
  const doi = getDOI(citation);

  let entry = authorStr ? `${authorStr}.` : '';
  entry += ` "${title}."`;
  if (journal) entry += ` *${journal}*,`;
  if (vol) entry += ` vol. ${vol},`;
  if (year) entry += ` ${year},`;
  if (pages) entry += ` pp. ${pages}.`;
  if (doi) entry += ` ${doi}.`;
  return entry.trim();
}

// Chicago: LastName, FirstName. "Title." Journal Volume (Year): Pages. DOI.
export function formatChicago(citation: Citation, num: number): string {
  const authors = getAuthors(citation);
  let authorStr = '';
  if (authors.length === 1) {
    const a = authors[0];
    authorStr = `${a.lastName || a.name || ''}, ${a.firstName || ''}`.trim().replace(/,\s*$/, '');
  } else if (authors.length > 1) {
    const [first, ...rest] = authors;
    authorStr = `${first.lastName || first.name || ''}, ${first.firstName || ''}`;
    if (rest.length > 0) {
      authorStr += ', and ' + rest.slice(0, 2).map(a => `${a.firstName || ''} ${a.lastName || a.name || ''}`.trim()).join(', ');
      if (rest.length > 2) authorStr += ', et al';
    }
  }

  const year = getYear(citation);
  const title = getTitle(citation);
  const journal = getJournal(citation);
  const vol = citation.data.volume || '';
  const pages = citation.data.pages || '';
  const doi = getDOI(citation);

  let entry = authorStr ? `${authorStr}.` : '';
  entry += ` "${title}."`;
  if (journal) entry += ` *${journal}*`;
  if (vol) entry += ` ${vol}`;
  if (year) entry += ` (${year})`;
  if (pages) entry += `: ${pages}`;
  entry += '.';
  if (doi) entry += ` ${doi}.`;
  return entry.trim();
}

export function formatCitationEntry(citation: Citation, num: number, style: CitationStyle): string {
  switch (style) {
    case 'apa': return formatAPA(citation, num);
    case 'mla': return formatMLA(citation, num);
    case 'chicago': return formatChicago(citation, num);
    case 'vancouver':
    default: return formatVancouver(citation, num);
  }
}
