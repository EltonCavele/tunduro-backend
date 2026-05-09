import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InvitationStatus, ParticipantStatus } from '@prisma/client';
import { Expose, Type } from 'class-transformer';

import { BookingResponseDto } from './booking.response';

export class BookingInvitationResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty({ enum: InvitationStatus })
  @Expose()
  status: InvitationStatus;

  @ApiProperty()
  @Expose()
  expiresAt: Date;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  respondedAt: Date | null;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  inviteeEmail: string | null;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  invitedUserId: string | null;
}

export class BookingInvitationPreviewResponseDto {
  @ApiProperty({ type: () => BookingInvitationResponseDto })
  @Expose()
  @Type(() => BookingInvitationResponseDto)
  invitation: BookingInvitationResponseDto;

  @ApiProperty({ type: () => BookingResponseDto })
  @Expose()
  @Type(() => BookingResponseDto)
  booking: BookingResponseDto;
}

export class BookingInvitationRespondResponseDto {
  @ApiProperty()
  @Expose()
  bookingId: string;

  @ApiProperty()
  @Expose()
  invitationId: string;

  @ApiProperty({ enum: ParticipantStatus })
  @Expose()
  status: ParticipantStatus;
}
