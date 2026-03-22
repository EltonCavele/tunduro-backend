import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class BookingRecurrenceRequestDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  weekly: boolean;

  @ApiProperty({ example: 4, minimum: 2, maximum: 12 })
  @IsInt()
  @Min(2)
  @Max(12)
  occurrences: number;
}

export class BookingCreateRequestDto {
  @ApiProperty({ example: 'court-id' })
  @IsString()
  @IsNotEmpty()
  courtId: string;

  @ApiProperty({ example: '2026-03-20T16:00:00.000Z' })
  @IsString()
  startAt: string;

  @ApiProperty({ example: '2026-03-20T17:00:00.000Z' })
  @IsString()
  endAt: string;

  @ApiPropertyOptional({ type: [String], example: ['user-id-1'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  participantUserIds?: string[];

  @ApiPropertyOptional({ type: [String], example: ['friend@example.com'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsEmail({}, { each: true })
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value.map((item: string) => item.trim().toLowerCase())
      : value
  )
  inviteEmails?: string[];

  @ApiPropertyOptional({ type: BookingRecurrenceRequestDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BookingRecurrenceRequestDto)
  recurrence?: BookingRecurrenceRequestDto;
}

export class BookingCheckoutCreateRequestDto {
  @ApiProperty({ example: 'court-id' })
  @IsString()
  @IsNotEmpty()
  courtId: string;

  @ApiProperty({ example: '2026-03-20T16:00:00.000Z' })
  @IsString()
  startAt: string;

  @ApiProperty({ example: '2026-03-20T17:00:00.000Z' })
  @IsString()
  endAt: string;

  @ApiPropertyOptional({ type: [String], example: ['user-id-1'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  participantUserIds?: string[];
}

export class BookingMockPaymentConfirmRequestDto {
  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  applyToSeries?: boolean;
}

export class BookingCancelRequestDto {
  @ApiPropertyOptional({ example: 'Can no longer attend.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class BookingRescheduleRequestDto {
  @ApiPropertyOptional({ example: 'new-court-id' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  courtId?: string;

  @ApiProperty({ example: '2026-03-21T18:00:00.000Z' })
  @IsString()
  startAt: string;

  @ApiProperty({ example: '2026-03-21T19:00:00.000Z' })
  @IsString()
  endAt: string;
}

export class BookingInviteRequestDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  userIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsEmail({}, { each: true })
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value.map((item: string) => item.trim().toLowerCase())
      : value
  )
  emails?: string[];
}

export class BookingInvitationRespondRequestDto {
  @ApiProperty({ enum: ['accept', 'decline'] })
  @IsEnum(['accept', 'decline'])
  action: 'accept' | 'decline';
}

export class WaitlistCreateRequestDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  courtId: string;

  @ApiProperty({ example: '2026-03-20T16:00:00.000Z' })
  @IsString()
  startAt: string;

  @ApiProperty({ example: '2026-03-20T17:00:00.000Z' })
  @IsString()
  endAt: string;
}

export class BookingCheckInRequestDto {
  @ApiPropertyOptional({ example: 'qr-token' })
  @IsOptional()
  @IsString()
  token?: string;
}

export class OpenGameCreateRequestDto {
  @ApiPropertyOptional({ example: 'Falta 1 jogador' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional({ example: 'Jogo amigável nível intermediário.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ example: 4, minimum: 2, maximum: 20 })
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(20)
  slotsTotal?: number;
}

export class CourtRatingCreateRequestDto {
  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  courtScore: number;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  cleanlinessScore: number;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  lightingScore: number;

  @ApiPropertyOptional({ example: 'Good lighting and clean court.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class CourtRatingUpdateRequestDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  courtScore?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  cleanlinessScore?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  lightingScore?: number;

  @ApiPropertyOptional({ example: 'Updated comment.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class BookingMeQueryRequestDto {
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

  @ApiPropertyOptional({ example: 'CONFIRMED' })
  @IsOptional()
  @IsString()
  status?: string;
}

export class OpenGamesListQueryRequestDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @ApiPropertyOptional({ example: 'OPEN' })
  @IsOptional()
  @IsString()
  status?: string;
}

export class OvertimeRequestCreateDto {
  @ApiProperty({ example: 1, enum: [1, 2] })
  @IsInt()
  @Min(1)
  @Max(2)
  blocks: number;
}

export class OvertimeAdminDeclineRequestDto {
  @ApiPropertyOptional({ example: 'Court unavailable for extension window.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class OvertimeAdminListQueryRequestDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @ApiPropertyOptional({ example: 'PENDING' })
  @IsOptional()
  @IsString()
  status?: string;
}
