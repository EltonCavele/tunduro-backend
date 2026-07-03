import { randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import {
  BookingCheckoutSession,
  BookingCheckoutSessionStatus,
  BookingStatus,
  ParticipantStatus,
  PaymentMethod,
  Prisma,
} from '@prisma/client';

import { DatabaseService } from 'src/common/database/services/database.service';
import { BOOKING_EXTENSION_INTENT } from 'src/modules/booking/constants/booking-extension.constants';
import { LightingOrchestratorService } from 'src/modules/lighting/services/lighting.orchestrator.service';
import { BookingNotifierService } from 'src/modules/notification/services/booking.notifier.service';

import { ChargeResult } from '../providers/payment.provider.interface';
import { PaymentTransactionStateService } from './payment-transaction-state.service';

export interface BookingCheckoutCompletion {
  bookingId: string | null;
  checkedInAt?: Date | null;
  createdInvitationIds: string[];
  isExtension: boolean;
  skipSideEffects?: boolean;
}

const CHECKOUT_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 20_000,
};

@Injectable()
export class BookingCheckoutFinalizerService {
  private readonly logger = new Logger(BookingCheckoutFinalizerService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly bookingNotifier: BookingNotifierService,
    private readonly lightingOrchestrator: LightingOrchestratorService,
    private readonly paymentTransactions: PaymentTransactionStateService
  ) {}

  async completeSuccessfulSession(
    session: BookingCheckoutSession,
    method: PaymentMethod,
    result: ChargeResult
  ): Promise<BookingCheckoutCompletion> {
    const completion = await this.db.$transaction(async tx => {
      const current = await tx.bookingCheckoutSession.findUnique({
        where: { id: session.id },
      });
      if (!current) {
        throw new Error(`Checkout session ${session.id} not found`);
      }

      const claimed = await tx.bookingCheckoutSession.updateMany({
        where: {
          id: session.id,
          status: BookingCheckoutSessionStatus.OPEN,
        },
        data: { status: BookingCheckoutSessionStatus.FINALIZING },
      });
      if (claimed.count !== 1) {
        return {
          bookingId: current.bookingId,
          createdInvitationIds: [],
          isExtension: this.isExtensionSession(current),
          skipSideEffects: true,
        };
      }

      return this.applySuccessfulSession(tx, current, method, result);
    }, CHECKOUT_TRANSACTION_OPTIONS);

    await this.dispatchCompletionSideEffects(completion);

    return completion;
  }

  async applySuccessfulSession(
    tx: Prisma.TransactionClient,
    session: BookingCheckoutSession,
    method: PaymentMethod,
    result: ChargeResult
  ): Promise<BookingCheckoutCompletion> {
    if (this.isExtensionSession(session)) {
      return this.applyExtensionSession(tx, session, method, result);
    }

    return this.applyBookingSession(tx, session, method, result);
  }

  async dispatchCompletionSideEffects(
    completion: BookingCheckoutCompletion
  ): Promise<void> {
    if (completion.skipSideEffects) {
      return;
    }

    if (!completion.bookingId) {
      return;
    }

    if (completion.isExtension) {
      if (completion.checkedInAt) {
        try {
          await this.lightingOrchestrator.activateByCheckIn(
            completion.bookingId
          );
        } catch (error) {
          this.logger.warn(
            `Failed to refresh lighting after extension for booking ${completion.bookingId}: ${
              (error as Error)?.message ?? 'unknown'
            }`
          );
        }
      }

      await this.bookingNotifier.notifyBookingExtended(completion.bookingId);
      return;
    }

    await this.bookingNotifier.notifyPaymentConfirmed(completion.bookingId);

    for (const invitationId of completion.createdInvitationIds) {
      await this.bookingNotifier.notifyInvitationCreated(invitationId);
    }
  }

  private isExtensionSession(session: BookingCheckoutSession): boolean {
    const metadata = session.metadata as Record<string, unknown> | null;
    return (
      metadata?.intent === BOOKING_EXTENSION_INTENT &&
      typeof metadata?.targetBookingId === 'string'
    );
  }

  private getExtensionTargetBookingId(
    session: BookingCheckoutSession
  ): string | null {
    const metadata = session.metadata as Record<string, unknown> | null;
    const targetBookingId = metadata?.targetBookingId;
    return typeof targetBookingId === 'string' ? targetBookingId : null;
  }

  private async applyExtensionSession(
    tx: Prisma.TransactionClient,
    session: BookingCheckoutSession,
    method: PaymentMethod,
    result: ChargeResult
  ): Promise<BookingCheckoutCompletion> {
    const targetBookingId = this.getExtensionTargetBookingId(session);
    if (!targetBookingId) {
      throw new Error(
        `Extension session ${session.id} is missing targetBookingId`
      );
    }

    const booking = await tx.booking.findUnique({
      where: { id: targetBookingId },
    });

    if (!booking || booking.status !== BookingStatus.CONFIRMED) {
      throw new Error(`Booking ${targetBookingId} is not extendable`);
    }

    const extensionAmount = Number(session.amount);
    const addedMinutes = session.durationMinutes;

    await tx.booking.update({
      where: { id: targetBookingId },
      data: {
        endAt: session.endAt,
        durationMinutes: booking.durationMinutes + addedMinutes,
        totalPrice: Number(booking.totalPrice) + extensionAmount,
        paidAmount: Number(booking.paidAmount) + extensionAmount,
        endReminderSentAt: null,
      },
    });

    await tx.bookingStatusHistory.create({
      data: {
        bookingId: targetBookingId,
        fromStatus: BookingStatus.CONFIRMED,
        toStatus: BookingStatus.CONFIRMED,
        reason: `session extended +${addedMinutes}min via ${method}`,
      },
    });

    await this.paymentTransactions.completeCheckoutPayment(
      tx,
      session,
      targetBookingId,
      method,
      result
    );

    await tx.bookingCheckoutSession.update({
      where: { id: session.id },
      data: {
        status: BookingCheckoutSessionStatus.COMPLETED,
        paidAt: new Date(),
        completedAt: new Date(),
      },
    });

    return {
      bookingId: targetBookingId,
      checkedInAt: booking.checkedInAt,
      createdInvitationIds: [],
      isExtension: true,
    };
  }

