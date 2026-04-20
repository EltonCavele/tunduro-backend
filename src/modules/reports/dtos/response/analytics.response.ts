import { ApiProperty } from '@nestjs/swagger';
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

class AnalyticsPaymentChartData {
  @ApiProperty()
  @Expose()
  date: string;

  @ApiProperty()
  @Expose()
  @Transform(toNumber)
  amount: number;
}

class AnalyticsPaymentData {
  @ApiProperty()
  @Expose()
  @Transform(toNumber)
  total: number;

  @ApiProperty()
  @Expose()
  @Transform(toNumber)
  count: number;

  @ApiProperty({ type: [AnalyticsPaymentChartData] })
  @Expose()
  chartData: AnalyticsPaymentChartData[];
}

class AnalyticsCourtData {
  @ApiProperty()
  @Expose()
  @Transform(toNumber)
  total: number;

  @ApiProperty()
  @Expose()
  @Transform(toNumber)
  active: number;
}

class AnalyticsUserData {
  @ApiProperty()
  @Expose()
  @Transform(toNumber)
  total: number;
}

class AnalyticsBookingData {
  @ApiProperty()
  @Expose()
  @Transform(toNumber)
  total: number;

  @ApiProperty()
  @Expose()
  @Transform(toNumber)
  confirmed: number;

  @ApiProperty()
  @Expose()
  @Transform(toNumber)
  cancelled: number;
}

export class AnalyticsResponseDto {
  @ApiProperty({ type: AnalyticsBookingData })
  @Expose()
  bookings: AnalyticsBookingData;

  @ApiProperty({ type: AnalyticsCourtData })
  @Expose()
  courts: AnalyticsCourtData;

  @ApiProperty({ type: AnalyticsUserData })
  @Expose()
  users: AnalyticsUserData;

  @ApiProperty({ type: AnalyticsPaymentData })
  @Expose()
  payments: AnalyticsPaymentData;
}