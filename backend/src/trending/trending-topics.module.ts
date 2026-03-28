import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { TrendingTopicsController } from './trending-topics.controller';
import { TrendingTopicsService } from './trending-topics.service';

@Module({
  imports: [PrismaModule],
  controllers: [TrendingTopicsController],
  providers: [TrendingTopicsService],
  exports: [TrendingTopicsService],
})
export class TrendingTopicsModule {}
