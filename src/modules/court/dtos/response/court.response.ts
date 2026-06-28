import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CourtType } from '@prisma/client';
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

export class CourtImageResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  url: string;

  @ApiProperty()
  @Expose()
  @Transform(toNumber)
  sortOrder: number;
}

export class CourtResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  name: string;

  @ApiProperty({ enum: CourtType })
  @Expose()
  type: CourtType;

  @ApiProperty()
  @Expose()
  surface: string;

  @ApiProperty()
  @Expose()
  hasLighting: boolean;

  @ApiPropertyOptional()
  @Expose()
  rules: string | null;

  @ApiProperty({ example: 1200 })
  @Expose()
  @Transform(toNumber)
  pricePerHour: number;

  @ApiProperty({ example: 900 })
  @Expose()
  @Transform(toNumber)
  memberPricePerHour: number;

  @ApiProperty({ example: 200 })
  @Expose()
  @Transform(toNumber)
  lightingPricePerHour: number;

  @ApiProperty({ example: 'MZN' })
  @Expose()
  currency: string;

  @ApiProperty({ example: 4 })
  @Expose()
  @Transform(toNumber)
  maxPlayers: number;

  @ApiProperty({ example: true })
  @Expose()
  isActive: boolean;

  @ApiProperty({ type: [CourtImageResponseDto] })
  @Expose()
  @Type(() => CourtImageResponseDto)
  images: CourtImageResponseDto[];

  @ApiProperty({ type: [String] })
  @Expose()
  lightingDeviceId: string[];

  @ApiProperty()
  @Expose()
  lightingEnabled: boolean;

  @ApiProperty()
  @Expose()
  @Transform(toNumber)
  lightingOnOffsetMin: number;

  @ApiProperty()
  @Expose()
  @Transform(toNumber)
  lightingOffBufferMin: number;

  @ApiProperty()
  @Expose()
  quietHoursEnabled: boolean;

  @ApiProperty()
  @Expose()
  quietHoursStart: string;

  @ApiProperty()
  @Expose()
  quietHoursEnd: string;

  @ApiProperty()
  @Expose()
  quietHoursHardBlock: boolean;

  @ApiProperty()
  @Expose()
  @Transform(toDate)
  createdAt: Date;

  @ApiProperty()
  @Expose()
  @Transform(toDate)
  updatedAt: Date;
}

export class CourtBookingOrganizerResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiPropertyOptional()
  @Expose()
  firstName: string | null;

  @ApiPropertyOptional()
  @Expose()
  lastName: string | null;

  @ApiPropertyOptional()
  @Expose()
  email: string | null;

  @ApiPropertyOptional()
  @Expose()
  avatarUrl: string | null;
}

export class CourtBookingPublicResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

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
  status: string;

  @ApiProperty()
  @Expose()
  organizerId: string;

  @ApiPropertyOptional()
  @Expose()
  organizer: CourtBookingOrganizerResponseDto | null;

  @ApiProperty()
  @Expose()
  @Transform(toNumber)
  participantCount: number;
}

export class CourtBookingAdminResponseDto extends CourtBookingPublicResponseDto {
  @ApiProperty({ type: [String] })
  @Expose()
  participantIds: string[];
}
