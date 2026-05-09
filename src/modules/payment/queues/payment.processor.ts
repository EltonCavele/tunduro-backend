import { randomUUID } from 'crypto';
import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import {
  BookingCheckoutSession,
  BookingCheckoutSessionStatus,
  BookingStatus,
  ParticipantStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
  Prisma,
} from '@prisma/client';
import { Job } from 'bull';

import { DatabaseService } from 'src/common/database/services/database.service';
import { BookingNotifierService } from 'src/modules/notification/services/booking.notifier.service';

import { ChargeResult } from '../providers/payment.provider.interface';
import { PaymentProviderFactory } from '../providers/payment.provider.factory';
import {
  PAYMENT_CHARGE_JOB,
  PAYMENT_QUEUE,
  PaymentChargeJobData,
} from './payment.queue';

@Processor(PAYMENT_QUEUE)
export class PaymentProcessor {
  private readonly logger = new Logger(PaymentProcessor.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly providerFactory: PaymentProviderFactory,
    private readonly bookingNotifier: BookingNotifierService
  ) {}

  @Process(PAYMENT_CHARGE_JOB)
  async handleCharge(job: Job<PaymentChargeJobData>): Promise<void> {
    const { sessionId } = job.data;

    const session = await this.db.bookingCheckoutSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      this.logger.warn(`Checkout session ${sessionId} not found, skipping job`);
      return;
    }

    if (session.status !== BookingCheckoutSessionStatus.OPEN) {
      this.logger.warn(
        `Session ${sessionId} is not OPEN (got ${session.status}), skipping job`
      );
      return;
    }

    await this.db.bookingCheckoutSession.update({
      where: { id: sessionId },
      data: { status: BookingCheckoutSessionStatus.FINALIZING },
    });

    const method = session.paymentMethod ?? PaymentMethod.MPESA;
    const provider = this.providerFactory.getProvider(method);

    const result = await provider.charge({
      amount: Number(session.amount),
      currency: session.currency,
      phone: session.phone ?? undefined,
      reference: session.reference,
      thirdPartyRef: session.id.replace(/-/g, '').slice(0, 20),
    });

    if (result.success) {
      await this.completeSession(session, method, result);
    } else {
      await this.failSession(session, result);
    }
  }

  private async completeSession(
    session: BookingCheckoutSession,
    method: PaymentMethod,
    result: ChargeResult
  ): Promise<void> {
    let bookingId: string | null = null;
    const createdInvitationIds: string[] = [];

    await this.db.$transaction(async tx => {
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

      bookingId = booking.id;

      await tx.bookingStatusHistory.create({
        data: {
          bookingId: booking.id,
          fromStatus: null,
          toStatus: BookingStatus.CONFIRMED,
          reason: `payment confirmed via ${method}`,
        },
      });

      await tx.paymentTransaction.create({
        data: {
          bookingId: booking.id,
          userId: session.organizerId,
          type: PaymentType.BOOKING,
          status: PaymentStatus.COMPLETED,
          amount: session.amount,
          currency: session.currency,
          reference: session.reference,
          method,
          phone: session.phone,
          providerTransactionId: result.providerTransactionId ?? null,
          providerStatusCode: result.providerStatusCode,
          providerMessage: result.providerMessage,
          processedAt: new Date(),
          attempts: 1,
          metadata: (session.metadata as Prisma.InputJsonValue) ?? undefined,
        },
      });

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
      for (const u of usersByEmail) {
        emailToUserId.set(u.email.toLowerCase(), u.id);
      }

      const userIdSet = new Set<string>();
      for (const id of participantUserIds) {
        if (typeof id === 'string' && id && id !== session.organizerId) {
          userIdSet.add(id);
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
            bookingId: booking.id,
            userId,
            status: ParticipantStatus.INVITED,
            isOrganizer: false,
          },
        });
        const invitation = await tx.bookingInvitation.create({
          data: {
            bookingId: booking.id,
            inviterUserId: session.organizerId,
            invitedUserId: userId,
            token: randomUUID(),
            expiresAt: booking.startAt,
          },
          select: { id: true },
        });
        createdInvitationIds.push(invitation.id);
      }

      const emailsWithoutUser = Array.from(
        new Set(
          inviteEmails.filter(
            e => e !== organizerEmail && !emailToUserId.has(e)
          )
        )
      );

      for (const email of emailsWithoutUser) {
        const invitation = await tx.bookingInvitation.create({
          data: {
            bookingId: booking.id,
            inviterUserId: session.organizerId,
            inviteeEmail: email,
            token: randomUUID(),
            expiresAt: booking.startAt,
          },
          select: { id: true },
        });
        createdInvitationIds.push(invitation.id);
      }

      await tx.bookingCheckoutSession.update({
        where: { id: session.id },
        data: {
          status: BookingCheckoutSessionStatus.COMPLETED,
          bookingId: booking.id,
          paidAt: new Date(),
          completedAt: new Date(),
        },
      });
    });

    this.logger.log(
      `Session ${session.id} completed (${result.providerStatusCode}) - booking ${bookingId} CONFIRMED with ${createdInvitationIds.length} invitation(s)`
    );

    if (bookingId) {
      await this.bookingNotifier.notifyPaymentConfirmed(bookingId);
    }

    for (const invitationId of createdInvitationIds) {
      await this.bookingNotifier.notifyInvitationCreated(invitationId);
    }
  }

  private async failSession(
    session: BookingCheckoutSession,
    result: ChargeResult
  ): Promise<void> {
    const failureReason = `${result.providerStatusCode}: ${result.providerMessage}`;

    await this.db.bookingCheckoutSession.update({
      where: { id: session.id },
      data: {
        status: BookingCheckoutSessionStatus.PAYMENT_FAILED,
        failureReason,
      },
    });

    this.logger.warn(
      `Session ${session.id} payment failed (${failureReason})`
    );

    await this.bookingNotifier.notifyCheckoutFailed(
      session.id,
      result.providerMessage
    );
  }
}
