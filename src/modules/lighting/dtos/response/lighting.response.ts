import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LightingActionSource, LightingActionType } from '@prisma/client';
import { Expose } from 'class-transformer';

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
  lightingOnOffsetMin: number;

  @ApiProperty()
  @Expose()
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
  lastPingAt: Date | null;

  @ApiPropertyOptional({ enum: LightingActionType })
  @Expose()
  lastCommandAction: LightingActionType | null;

  @ApiPropertyOptional()
  @Expose()
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
  attempts: number;

  @ApiPropertyOptional()
  @Expose()
  errorCode: string | null;

  @ApiPropertyOptional()
  @Expose()
  errorMessage: string | null;

  @ApiProperty()
  @Expose()
  createdAt: Date;
}
