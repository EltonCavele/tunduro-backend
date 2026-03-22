import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CourtType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CourtCreateRequestDto {
  @ApiProperty({ example: 'Court A' })
  @IsString()
  @MaxLength(120)
  @Transform(({ value }) => `${value}`.trim())
  name: string;

  @ApiProperty({ enum: CourtType, example: CourtType.OUTDOOR })
  @IsEnum(CourtType)
  type: CourtType;

  @ApiProperty({ example: 'HARD' })
  @IsString()
  @MaxLength(60)
  @Transform(({ value }) => `${value}`.trim().toUpperCase())
  surface: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  hasLighting: boolean;

  @ApiPropertyOptional({ example: 'No glass bottles allowed.' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  @Transform(({ value }) => (value === null ? null : `${value}`.trim()))
  rules?: string | null;

  @ApiProperty({ example: 1200 })
  @IsNumber()
  @Min(0)
  pricePerHour: number;

  @ApiPropertyOptional({ example: 'MZN', default: 'MZN' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  @Transform(({ value }) => `${value}`.trim().toUpperCase())
  currency?: string;

  @ApiPropertyOptional({ example: 4, default: 4 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(20)
  maxPlayers?: number;
}

export class CourtUpdateRequestDto {
  @ApiPropertyOptional({ example: 'Court A Premium' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(({ value }) => `${value}`.trim())
  name?: string;

  @ApiPropertyOptional({ enum: CourtType, example: CourtType.INDOOR })
  @IsOptional()
  @IsEnum(CourtType)
  type?: CourtType;

  @ApiPropertyOptional({ example: 'CLAY' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  @Transform(({ value }) => `${value}`.trim().toUpperCase())
  surface?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  hasLighting?: boolean;

  @ApiPropertyOptional({ example: 'Bring your own racket.' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  @Transform(({ value }) => (value === null ? null : `${value}`.trim()))
  rules?: string | null;

  @ApiPropertyOptional({ example: 1300 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  pricePerHour?: number;

  @ApiPropertyOptional({ example: 'MZN' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  @Transform(({ value }) => `${value}`.trim().toUpperCase())
  currency?: string;

  @ApiPropertyOptional({ example: 6 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(20)
  maxPlayers?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CourtListQueryRequestDto {
  @ApiPropertyOptional({ example: 'court a' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ enum: CourtType })
  @IsOptional()
  @IsEnum(CourtType)
  type?: CourtType;

  @ApiPropertyOptional({ example: 'HARD' })
  @IsOptional()
  @IsString()
  surface?: string;

  @ApiPropertyOptional({ example: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  priceMin?: number;

  @ApiPropertyOptional({ example: 2500 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  priceMax?: number;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number;

  @ApiPropertyOptional({ example: 10, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  pageSize?: number;

  @ApiPropertyOptional({ example: '2026-03-12T18:00:00.000Z' })
  @IsOptional()
  @IsString()
  startAt?: string;

  @ApiPropertyOptional({ example: '2026-03-12T19:00:00.000Z' })
  @IsOptional()
  @IsString()
  endAt?: string;
}

export class CourtBookingsQueryRequestDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  pageSize?: number;

  @ApiPropertyOptional({ example: '2026-03-01T00:00:00.000Z' })
  @IsOptional()
  @IsString()
  startAt?: string;

  @ApiPropertyOptional({ example: '2026-04-01T00:00:00.000Z' })
  @IsOptional()
  @IsString()
  endAt?: string;
}

export class CourtGalleryPresignRequestDto {
  @ApiProperty({ example: 'court-1.png' })
  @IsString()
  @MaxLength(255)
  fileName: string;

  @ApiProperty({ example: 'image/png' })
  @IsString()
  @MaxLength(100)
  contentType: string;
}

export class CourtGalleryItemRequestDto {
  @ApiProperty({
    example: 'https://bucket.s3.af-south-1.amazonaws.com/courts/id/file.png',
  })
  @IsUrl()
  url: string;

  @ApiPropertyOptional({ example: 0, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  sortOrder?: number;
}

export class CourtGalleryUpsertRequestDto {
  @ApiProperty({ type: [CourtGalleryItemRequestDto] })
  @IsArray()
  images: CourtGalleryItemRequestDto[];
}
