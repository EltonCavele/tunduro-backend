import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  BookingStatus,
  PaymentMethod,
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
  if (typeof value === 'object' && value !== null && 'toNumber' in value) {
    return (value as { toNumber: () => number }).toNumber();
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

export class PaymentBookingSummaryResponseDto {
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

  @ApiProperty({ enum: BookingStatus })
  @Expose()
  status: BookingStatus;
}

export class PaymentResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  bookingId: string;

  @ApiProperty()
  @Expose()
  userId: string;

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

  @ApiPropertyOptional({ enum: PaymentMethod })
  @Expose()
  method: PaymentMethod | null;

  @ApiPropertyOptional()
  @Expose()
  phone: string | null;

  @ApiPropertyOptional()
  @Expose()
  providerTransactionId: string | null;

  @ApiPropertyOptional()
  @Expose()
  providerStatusCode: string | null;

  @ApiPropertyOptional()
  @Expose()
  providerMessage: string | null;

  @ApiPropertyOptional()
  @Expose()
  confirmedByUserId: string | null;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @Expose()
  metadata: Record<string, unknown> | null;

  @ApiPropertyOptional()
  @Expose()
  @Transform(toDate)
  processedAt: Date | null;

  @ApiProperty()
  @Expose()
  @Transform(toDate)
  createdAt: Date;

  @ApiProperty()
  @Expose()
  @Transform(toDate)
  updatedAt: Date;

  @ApiProperty({ type: PaymentBookingSummaryResponseDto })
  @Expose()
  @Type(() => PaymentBookingSummaryResponseDto)
  booking: PaymentBookingSummaryResponseDto;
}
