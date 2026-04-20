import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';

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

export class GeneralReportResponseDto {
  @ApiProperty()
  @Expose()
  @Transform(toNumber)
  totalUsers: number;

  @ApiProperty()
  @Expose()
  @Transform(toNumber)
  newUsers: number;

  @ApiProperty()
  @Expose()
  @Transform(toNumber)
  totalBookings: number;

  @ApiProperty()
  @Expose()
  @Transform(toNumber)
  totalRevenue: number;

  @ApiProperty()
  @Expose()
  @Transform(toNumber)
  averageOccupancyRate: number;

  @ApiProperty()
  @Expose()
  @Transform(toNumber)
  totalCancellations: number;
}

export class ScheduleReportResponseDto {
  @ApiProperty()
  @Expose()
  @Transform(toNumber)
  pendingBookings: number;

  @ApiProperty()
  @Expose()
  @Transform(toNumber)
  confirmedBookings: number;

  @ApiPropertyOptional()
  @Expose()
  mostPopularCourt: { id: string; name: string; count: number } | null;

  @ApiPropertyOptional()
  @Expose()
  mostActiveUser: { id: string; name: string; count: number } | null;

  @ApiProperty()
  @Expose()
  @Transform(toNumber)
  cancellationRate: number;

  @ApiProperty()
  @Expose()
  @Transform(toNumber)
  noShows: number;
}

export class PaymentReportResponseDto {
  @ApiProperty()
  @Expose()
  monthlyRevenue: { month: string; revenue: number }[];

  @ApiProperty()
  @Expose()
  courtRevenues: { courtId: string; courtName: string; revenue: number }[];

  @ApiProperty()
  @Expose()
  @Transform(toNumber)
  totalRefunds: number;

  @ApiProperty()
  @Expose()
  @Transform(toNumber)
  averageTicket: number;
}