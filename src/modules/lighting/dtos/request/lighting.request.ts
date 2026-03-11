import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LightingActionSource } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Matches,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const HH_MM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export class LightingConfigUpdateRequestDto {
  @ApiPropertyOptional({ example: 'bf457ca53a6d091a06xw0s' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) => (value === null ? null : `${value}`.trim()))
  lightingDeviceId?: string | null;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  lightingEnabled?: boolean;

  @ApiPropertyOptional({ example: 0, default: 0, minimum: -30, maximum: 120 })
  @IsOptional()
  @IsInt()
  @Min(-30)
  @Max(120)
  lightingOnOffsetMin?: number;

  @ApiPropertyOptional({ example: 5, default: 5, minimum: 0, maximum: 180 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(180)
  lightingOffBufferMin?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  quietHoursEnabled?: boolean;

  @ApiPropertyOptional({ example: '22:00' })
  @IsOptional()
  @IsString()
  @Matches(HH_MM_REGEX, {
    message: 'lighting.error.invalidQuietHoursStart',
  })
  @Transform(({ value }) => `${value}`.trim())
  quietHoursStart?: string;

  @ApiPropertyOptional({ example: '06:00' })
  @IsOptional()
  @IsString()
  @Matches(HH_MM_REGEX, {
    message: 'lighting.error.invalidQuietHoursEnd',
  })
  @Transform(({ value }) => `${value}`.trim())
  quietHoursEnd?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  quietHoursHardBlock?: boolean;
}

export class LightingOverrideRequestDto {
  @ApiProperty({ enum: ['ON', 'OFF'] })
  @IsIn(['ON', 'OFF'])
  action: 'ON' | 'OFF';

  @ApiProperty({ example: 'Maintenance extension approved by manager.' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  @Transform(({ value }) => `${value}`.trim())
  reason: string;
}

export class LightingCommandItemRequestDto {
  @ApiProperty({ example: 'switch_1' })
  @IsString()
  @MaxLength(120)
  code: string;

  @ApiProperty({ example: true })
  value: unknown;
}

export class LightingCommandsRequestDto {
  @ApiProperty({ type: [LightingCommandItemRequestDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => LightingCommandItemRequestDto)
  commands: LightingCommandItemRequestDto[];

  @ApiPropertyOptional({ example: 'Manual maintenance command.' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  @Transform(({ value }) => `${value}`.trim())
  reason?: string;
}

export class LightingAuditQueryRequestDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @ApiPropertyOptional({ example: 'court-id' })
  @IsOptional()
  @IsUUID()
  courtId?: string;

  @ApiPropertyOptional({ example: 'booking-id' })
  @IsOptional()
  @IsUUID()
  bookingId?: string;

  @ApiPropertyOptional({ enum: LightingActionSource })
  @IsOptional()
  @IsEnum(LightingActionSource)
  source?: LightingActionSource;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    if (value === true || value === 'true') {
      return true;
    }
    if (value === false || value === 'false') {
      return false;
    }
    return value;
  })
  @IsBoolean()
  success?: boolean;
}

export class LightingTestSwitchRequestDto {
  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  on?: boolean;
}

export const LIGHTING_ALLOWED_COMMAND_CODES = [
  'switch_1',
  'countdown_1',
  'relay_status',
  'random_time',
  'cycle_time',
] as const;

export const LIGHTING_HH_MM_REGEX = HH_MM_REGEX;
