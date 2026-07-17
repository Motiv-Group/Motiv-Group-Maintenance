import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  TableOfContents, SequentialIdentifier, PageBreak, ImageRun,
  Table, TableRow, TableCell, WidthType,
} from 'docx'
import { chartUrl, type ReportModel, type ReportTable } from '@/lib/report-data'

const GOLD = '9A7B34'
const GREY = '64748B'

async function fetchPng(url: string): Promise<Uint8Array | null> {
  try {
    // External chart-render service — bound it so a hang can't stall the report.
    const r = await fetch(url, { signal: AbortSignal.timeout(20_000) })
    if (!r.ok) return null
    return new Uint8Array(await r.arrayBuffer())
  } catch { return null }
}

function dataTable(t: ReportTable): Table {
  const header = new TableRow({
    tableHeader: true,
    children: t.columns.map(c => new TableCell({
      shading: { fill: GOLD },
      children: [new Paragraph({ children: [new TextRun({ text: c, bold: true, color: 'FFFFFF', size: 18 })] })],
    })),
  })
  const body = t.rows.map(r => new TableRow({
    children: r.map(cell => new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: String(cell), size: 18 })] })],
    })),
  }))
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [header, ...body],
  })
}

function caption(label: 'Figure' | 'Table', text: string): Paragraph {
  return new Paragraph({
    style: 'Caption',
    spacing: { before: 80, after: 160 },
    children: [
      new TextRun({ text: `${label} `, bold: true, size: 16, color: GREY }),
      new SequentialIdentifier(label),
      new TextRun({ text: `: ${text}`, italics: true, size: 16, color: GREY }),
    ],
  })
}

export async function buildReportDocx(model: ReportModel): Promise<Buffer> {
  // Pre-fetch all chart images (sequential to be gentle on the chart API).
  const figureImages = new Map<string, Uint8Array | null>()
  for (const s of model.sections) {
    for (const f of s.figures ?? []) {
      figureImages.set(f.caption, await fetchPng(chartUrl(f.chart)))
    }
  }

  const children: (Paragraph | Table)[] = []

  // ── Cover page ──
  children.push(
    new Paragraph({ spacing: { before: 2400 } }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Motiv', bold: true, size: 56, color: GOLD })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 800 }, children: [new TextRun({ text: 'Maintenance Platform', size: 22, color: GREY })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: model.title, bold: true, size: 40 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 }, children: [new TextRun({ text: model.subtitle, size: 24, color: GREY })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `Prepared for: ${model.preparedFor}`, size: 24 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: model.periodLabel, size: 22 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `Generated: ${model.generatedAt}`, size: 18, color: GREY })] }),
    new Paragraph({ children: [new PageBreak()] }),
  )

  // ── Contents / figures / tables ──
  children.push(
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Table of Contents')] }),
    new TableOfContents('Table of Contents', { hyperlink: true, headingStyleRange: '1-2' }),
    new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 240 }, children: [new TextRun('Table of Figures')] }),
    new TableOfContents('Table of Figures', { hyperlink: true, captionLabel: 'Figure' }),
    new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 240 }, children: [new TextRun('Table of Tables')] }),
    new TableOfContents('Table of Tables', { hyperlink: true, captionLabel: 'Table' }),
    new Paragraph({ children: [new PageBreak()] }),
  )

  // ── Executive summary ──
  if (model.executiveSummary) {
    children.push(
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Executive Summary')] }),
      new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: model.executiveSummary, size: 22 })] }),
    )
  }

  // ── Sections ──
  for (const s of model.sections) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 240 }, children: [new TextRun(s.heading)] }))

    if (s.narrative) children.push(new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: s.narrative, size: 22 })] }))

    if (s.stats?.length) {
      children.push(dataTable({ caption: '', columns: ['Metric', 'Value'], rows: s.stats.map(st => [st.label, st.value]) }))
      children.push(new Paragraph({ spacing: { after: 120 } }))
    }

    for (const f of s.figures ?? []) {
      const img = figureImages.get(f.caption)
      if (img) {
        children.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new ImageRun({ data: img, type: 'png', transformation: { width: 520, height: 293 } })],
        }))
        children.push(caption('Figure', f.caption))
      }
    }

    for (const t of s.tables ?? []) {
      children.push(dataTable(t))
      children.push(caption('Table', t.caption))
    }
  }

  const doc = new Document({
    creator: 'Motiv',
    title: model.title,
    features: { updateFields: true }, // prompts Word to populate TOC / figures / tables on open
    styles: {
      paragraphStyles: [
        { id: 'Caption', name: 'Caption', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { italics: true, size: 16, color: GREY } },
      ],
    },
    sections: [{
      properties: { page: { margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } },
      children,
    }],
  })

  return Packer.toBuffer(doc)
}
