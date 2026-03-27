import { Injectable, Logger } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';

interface PdfContent {
  heading: string;
  content: any[];
}

@Injectable()
export class PdfGenerator {
  private readonly logger = new Logger(PdfGenerator.name);

  async generate(exportType: string, content: PdfContent[]): Promise<Buffer> {
    return await new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
      doc.on('error', (error: Error) => {
        this.logger.error(`Failed to generate PDF: ${error.message}`);
        reject(error);
      });

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
  }

  private generateTable(doc: any, data: any[]): void {
    if (!data || data.length === 0) return;

    const headers = Object.keys(data[0]);
    if (headers.length === 0) return;

    const maxRows = 100;
    const rows = data.slice(0, maxRows);
    const tableLeft = doc.page.margins.left;
    const tableRight = doc.page.width - doc.page.margins.right;
    const tableWidth = tableRight - tableLeft;
    const columnWidths = this.getColumnWidths(headers, tableWidth);
    const headerHeight = 22;
    const rowHeight = 24;
    const textPaddingX = 4;
    const textPaddingY = 7;
    const pageBottom = doc.page.height - doc.page.margins.bottom;
    const borderColor = '#D1D5DB';

    let currentY = doc.y;

    const ensureSpace = (requiredHeight: number) => {
      if (currentY + requiredHeight <= pageBottom) {
        return;
      }
      doc.addPage();
      currentY = doc.page.margins.top;
      drawHeader();
    };

    const drawHeader = () => {
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#111111');
      let xOffset = tableLeft;
      headers.forEach((header, index) => {
        const width = columnWidths[index];
        const headerText = this.truncateToFit(
          this.humanizeHeader(header),
          width - textPaddingX * 2,
        );

        doc.rect(xOffset, currentY, width, headerHeight).fillAndStroke('#F3F4F6', borderColor);
        doc.text(headerText, xOffset + textPaddingX, currentY + textPaddingY, {
          width: width - textPaddingX * 2,
          lineBreak: false,
        });

        xOffset += width;
      });
      currentY += headerHeight;
    };

    drawHeader();

    doc.font('Helvetica').fontSize(8).fillColor('#111111');
    rows.forEach((row, rowIndex) => {
      ensureSpace(rowHeight);

      if (rowIndex % 2 === 1) {
        doc.rect(tableLeft, currentY, tableWidth, rowHeight).fill('#FAFAFA');
      }

      let xOffset = tableLeft;
      headers.forEach((header, index) => {
        const width = columnWidths[index];
        const rawValue = row[header];
        const displayValue = this.truncateToFit(
          this.formatCellValue(rawValue, header),
          width - textPaddingX * 2,
        );

        doc.rect(xOffset, currentY, width, rowHeight).stroke(borderColor);
        doc.fillColor('#111111').text(displayValue, xOffset + textPaddingX, currentY + textPaddingY, {
          width: width - textPaddingX * 2,
          lineBreak: false,
        });

        xOffset += width;
      });

      currentY += rowHeight;
    });

    doc.y = currentY + 8;

    if (data.length > maxRows) {
      doc.fontSize(9).fillColor('#4B5563').text(`... and ${data.length - maxRows} more records`, tableLeft, doc.y);
      doc.fillColor('#111111');
    }
  }

  private getColumnWidths(headers: string[], tableWidth: number): number[] {
    const weights: Record<string, number> = {
      id: 1.6,
      connectedat: 1.2,
      status: 1,
      userid: 1.4,
      name: 1.3,
      email: 1.6,
      role: 1,
      location: 1.7,
      company: 1.4,
      jobtitle: 1.5,
      createdat: 1.2,
      deadline: 1.2,
      postedbyname: 1.3,
      postedbyemail: 1.6,
      applicationscount: 1.1,
    };

    const normalizedWeights = headers.map((header) => {
      const key = header.replaceAll(/[^a-zA-Z]/g, '').toLowerCase();
      return weights[key] || 1.2;
    });

    const totalWeight = normalizedWeights.reduce((sum, weight) => sum + weight, 0);
    return normalizedWeights.map((weight) => (tableWidth * weight) / totalWeight);
  }

  private humanizeHeader(header: string): string {
    return header
      .replaceAll(/([a-z])([A-Z])/g, '$1 $2')
      .replaceAll('_', ' ')
      .trim();
  }

  private truncateToFit(value: string, availableWidth: number): string {
    const normalized = value.replaceAll(/\s+/g, ' ').trim();
    const maxChars = Math.max(4, Math.floor(availableWidth / 4.6));

    if (normalized.length <= maxChars) {
      return normalized;
    }

    return `${normalized.slice(0, Math.max(1, maxChars - 1))}…`;
  }

  private formatCellValue(value: unknown, key?: string): string {
    if (value === null || value === undefined) return '';

    if (value instanceof Date) {
      return value.toISOString().split('T')[0];
    }

    if (typeof value === 'string') {
      const normalized = value.replaceAll(/\s+/g, ' ').trim();

      if (key && ['id', 'userId'].includes(key) && normalized.length > 14) {
        return `${normalized.slice(0, 8)}...${normalized.slice(-4)}`;
      }

      return normalized;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    if (typeof value === 'object') {
      const objectValue = value as Record<string, unknown>;
      if (typeof objectValue.name === 'string') {
        return objectValue.name;
      }
      return JSON.stringify(objectValue);
    }

    if (typeof value === 'function') {
      return '[function]';
    }

    if (typeof value === 'symbol') {
      return value.description || 'symbol';
    }

    try {
      return JSON.stringify(value) || '';
    } catch {
      return '';
    }
  }
}
