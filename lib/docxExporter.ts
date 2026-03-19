import { Block, Citation } from '@/types';
import { getOrderedCitationMap } from '@/store/useStore';
import { formatCitationEntry, CitationStyle } from './citationFormatter';

function stripHtml(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || '';
}

function getHeadingLevel(html: string): number | null {
  const match = html.match(/^<h([123])/i);
  return match ? parseInt(match[1]) : null;
}

export async function exportToDocx(
  projectName: string,
  blocks: Block[],
  citations: Citation[],
  citationStyle: CitationStyle
) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx');
  const citationMap = getOrderedCitationMap(blocks, citations);

  const docChildren: any[] = [];

  // Title
  docChildren.push(new Paragraph({
    text: projectName,
    heading: HeadingLevel.TITLE,
  }));

  for (const block of blocks) {
    const html = block.versions[block.activeVersion]?.html || '';
    if (!html.trim()) continue;

    const headingLevel = getHeadingLevel(html);

    // Extract text runs from HTML (handle bold/italic)
    const div = document.createElement('div');
    div.innerHTML = html;
    const fullText = div.textContent || '';

    if (!fullText.trim()) continue;

    // Citation suffix
    const cids = block.citationIds || [];
    const nums = cids.map(id => citationMap.get(id)).filter((n): n is number => n !== undefined);
    const citSuffix = nums.length > 0 ? ` [${nums.join(',')}]` : '';

    let headingEnum: (typeof HeadingLevel)[keyof typeof HeadingLevel] | undefined;
    if (headingLevel === 1) headingEnum = HeadingLevel.HEADING_1;
    else if (headingLevel === 2) headingEnum = HeadingLevel.HEADING_2;
    else if (headingLevel === 3) headingEnum = HeadingLevel.HEADING_3;

    // Parse bold/italic spans
    const runs: any[] = [];
    const walker = (el: Node) => {
      if (el.nodeType === Node.TEXT_NODE) {
        const txt = el.textContent || '';
        if (txt) {
          let bold = false;
          let italic = false;
          let parent: Node | null = el.parentNode;
          while (parent && parent !== div) {
            const tag = (parent as Element).tagName?.toLowerCase();
            if (tag === 'strong' || tag === 'b') bold = true;
            if (tag === 'em' || tag === 'i') italic = true;
            parent = parent.parentNode;
          }
          runs.push(new TextRun({ text: txt, bold, italics: italic }));
        }
      } else if (el.nodeType === Node.ELEMENT_NODE) {
        const children = Array.from(el.childNodes);
        children.forEach(child => walker(child));
      }
    };
    walker(div);

    if (citSuffix) runs.push(new TextRun({ text: citSuffix, color: '6c8aff', size: 18 }));

    docChildren.push(new Paragraph({
      children: runs.length > 0 ? runs : [new TextRun(fullText + citSuffix)],
      heading: headingEnum,
      spacing: { after: 200 },
    }));
  }

  // References section
  const allCited = [...citationMap.entries()].sort((a, b) => a[1] - b[1]);
  if (allCited.length > 0) {
    docChildren.push(new Paragraph({ text: '', spacing: { after: 200 } }));
    docChildren.push(new Paragraph({ text: 'References', heading: HeadingLevel.HEADING_2 }));
    for (const [citId, num] of allCited) {
      const citation = citations.find(c => c.id === citId);
      if (citation) {
        const entry = formatCitationEntry(citation, num, citationStyle);
        docChildren.push(new Paragraph({
          children: [new TextRun({ text: entry, size: 18 })],
          spacing: { after: 100 },
        }));
      }
    }
  }

  const doc = new Document({ sections: [{ children: docChildren }] });
  const blob = await Packer.toBlob(doc);
  return blob;
}
