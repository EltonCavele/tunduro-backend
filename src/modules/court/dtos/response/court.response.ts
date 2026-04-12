import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CourtType } from '@prisma/client';
import { Expose, Type } from 'class-transformer';

export class CourtImageResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  url: string;

  @ApiProperty()
  @Expose()
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
  pricePerHour: number;

  @ApiProperty({ example: 'MZN' })
  @Expose()
  currency: string;

  @ApiProperty({ example: 4 })
  @Expose()
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
  lightingOnOffsetMin: number;

  @ApiProperty()
  @Expose()
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
  createdAt: Date;

  @ApiProperty()
  @Expose()
  updatedAt: Date;
}

export class CourtBookingPublicResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  startAt: Date;

  @ApiProperty()
  @Expose()
  endAt: Date;

  @ApiProperty()
  @Expose()
  status: string;
}

export class CourtBookingAdminResponseDto extends CourtBookingPublicResponseDto {
  @ApiProperty()
  @Expose()
  organizerId: string;

  @ApiProperty({ type: [String] })
  @Expose()
  participantIds: string[];
}
