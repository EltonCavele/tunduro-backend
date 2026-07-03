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

  @ApiPropertyOptional({
    example: '258841234567',
    description: 'Opcional; PaySuite recolhe o numero no checkout',
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    enum: PaymentMethod,
    example: PaymentMethod.MPESA,
    description: 'Método de pagamento; só MPESA é suportado de momento',
  })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  lightingRequested?: boolean;

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

  @ApiPropertyOptional({
    example: '258841234567',
    description: 'Opcional; PaySuite recolhe o numero no checkout',
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    enum: PaymentMethod,
    example: PaymentMethod.MPESA,
    description: 'Método de pagamento; só MPESA é suportado de momento',
  })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  lightingRequested?: boolean;

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

export class BookingInvitationRespondDto {
  @ApiProperty({
    example: true,
    description: 'true para aceitar o convite, false para recusar',
  })
  @IsBoolean()
  accept: boolean;
}

export class BookingExtendRequestDto {
  @ApiPropertyOptional({
    example: '258841234567',
    description: 'Opcional; PaySuite recolhe o numero no checkout',
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    enum: PaymentMethod,
    example: PaymentMethod.MPESA,
    description: 'Método de pagamento; só MPESA é suportado de momento',
  })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;
}

export class BookingInvitationTokenRespondDto {
  @ApiProperty({
    example: '7d5b3c12-...-token',
    description: 'Token único da BookingInvitation',
  })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  accept: boolean;
}
