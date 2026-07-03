import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PaymentMethod,
  WalletTopUpSessionStatus,
  WalletTransactionType,
} from '@prisma/client';
import { Expose, Transform, Type } from 'class-transformer';

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

export class WalletTransactionResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  userId: string;

  @ApiPropertyOptional()
  @Expose()
  createdByUserId: string | null;

  @ApiProperty({ enum: WalletTransactionType })
  @Expose()
  type: WalletTransactionType;

  @ApiProperty()
  @Expose()
  @Transform(toNumber)
  amount: number;

  @ApiProperty()
  @Expose()
  @Transform(toNumber)
  balanceAfter: number;

  @ApiProperty()
  @Expose()
  currency: string;

  @ApiProperty()
  @Expose()
  reference: string;

  @ApiPropertyOptional()
  @Expose()
  bookingId: string | null;

  @ApiPropertyOptional()
  @Expose()
  paymentReference: string | null;

  @ApiPropertyOptional()
  @Expose()
  note: string | null;

  @ApiProperty()
  @Expose()
  @Transform(toDate)
  createdAt: Date;
}

export class WalletResponseDto {
  @ApiProperty()
  @Expose()
  userId: string;

  @ApiProperty()
  @Expose()
  @Transform(toNumber)
  balance: number;

  @ApiProperty()
  @Expose()
  currency: string;

  @ApiProperty({ type: [WalletTransactionResponseDto] })
  @Expose()
  @Type(() => WalletTransactionResponseDto)
  transactions: WalletTransactionResponseDto[];
}

export class WalletTopUpSessionResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  userId: string;

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

  @ApiProperty({ enum: WalletTopUpSessionStatus })
  @Expose()
  status: WalletTopUpSessionStatus;

  @ApiProperty()
  @Expose()
  @Transform(toDate)
  expiresAt: Date;

  @ApiPropertyOptional()
  @Expose()
  checkoutUrl: string | null;

  @ApiPropertyOptional({ enum: PaymentMethod })
  @Expose()
  paymentMethod: PaymentMethod | null;

  @ApiPropertyOptional()
  @Expose()
  phone: string | null;

  @ApiPropertyOptional()
  @Expose()
  failureReason: string | null;

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
