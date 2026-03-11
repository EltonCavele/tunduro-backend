import { randomUUID } from 'crypto';

import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import {
  Booking,
  BookingStatus,
  InvitationStatus,
  OpenGameJoinStatus,
  OpenGameStatus,
  ParticipantStatus,
  PaymentStatus,
  PaymentType,
  Prisma,
  Role,
  WaitlistStatus,
} from '@prisma/client';

import { DatabaseService } from 'src/common/database/services/database.service';
import { HelperNotificationService } from 'src/common/helper/services/helper.notification.service';
import { IAuthUser } from 'src/common/request/interfaces/request.interface';
import { ApiPaginatedDataDto } from 'src/common/response/dtos/response.paginated.dto';
import { CourtService } from 'src/modules/court/services/court.service';
import { LightingOrchestratorService } from 'src/modules/lighting/services/lighting.orchestrator.service';

import {
  BookingCancelRequestDto,
  BookingCheckInRequestDto,
  BookingCreateRequestDto,
  BookingInviteRequestDto,
  BookingInvitationRespondRequestDto,
  BookingMeQueryRequestDto,
  BookingMockPaymentConfirmRequestDto,
  BookingRescheduleRequestDto,
  CourtRatingCreateRequestDto,
  CourtRatingUpdateRequestDto,
  OpenGameCreateRequestDto,
  OpenGamesListQueryRequestDto,
  WaitlistCreateRequestDto,
} from '../dtos/request/booking.request';
import {
  BookingCheckInQrResponseDto,
  BookingResponseDto,
  CourtRatingResponseDto,
  OpenGameResponseDto,
  WaitlistResponseDto,
} from '../dtos/response/booking.response';

const BLOCKING_BOOKING_STATUSES: BookingStatus[] = [
  BookingStatus.PENDING,
  BookingStatus.CONFIRMED,
];

const CLUB_TIMEZONE = 'Africa/Maputo';
const MIN_LEAD_MINUTES = 30;
const MAX_FUTURE_DAYS = 60;
const PAYMENT_PENDING_MINUTES = 15;
const WAITLIST_HOLD_MINUTES = 30;
const CHECKIN_BEFORE_MINUTES = 30;
const CHECKIN_AFTER_MINUTES = 15;

