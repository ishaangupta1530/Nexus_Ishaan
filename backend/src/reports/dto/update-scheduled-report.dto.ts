import { IsString, IsArray, IsEmail, IsOptional, IsObject, IsBoolean } from 'class-validator';

export class UpdateScheduledReportDTO {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  schedule?: string;

  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  recipients?: string[];

  @IsOptional()
  @IsObject()
  filters?: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
