import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LightingActionSource, LightingActionType } from '@prisma/client';
import { Expose, Transform } from 'class-transformer';

const toNumber = ({ value }: { value: unknown }): unknown => {
  if (value === undefined || value === null) {
    return value;
  }
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? value : parsed;
  }
  if (typeof value === 'object' && 'toNumber' in value) {
    return value.toNumber();
  }
  return value;
};

const toDate = ({ value }: { value: unknown }): unknown => {
  if (value === undefined || value === null) {
    return value;
  }
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date;
  }
  return value;
};

export class LightingConfigResponseDto {
  @ApiProperty()
  @Expose()
  courtId: string;

  @ApiProperty({ type: [String] })
  @Expose()
  lightingDeviceId: string[];

  @ApiProperty()
  @Expose()
  hasLighting: boolean;

  @ApiProperty()
  @Expose()
  lightingEnabled: boolean;

  @ApiProperty()
  @Expose()
  @Transform(toNumber)
  lightingOnOffsetMin: number;

  @ApiProperty()
  @Expose()
  @Transform(toNumber)
  lightingOffBufferMin: number;

  @ApiProperty()
  @Expose()
  quietHoursEnabled: boolean;

  @ApiProperty()
  @Expose()
  quietHoursStart: string;

  @ApiProperty()
  @Expose()
  quietHoursEnd: string;

  @ApiProperty()
  @Expose()
  quietHoursHardBlock: boolean;
}

export class LightingCommandDispatchResponseDto {
  @ApiProperty()
  @Expose()
  success: boolean;

  @ApiProperty()
  @Expose()
  courtId: string;

  @ApiPropertyOptional()
  @Expose()
  bookingId: string | null;

  @ApiPropertyOptional()
  @Expose()
  error: string | null;

  @ApiPropertyOptional()
  @Expose()
  details: unknown;
}

export class LightingDeviceStatusResponseDto {
  @ApiProperty()
  @Expose()
  courtId: string;

  @ApiProperty({ type: [String] })
  @Expose()
  lightingDeviceId: string[];

  @ApiProperty()
  @Expose()
  isOnline: boolean;

  @ApiPropertyOptional()
  @Expose()
  @Transform(toDate)
  lastPingAt: Date | null;

  @ApiPropertyOptional({ enum: LightingActionType })
  @Expose()
  lastCommandAction: LightingActionType | null;

  @ApiPropertyOptional()
  @Expose()
  @Transform(toDate)
  lastCommandAt: Date | null;

  @ApiPropertyOptional()
  @Expose()
  lastCommandSuccess: boolean | null;

  @ApiPropertyOptional()
  @Expose()
  lastError: string | null;
}

export class LightingActionLogResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  courtId: string;

  @ApiPropertyOptional()
  @Expose()
  bookingId: string | null;

  @ApiPropertyOptional()
  @Expose()
  requestedByUserId: string | null;

  @ApiProperty({ enum: LightingActionSource })
  @Expose()
  source: LightingActionSource;

  @ApiProperty({ enum: LightingActionType })
  @Expose()
  action: LightingActionType;

  @ApiPropertyOptional()
  @Expose()
  reason: string | null;

  @ApiProperty()
  @Expose()
  success: boolean;

  @ApiProperty()
  @Expose()
  @Transform(toNumber)
  attempts: number;

  @ApiPropertyOptional()
  @Expose()
  errorCode: string | null;

  @ApiPropertyOptional()
  @Expose()
  errorMessage: string | null;

  @ApiProperty()
  @Expose()
  @Transform(toDate)
  createdAt: Date;
}