@Injectable()
export class BookingService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly helperNotificationService: HelperNotificationService,
    private readonly courtService: CourtService,
    private readonly lightingOrchestratorService: LightingOrchestratorService
  ) {}

  async createBooking(
    user: IAuthUser,
    payload: BookingCreateRequestDto
  ): Promise<BookingResponseDto | BookingResponseDto[]> {
    const court = await this.courtService.assertCourtIsBookable(
      payload.courtId
    );

    const participantUserIds = this.normalizeDistinctIds(
      payload.participantUserIds ?? []
    ).filter(userId => userId !== user.userId);
    const inviteEmails = this.normalizeDistinctEmails(
      payload.inviteEmails ?? []
    );

    const totalRequestedParticipants =
      1 + participantUserIds.length + inviteEmails.length;
    if (totalRequestedParticipants > court.maxPlayers) {
      throw new HttpException(
        'booking.error.exceedsCourtCapacity',
        HttpStatus.BAD_REQUEST
      );
    }

    const firstSlot = this.validateAndBuildSlot(payload.startAt, payload.endAt);

    const slots = this.buildSlots(firstSlot, payload.recurrence);

    if (slots.length > 12) {
      throw new HttpException(
        'booking.error.recurrenceLimitExceeded',
        HttpStatus.BAD_REQUEST
      );
    }

    for (const slot of slots) {
      this.validateBookingWindow(slot.startAt, slot.endAt);
      await this.assertCourtAvailability(court.id, slot.startAt, slot.endAt);
      await this.assertOrganizerAvailability(
        user.userId,
        slot.startAt,
        slot.endAt
      );
    }

    const usersById = await this.fetchUsersByIds(participantUserIds);

    const now = new Date();
    const amountPerSlot = this.calculatePrice(
      court.pricePerHour,
      firstSlot.durationMinutes
    );

    const result = await this.databaseService.$transaction(async tx => {
      let seriesId: string | null = null;

      if (payload.recurrence?.weekly) {
        const series = await tx.bookingSeries.create({
          data: {
            organizerId: user.userId,
            courtId: court.id,
            startsAt: firstSlot.startAt,
            occurrences: slots.length,
            intervalWeeks: 1,
            status: 'ACTIVE',
          },
        });
        seriesId = series.id;
      }

      const createdBookings: Booking[] = [];

      for (const slot of slots) {
        const booking = await tx.booking.create({
          data: {
            courtId: court.id,
            organizerId: user.userId,
            seriesId,
            startAt: slot.startAt,
            endAt: slot.endAt,
            durationMinutes: slot.durationMinutes,
            totalPrice: amountPerSlot,
            currency: court.currency,
            paidAmount: this.decimal(0),
            status: BookingStatus.PENDING,
            paymentDueAt: this.addMinutes(now, PAYMENT_PENDING_MINUTES),
          },
        });

        await tx.bookingStatusHistory.create({
          data: {
            bookingId: booking.id,
            fromStatus: null,
            toStatus: BookingStatus.PENDING,
            reason: 'booking_created',
            changedByUserId: user.userId,
          },
        });

        await tx.bookingParticipant.create({
          data: {
            bookingId: booking.id,
            userId: user.userId,
            status: ParticipantStatus.ACCEPTED,
            isOrganizer: true,
          },
        });

        for (const participantUserId of participantUserIds) {
          await tx.bookingParticipant.upsert({
            where: {
              bookingId_userId: {
                bookingId: booking.id,
                userId: participantUserId,
              },
            },
            create: {
              bookingId: booking.id,
              userId: participantUserId,
              status: ParticipantStatus.INVITED,
              isOrganizer: false,
            },
            update: {
              status: ParticipantStatus.INVITED,
            },
          });

          await tx.bookingInvitation.create({
            data: {
              bookingId: booking.id,
              inviterUserId: user.userId,
              invitedUserId: participantUserId,
              token: randomUUID(),
              status: InvitationStatus.PENDING,
              expiresAt: this.addHours(now, 24),
            },
          });
        }

        for (const email of inviteEmails) {
          await tx.bookingInvitation.create({
            data: {
              bookingId: booking.id,
              inviterUserId: user.userId,
              inviteeEmail: email,
              token: randomUUID(),
              status: InvitationStatus.PENDING,
              expiresAt: this.addHours(now, 24),
            },
          });
        }

        await tx.paymentTransaction.create({
          data: {
            bookingId: booking.id,
            userId: user.userId,
            type: PaymentType.BOOKING,
            status: PaymentStatus.PENDING,
            amount: amountPerSlot,
            currency: court.currency,
            reference: this.paymentReference('BK'),
            metadata: {
              timezone: CLUB_TIMEZONE,
              source: 'create_booking',
            },
          },
        });

        createdBookings.push(booking);
      }

      return createdBookings;
    });

    for (const invitedUser of usersById.values()) {
      await this.notifyUser(
        invitedUser,
        'New booking invitation',
        'You were invited to join a court booking.'
      );
    }

    for (const email of inviteEmails) {
      await this.notifyExternalEmail(
        email,
        'Booking invitation',
        'You were invited to join a booking. Please create or use your account to respond.'
      );
    }

    if (result.length === 1) {
      return this.getBookingForUser(user, result[0].id);
    }

    const bookings: BookingResponseDto[] = [];
    for (const booking of result) {
      bookings.push(await this.getBookingForUser(user, booking.id));
    }

    return bookings;
  }

  async confirmBookingPayment(
    user: IAuthUser,
    bookingId: string,
    payload: BookingMockPaymentConfirmRequestDto
  ): Promise<BookingResponseDto | BookingResponseDto[]> {
    const booking = await this.databaseService.booking.findUnique({
      where: { id: bookingId },
      include: {
        court: true,
      },
    });

    if (!booking) {
      throw new HttpException('booking.error.notFound', HttpStatus.NOT_FOUND);
    }

    if (booking.organizerId !== user.userId && user.role !== Role.ADMIN) {
      throw new HttpException(
        'auth.error.insufficientPermissions',
        HttpStatus.FORBIDDEN
      );
    }

    const targetBookings =
      payload.applyToSeries && booking.seriesId
        ? await this.databaseService.booking.findMany({
            where: {
              seriesId: booking.seriesId,
              status: BookingStatus.PENDING,
            },
            orderBy: { startAt: 'asc' },
          })
        : [booking];

    if (targetBookings.length === 0) {
      throw new HttpException(
        'booking.error.nothingToConfirm',
        HttpStatus.BAD_REQUEST
      );
    }

    const now = new Date();

    await this.databaseService.$transaction(async tx => {
      for (const target of targetBookings) {
        if (target.status !== BookingStatus.PENDING) {
          continue;
        }

        await tx.paymentTransaction.updateMany({
          where: {
            bookingId: target.id,
            type: PaymentType.BOOKING,
            status: PaymentStatus.PENDING,
          },
          data: {
            status: PaymentStatus.COMPLETED,
            processedAt: now,
          },
        });

        await tx.booking.update({
          where: { id: target.id },
          data: {
            status: BookingStatus.CONFIRMED,
            paidAmount: target.totalPrice,
            checkInToken: randomUUID(),
            checkInTokenExpiresAt: this.addMinutes(
              target.startAt,
              CHECKIN_AFTER_MINUTES
            ),
          },
        });

        await tx.bookingStatusHistory.create({
          data: {
            bookingId: target.id,
            fromStatus: BookingStatus.PENDING,
            toStatus: BookingStatus.CONFIRMED,
            reason: 'payment_confirmed',
            changedByUserId: user.userId,
          },
        });
      }
    });

    if (targetBookings.length === 1) {
      return this.getBookingForUser(user, targetBookings[0].id);
    }

    const response: BookingResponseDto[] = [];
    for (const target of targetBookings) {
      response.push(await this.getBookingForUser(user, target.id));
    }

    return response;
  }

  async getMyBookings(
    userId: string,
    query: BookingMeQueryRequestDto
  ): Promise<ApiPaginatedDataDto<BookingResponseDto>> {
    const page = this.safePage(query.page);
    const pageSize = this.safePageSize(query.pageSize, 20);

    const status = this.parseBookingStatus(query.status);

    const where: Prisma.BookingWhereInput = {
      ...(status ? { status } : {}),
      OR: [
        { organizerId: userId },
        {
          participants: {
            some: {
              userId,
              status: {
                in: [ParticipantStatus.ACCEPTED, ParticipantStatus.INVITED],
              },
            },
          },
        },
      ],
    };

    const [totalItems, bookings] = await Promise.all([
      this.databaseService.booking.count({ where }),
      this.databaseService.booking.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { startAt: 'desc' },
        include: this.bookingInclude(),
      }),
    ]);

    return {
      items: bookings.map(item => this.serializeBooking(item)),
      metadata: {
        currentPage: page,
        itemsPerPage: pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / pageSize),
      },
    };
  }

  async getBookingForUser(
    user: IAuthUser,
    bookingId: string
  ): Promise<BookingResponseDto> {
    const booking = await this.databaseService.booking.findUnique({
      where: { id: bookingId },
      include: this.bookingInclude(),
    });

    if (!booking) {
      throw new HttpException('booking.error.notFound', HttpStatus.NOT_FOUND);
    }

    const isParticipant = booking.participants.some(
      participant => participant.userId === user.userId
    );

    if (
      booking.organizerId !== user.userId &&
      !isParticipant &&
      user.role !== Role.ADMIN
    ) {
      throw new HttpException(
        'auth.error.insufficientPermissions',
        HttpStatus.FORBIDDEN
      );
    }

    return this.serializeBooking(booking);
  }

  async cancelBooking(
    user: IAuthUser,
    bookingId: string,
    payload: BookingCancelRequestDto
  ): Promise<BookingResponseDto> {
    const booking = await this.databaseService.booking.findUnique({
      where: { id: bookingId },
      include: {
        organizer: true,
        participants: true,
        court: true,
      },
    });

    if (!booking) {
      throw new HttpException('booking.error.notFound', HttpStatus.NOT_FOUND);
    }

    if (booking.organizerId !== user.userId && user.role !== Role.ADMIN) {
      throw new HttpException(
        'auth.error.insufficientPermissions',
        HttpStatus.FORBIDDEN
      );
    }

    if (!this.isPendingOrConfirmed(booking.status)) {
      throw new HttpException(
        'booking.error.invalidStatusForCancellation',
        HttpStatus.BAD_REQUEST
      );
    }

    const now = new Date();
    const hoursToStart =
      (booking.startAt.getTime() - now.getTime()) / (1000 * 60 * 60);

    let refundRate = 0;
    if (hoursToStart >= 24) {
      refundRate = 1;
    } else if (hoursToStart >= 2) {
      refundRate = 0.5;
    }

    const paidAmount = Number(booking.paidAmount);
    const refundAmount = Number((paidAmount * refundRate).toFixed(2));
    const penaltyAmount = Number((paidAmount - refundAmount).toFixed(2));

    await this.databaseService.$transaction(async tx => {
      await tx.booking.update({
        where: { id: booking.id },
        data: {
          status: BookingStatus.CANCELLED,
          cancelledAt: now,
          cancellationReason: payload.reason?.trim() || 'cancelled_by_user',
        },
      });

      await tx.bookingStatusHistory.create({
        data: {
          bookingId: booking.id,
          fromStatus: booking.status,
          toStatus: BookingStatus.CANCELLED,
          reason: payload.reason?.trim() || 'cancelled_by_user',
          changedByUserId: user.userId,
        },
      });

      if (refundAmount > 0) {
        await tx.paymentTransaction.create({
          data: {
            bookingId: booking.id,
            userId: booking.organizerId,
            type: PaymentType.CANCELLATION_REFUND,
            status: PaymentStatus.COMPLETED,
            amount: this.decimal(refundAmount),
            currency: booking.currency,
            reference: this.paymentReference('RF'),
            processedAt: now,
            metadata: {
              policy: '>=24h=100%;2-24h=50%;<2h=0%',
            },
          },
        });
      }

      if (penaltyAmount > 0) {
        await tx.paymentTransaction.create({
          data: {
            bookingId: booking.id,
            userId: booking.organizerId,
            type: PaymentType.CANCELLATION_PENALTY,
            status: PaymentStatus.COMPLETED,
            amount: this.decimal(penaltyAmount),
            currency: booking.currency,
            reference: this.paymentReference('PN'),
            processedAt: now,
            metadata: {
              policy: '>=24h=100%;2-24h=50%;<2h=0%',
            },
          },
        });
      }

      await tx.openGame.updateMany({
        where: {
          bookingId: booking.id,
          status: { in: [OpenGameStatus.OPEN, OpenGameStatus.FULL] },
        },
        data: {
          status: OpenGameStatus.CANCELLED,
        },
      });
    });

    await this.promoteWaitlistForSlot(
      booking.courtId,
      booking.startAt,
      booking.endAt
    );

    try {
      await this.lightingOrchestratorService.handleBookingCancelled(
        booking.id,
        user.userId
      );
    } catch {
      // Best effort: booking cancellation should not fail because of Tuya command issues.
    }

    await this.notifyBookingMembers(
      booking.id,
      'Booking cancelled',
      'The booking was cancelled and the slot has been released.'
    );

    return this.getBookingForUser(user, booking.id);
  }

  async rescheduleBooking(
    user: IAuthUser,
    bookingId: string,
    payload: BookingRescheduleRequestDto
  ): Promise<BookingResponseDto> {
    const booking = await this.databaseService.booking.findUnique({
      where: { id: bookingId },
      include: {
        court: true,
      },
    });

    if (!booking) {
      throw new HttpException('booking.error.notFound', HttpStatus.NOT_FOUND);
    }

    if (booking.organizerId !== user.userId && user.role !== Role.ADMIN) {
      throw new HttpException(
        'auth.error.insufficientPermissions',
        HttpStatus.FORBIDDEN
      );
    }

    if (!this.isPendingOrConfirmed(booking.status)) {
      throw new HttpException(
        'booking.error.invalidStatusForReschedule',
        HttpStatus.BAD_REQUEST
      );
    }

    const now = new Date();
    if (booking.startAt <= now) {
      throw new HttpException(
        'booking.error.onlyFutureBookingsCanBeEdited',
        HttpStatus.BAD_REQUEST
      );
    }

    const isAdmin = user.role === Role.ADMIN;

    if (!isAdmin && now >= booking.startAt) {
      throw new HttpException(
        'booking.error.rescheduleTooLate',
        HttpStatus.BAD_REQUEST
      );
    }

    const nextCourt = payload.courtId
      ? await this.courtService.assertCourtIsBookable(payload.courtId)
      : booking.court;

    const slot = this.validateAndBuildSlot(payload.startAt, payload.endAt);
    this.validateBookingWindow(slot.startAt, slot.endAt);

    await this.assertCourtAvailability(
      nextCourt.id,
      slot.startAt,
      slot.endAt,
      booking.id
    );
    await this.assertOrganizerAvailability(
      booking.organizerId,
      slot.startAt,
      slot.endAt,
      booking.id
    );

    const newTotal = this.calculatePrice(
      nextCourt.pricePerHour,
      slot.durationMinutes
    );
    const previousTotal = Number(booking.totalPrice);

    const rescheduleFee = Number((previousTotal * 0.1).toFixed(2));
    const positiveDifference = Number(
      Math.max(newTotal - previousTotal, 0).toFixed(2)
    );

    await this.databaseService.$transaction(async tx => {
      await tx.booking.update({
        where: { id: booking.id },
        data: {
          courtId: nextCourt.id,
          startAt: slot.startAt,
          endAt: slot.endAt,
          durationMinutes: slot.durationMinutes,
          totalPrice: this.decimal(newTotal),
          ...(isAdmin
            ? {
                isAdminForced: true,
              }
            : {}),
          ...(isAdmin
            ? {}
            : booking.status === BookingStatus.CONFIRMED
              ? {
                  paidAmount: this.decimal(
                    Number(booking.paidAmount) +
                      rescheduleFee +
                      positiveDifference
                  ),
                }
              : {}),
        },
      });

      if (!isAdmin && booking.status === BookingStatus.CONFIRMED) {
        if (rescheduleFee > 0) {
          await tx.paymentTransaction.create({
            data: {
              bookingId: booking.id,
              userId: booking.organizerId,
              type: PaymentType.RESCHEDULE_FEE,
              status: PaymentStatus.COMPLETED,
              amount: this.decimal(rescheduleFee),
              currency: booking.currency,
              reference: this.paymentReference('RSF'),
              processedAt: new Date(),
              metadata: {
                policy: '10_percent_fee',
              },
            },
          });
        }

        if (positiveDifference > 0) {
          await tx.paymentTransaction.create({
            data: {
              bookingId: booking.id,
              userId: booking.organizerId,
              type: PaymentType.RESCHEDULE_DIFFERENCE,
              status: PaymentStatus.COMPLETED,
              amount: this.decimal(positiveDifference),
              currency: booking.currency,
              reference: this.paymentReference('RSD'),
              processedAt: new Date(),
              metadata: {
                policy: 'positive_difference_only',
              },
            },
          });
        }
      }
    });

    await this.notifyBookingMembers(
      booking.id,
      'Booking rescheduled',
      'The booking date/time or court has been updated.'
    );

    return this.getBookingForUser(user, booking.id);
  }

  async inviteParticipants(
    user: IAuthUser,
    bookingId: string,
    payload: BookingInviteRequestDto
  ): Promise<BookingResponseDto> {
    const booking = await this.databaseService.booking.findUnique({
      where: { id: bookingId },
      include: {
        court: true,
        participants: true,
      },
    });

    if (!booking) {
      throw new HttpException('booking.error.notFound', HttpStatus.NOT_FOUND);
    }

    if (booking.organizerId !== user.userId && user.role !== Role.ADMIN) {
      throw new HttpException(
        'auth.error.insufficientPermissions',
        HttpStatus.FORBIDDEN
      );
    }

    if (new Date() >= booking.startAt) {
      throw new HttpException(
        'booking.error.invitationWindowClosed',
        HttpStatus.BAD_REQUEST
      );
    }

    const userIds = this.normalizeDistinctIds(payload.userIds ?? []).filter(
      userId => userId !== booking.organizerId
    );
    const emails = this.normalizeDistinctEmails(payload.emails ?? []);

    const activeCount = booking.participants.filter(participant =>
      this.isAcceptedOrInvitedParticipant(participant.status)
    ).length;

    if (
      activeCount + userIds.length + emails.length >
      booking.court.maxPlayers
    ) {
      throw new HttpException(
        'booking.error.exceedsCourtCapacity',
        HttpStatus.BAD_REQUEST
      );
    }

    const now = new Date();
    const users = await this.fetchUsersByIds(userIds);

    await this.databaseService.$transaction(async tx => {
      for (const targetUserId of userIds) {
        await tx.bookingParticipant.upsert({
          where: {
            bookingId_userId: {
              bookingId,
              userId: targetUserId,
            },
          },
          create: {
            bookingId,
            userId: targetUserId,
            status: ParticipantStatus.INVITED,
            isOrganizer: false,
          },
          update: {
            status: ParticipantStatus.INVITED,
          },
        });

        await tx.bookingInvitation.create({
          data: {
            bookingId,
            inviterUserId: user.userId,
            invitedUserId: targetUserId,
            token: randomUUID(),
            status: InvitationStatus.PENDING,
            expiresAt: this.addHours(now, 24),
          },
        });
      }

      for (const email of emails) {
        await tx.bookingInvitation.create({
          data: {
            bookingId,
            inviterUserId: user.userId,
            inviteeEmail: email,
            token: randomUUID(),
            status: InvitationStatus.PENDING,
            expiresAt: this.addHours(now, 24),
          },
        });
      }
    });

    for (const targetUser of users.values()) {
      await this.notifyUser(
        targetUser,
        'Booking invitation',
        'You have received a booking invitation.'
      );
    }

    for (const email of emails) {
      await this.notifyExternalEmail(
        email,
        'Booking invitation',
        'You have received a booking invitation. Please register/login to respond.'
      );
    }

    return this.getBookingForUser(user, bookingId);
  }

  async resendInvitation(
    user: IAuthUser,
    bookingId: string,
    invitationId: string
  ): Promise<BookingResponseDto> {
    const invitation = await this.databaseService.bookingInvitation.findFirst({
      where: {
        id: invitationId,
        bookingId,
      },
      include: {
        booking: true,
        invitedUser: true,
      },
    });

    if (!invitation) {
      throw new HttpException(
        'booking.error.invitationNotFound',
        HttpStatus.NOT_FOUND
      );
    }

    if (
      invitation.booking.organizerId !== user.userId &&
      user.role !== Role.ADMIN
    ) {
      throw new HttpException(
        'auth.error.insufficientPermissions',
        HttpStatus.FORBIDDEN
      );
    }

    if (new Date() >= invitation.booking.startAt) {
      throw new HttpException(
        'booking.error.invitationWindowClosed',
        HttpStatus.BAD_REQUEST
      );
    }

    const updated = await this.databaseService.bookingInvitation.update({
      where: { id: invitation.id },
      data: {
        status: InvitationStatus.PENDING,
        token: randomUUID(),
        expiresAt: this.addHours(new Date(), 24),
      },
      include: {
        invitedUser: true,
      },
    });

    if (updated.invitedUser) {
      await this.notifyUser(
        updated.invitedUser,
        'Booking invitation reminder',
        'Reminder: you have a pending booking invitation.'
      );
    }

    if (updated.inviteeEmail) {
      await this.notifyExternalEmail(
        updated.inviteeEmail,
        'Booking invitation reminder',
        'Reminder: you have a pending booking invitation.'
      );
    }

    return this.getBookingForUser(user, bookingId);
  }

  async removeInvitation(
    user: IAuthUser,
    bookingId: string,
    invitationId: string
  ): Promise<BookingResponseDto> {
    const invitation = await this.databaseService.bookingInvitation.findFirst({
      where: {
        id: invitationId,
        bookingId,
      },
      include: {
        booking: true,
      },
    });

    if (!invitation) {
      throw new HttpException(
        'booking.error.invitationNotFound',
        HttpStatus.NOT_FOUND
      );
    }

    if (
      invitation.booking.organizerId !== user.userId &&
      user.role !== Role.ADMIN
    ) {
      throw new HttpException(
        'auth.error.insufficientPermissions',
        HttpStatus.FORBIDDEN
      );
    }

    if (new Date() >= invitation.booking.startAt) {
      throw new HttpException(
        'booking.error.invitationWindowClosed',
        HttpStatus.BAD_REQUEST
      );
    }

    await this.databaseService.$transaction(async tx => {
      await tx.bookingInvitation.update({
        where: { id: invitation.id },
        data: {
          status: InvitationStatus.REVOKED,
        },
      });

      if (invitation.invitedUserId) {
        await tx.bookingParticipant.updateMany({
          where: {
            bookingId,
            userId: invitation.invitedUserId,
            isOrganizer: false,
          },
          data: {
            status: ParticipantStatus.REMOVED,
          },
        });
      }
    });

    return this.getBookingForUser(user, bookingId);
  }

  async respondInvitation(
    user: IAuthUser,
    token: string,
    payload: BookingInvitationRespondRequestDto
  ): Promise<BookingResponseDto> {
    const invitation = await this.databaseService.bookingInvitation.findUnique({
      where: { token },
      include: {
        booking: {
          include: {
            court: true,
            participants: true,
          },
        },
      },
    });

    if (!invitation) {
      throw new HttpException(
        'booking.error.invitationNotFound',
        HttpStatus.NOT_FOUND
      );
    }

    if (invitation.status !== InvitationStatus.PENDING) {
      throw new HttpException(
        'booking.error.invitationAlreadyHandled',
        HttpStatus.BAD_REQUEST
      );
    }

    const now = new Date();
    if (invitation.expiresAt < now) {
      await this.databaseService.bookingInvitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.EXPIRED },
      });
      throw new HttpException(
        'booking.error.invitationExpired',
        HttpStatus.BAD_REQUEST
      );
    }

    if (invitation.booking.startAt <= now) {
      throw new HttpException(
        'booking.error.invitationWindowClosed',
        HttpStatus.BAD_REQUEST
      );
    }

    const currentUser = await this.databaseService.user.findUnique({
      where: { id: user.userId },
    });

    if (!currentUser || currentUser.deletedAt) {
      throw new HttpException('user.error.userNotFound', HttpStatus.NOT_FOUND);
    }

    if (invitation.invitedUserId && invitation.invitedUserId !== user.userId) {
      throw new HttpException(
        'auth.error.insufficientPermissions',
        HttpStatus.FORBIDDEN
      );
    }

    if (
      invitation.inviteeEmail &&
      invitation.inviteeEmail.toLowerCase() !== currentUser.email.toLowerCase()
    ) {
      throw new HttpException(
        'booking.error.invitationEmailMismatch',
        HttpStatus.FORBIDDEN
      );
    }

    if (payload.action === 'decline') {
      await this.databaseService.$transaction(async tx => {
        await tx.bookingInvitation.update({
          where: { id: invitation.id },
          data: {
            status: InvitationStatus.DECLINED,
            respondedAt: now,
            invitedUserId: user.userId,
          },
        });

        await tx.bookingParticipant.upsert({
          where: {
            bookingId_userId: {
              bookingId: invitation.bookingId,
              userId: user.userId,
            },
          },
          create: {
            bookingId: invitation.bookingId,
            userId: user.userId,
            status: ParticipantStatus.DECLINED,
            isOrganizer: false,
          },
          update: {
            status: ParticipantStatus.DECLINED,
          },
        });
      });

      return this.getBookingForUser(user, invitation.bookingId);
    }

    const activeCount = invitation.booking.participants.filter(participant =>
      this.isAcceptedOrInvitedParticipant(participant.status)
    ).length;

    if (activeCount >= invitation.booking.court.maxPlayers) {
      throw new HttpException(
        'booking.error.exceedsCourtCapacity',
        HttpStatus.CONFLICT
      );
    }

    await this.assertParticipantAvailability(
      user.userId,
      invitation.booking.startAt,
      invitation.booking.endAt,
      invitation.bookingId
    );

    await this.databaseService.$transaction(async tx => {
      await tx.bookingInvitation.update({
        where: { id: invitation.id },
        data: {
          status: InvitationStatus.ACCEPTED,
          respondedAt: now,
          invitedUserId: user.userId,
        },
      });

      await tx.bookingParticipant.upsert({
        where: {
          bookingId_userId: {
            bookingId: invitation.bookingId,
            userId: user.userId,
          },
        },
        create: {
          bookingId: invitation.bookingId,
          userId: user.userId,
          status: ParticipantStatus.ACCEPTED,
          isOrganizer: false,
        },
        update: {
          status: ParticipantStatus.ACCEPTED,
        },
      });
    });

    return this.getBookingForUser(user, invitation.bookingId);
  }

  async removeParticipant(
    user: IAuthUser,
    bookingId: string,
    participantUserId: string
  ): Promise<BookingResponseDto> {
    const booking = await this.databaseService.booking.findUnique({
      where: { id: bookingId },
      include: {
        participants: true,
      },
    });

    if (!booking) {
      throw new HttpException('booking.error.notFound', HttpStatus.NOT_FOUND);
    }

    if (booking.organizerId !== user.userId && user.role !== Role.ADMIN) {
      throw new HttpException(
        'auth.error.insufficientPermissions',
        HttpStatus.FORBIDDEN
      );
    }

    if (participantUserId === booking.organizerId) {
      throw new HttpException(
        'booking.error.organizerCannotBeRemoved',
        HttpStatus.BAD_REQUEST
      );
    }

    if (new Date() >= booking.startAt) {
      throw new HttpException(
        'booking.error.invitationWindowClosed',
        HttpStatus.BAD_REQUEST
      );
    }

    await this.databaseService.$transaction(async tx => {
      await tx.bookingParticipant.updateMany({
        where: {
          bookingId,
          userId: participantUserId,
        },
        data: {
          status: ParticipantStatus.REMOVED,
        },
      });

      await tx.bookingInvitation.updateMany({
        where: {
          bookingId,
          invitedUserId: participantUserId,
          status: InvitationStatus.PENDING,
        },
        data: {
          status: InvitationStatus.REVOKED,
        },
      });

      const openGame = await tx.openGame.findUnique({
        where: { bookingId },
      });

      if (openGame) {
        const acceptedParticipants = await tx.bookingParticipant.count({
          where: {
            bookingId,
            status: ParticipantStatus.ACCEPTED,
          },
        });

        await tx.openGame.update({
          where: { bookingId },
          data: {
            slotsFilled: acceptedParticipants,
            status:
              acceptedParticipants >= openGame.slotsTotal
                ? OpenGameStatus.FULL
                : OpenGameStatus.OPEN,
          },
        });
      }
    });

    return this.getBookingForUser(user, bookingId);
  }

  async createWaitlistEntry(
    user: IAuthUser,
    payload: WaitlistCreateRequestDto
  ): Promise<WaitlistResponseDto> {
    await this.courtService.assertCourtIsBookable(payload.courtId);
    const slot = this.validateAndBuildSlot(payload.startAt, payload.endAt);

    const hasAvailability = await this.isCourtAvailable(
      payload.courtId,
      slot.startAt,
      slot.endAt
    );

    if (hasAvailability) {
      throw new HttpException(
        'waitlist.error.slotStillAvailable',
        HttpStatus.BAD_REQUEST
      );
    }

    const position =
      (await this.databaseService.waitlistEntry.count({
        where: {
          courtId: payload.courtId,
          startAt: slot.startAt,
          endAt: slot.endAt,
          status: {
            in: [WaitlistStatus.WAITING, WaitlistStatus.OFFERED],
          },
        },
      })) + 1;

    const created = await this.databaseService.waitlistEntry.create({
      data: {
        courtId: payload.courtId,
        userId: user.userId,
        startAt: slot.startAt,
        endAt: slot.endAt,
        status: WaitlistStatus.WAITING,
        position,
      },
    });

    return this.serializeWaitlist(created);
  }

  async getMyWaitlist(userId: string): Promise<WaitlistResponseDto[]> {
    const entries = await this.databaseService.waitlistEntry.findMany({
      where: {
        userId,
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    return entries.map(entry => this.serializeWaitlist(entry));
  }

  async acceptWaitlistOffer(
    user: IAuthUser,
    waitlistId: string
  ): Promise<BookingResponseDto> {
    const entry = await this.databaseService.waitlistEntry.findFirst({
      where: {
        id: waitlistId,
        userId: user.userId,
      },
      include: {
        booking: true,
        court: true,
      },
    });

    if (!entry) {
      throw new HttpException('waitlist.error.notFound', HttpStatus.NOT_FOUND);
    }

    if (entry.status !== WaitlistStatus.OFFERED) {
      throw new HttpException(
        'waitlist.error.invalidStateToAccept',
        HttpStatus.BAD_REQUEST
      );
    }

    if (entry.offerExpiresAt && entry.offerExpiresAt < new Date()) {
      throw new HttpException(
        'waitlist.error.offerExpired',
        HttpStatus.BAD_REQUEST
      );
    }

    let booking = entry.booking;

    if (!booking) {
      const created = await this.databaseService.$transaction(async tx => {
        const durationMinutes = this.diffInMinutes(entry.startAt, entry.endAt);
        const totalPrice = this.calculatePrice(
          entry.court.pricePerHour,
          durationMinutes
        );

        const newBooking = await tx.booking.create({
          data: {
            courtId: entry.courtId,
            organizerId: user.userId,
            startAt: entry.startAt,
            endAt: entry.endAt,
            durationMinutes,
            totalPrice: this.decimal(totalPrice),
            currency: entry.court.currency,
            paidAmount: this.decimal(0),
            status: BookingStatus.PENDING,
            paymentDueAt: this.addMinutes(new Date(), PAYMENT_PENDING_MINUTES),
          },
        });

        await tx.bookingStatusHistory.create({
          data: {
            bookingId: newBooking.id,
            fromStatus: null,
            toStatus: BookingStatus.PENDING,
            reason: 'waitlist_offer_accepted',
            changedByUserId: user.userId,
          },
        });

        await tx.bookingParticipant.create({
          data: {
            bookingId: newBooking.id,
            userId: user.userId,
            status: ParticipantStatus.ACCEPTED,
            isOrganizer: true,
          },
        });

        await tx.paymentTransaction.create({
          data: {
            bookingId: newBooking.id,
            userId: user.userId,
            type: PaymentType.WAITLIST_CLAIM,
            status: PaymentStatus.PENDING,
            amount: this.decimal(totalPrice),
            currency: entry.court.currency,
            reference: this.paymentReference('WLC'),
            metadata: {
              source: 'waitlist_accept_offer',
            },
          },
        });

        await tx.waitlistEntry.update({
          where: { id: entry.id },
          data: {
            status: WaitlistStatus.ACCEPTED,
            bookingId: newBooking.id,
          },
        });

        return newBooking;
      });

      booking = created;
    } else {
      await this.databaseService.waitlistEntry.update({
        where: { id: entry.id },
        data: {
          status: WaitlistStatus.ACCEPTED,
        },
      });
    }

    return this.getBookingForUser(user, booking.id);
  }

  async getCheckInQr(
    user: IAuthUser,
    bookingId: string
  ): Promise<BookingCheckInQrResponseDto> {
    const booking = await this.databaseService.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking) {
      throw new HttpException('booking.error.notFound', HttpStatus.NOT_FOUND);
    }

    if (booking.organizerId !== user.userId && user.role !== Role.ADMIN) {
      throw new HttpException(
        'auth.error.insufficientPermissions',
        HttpStatus.FORBIDDEN
      );
    }

    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new HttpException(
        'booking.error.checkInUnavailable',
        HttpStatus.BAD_REQUEST
      );
    }

    this.assertCheckInWindow(booking);

    let token = booking.checkInToken;
    let expiresAt = booking.checkInTokenExpiresAt;

    if (!token || !expiresAt || expiresAt < new Date()) {
      token = randomUUID();
      expiresAt = this.addMinutes(booking.startAt, CHECKIN_AFTER_MINUTES);

      await this.databaseService.booking.update({
        where: { id: booking.id },
        data: {
          checkInToken: token,
          checkInTokenExpiresAt: expiresAt,
        },
      });
    }

    return {
      bookingId: booking.id,
      token,
      expiresAt,
      qrPayload: JSON.stringify({
        bookingId: booking.id,
        token,
      }),
    };
  }

  async checkIn(
    user: IAuthUser,
    bookingId: string,
    payload: BookingCheckInRequestDto
  ): Promise<BookingResponseDto> {
    const booking = await this.databaseService.booking.findUnique({
      where: { id: bookingId },
      include: {
        participants: true,
      },
    });

    if (!booking) {
      throw new HttpException('booking.error.notFound', HttpStatus.NOT_FOUND);
    }

    const canCheckIn =
      user.role === Role.ADMIN ||
      booking.organizerId === user.userId ||
      booking.participants.some(
        participant =>
          participant.userId === user.userId &&
          participant.status === ParticipantStatus.ACCEPTED
      );

    if (!canCheckIn) {
      throw new HttpException(
        'auth.error.insufficientPermissions',
        HttpStatus.FORBIDDEN
      );
    }

    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new HttpException(
        'booking.error.checkInUnavailable',
        HttpStatus.BAD_REQUEST
      );
    }

    this.assertCheckInWindow(booking);

    if (
      booking.checkInToken &&
      payload.token &&
      booking.checkInToken !== payload.token
    ) {
      throw new HttpException(
        'booking.error.invalidCheckInToken',
        HttpStatus.BAD_REQUEST
      );
    }

    await this.databaseService.booking.update({
      where: { id: booking.id },
      data: {
        checkedInAt: new Date(),
        checkInByUserId: user.userId,
      },
    });

    return this.getBookingForUser(user, booking.id);
  }

  async createOpenGame(
    user: IAuthUser,
    bookingId: string,
    payload: OpenGameCreateRequestDto
  ): Promise<OpenGameResponseDto> {
    const booking = await this.databaseService.booking.findUnique({
      where: { id: bookingId },
      include: {
        court: true,
        participants: true,
        openGame: {
          include: {
            joinRequests: true,
          },
        },
      },
    });

    if (!booking) {
      throw new HttpException('booking.error.notFound', HttpStatus.NOT_FOUND);
    }

    if (booking.organizerId !== user.userId && user.role !== Role.ADMIN) {
      throw new HttpException(
        'auth.error.insufficientPermissions',
        HttpStatus.FORBIDDEN
      );
    }

    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new HttpException(
        'openGame.error.onlyConfirmedBookingAllowed',
        HttpStatus.BAD_REQUEST
      );
    }

    if (booking.openGame) {
      return this.serializeOpenGame(booking.openGame);
    }

    const acceptedParticipants = booking.participants.filter(
      participant => participant.status === ParticipantStatus.ACCEPTED
    ).length;

    const slotsTotal = Math.max(
      acceptedParticipants,
      Math.min(
        payload.slotsTotal ?? booking.court.maxPlayers,
        booking.court.maxPlayers
      )
    );

    const created = await this.databaseService.openGame.create({
      data: {
        bookingId: booking.id,
        organizerId: booking.organizerId,
        title: payload.title?.trim() || null,
        description: payload.description?.trim() || null,
        status:
          acceptedParticipants >= slotsTotal
            ? OpenGameStatus.FULL
            : OpenGameStatus.OPEN,
        slotsTotal,
        slotsFilled: acceptedParticipants,
      },
      include: {
        joinRequests: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    return this.serializeOpenGame(created);
  }

  async listOpenGames(
    query: OpenGamesListQueryRequestDto
  ): Promise<ApiPaginatedDataDto<OpenGameResponseDto>> {
    const page = this.safePage(query.page);
    const pageSize = this.safePageSize(query.pageSize, 20);

    const status = this.parseOpenGameStatus(query.status);

    const where: Prisma.OpenGameWhereInput = {
      ...(status ? { status } : {}),
    };

    const [totalItems, games] = await Promise.all([
      this.databaseService.openGame.count({ where }),
      this.databaseService.openGame.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          joinRequests: {
            orderBy: { createdAt: 'desc' },
          },
        },
      }),
    ]);

    return {
      items: games.map(game => this.serializeOpenGame(game)),
      metadata: {
        currentPage: page,
        itemsPerPage: pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / pageSize),
      },
    };
  }

  async requestJoinOpenGame(
    user: IAuthUser,
    openGameId: string
  ): Promise<OpenGameResponseDto> {
    const openGame = await this.databaseService.openGame.findUnique({
      where: { id: openGameId },
      include: {
        booking: {
          include: {
            participants: true,
          },
        },
        joinRequests: true,
      },
    });

    if (!openGame) {
      throw new HttpException('openGame.error.notFound', HttpStatus.NOT_FOUND);
    }

    if (openGame.status !== OpenGameStatus.OPEN) {
      throw new HttpException('openGame.error.notOpen', HttpStatus.BAD_REQUEST);
    }

    const alreadyParticipant = openGame.booking.participants.some(
      participant =>
        participant.userId === user.userId &&
        participant.status === ParticipantStatus.ACCEPTED
    );

    if (alreadyParticipant) {
      throw new HttpException(
        'openGame.error.alreadyParticipant',
        HttpStatus.BAD_REQUEST
      );
    }

    const existingRequest = openGame.joinRequests.find(
      request =>
        request.userId === user.userId &&
        request.status === OpenGameJoinStatus.PENDING
    );

    if (existingRequest) {
      throw new HttpException(
        'openGame.error.requestAlreadyExists',
        HttpStatus.CONFLICT
      );
    }

    await this.databaseService.openGameJoinRequest.create({
      data: {
        openGameId,
        userId: user.userId,
        status: OpenGameJoinStatus.PENDING,
      },
    });

    const refreshed = await this.databaseService.openGame.findUnique({
      where: { id: openGameId },
      include: {
        joinRequests: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!refreshed) {
      throw new HttpException('openGame.error.notFound', HttpStatus.NOT_FOUND);
    }

    await this.notifyUsersByIds(
      [openGame.organizerId],
      'Open game join request',
      'A user requested to join your open game.'
    );

    return this.serializeOpenGame(refreshed);
  }

  async handleJoinRequest(
    user: IAuthUser,
    openGameId: string,
    requestId: string,
    approve: boolean
  ): Promise<OpenGameResponseDto> {
    const openGame = await this.databaseService.openGame.findUnique({
      where: { id: openGameId },
      include: {
        booking: {
          include: {
            participants: true,
          },
        },
      },
    });

    if (!openGame) {
      throw new HttpException('openGame.error.notFound', HttpStatus.NOT_FOUND);
    }

    if (openGame.organizerId !== user.userId && user.role !== Role.ADMIN) {
      throw new HttpException(
        'auth.error.insufficientPermissions',
        HttpStatus.FORBIDDEN
      );
    }

    const request = await this.databaseService.openGameJoinRequest.findFirst({
      where: {
        id: requestId,
        openGameId,
      },
    });

    if (!request) {
      throw new HttpException(
        'openGame.error.requestNotFound',
        HttpStatus.NOT_FOUND
      );
    }

    if (request.status !== OpenGameJoinStatus.PENDING) {
      throw new HttpException(
        'openGame.error.requestAlreadyHandled',
        HttpStatus.BAD_REQUEST
      );
    }

    if (!approve) {
      await this.databaseService.openGameJoinRequest.update({
        where: { id: request.id },
        data: {
          status: OpenGameJoinStatus.DECLINED,
          respondedById: user.userId,
          respondedAt: new Date(),
        },
      });

      const updatedDeclined = await this.databaseService.openGame.findUnique({
        where: { id: openGameId },
        include: {
          joinRequests: {
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      if (!updatedDeclined) {
        throw new HttpException(
          'openGame.error.notFound',
          HttpStatus.NOT_FOUND
        );
      }

      return this.serializeOpenGame(updatedDeclined);
    }

    const acceptedCount = await this.databaseService.bookingParticipant.count({
      where: {
        bookingId: openGame.bookingId,
        status: ParticipantStatus.ACCEPTED,
      },
    });

    if (acceptedCount >= openGame.slotsTotal) {
      throw new HttpException(
        'openGame.error.alreadyFull',
        HttpStatus.CONFLICT
      );
    }

    await this.assertParticipantAvailability(
      request.userId,
      openGame.booking.startAt,
      openGame.booking.endAt,
      openGame.bookingId
    );

    await this.databaseService.$transaction(async tx => {
      await tx.bookingParticipant.upsert({
        where: {
          bookingId_userId: {
            bookingId: openGame.bookingId,
            userId: request.userId,
          },
        },
        create: {
          bookingId: openGame.bookingId,
          userId: request.userId,
          status: ParticipantStatus.ACCEPTED,
          isOrganizer: false,
        },
        update: {
          status: ParticipantStatus.ACCEPTED,
        },
      });

      await tx.openGameJoinRequest.update({
        where: { id: request.id },
        data: {
          status: OpenGameJoinStatus.APPROVED,
          respondedAt: new Date(),
          respondedById: user.userId,
        },
      });

      const updatedCount = await tx.bookingParticipant.count({
        where: {
          bookingId: openGame.bookingId,
          status: ParticipantStatus.ACCEPTED,
        },
      });

      await tx.openGame.update({
        where: { id: openGame.id },
        data: {
          slotsFilled: updatedCount,
          status:
            updatedCount >= openGame.slotsTotal
              ? OpenGameStatus.FULL
              : OpenGameStatus.OPEN,
        },
      });
    });

    const updated = await this.databaseService.openGame.findUnique({
      where: { id: openGame.id },
      include: {
        joinRequests: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!updated) {
      throw new HttpException('openGame.error.notFound', HttpStatus.NOT_FOUND);
    }

    return this.serializeOpenGame(updated);
  }

  async createRating(
    user: IAuthUser,
    bookingId: string,
    payload: CourtRatingCreateRequestDto
  ): Promise<CourtRatingResponseDto> {
    const booking = await this.databaseService.booking.findUnique({
      where: { id: bookingId },
      include: {
        participants: true,
      },
    });

    if (!booking) {
      throw new HttpException('booking.error.notFound', HttpStatus.NOT_FOUND);
    }

    const allowed =
      booking.organizerId === user.userId ||
      booking.participants.some(
        participant =>
          participant.userId === user.userId &&
          participant.status === ParticipantStatus.ACCEPTED
      );

    if (!allowed) {
      throw new HttpException(
        'auth.error.insufficientPermissions',
        HttpStatus.FORBIDDEN
      );
    }

    if (booking.status !== BookingStatus.COMPLETED) {
      throw new HttpException(
        'rating.error.bookingMustBeCompleted',
        HttpStatus.BAD_REQUEST
      );
    }

    const created = await this.databaseService.courtRating.create({
      data: {
        bookingId,
        courtId: booking.courtId,
        userId: user.userId,
        courtScore: payload.courtScore,
        cleanlinessScore: payload.cleanlinessScore,
        lightingScore: payload.lightingScore,
        comment: payload.comment?.trim() || null,
      },
    });

    return this.serializeRating(created);
  }

  async updateRating(
    user: IAuthUser,
    bookingId: string,
    payload: CourtRatingUpdateRequestDto
  ): Promise<CourtRatingResponseDto> {
    const rating = await this.databaseService.courtRating.findFirst({
      where: {
        bookingId,
        userId: user.userId,
      },
    });

    if (!rating) {
      throw new HttpException('rating.error.notFound', HttpStatus.NOT_FOUND);
    }

    if (
      new Date().getTime() - rating.createdAt.getTime() >
      24 * 60 * 60 * 1000
    ) {
      throw new HttpException(
        'rating.error.editWindowExpired',
        HttpStatus.BAD_REQUEST
      );
    }

    const updated = await this.databaseService.courtRating.update({
      where: { id: rating.id },
      data: {
        ...(payload.courtScore !== undefined
          ? { courtScore: payload.courtScore }
          : {}),
        ...(payload.cleanlinessScore !== undefined
          ? { cleanlinessScore: payload.cleanlinessScore }
          : {}),
        ...(payload.lightingScore !== undefined
          ? { lightingScore: payload.lightingScore }
          : {}),
        ...(payload.comment !== undefined
          ? { comment: payload.comment?.trim() || null }
          : {}),
      },
    });

    return this.serializeRating(updated);
  }

  async processPendingPaymentExpirations(): Promise<number> {
    const now = new Date();
    const pending = await this.databaseService.booking.findMany({
      where: {
        status: BookingStatus.PENDING,
        paymentDueAt: {
          lt: now,
        },
      },
    });

    for (const booking of pending) {
      await this.databaseService.$transaction(async tx => {
        await tx.booking.update({
          where: { id: booking.id },
          data: {
            status: BookingStatus.CANCELLED,
            cancelledAt: now,
            cancellationReason: 'payment_expired',
          },
        });

        await tx.bookingStatusHistory.create({
          data: {
            bookingId: booking.id,
            fromStatus: BookingStatus.PENDING,
            toStatus: BookingStatus.CANCELLED,
            reason: 'payment_expired',
          },
        });

        await tx.paymentTransaction.updateMany({
          where: {
            bookingId: booking.id,
            status: PaymentStatus.PENDING,
          },
          data: {
            status: PaymentStatus.CANCELLED,
            processedAt: now,
          },
        });
      });

      await this.promoteWaitlistForSlot(
        booking.courtId,
        booking.startAt,
        booking.endAt
      );
    }

    return pending.length;
  }

  async processNoShows(): Promise<number> {
    const now = new Date();
    const threshold = this.addMinutes(now, -CHECKIN_AFTER_MINUTES);

    const targets = await this.databaseService.booking.findMany({
      where: {
        status: BookingStatus.CONFIRMED,
        checkedInAt: null,
        startAt: {
          lte: threshold,
        },
      },
    });

    if (targets.length === 0) {
      return 0;
    }

    await this.databaseService.$transaction(async tx => {
      for (const booking of targets) {
        await tx.booking.update({
          where: { id: booking.id },
          data: {
            status: BookingStatus.NO_SHOW,
            cancellationReason: 'auto_no_show',
          },
        });

        await tx.bookingStatusHistory.create({
          data: {
            bookingId: booking.id,
            fromStatus: BookingStatus.CONFIRMED,
            toStatus: BookingStatus.NO_SHOW,
            reason: 'auto_no_show',
          },
        });
      }
    });

    return targets.length;
  }

  async processCompletions(): Promise<number> {
    const now = new Date();

    const targets = await this.databaseService.booking.findMany({
      where: {
        status: BookingStatus.CONFIRMED,
        checkedInAt: {
          not: null,
        },
        endAt: {
          lte: now,
        },
      },
    });

    if (targets.length === 0) {
      return 0;
    }

    await this.databaseService.$transaction(async tx => {
      for (const booking of targets) {
        await tx.booking.update({
          where: { id: booking.id },
          data: {
            status: BookingStatus.COMPLETED,
          },
        });

        await tx.bookingStatusHistory.create({
          data: {
            bookingId: booking.id,
            fromStatus: BookingStatus.CONFIRMED,
            toStatus: BookingStatus.COMPLETED,
            reason: 'auto_completed',
          },
        });
      }
    });

    return targets.length;
  }

  async processWaitlistOfferExpirations(): Promise<number> {
    const now = new Date();

    const offered = await this.databaseService.waitlistEntry.findMany({
      where: {
        status: WaitlistStatus.OFFERED,
        offerExpiresAt: {
          lt: now,
        },
      },
      include: {
        booking: true,
      },
    });

    for (const entry of offered) {
      await this.databaseService.$transaction(async tx => {
        await tx.waitlistEntry.update({
          where: { id: entry.id },
          data: {
            status: WaitlistStatus.EXPIRED,
          },
        });

        if (entry.booking && entry.booking.status === BookingStatus.PENDING) {
          await tx.booking.update({
            where: { id: entry.booking.id },
            data: {
              status: BookingStatus.CANCELLED,
              cancellationReason: 'waitlist_offer_expired',
              cancelledAt: now,
            },
          });

          await tx.bookingStatusHistory.create({
            data: {
              bookingId: entry.booking.id,
              fromStatus: BookingStatus.PENDING,
              toStatus: BookingStatus.CANCELLED,
              reason: 'waitlist_offer_expired',
            },
          });
        }
      });

      await this.promoteWaitlistForSlot(
        entry.courtId,
        entry.startAt,
        entry.endAt
      );
    }

    return offered.length;
  }

  private async promoteWaitlistForSlot(
    courtId: string,
    startAt: Date,
    endAt: Date
  ): Promise<void> {
    const candidate = await this.databaseService.waitlistEntry.findFirst({
      where: {
        courtId,
        startAt,
        endAt,
        status: WaitlistStatus.WAITING,
      },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      include: {
        court: true,
        user: true,
      },
    });

    if (!candidate) {
      return;
    }

    const durationMinutes = this.diffInMinutes(startAt, endAt);
    const amount = this.calculatePrice(
      candidate.court.pricePerHour,
      durationMinutes
    );

    const now = new Date();
    const offerExpiresAt = this.addMinutes(now, WAITLIST_HOLD_MINUTES);

    await this.databaseService.$transaction(async tx => {
      const booking = await tx.booking.create({
        data: {
          courtId,
          organizerId: candidate.userId,
          startAt,
          endAt,
          durationMinutes,
          totalPrice: this.decimal(amount),
          currency: candidate.court.currency,
          paidAmount: this.decimal(0),
          status: BookingStatus.PENDING,
          paymentDueAt: this.addMinutes(now, PAYMENT_PENDING_MINUTES),
        },
      });

      await tx.bookingParticipant.create({
        data: {
          bookingId: booking.id,
          userId: candidate.userId,
          status: ParticipantStatus.ACCEPTED,
          isOrganizer: true,
        },
      });

      await tx.bookingStatusHistory.create({
        data: {
          bookingId: booking.id,
          fromStatus: null,
          toStatus: BookingStatus.PENDING,
          reason: 'waitlist_offer_generated',
        },
      });

      await tx.paymentTransaction.create({
        data: {
          bookingId: booking.id,
          userId: candidate.userId,
          type: PaymentType.WAITLIST_CLAIM,
          status: PaymentStatus.PENDING,
          amount: this.decimal(amount),
          currency: candidate.court.currency,
          reference: this.paymentReference('WLH'),
          metadata: {
            source: 'waitlist_offer',
          },
        },
      });

      await tx.waitlistEntry.update({
        where: { id: candidate.id },
        data: {
          status: WaitlistStatus.OFFERED,
          offeredAt: now,
          offerExpiresAt,
          bookingId: booking.id,
        },
      });
    });

    await this.notifyUser(
      candidate.user,
      'Waitlist slot available',
      'A slot became available. You have 30 minutes to accept the offer and proceed with payment.'
    );
  }

  private bookingInclude(): Prisma.BookingInclude {
    return {
      participants: {
        orderBy: { createdAt: 'asc' },
      },
      invitations: {
        orderBy: { createdAt: 'desc' },
      },
      statusHistory: {
        orderBy: { createdAt: 'asc' },
      },
      payments: {
        orderBy: { createdAt: 'desc' },
      },
    };
  }

  private serializeBooking(booking: any): BookingResponseDto {
    return {
      id: booking.id,
      courtId: booking.courtId,
      organizerId: booking.organizerId,
      seriesId: booking.seriesId ?? null,
      startAt: booking.startAt,
      endAt: booking.endAt,
      durationMinutes: booking.durationMinutes,
      totalPrice: Number(booking.totalPrice),
      paidAmount: Number(booking.paidAmount),
      currency: booking.currency,
      status: booking.status,
      paymentDueAt: booking.paymentDueAt ?? null,
      checkedInAt: booking.checkedInAt ?? null,
      participants: (booking.participants ?? []).map((item: any) => ({
        userId: item.userId,
        status: item.status,
        isOrganizer: item.isOrganizer,
      })),
      invitations: (booking.invitations ?? []).map((item: any) => ({
        id: item.id,
        invitedUserId: item.invitedUserId ?? null,
        inviteeEmail: item.inviteeEmail ?? null,
        status: item.status,
        expiresAt: item.expiresAt,
      })),
      statusHistory: (booking.statusHistory ?? []).map((item: any) => ({
        fromStatus: item.fromStatus,
        toStatus: item.toStatus,
        reason: item.reason ?? null,
        createdAt: item.createdAt,
      })),
      payments: (booking.payments ?? []).map((item: any) => ({
        id: item.id,
        type: item.type,
        status: item.status,
        amount: Number(item.amount),
        currency: item.currency,
        reference: item.reference,
        processedAt: item.processedAt ?? null,
      })),
      createdAt: booking.createdAt,
      updatedAt: booking.updatedAt,
    };
  }

  private serializeWaitlist(entry: any): WaitlistResponseDto {
    return {
      id: entry.id,
      courtId: entry.courtId,
      userId: entry.userId,
      startAt: entry.startAt,
      endAt: entry.endAt,
      status: entry.status,
      position: entry.position,
      bookingId: entry.bookingId ?? null,
      offerExpiresAt: entry.offerExpiresAt ?? null,
    };
  }

  private serializeOpenGame(openGame: any): OpenGameResponseDto {
    return {
      id: openGame.id,
      bookingId: openGame.bookingId,
      organizerId: openGame.organizerId,
      title: openGame.title ?? null,
      description: openGame.description ?? null,
      status: openGame.status,
      slotsTotal: openGame.slotsTotal,
      slotsFilled: openGame.slotsFilled,
      joinRequests: (openGame.joinRequests ?? []).map((request: any) => ({
        id: request.id,
        userId: request.userId,
        status: request.status,
        createdAt: request.createdAt,
      })),
      createdAt: openGame.createdAt,
      updatedAt: openGame.updatedAt,
    };
  }

  private serializeRating(rating: any): CourtRatingResponseDto {
    return {
      id: rating.id,
      bookingId: rating.bookingId,
      courtId: rating.courtId,
      userId: rating.userId,
      courtScore: rating.courtScore,
      cleanlinessScore: rating.cleanlinessScore,
      lightingScore: rating.lightingScore,
      comment: rating.comment ?? null,
      createdAt: rating.createdAt,
      updatedAt: rating.updatedAt,
    };
  }

  private validateAndBuildSlot(
    startAtRaw: string,
    endAtRaw: string
  ): {
    startAt: Date;
    endAt: Date;
    durationMinutes: number;
  } {
    const startAt = this.toDate(startAtRaw, 'startAt');
    const endAt = this.toDate(endAtRaw, 'endAt');

    if (startAt >= endAt) {
      throw new HttpException(
        'booking.error.invalidTimeRange',
        HttpStatus.BAD_REQUEST
      );
    }

    const durationMinutes = this.diffInMinutes(startAt, endAt);
    if (![60, 120, 180].includes(durationMinutes)) {
      throw new HttpException(
        'booking.error.invalidDuration',
        HttpStatus.BAD_REQUEST
      );
    }

    return {
      startAt,
      endAt,
      durationMinutes,
    };
  }

  private buildSlots(
    firstSlot: { startAt: Date; endAt: Date; durationMinutes: number },
    recurrence?: { weekly: boolean; occurrences: number }
  ): { startAt: Date; endAt: Date; durationMinutes: number }[] {
    if (!recurrence?.weekly) {
      return [firstSlot];
    }

    const occurrences = recurrence.occurrences;
    if (occurrences < 2 || occurrences > 12) {
      throw new HttpException(
        'booking.error.recurrenceLimitExceeded',
        HttpStatus.BAD_REQUEST
      );
    }

    const slots: { startAt: Date; endAt: Date; durationMinutes: number }[] = [];

    for (let index = 0; index < occurrences; index += 1) {
      slots.push({
        startAt: this.addDays(firstSlot.startAt, index * 7),
        endAt: this.addDays(firstSlot.endAt, index * 7),
        durationMinutes: firstSlot.durationMinutes,
      });
    }

    return slots;
  }

  private validateBookingWindow(startAt: Date, _endAt: Date): void {
    const now = new Date();
    if (startAt < this.addMinutes(now, MIN_LEAD_MINUTES)) {
      throw new HttpException(
        'booking.error.minimumLeadTime',
        HttpStatus.BAD_REQUEST
      );
    }

    if (startAt > this.addDays(now, MAX_FUTURE_DAYS)) {
      throw new HttpException(
        'booking.error.exceedsFutureWindow',
        HttpStatus.BAD_REQUEST
      );
    }
  }

  private async assertCourtAvailability(
    courtId: string,
    startAt: Date,
    endAt: Date,
    excludeBookingId?: string
  ): Promise<void> {
    const conflict = await this.databaseService.booking.findFirst({
      where: {
        courtId,
        status: { in: BLOCKING_BOOKING_STATUSES },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
        ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
      },
      select: { id: true },
    });

    if (conflict) {
      throw new HttpException(
        'booking.error.slotAlreadyBooked',
        HttpStatus.CONFLICT
      );
    }
  }

  private async assertOrganizerAvailability(
    organizerId: string,
    startAt: Date,
    endAt: Date,
    excludeBookingId?: string
  ): Promise<void> {
    const conflict = await this.databaseService.booking.findFirst({
      where: {
        organizerId,
        status: { in: BLOCKING_BOOKING_STATUSES },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
        ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
      },
      select: { id: true },
    });

    if (conflict) {
      throw new HttpException(
        'booking.error.organizerOverlap',
        HttpStatus.CONFLICT
      );
    }
  }

  private async assertParticipantAvailability(
    participantUserId: string,
    startAt: Date,
    endAt: Date,
    excludeBookingId?: string
  ): Promise<void> {
    const conflict = await this.databaseService.bookingParticipant.findFirst({
      where: {
        userId: participantUserId,
        status: ParticipantStatus.ACCEPTED,
        booking: {
          status: {
            in: BLOCKING_BOOKING_STATUSES,
          },
          startAt: {
            lt: endAt,
          },
          endAt: {
            gt: startAt,
          },
          ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
        },
      },
      select: { id: true },
    });

    if (conflict) {
      throw new HttpException(
        'booking.error.participantOverlap',
        HttpStatus.CONFLICT
      );
    }
  }

  private async isCourtAvailable(
    courtId: string,
    startAt: Date,
    endAt: Date
  ): Promise<boolean> {
    const conflict = await this.databaseService.booking.findFirst({
      where: {
        courtId,
        status: { in: BLOCKING_BOOKING_STATUSES },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
      select: {
        id: true,
      },
    });

    return !conflict;
  }

  private parseBookingStatus(value?: string): BookingStatus | undefined {
    if (!value) {
      return undefined;
    }

    const normalized = value.trim().toUpperCase() as BookingStatus;
    if (!Object.values(BookingStatus).includes(normalized)) {
      return undefined;
    }

    return normalized;
  }

  private parseOpenGameStatus(value?: string): OpenGameStatus | undefined {
    if (!value) {
      return undefined;
    }

    const normalized = value.trim().toUpperCase() as OpenGameStatus;
    if (!Object.values(OpenGameStatus).includes(normalized)) {
      return undefined;
    }

    return normalized;
  }

  private isPendingOrConfirmed(status: BookingStatus): boolean {
    return (
      status === BookingStatus.PENDING || status === BookingStatus.CONFIRMED
    );
  }

  private isAcceptedOrInvitedParticipant(status: ParticipantStatus): boolean {
    return (
      status === ParticipantStatus.ACCEPTED ||
      status === ParticipantStatus.INVITED
    );
  }

  private normalizeDistinctIds(values: string[]): string[] {
    return Array.from(
      new Set(values.map(value => value.trim()).filter(Boolean))
    );
  }

  private normalizeDistinctEmails(values: string[]): string[] {
    return Array.from(
      new Set(values.map(value => value.trim().toLowerCase()).filter(Boolean))
    );
  }

  private calculatePrice(
    pricePerHour: Prisma.Decimal | number,
    durationMinutes: number
  ): number {
    const price = Number(pricePerHour);
    const blocks = durationMinutes / 60;
    return Number((price * blocks).toFixed(2));
  }

  private safePage(value?: number): number {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
  }

  private safePageSize(value?: number, fallback = 10): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return fallback;
    }

    return Math.min(parsed, 100);
  }

  private toDate(raw: string, field: string): Date {
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      throw new HttpException(
        `validation.error.invalid${field[0].toUpperCase()}${field.slice(1)}`,
        HttpStatus.BAD_REQUEST
      );
    }

    return parsed;
  }

  private diffInMinutes(start: Date, end: Date): number {
    return Math.round((end.getTime() - start.getTime()) / (1000 * 60));
  }

  private decimal(value: number): Prisma.Decimal {
    return new Prisma.Decimal(Number(value));
  }

  private addMinutes(date: Date, minutes: number): Date {
    return new Date(date.getTime() + minutes * 60 * 1000);
  }

  private addHours(date: Date, hours: number): Date {
    return new Date(date.getTime() + hours * 60 * 60 * 1000);
  }

  private addDays(date: Date, days: number): Date {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
  }

  private paymentReference(prefix: string): string {
    return `${prefix}-${Date.now()}-${randomUUID().slice(0, 8)}`;
  }

  private assertCheckInWindow(booking: Booking): void {
    const now = new Date();
    const opensAt = this.addMinutes(booking.startAt, -CHECKIN_BEFORE_MINUTES);
    const closesAt = this.addMinutes(booking.startAt, CHECKIN_AFTER_MINUTES);

    if (now < opensAt || now > closesAt) {
      throw new HttpException(
        'booking.error.checkInWindowClosed',
        HttpStatus.BAD_REQUEST
      );
    }
  }

  private async fetchUsersByIds(userIds: string[]): Promise<Map<string, any>> {
    if (userIds.length === 0) {
      return new Map();
    }

    const users = await this.databaseService.user.findMany({
      where: {
        id: {
          in: userIds,
        },
        deletedAt: null,
      },
    });

    return new Map(users.map(user => [user.id, user]));
  }

  private async notifyBookingMembers(
    bookingId: string,
    title: string,
    message: string
  ): Promise<void> {
    const participants = await this.databaseService.bookingParticipant.findMany(
      {
        where: {
          bookingId,
          status: ParticipantStatus.ACCEPTED,
        },
        select: {
          userId: true,
        },
      }
    );

    await this.notifyUsersByIds(
      participants.map(participant => participant.userId),
      title,
      message
    );
  }

  private async notifyUsersByIds(
    userIds: string[],
    title: string,
    message: string
  ): Promise<void> {
    const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
    if (uniqueIds.length === 0) {
      return;
    }

    const users = await this.databaseService.user.findMany({
      where: {
        id: { in: uniqueIds },
        deletedAt: null,
      },
    });

    for (const targetUser of users) {
      await this.notifyUser(targetUser, title, message);
    }
  }

  private async notifyUser(
    user: any,
    title: string,
    message: string
  ): Promise<void> {
    if (user.notifyEmail !== false && user.email) {
      await this.helperNotificationService.sendEmail({
        to: user.email,
        subject: title,
        text: message,
        html: `<p>${message}</p>`,
      });
    }

    if (user.notifyPush !== false && user.expoPushToken) {
      await this.helperNotificationService.sendPush({
        to: user.expoPushToken,
        title,
        body: message,
      });
    }
  }

  private async notifyExternalEmail(
    email: string,
    subject: string,
    message: string
  ): Promise<void> {
    await this.helperNotificationService.sendEmail({
      to: email,
      subject,
      text: message,
      html: `<p>${message}</p>`,
    });
  }
}
