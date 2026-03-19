import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';

interface PdfContent {
  heading: string;
  content: any[];
}

@Injectable()
export class PdfGenerator {
  private readonly logger = new Logger(PdfGenerator.name);

  async generate(exportType: string, content: PdfContent[]): Promise<Buffer> {
    try {
      return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const chunks: Buffer[] = [];

        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => {
          resolve(Buffer.concat(chunks));
        });
        doc.on('error', reject);

        // Title
        doc.fontSize(20).font('Helvetica-Bold').text(`${exportType} Export`, { align: 'center' });
        doc.fontSize(10).text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
        doc.moveDown();

        // Process each content section
        content.forEach((section) => {
          doc.fontSize(14).font('Helvetica-Bold').text(section.heading);
          doc.moveDown(0.5);

          // Generate table
          if (section.content && section.content.length > 0) {
            this.generateTable(doc, section.content);
          }

          doc.moveDown();
        });

        this.logger.log(`Generated PDF for ${exportType} export with ${content.length} sections`);
        doc.end();
      });
    } catch (error) {
      this.logger.error(`Failed to generate PDF: ${error.message}`);
      throw error;
    }
  }

  private generateTable(doc: any, data: any[]): void {
    if (!data || data.length === 0) return;

    const headers = Object.keys(data[0]);
    const columnWidth = 500 / headers.length;

    // Draw header row
    doc.font('Helvetica-Bold').fontSize(9);
    headers.forEach((header, index) => {
      doc.text(header, 50 + index * columnWidth, doc.y, {
        width: columnWidth,
        height: 20,
        align: 'left',
        overflow: 'ellipsis',
      });
    });

    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown();

    // Draw data rows
    doc.font('Helvetica').fontSize(8);
    data.slice(0, 100).forEach((row) => {
      // Limit to first 100 rows for performance
      headers.forEach((header, index) => {
        const value = row[header];
        const displayValue = value === null || value === undefined ? '' : String(value).substring(0, 50);

        doc.text(displayValue, 50 + index * columnWidth, doc.y, {
          width: columnWidth,
          height: 15,
          align: 'left',
          overflow: 'ellipsis',
        });
      });

      doc.moveDown(0.5);
    });

    if (data.length > 100) {
      doc.fontSize(9).text(`... and ${data.length - 100} more records`, { align: 'center' });
    }
  }
}
