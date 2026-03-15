import { Module } from '@nestjs/common';
import { SharedExportService } from './shared-export.service';
import { SharedExportController } from './shared-export.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [SharedExportService],
  controllers: [SharedExportController],
  exports: [SharedExportService],
})
export class SharedExportModule {}
