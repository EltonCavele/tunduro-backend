import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
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
} from 'class-validator';

export class BookingAdminCreateRequestDto {
  @ApiProperty({ example: 'user-id' })
  @IsString()
  @IsNotEmpty()
  userId: string;

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

  @ApiPropertyOptional({ enum: PaymentMethod, example: PaymentMethod.CASH })
  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @ApiPropertyOptional({
    example: true,
    description: 'Se true e method estiver definido, confirma o pagamento de imediato',
  })
  @IsOptional()
  @IsBoolean()
  confirmPaymentNow?: boolean;
}

export class BookingPaymentConfirmRequestDto {
  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.MPESA })
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @ApiPropertyOptional({ example: 'M-Pesa ref 123' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
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
}

export class BookingCancelRequestDto {
  @ApiPropertyOptional({ example: 'Can no longer attend.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class BookingCheckInRequestDto {
  @ApiPropertyOptional({ example: 'qr-token' })
  @IsOptional()
  @IsString()
  token?: string;
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

export class BookingAdminQueryRequestDto {
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

  @ApiPropertyOptional({ example: 'court-id' })
  @IsOptional()
  @IsString()
  courtId?: string;

  @ApiPropertyOptional({ example: 'user-id' })
  @IsOptional()
  @IsString()
  userId?: string;
}

export class BookingAdminCancelRequestDto {
  @ApiPropertyOptional({ example: 'Cancelled by admin.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class BookingAdminCheckInRequestDto {}
