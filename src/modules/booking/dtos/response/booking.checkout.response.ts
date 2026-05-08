import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  BookingCheckoutSessionStatus,
  PaymentMethod,
} from '@prisma/client';
import { Expose, Transform } from 'class-transformer';

const toNumber = ({ value }: { value: unknown }): unknown => {
  if (value === undefined || value === null) return value;
  if (typeof value === 'number') return value;
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
  if (value === undefined || value === null) return value;
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date;
  }
  return value;
};

const maskPhone = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string' || !value) return value;
  const trimmed = value.trim();
  if (trimmed.length <= 4) return `*** ${trimmed}`;
  return `*** ${trimmed.slice(-4)}`;
};

export class BookingCheckoutSessionResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty({ enum: BookingCheckoutSessionStatus })
  @Expose()
  status: BookingCheckoutSessionStatus;

  @ApiPropertyOptional({
    description:
      'Preenchido quando status === COMPLETED. Use para chamar GET /bookings/:id.',
  })
  @Expose()
  bookingId: string | null;

  @ApiProperty()
  @Expose()
  organizerId: string;

  @ApiProperty()
  @Expose()
  courtId: string;

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

  @ApiPropertyOptional({ enum: PaymentMethod })
  @Expose()
  paymentMethod: PaymentMethod | null;

  @ApiPropertyOptional({
    description:
      'MSISDN mascarado para o débito (e.g. "*** 4567"). Não é exposto na íntegra.',
  })
  @Expose()
  @Transform(maskPhone)
  phone: string | null;

  @ApiPropertyOptional()
  @Expose()
  failureReason: string | null;

  @ApiProperty()
  @Expose()
  @Transform(toDate)
  expiresAt: Date;

  @ApiPropertyOptional()
  @Expose()
  @Transform(toDate)
  paidAt: Date | null;

  @ApiPropertyOptional()
  @Expose()
  @Transform(toDate)
  completedAt: Date | null;

  @ApiProperty()
  @Expose()
  @Transform(toDate)
  createdAt: Date;

  @ApiProperty()
  @Expose()
  @Transform(toDate)
  updatedAt: Date;
}
