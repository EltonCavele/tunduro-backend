import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  BookingCheckoutSessionStatus,
  BookingStatus,
  ParticipantStatus,
  PaymentStatus,
  PaymentType,
} from '@prisma/client';
import { Expose, Type } from 'class-transformer';

export class BookingParticipantResponseDto {
  @ApiProperty()
  @Expose()
  userId: string;

  @ApiProperty({ enum: ParticipantStatus })
  @Expose()
  status: ParticipantStatus;

  @ApiProperty()
  @Expose()
  isOrganizer: boolean;
}

export class BookingStatusHistoryResponseDto {
  @ApiPropertyOptional({ enum: BookingStatus })
  @Expose()
  fromStatus: BookingStatus | null;

  @ApiProperty({ enum: BookingStatus })
  @Expose()
  toStatus: BookingStatus;

  @ApiPropertyOptional()
  @Expose()
  reason: string | null;

  @ApiProperty()
  @Expose()
  createdAt: Date;
}

export class BookingPaymentResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty({ enum: PaymentType })
  @Expose()
  type: PaymentType;

  @ApiProperty({ enum: PaymentStatus })
  @Expose()
  status: PaymentStatus;

  @ApiProperty()
  @Expose()
  amount: number;

  @ApiProperty()
  @Expose()
  currency: string;

  @ApiProperty()
  @Expose()
  reference: string;

  @ApiPropertyOptional()
  @Expose()
  processedAt: Date | null;
}

export class BookingResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  courtId: string;

  @ApiProperty()
  @Expose()
  organizerId: string;

  @ApiProperty()
  @Expose()
  startAt: Date;

  @ApiProperty()
  @Expose()
  endAt: Date;

  @ApiProperty()
  @Expose()
  durationMinutes: number;

  @ApiProperty()
  @Expose()
  totalPrice: number;

  @ApiProperty()
  @Expose()
  paidAmount: number;

  @ApiProperty()
  @Expose()
  currency: string;

  @ApiProperty({ enum: BookingStatus })
  @Expose()
  status: BookingStatus;

  @ApiPropertyOptional()
  @Expose()
  paymentDueAt: Date | null;

  @ApiPropertyOptional()
  @Expose()
  checkedInAt: Date | null;

  @ApiProperty({ type: [BookingParticipantResponseDto] })
  @Expose()
  @Type(() => BookingParticipantResponseDto)
  participants: BookingParticipantResponseDto[];

  @ApiProperty({ type: [BookingStatusHistoryResponseDto] })
  @Expose()
  @Type(() => BookingStatusHistoryResponseDto)
  statusHistory: BookingStatusHistoryResponseDto[];

  @ApiProperty({ type: [BookingPaymentResponseDto] })
  @Expose()
  @Type(() => BookingPaymentResponseDto)
  payments: BookingPaymentResponseDto[];

  @ApiProperty()
  @Expose()
  createdAt: Date;

  @ApiProperty()
  @Expose()
  updatedAt: Date;
}

export class BookingCheckoutSessionResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  courtId: string;

  @ApiPropertyOptional()
  @Expose()
  bookingId: string | null;

  @ApiProperty()
  @Expose()
  startAt: Date;

  @ApiProperty()
  @Expose()
  endAt: Date;

  @ApiProperty()
  @Expose()
  durationMinutes: number;

  @ApiProperty()
  @Expose()
  amount: number;

  @ApiProperty()
  @Expose()
  currency: string;

  @ApiProperty()
  @Expose()
  reference: string;

  @ApiProperty({ enum: BookingCheckoutSessionStatus })
  @Expose()
  status: BookingCheckoutSessionStatus;

  @ApiProperty()
  @Expose()
  expiresAt: Date;

  @ApiPropertyOptional()
  @Expose()
  checkoutUrl: string | null;

  @ApiPropertyOptional()
  @Expose()
  failureReason: string | null;

  @ApiPropertyOptional()
  @Expose()
  paidAt: Date | null;

  @ApiProperty()
  @Expose()
  createdAt: Date;
}
