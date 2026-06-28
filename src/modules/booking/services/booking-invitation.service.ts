import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import {
  BookingStatus,
  InvitationStatus,
  ParticipantStatus,
} from '@prisma/client';

import { DatabaseService } from 'src/common/database/services/database.service';
import { IAuthUser } from 'src/common/request/interfaces/request.interface';
import { BookingNotifierService } from 'src/modules/notification/services/booking.notifier.service';

import { BookingResponseDto } from '../dtos/response/booking.response';
import { bookingInclude, mapBooking } from '../helpers/booking-mapper.helper';

@Injectable()
export class BookingInvitationService {
  constructor(
    private readonly db: DatabaseService,
    private readonly bookingNotifier: BookingNotifierService
  ) {}

  async respondToInvitationAsUser(
    userId: string,
    bookingId: string,
    accept: boolean
  ): Promise<{
    bookingId: string;
    invitationId: string;
    status: ParticipantStatus;
  }> {
    const booking = await this.db.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, status: true, startAt: true },
    });
    if (!booking) {
      throw new HttpException('booking.error.notFound', HttpStatus.NOT_FOUND);
    }
    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new HttpException('booking.error.invalid', HttpStatus.CONFLICT);
    }

    const participant = await this.db.bookingParticipant.findUnique({
      where: { bookingId_userId: { bookingId, userId } },
    });
    if (!participant) {
      throw new HttpException(
        'booking.error.invitationNotFound',
        HttpStatus.NOT_FOUND
      );
    }
    if (participant.status !== ParticipantStatus.INVITED) {
      throw new HttpException(
        'booking.error.invitationAlreadyHandled',
        HttpStatus.CONFLICT
      );
    }

    const invitation = await this.db.bookingInvitation.findFirst({
      where: {
        bookingId,
        invitedUserId: userId,
        status: InvitationStatus.PENDING,
      },
    });
    if (!invitation) {
      throw new HttpException(
        'booking.error.invitationNotFound',
        HttpStatus.NOT_FOUND
      );
    }
    if (invitation.expiresAt.getTime() <= Date.now()) {
      throw new HttpException(
        'booking.error.invitationExpired',
        HttpStatus.GONE
      );
    }

    return this.applyInvitationResponse({
      bookingId,
      userId,
      invitationId: invitation.id,
      hasParticipant: true,
      accept,
    });
  }

  async respondToInvitationByToken(
    user: IAuthUser,
    token: string,
    accept: boolean
  ): Promise<{
    bookingId: string;
    invitationId: string;
    status: ParticipantStatus;
  }> {
    const invitation = await this.db.bookingInvitation.findUnique({
      where: { token },
      include: {
        booking: { select: { id: true, status: true, startAt: true } },
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
        HttpStatus.CONFLICT
      );
    }
    if (invitation.expiresAt.getTime() <= Date.now()) {
      throw new HttpException(
        'booking.error.invitationExpired',
        HttpStatus.GONE
      );
    }
    if (invitation.booking.status !== BookingStatus.CONFIRMED) {
      throw new HttpException('booking.error.invalid', HttpStatus.CONFLICT);
    }

    if (invitation.invitedUserId && invitation.invitedUserId !== user.userId) {
      throw new HttpException('auth.error.forbidden', HttpStatus.FORBIDDEN);
    }

    if (!invitation.invitedUserId && invitation.inviteeEmail) {
      const me = await this.db.user.findUnique({
        where: { id: user.userId },
        select: { email: true },
      });
      if (
        !me ||
        me.email.trim().toLowerCase() !==
          invitation.inviteeEmail.trim().toLowerCase()
      ) {
        throw new HttpException(
          'booking.error.invitationEmailMismatch',
          HttpStatus.FORBIDDEN
        );
      }
    }

    const existingParticipant = await this.db.bookingParticipant.findUnique({
      where: {
        bookingId_userId: {
          bookingId: invitation.bookingId,
          userId: user.userId,
        },
      },
    });

    return this.applyInvitationResponse({
      bookingId: invitation.bookingId,
      userId: user.userId,
      invitationId: invitation.id,
      hasParticipant: Boolean(existingParticipant),
      accept,
      linkInvitedUserId: !invitation.invitedUserId,
    });
  }

  async getInvitationByToken(
    user: IAuthUser,
    token: string
  ): Promise<{
    invitation: {
      id: string;
      status: InvitationStatus;
      expiresAt: Date;
      respondedAt: Date | null;
      inviteeEmail: string | null;
      invitedUserId: string | null;
    };
    booking: BookingResponseDto;
  }> {
    const invitation = await this.db.bookingInvitation.findUnique({
      where: { token },
      include: {
        booking: { include: bookingInclude() },
      },
    });
    if (!invitation) {
      throw new HttpException(
        'booking.error.invitationNotFound',
        HttpStatus.NOT_FOUND
      );
    }

    void user;

    return {
      invitation: {
        id: invitation.id,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
        respondedAt: invitation.respondedAt,
        inviteeEmail: invitation.inviteeEmail,
        invitedUserId: invitation.invitedUserId,
      },
      booking: mapBooking(invitation.booking),
    };
  }

  private async applyInvitationResponse(args: {
    bookingId: string;
    userId: string;
    invitationId: string;
    hasParticipant: boolean;
    accept: boolean;
    linkInvitedUserId?: boolean;
  }): Promise<{
    bookingId: string;
    invitationId: string;
    status: ParticipantStatus;
  }> {
    const targetParticipantStatus = args.accept
      ? ParticipantStatus.ACCEPTED
      : ParticipantStatus.DECLINED;
    const targetInvitationStatus = args.accept
      ? InvitationStatus.ACCEPTED
      : InvitationStatus.DECLINED;
    const now = new Date();

    await this.db.$transaction(async tx => {
      if (args.hasParticipant) {
        await tx.bookingParticipant.update({
          where: {
            bookingId_userId: {
              bookingId: args.bookingId,
              userId: args.userId,
            },
          },
          data: { status: targetParticipantStatus },
        });
      } else if (args.accept) {
        await tx.bookingParticipant.create({
          data: {
            bookingId: args.bookingId,
            userId: args.userId,
            status: ParticipantStatus.ACCEPTED,
            isOrganizer: false,
          },
        });
      }

      await tx.bookingInvitation.update({
        where: { id: args.invitationId },
        data: {
          status: targetInvitationStatus,
          respondedAt: now,
          ...(args.linkInvitedUserId ? { invitedUserId: args.userId } : {}),
        },
      });
    });

    await this.bookingNotifier.notifyInvitationResponded(
      args.invitationId,
      args.accept
    );

    return {
      bookingId: args.bookingId,
      invitationId: args.invitationId,
      status: targetParticipantStatus,
    };
  }
}