  private async applyBookingSession(
    tx: Prisma.TransactionClient,
    session: BookingCheckoutSession,
    method: PaymentMethod,
    result: ChargeResult
  ): Promise<BookingCheckoutCompletion> {
    const createdInvitationIds: string[] = [];

    const booking = await tx.booking.create({
      data: {
        courtId: session.courtId,
        organizerId: session.organizerId,
        startAt: session.startAt,
        endAt: session.endAt,
        durationMinutes: session.durationMinutes,
        totalPrice: session.amount,
        currency: session.currency,
        paidAmount: session.amount,
        lightingRequested: session.lightingRequested,
        status: BookingStatus.CONFIRMED,
        participants: {
          create: {
            userId: session.organizerId,
            status: ParticipantStatus.ACCEPTED,
            isOrganizer: true,
          },
        },
      },
    });

    await tx.bookingStatusHistory.create({
      data: {
        bookingId: booking.id,
        fromStatus: null,
        toStatus: BookingStatus.CONFIRMED,
        reason: `payment confirmed via ${method}`,
      },
    });

    await this.paymentTransactions.completeCheckoutPayment(
      tx,
      session,
      booking.id,
      method,
      result
    );

    await this.createInvitations(
      tx,
      session,
      booking.id,
      booking.startAt,
      createdInvitationIds
    );

    await tx.bookingCheckoutSession.update({
      where: { id: session.id },
      data: {
        status: BookingCheckoutSessionStatus.COMPLETED,
        bookingId: booking.id,
        paidAt: new Date(),
        completedAt: new Date(),
      },
    });

    return {
      bookingId: booking.id,
      createdInvitationIds,
      isExtension: false,
    };
  }

  private async createInvitations(
    tx: Prisma.TransactionClient,
    session: BookingCheckoutSession,
    bookingId: string,
    bookingStartAt: Date,
    createdInvitationIds: string[]
  ): Promise<void> {
    const participantUserIds = Array.isArray(session.participantUserIds)
      ? (session.participantUserIds as string[])
      : [];
    const inviteEmailsRaw = Array.isArray(session.inviteEmails)
      ? (session.inviteEmails as string[])
      : [];
    const inviteEmails = inviteEmailsRaw
      .filter(e => typeof e === 'string')
      .map(e => e.trim().toLowerCase())
      .filter(Boolean);

    const organizer = await tx.user.findUnique({
      where: { id: session.organizerId },
      select: { email: true },
    });
    const organizerEmail = organizer?.email?.toLowerCase() ?? null;

    const usersByEmail = inviteEmails.length
      ? await tx.user.findMany({
          where: { email: { in: inviteEmails } },
          select: { id: true, email: true },
        })
      : [];
    const emailToUserId = new Map<string, string>();
    for (const user of usersByEmail) {
      emailToUserId.set(user.email.toLowerCase(), user.id);
    }

    const userIdSet = new Set<string>();
    for (const userId of participantUserIds) {
      if (
        typeof userId === 'string' &&
        userId &&
        userId !== session.organizerId
      ) {
        userIdSet.add(userId);
      }
    }
    for (const email of inviteEmails) {
      if (email === organizerEmail) continue;
      const linked = emailToUserId.get(email);
      if (linked && linked !== session.organizerId) userIdSet.add(linked);
    }

    for (const userId of userIdSet) {
      await tx.bookingParticipant.create({
        data: {
          bookingId,
          userId,
          status: ParticipantStatus.INVITED,
          isOrganizer: false,
        },
      });
      const invitation = await tx.bookingInvitation.create({
        data: {
          bookingId,
          inviterUserId: session.organizerId,
          invitedUserId: userId,
          token: randomUUID(),
          expiresAt: bookingStartAt,
        },
        select: { id: true },
      });
      createdInvitationIds.push(invitation.id);
    }

    const emailsWithoutUser = Array.from(
      new Set(
        inviteEmails.filter(
          email => email !== organizerEmail && !emailToUserId.has(email)
        )
      )
    );

    for (const email of emailsWithoutUser) {
      const invitation = await tx.bookingInvitation.create({
        data: {
          bookingId,
          inviterUserId: session.organizerId,
          inviteeEmail: email,
          token: randomUUID(),
          expiresAt: bookingStartAt,
        },
        select: { id: true },
      });
      createdInvitationIds.push(invitation.id);
    }
  }
}
