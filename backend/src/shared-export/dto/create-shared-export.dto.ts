import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateSharedExportDto {
  @ApiProperty({
    description: 'Export job identifier to share',
    example: 'clu123abc456def',
  })
  @IsString()
  @IsNotEmpty()
  exportJobId: string;

  @ApiPropertyOptional({
    description: 'Optional password to protect the shared link',
    minLength: 6,
    maxLength: 128,
  })
  @IsOptional()
  @IsString()
  @MinLength(6)
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
