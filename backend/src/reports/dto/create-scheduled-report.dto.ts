import { IsString, IsEnum, IsArray, IsEmail, IsOptional, IsObject, IsBoolean } from 'class-validator';

export class CreateScheduledReportDTO {
  @IsString()
  name: string;

  @IsEnum(['REFERRALS', 'ANALYTICS', 'CONNECTIONS'], {
    message: 'reportType must be one of: REFERRALS, ANALYTICS, CONNECTIONS',
  })
  reportType: 'REFERRALS' | 'ANALYTICS' | 'CONNECTIONS';

  @IsEnum(['csv', 'pdf', 'excel', 'json'], {
    message: 'format must be one of: csv, pdf, excel, json',
  })
  format: 'csv' | 'pdf' | 'excel' | 'json';

  @IsString()
  schedule: string; // Cron expression (e.g., '0 0 * * 1' for weekly Monday)

  @IsArray()
  @IsEmail({}, { each: true })
  recipients: string[];

  @IsOptional()
  @IsObject()
  filters?: Record<string, any>;

  @IsBoolean()
  enabled: boolean;
}
