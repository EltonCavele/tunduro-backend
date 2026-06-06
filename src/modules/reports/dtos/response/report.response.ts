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
  if (typeof value === 'object' && value !== null && 'toNumber' in value) {
    return (value as { toNumber: () => number }).toNumber();
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

export class StatisticsSummaryDto {
  @ApiProperty() @Expose() @Transform(toNumber) totalBookings: number;
  @ApiProperty() @Expose() @Transform(toNumber) confirmedBookings: number;
  @ApiProperty() @Expose() @Transform(toNumber) cancelledBookings: number;
  @ApiProperty() @Expose() @Transform(toNumber) pendingBookings: number;
  @ApiProperty() @Expose() @Transform(toNumber) noShowBookings: number;
  @ApiProperty() @Expose() @Transform(toNumber) completedBookings: number;
  @ApiProperty() @Expose() @Transform(toNumber) activeCourts: number;
  @ApiProperty() @Expose() @Transform(toNumber) totalCourts: number;
  @ApiProperty() @Expose() @Transform(toNumber) totalUsers: number;
  @ApiProperty() @Expose() @Transform(toNumber) totalRevenue: number;
  @ApiProperty() @Expose() @Transform(toNumber) paymentsCount: number;
}

export class StatisticsMonthlyDto {
  @ApiProperty({ example: '2026-01' }) @Expose() month: string;
  @ApiProperty() @Expose() @Transform(toNumber) reserved: number;
  @ApiProperty() @Expose() @Transform(toNumber) cancelled: number;
  @ApiProperty() @Expose() @Transform(toNumber) revenue: number;
}

export class StatisticsResponseDto {
  @ApiProperty({ type: StatisticsSummaryDto })
  @Expose()
  summary: StatisticsSummaryDto;

  @ApiProperty({ type: [StatisticsMonthlyDto] })
  @Expose()
  monthly: StatisticsMonthlyDto[];

  @ApiProperty({ example: '2025-06-01' })
  @Expose()
  startDate: string;

  @ApiProperty({ example: '2026-06-30' })
  @Expose()
  endDate: string;
}

export class ExportReportResponseDto {
  @ApiProperty({ type: GeneralReportResponseDto })
  @Expose()
  general: GeneralReportResponseDto;

  @ApiProperty({ type: ScheduleReportResponseDto })
  @Expose()
  schedule: ScheduleReportResponseDto;

  @ApiProperty({ type: PaymentReportResponseDto })
  @Expose()
  payment: PaymentReportResponseDto;

  @ApiProperty({ example: '2026-01-01' })
  @Expose()
  startDate: string;

  @ApiProperty({ example: '2026-12-31' })
  @Expose()
  endDate: string;

  @ApiProperty({ example: '2026-06-06T10:00:00.000Z' })
  @Expose()
  generatedAt: string;
}