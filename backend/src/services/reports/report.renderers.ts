/**
 * Report renderers — turn structured report data into a PDF or CSV buffer.
 *
 * Kept separate from report.service so the data-gathering (business logic) and
 * the presentation (formatting) concerns don't tangle. A "report" is normalized
 * to a title + metadata + a list of titled tables ({columns, rows}); both
 * renderers consume that same shape, so adding a format or a report type never
 * touches the other side.
 */
import PDFDocument from 'pdfkit';

export interface ReportTable {
  heading: string;
  columns: string[];
  rows: Array<Array<string | number>>;
}

export interface ReportDocument {
  title: string;
  /** Label→value lines shown under the title (period, region, generated-at). */
  meta: Array<[string, string]>;
  tables: ReportTable[];
}

/** Escape a value for CSV (RFC 4180): quote if it contains , " or newline. */
function csvCell(value: string | number): string {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Render to CSV. Multiple tables are stacked with a blank line and a heading row
 * between them so a single file can carry, e.g., overview + top diseases.
 */
export function renderCSV(doc: ReportDocument): Buffer {
  const lines: string[] = [];
  lines.push(csvCell(doc.title));
  for (const [k, v] of doc.meta) lines.push(`${csvCell(k)},${csvCell(v)}`);
  lines.push('');

  for (const table of doc.tables) {
    lines.push(csvCell(table.heading));
    lines.push(table.columns.map(csvCell).join(','));
    for (const row of table.rows) {
      lines.push(row.map(csvCell).join(','));
    }
    lines.push('');
  }

  // CRLF per RFC 4180; BOM so Excel reads UTF-8 (Devanagari disease names, etc.).
  return Buffer.from('﻿' + lines.join('\r\n'), 'utf8');
}

/** Render to PDF via pdfkit. Resolves once the document stream ends. */
export function renderPDF(doc: ReportDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];
    pdf.on('data', (c: Buffer) => chunks.push(c));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);

    // Header
    pdf.fontSize(20).text('Krishi Raksha', { align: 'left' });
    pdf.moveDown(0.2);
    pdf.fontSize(15).text(doc.title);
    pdf.moveDown(0.5);

    pdf.fontSize(10).fillColor('#555');
    for (const [k, v] of doc.meta) pdf.text(`${k}: ${v}`);
    pdf.fillColor('#000');
    pdf.moveDown(1);

    for (const table of doc.tables) {
      pdf.fontSize(13).text(table.heading);
      pdf.moveDown(0.3);
      pdf.fontSize(10);

      if (table.rows.length === 0) {
        pdf.fillColor('#888').text('No data for this period.').fillColor('#000');
        pdf.moveDown(1);
        continue;
      }

      // Simple fixed-width columns across the printable width.
      const startX = pdf.page.margins.left;
      const usableWidth =
        pdf.page.width - pdf.page.margins.left - pdf.page.margins.right;
      const colWidth = usableWidth / table.columns.length;

      const writeRow = (cells: Array<string | number>, bold: boolean) => {
        const y = pdf.y;
        pdf.font(bold ? 'Helvetica-Bold' : 'Helvetica');
        cells.forEach((cell, i) => {
          pdf.text(String(cell ?? ''), startX + i * colWidth, y, {
            width: colWidth,
            ellipsis: true,
          });
        });
        pdf.font('Helvetica');
      };

      writeRow(table.columns, true);
      pdf.moveDown(0.2);
      // Divider under the header row.
      pdf
        .moveTo(startX, pdf.y)
        .lineTo(startX + usableWidth, pdf.y)
        .strokeColor('#ccc')
        .stroke()
        .strokeColor('#000');
      pdf.moveDown(0.3);

      for (const row of table.rows) {
        // Page-break guard near the bottom margin.
        if (pdf.y > pdf.page.height - pdf.page.margins.bottom - 30) {
          pdf.addPage();
        }
        writeRow(row, false);
        pdf.moveDown(0.2);
      }
      pdf.moveDown(1);
    }

    pdf.end();
  });
}
