import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  BookingStatus,
  InvitationStatus,
  OpenGameJoinStatus,
  OpenGameStatus,
  OvertimeStatus,
  ParticipantStatus,
  PaymentStatus,
  PaymentType,
  WaitlistStatus,
} from '@prisma/client';
import { Expose, Type } from 'class-transformer';

export class BookingParticipantResponseDto {
  @ApiProperty()
  @Expose()
  userId: string;

  @ApiProperty({ enum: ParticipantStatus })
  @Expose()
  status: ParticipantStatus;

  @ApiProperty()
  @Expose()
  isOrganizer: boolean;
}

export class BookingInvitationResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiPropertyOptional()
  @Expose()
  invitedUserId: string | null;

  @ApiPropertyOptional()
  @Expose()
  inviteeEmail: string | null;

  @ApiProperty({ enum: InvitationStatus })
  @Expose()
  status: InvitationStatus;

  @ApiProperty()
  @Expose()
  expiresAt: Date;
}

export class BookingStatusHistoryResponseDto {
  @ApiPropertyOptional({ enum: BookingStatus })
  @Expose()
  fromStatus: BookingStatus | null;

  @ApiProperty({ enum: BookingStatus })
  @Expose()
  toStatus: BookingStatus;

  @ApiPropertyOptional()
  @Expose()
  reason: string | null;

  @ApiProperty()
  @Expose()
  createdAt: Date;
}

export class BookingPaymentResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

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

  @ApiPropertyOptional()
  @Expose()
  processedAt: Date | null;
}

export class BookingResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  courtId: string;

  @ApiProperty()
  @Expose()
  organizerId: string;

  @ApiPropertyOptional()
  @Expose()
  seriesId: string | null;

  @ApiProperty()
  @Expose()
  startAt: Date;

  @ApiProperty()
  @Expose()
  endAt: Date;

  @ApiProperty()
  @Expose()
  durationMinutes: number;

  @ApiProperty()
  @Expose()
  totalPrice: number;

  @ApiProperty()
  @Expose()
  paidAmount: number;

  @ApiProperty()
  @Expose()
  currency: string;

  @ApiProperty({ enum: BookingStatus })
  @Expose()
  status: BookingStatus;

  @ApiPropertyOptional()
  @Expose()
  paymentDueAt: Date | null;

  @ApiPropertyOptional()
  @Expose()
  checkedInAt: Date | null;

  @ApiProperty({ type: [BookingParticipantResponseDto] })
  @Expose()
  @Type(() => BookingParticipantResponseDto)
  participants: BookingParticipantResponseDto[];

  @ApiProperty({ type: [BookingInvitationResponseDto] })
  @Expose()
  @Type(() => BookingInvitationResponseDto)
  invitations: BookingInvitationResponseDto[];

  @ApiProperty({ type: [BookingStatusHistoryResponseDto] })
  @Expose()
  @Type(() => BookingStatusHistoryResponseDto)
  statusHistory: BookingStatusHistoryResponseDto[];

  @ApiProperty({ type: [BookingPaymentResponseDto] })
  @Expose()
  @Type(() => BookingPaymentResponseDto)
  payments: BookingPaymentResponseDto[];

  @ApiProperty()
  @Expose()
  createdAt: Date;

  @ApiProperty()
  @Expose()
  updatedAt: Date;
}

export class WaitlistResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  courtId: string;

  @ApiProperty()
  @Expose()
  userId: string;

  @ApiProperty()
  @Expose()
  startAt: Date;

  @ApiProperty()
  @Expose()
  endAt: Date;

  @ApiProperty({ enum: WaitlistStatus })
  @Expose()
  status: WaitlistStatus;

  @ApiProperty()
  @Expose()
  position: number;

  @ApiPropertyOptional()
  @Expose()
  bookingId: string | null;

  @ApiPropertyOptional()
  @Expose()
  offerExpiresAt: Date | null;
}

export class BookingCheckInQrResponseDto {
  @ApiProperty()
  @Expose()
  bookingId: string;

  @ApiProperty()
  @Expose()
  token: string;

  @ApiProperty()
  @Expose()
  expiresAt: Date;

  @ApiProperty()
  @Expose()
  qrPayload: string;
}

export class OpenGameJoinRequestResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  userId: string;

  @ApiProperty({ enum: OpenGameJoinStatus })
  @Expose()
  status: OpenGameJoinStatus;

  @ApiProperty()
  @Expose()
  createdAt: Date;
}

export class OpenGameResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  bookingId: string;

  @ApiProperty()
  @Expose()
  organizerId: string;

  @ApiPropertyOptional()
  @Expose()
  title: string | null;

  @ApiPropertyOptional()
  @Expose()
  description: string | null;

  @ApiProperty({ enum: OpenGameStatus })
  @Expose()
  status: OpenGameStatus;

  @ApiProperty()
  @Expose()
  slotsTotal: number;

  @ApiProperty()
  @Expose()
  slotsFilled: number;

  @ApiProperty({ type: [OpenGameJoinRequestResponseDto] })
  @Expose()
  @Type(() => OpenGameJoinRequestResponseDto)
  joinRequests: OpenGameJoinRequestResponseDto[];

  @ApiProperty()
  @Expose()
  createdAt: Date;

  @ApiProperty()
  @Expose()
  updatedAt: Date;
}

export class CourtRatingResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  bookingId: string;

  @ApiProperty()
  @Expose()
  courtId: string;

  @ApiProperty()
  @Expose()
  userId: string;

  @ApiProperty()
  @Expose()
  courtScore: number;

  @ApiProperty()
  @Expose()
  cleanlinessScore: number;

  @ApiProperty()
  @Expose()
  lightingScore: number;

  @ApiPropertyOptional()
  @Expose()
  comment: string | null;

  @ApiProperty()
  @Expose()
  createdAt: Date;

  @ApiProperty()
  @Expose()
  updatedAt: Date;
}

export class OvertimeRequestResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  bookingId: string;

  @ApiProperty()
  @Expose()
  requestedByUserId: string;

  @ApiPropertyOptional()
  @Expose()
  approvedByUserId: string | null;

  @ApiProperty()
  @Expose()
  blocks: number;

  @ApiProperty({ enum: OvertimeStatus })
  @Expose()
  status: OvertimeStatus;

  @ApiPropertyOptional()
  @Expose()
  declineReason: string | null;

  @ApiPropertyOptional()
  @Expose()
  paymentTransactionId: string | null;

  @ApiPropertyOptional()
  @Expose()
  expiresAt: Date | null;

  @ApiPropertyOptional()
  @Expose()
  processedAt: Date | null;

  @ApiProperty()
  @Expose()
  createdAt: Date;

  @ApiProperty()
  @Expose()
  updatedAt: Date;
}
