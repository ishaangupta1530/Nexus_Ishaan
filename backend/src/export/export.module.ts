import { Module } from '@nestjs/common';
import { CsvGenerator } from './generators/csv.generator';
import { JsonGenerator } from './generators/json.generator';
import { ExcelGenerator } from './generators/excel.generator';
import { PdfGenerator } from './generators/pdf.generator';
import { ExportController } from './export.controller';

@Module({
  controllers: [ExportController],
  providers: [CsvGenerator, JsonGenerator, ExcelGenerator, PdfGenerator],
  exports: [CsvGenerator, JsonGenerator, ExcelGenerator, PdfGenerator],
})
export class ExportModule {}
