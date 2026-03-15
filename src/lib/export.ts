import { Document, Packer, Paragraph, TextRun } from 'docx'
import jsPDF from 'jspdf'
import { formatReference } from './utils'
import type { ReferenceItem, WritingBlock, ProjectConfig } from './types'

export async function exportDocx(project: ProjectConfig | null, blocks: WritingBlock[], references: ReferenceItem[]) {
  const refMap = new Map(references.map((r) => [r.key, r]))
  const paragraphs = [
    new Paragraph({ text: project?.name || 'Research Draft', heading: 'Title' }),
    ...blocks.map(
      (block) =>
        new Paragraph({
          children: [
            new TextRun(block.text),
            ...(block.references.length
              ? [
                  new TextRun({
                    text: ` [${block.references
                      .map((key) => refMap.get(key)?.number)
                      .filter(Boolean)
                      .join(', ')}]`,
                    italics: true,
                  }),
                ]
              : []),
          ],
        })
    ),
    new Paragraph({ text: 'References', heading: 'Heading1' }),
    ...references.map((ref) => new Paragraph({ text: formatReference(ref) })),
  ]

  const doc = new Document({ sections: [{ properties: {}, children: paragraphs }] })
  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${project?.name || 'research-draft'}.docx`
  a.click()
  URL.revokeObjectURL(url)
}

export function exportPdf(project: ProjectConfig | null, blocks: WritingBlock[], references: ReferenceItem[]) {
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
  const width = 535
  let y = 50
  const addText = (text: string, fontSize = 12) => {
    pdf.setFontSize(fontSize)
    const lines = pdf.splitTextToSize(text, width)
    if (y + lines.length * (fontSize + 4) > 780) {
      pdf.addPage()
      y = 50
    }
    pdf.text(lines, 40, y)
    y += lines.length * (fontSize + 4) + 10
  }

  addText(project?.name || 'Research Draft', 20)
  blocks.forEach((block) => addText(block.text + (block.references.length ? ` [${block.references.map((_, i) => i + 1).join(', ')}]` : '')))
  addText('References', 16)
  references.forEach((ref) => addText(formatReference(ref), 11))
  pdf.save(`${project?.name || 'research-draft'}.pdf`)
}
