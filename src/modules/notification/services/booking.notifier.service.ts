import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ParticipantStatus } from '@prisma/client';

import { DatabaseService } from 'src/common/database/services/database.service';
import { HelperNotificationService } from 'src/common/helper/services/helper.notification.service';

import {
  BookingNotificationContent,
  BookingNotificationContext,
  CheckoutSessionNotificationContext,
  bookingCancelledByAdminTemplate,
  bookingCreatedByAdminTemplate,
  bookingEndingSoonTemplate,
  bookingExpiredTemplate,
  bookingStartingSoonTemplate,
  checkInTemplate,
  checkoutCreatedByAdminTemplate,
  checkoutExpiredTemplate,
  checkoutFailedTemplate,
  paymentConfirmedTemplate,
  paymentFailedTemplate,
} from '../templates/booking.templates';

interface RecipientSummary {
  id: string;
  email: string;
  firstName: string | null;
  expoPushToken: string | null;
  notifyPush: boolean;
  notifyEmail: boolean;
  isOrganizer: boolean;
}

@Injectable()
export class BookingNotifierService {
  private readonly logger = new Logger(BookingNotifierService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly notificationService: HelperNotificationService,
    private readonly configService: ConfigService
  ) {}

  async notifyBookingCreatedByAdmin(bookingId: string): Promise<void> {
    await this.dispatchBooking(bookingId, ctx =>
      bookingCreatedByAdminTemplate(ctx)
    );
  }

  async notifyPaymentConfirmed(bookingId: string): Promise<void> {
    await this.dispatchBooking(bookingId, ctx => paymentConfirmedTemplate(ctx));
  }

  async notifyPaymentFailed(
    bookingId: string,
    providerMessage: string
  ): Promise<void> {
    await this.dispatchBooking(bookingId, ctx =>
      paymentFailedTemplate(ctx, providerMessage)
    );
  }

  async notifyBookingCancelledByAdmin(
    bookingId: string,
    reason: string
  ): Promise<void> {
    await this.dispatchBooking(bookingId, ctx =>
      bookingCancelledByAdminTemplate(ctx, reason)
    );
  }

  async notifyBookingExpired(bookingId: string): Promise<void> {
    await this.dispatchBooking(bookingId, ctx => bookingExpiredTemplate(ctx));
  }

  async notifyCheckIn(bookingId: string): Promise<void> {
    await this.dispatchBooking(bookingId, ctx => checkInTemplate(ctx));
  }

  async notifyBookingStartingSoon(bookingId: string): Promise<void> {
    await this.dispatchBooking(bookingId, ctx =>
      bookingStartingSoonTemplate(ctx)
    );
  }

  async notifyBookingEndingSoon(bookingId: string): Promise<void> {
    await this.dispatchBooking(bookingId, ctx =>
      bookingEndingSoonTemplate(ctx)
    );
  }

  async notifyCheckoutCreatedByAdmin(sessionId: string): Promise<void> {
    await this.dispatchSession(sessionId, ctx =>
      checkoutCreatedByAdminTemplate(ctx)
    );
  }

  async notifyCheckoutFailed(
    sessionId: string,
    providerMessage: string
  ): Promise<void> {
    await this.dispatchSession(sessionId, ctx =>
      checkoutFailedTemplate(ctx, providerMessage)
    );
  }

  async notifyCheckoutExpired(sessionId: string): Promise<void> {
    await this.dispatchSession(sessionId, ctx => checkoutExpiredTemplate(ctx));
  }

  private async dispatchBooking(
    bookingId: string,
    build: (ctx: BookingNotificationContext) => BookingNotificationContent
  ): Promise<void> {
    try {
      const ctx = await this.loadBookingContext(bookingId);
      if (!ctx) return;

      const content = build(ctx.notificationContext);

      for (const recipient of ctx.recipients) {
        await this.send(content, recipient, {
          type: 'booking',
          bookingId,
        });
      }
    } catch (error) {
      this.logger.warn(
        `Failed to dispatch notification for booking ${bookingId}: ${
          (error as Error)?.message ?? 'unknown'
        }`
      );
    }
  }

