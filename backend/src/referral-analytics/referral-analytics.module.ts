import { Module } from '@nestjs/common';
import { ReferralAnalyticsController } from './referral-analytics.controller';
import { ReferralMentorshipAnalyticsController } from './referral-mentorship-analytics.controller';
import { ReferralAnalyticsService } from './referral-analytics.service';

@Module({
  controllers: [
    ReferralAnalyticsController,
    ReferralMentorshipAnalyticsController,
  ],
  providers: [ReferralAnalyticsService],
  exports: [ReferralAnalyticsService],
})
export class ReferralAnalyticsModule {}
