import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookingStatus, PaymentStatus, PaymentType } from '@prisma/client';
import { Expose, Type } from 'class-transformer';

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
  startAt: Date;

  @ApiProperty()
  @Expose()
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
  amount: number;

  @ApiProperty()
  @Expose()
  currency: string;

  @ApiProperty()
  @Expose()
  reference: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @Expose()
  metadata: Record<string, unknown> | null;

  @ApiPropertyOptional()
  @Expose()
  processedAt: Date | null;

  @ApiProperty()
  @Expose()
  createdAt: Date;

  @ApiProperty()
  @Expose()
  updatedAt: Date;

  @ApiProperty({ type: PaymentBookingSummaryResponseDto })
  @Expose()
  @Type(() => PaymentBookingSummaryResponseDto)
  booking: PaymentBookingSummaryResponseDto;
}
