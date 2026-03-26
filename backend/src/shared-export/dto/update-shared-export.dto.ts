import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateSharedExportDto {
  @ApiPropertyOptional({
    description:
      'Optional password to protect the shared link (empty string removes password)',
    minLength: 0,
    maxLength: 128,
  })
  @IsOptional()
  @IsString()
  @MinLength(0)
  @MaxLength(128)
  password?: string;

  @ApiPropertyOptional({
    description: 'Optional expiration date/time',
    example: '2026-04-01T00:00:00.000Z',
    type: String,
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expiresAt?: Date;

  @ApiPropertyOptional({
    description: 'Optional maximum allowed views',
    example: 10,
    minimum: 1,
    maximum: 100000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  maxViews?: number;
}
