import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  BookingCheckoutSessionStatus,
  BookingStatus,
  ParticipantStatus,
  PaymentStatus,
  PaymentType,
} from '@prisma/client';
import { Expose, Transform, Type } from 'class-transformer';

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

export class BookingParticipantResponseDto {
  @ApiProperty()
  @Expose()
  userId: string;

  @ApiProperty({ enum: ParticipantStatus })
  @Expose()
  status: ParticipantStatus;

  @ApiProperty()
  @Expose()
  @Transform(toNumber)
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
  @Transform(toDate)
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
  @Transform(toNumber)
  amount: number;

  @ApiProperty()
  @Expose()
  currency: string;

  @ApiProperty()
  @Expose()
  reference: string;

  @ApiPropertyOptional()
  @Expose()
  @Transform(toDate)
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
  @Transform(toDate)
  startAt: Date;

  @ApiProperty()
  @Expose()
  @Transform(toDate)
  endAt: Date;

  @ApiProperty()
  @Expose()
  @Transform(toNumber)
  durationMinutes: number;

  @ApiProperty()
  @Expose()
  @Transform(toNumber)
  totalPrice: number;

  @ApiProperty()
  @Expose()
  @Transform(toNumber)
  paidAmount: number;

  @ApiProperty()
  @Expose()
  currency: string;

  @ApiProperty({ enum: BookingStatus })
  @Expose()
  status: BookingStatus;

  @ApiPropertyOptional()
  @Expose()
  @Transform(toDate)
  paymentDueAt: Date | null;

  @ApiPropertyOptional()
  @Expose()
  @Transform(toDate)
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
  @Transform(toDate)
  createdAt: Date;

  @ApiProperty()
  @Expose()
  @Transform(toDate)
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
  @Transform(toDate)
  startAt: Date;

  @ApiProperty()
  @Expose()
  @Transform(toDate)
  endAt: Date;

  @ApiProperty()
  @Expose()
  @Transform(toNumber)
  durationMinutes: number;

  @ApiProperty()
  @Expose()
  @Transform(toNumber)
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
  @Transform(toDate)
  expiresAt: Date;

  @ApiPropertyOptional()
  @Expose()
  checkoutUrl: string | null;

  @ApiPropertyOptional()
  @Expose()
  failureReason: string | null;

  @ApiPropertyOptional()
  @Expose()
  @Transform(toDate)
  paidAt: Date | null;

  @ApiProperty()
  @Expose()
  @Transform(toDate)
  createdAt: Date;
}