  private async dispatchSession(
    sessionId: string,
    build: (
      ctx: CheckoutSessionNotificationContext
    ) => BookingNotificationContent
  ): Promise<void> {
    try {
      const ctx = await this.loadSessionContext(sessionId);
      if (!ctx) return;

      const content = build(ctx.notificationContext);
      await this.send(content, ctx.organizer, {
        type: 'checkoutSession',
        sessionId,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to dispatch notification for session ${sessionId}: ${
          (error as Error)?.message ?? 'unknown'
        }`
      );
    }
  }

  private async send(
    content: BookingNotificationContent,
    recipient: RecipientSummary,
    data: Record<string, string>
  ): Promise<void> {
    const pushAllowed =
      recipient.notifyPush && Boolean(recipient.expoPushToken);
    const emailAllowed = recipient.notifyEmail && Boolean(recipient.email);

    const tasks: Promise<unknown>[] = [];

    if (pushAllowed) {
      tasks.push(
        this.notificationService.sendPush({
          to: recipient.expoPushToken!,
          title: content.pushTitle,
          body: content.pushBody,
          data,
        })
      );
    }

    if (emailAllowed) {
      tasks.push(
        this.notificationService.sendEmail({
          to: recipient.email,
          subject: content.emailSubject,
          html: content.emailHtml,
          text: content.emailText,
        })
      );
    }

    if (tasks.length === 0) {
      this.logger.debug(
        `No notification channels enabled for recipient ${recipient.id}`
      );
      return;
    }

    const results = await Promise.allSettled(tasks);
    results.forEach((result, idx) => {
      if (result.status === 'rejected') {
        this.logger.warn(
          `Notification channel ${idx} failed for recipient ${recipient.id}: ${
            (result.reason as Error)?.message ?? 'unknown'
          }`
        );
      }
    });
  }

  private async loadBookingContext(bookingId: string): Promise<{
    notificationContext: BookingNotificationContext;
    recipients: RecipientSummary[];
  } | null> {
    const booking = await this.db.booking.findUnique({
      where: { id: bookingId },
      include: {
        court: { select: { name: true } },
        organizer: {
          select: {
            id: true,
            email: true,
            firstName: true,
            expoPushToken: true,
            notifyPush: true,
            notifyEmail: true,
          },
        },
        participants: {
          where: { status: ParticipantStatus.ACCEPTED },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                expoPushToken: true,
                notifyPush: true,
                notifyEmail: true,
              },
            },
          },
        },
      },
    });

    if (!booking) {
      this.logger.warn(`Booking ${bookingId} not found for notification`);
      return null;
    }

    const appName = this.configService.get<string>('app.name') ?? 'Tunduro';
    const frontendUrl = this.configService.get<string>('app.frontendUrl');

    const recipientsById = new Map<string, RecipientSummary>();
    recipientsById.set(booking.organizer.id, {
      ...booking.organizer,
      isOrganizer: true,
    });

    for (const participant of booking.participants) {
      if (recipientsById.has(participant.user.id)) continue;
      recipientsById.set(participant.user.id, {
        ...participant.user,
        isOrganizer: false,
      });
    }

    return {
      notificationContext: {
        booking: {
          id: booking.id,
          startAt: booking.startAt,
          endAt: booking.endAt,
          totalPrice: booking.totalPrice,
          currency: booking.currency,
          cancellationReason: booking.cancellationReason,
        },
        court: { name: booking.court.name },
        organizer: {
          firstName: booking.organizer.firstName,
          email: booking.organizer.email,
        },
        appName,
        frontendUrl: frontendUrl || undefined,
      },
      recipients: Array.from(recipientsById.values()),
    };
  }

  private async loadSessionContext(sessionId: string): Promise<{
    notificationContext: CheckoutSessionNotificationContext;
    organizer: RecipientSummary;
  } | null> {
    const session = await this.db.bookingCheckoutSession.findUnique({
      where: { id: sessionId },
      include: {
        court: { select: { name: true } },
        organizer: {
          select: {
            id: true,
            email: true,
            firstName: true,
            expoPushToken: true,
            notifyPush: true,
            notifyEmail: true,
          },
        },
      },
    });

    if (!session) {
      this.logger.warn(
        `Checkout session ${sessionId} not found for notification`
      );
      return null;
    }

    const appName = this.configService.get<string>('app.name') ?? 'Tunduro';
    const frontendUrl = this.configService.get<string>('app.frontendUrl');

    return {
      notificationContext: {
        session: {
          id: session.id,
          startAt: session.startAt,
          endAt: session.endAt,
          amount: session.amount,
          currency: session.currency,
          failureReason: session.failureReason,
        },
        court: { name: session.court.name },
        organizer: {
          firstName: session.organizer.firstName,
          email: session.organizer.email,
        },
        appName,
        frontendUrl: frontendUrl || undefined,
      },
      organizer: { ...session.organizer, isOrganizer: true },
    };
  }
}
