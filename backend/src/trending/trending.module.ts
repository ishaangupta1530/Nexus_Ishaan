import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TrendingController } from './trending.controller';
import { TrendingService } from './trending.service';

@Module({
  imports: [PrismaModule],
  controllers: [TrendingController],
  providers: [TrendingService],
  exports: [TrendingService],
})
export class TrendingModule {}
