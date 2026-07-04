import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ParticipantStatus } from '@prisma/client';

import { DatabaseService } from 'src/common/database/services/database.service';
import { HelperNotificationService } from 'src/common/helper/services/helper.notification.service';

import {
  BookingNotificationContent,
  BookingNotificationContext,
  CheckoutSessionNotificationContext,
  InvitationNotificationContext,
  bookingCancelledByAdminTemplate,
  bookingCreatedByAdminTemplate,
  bookingEndingSoonTemplate,
  bookingExtendedTemplate,
  bookingExpiredTemplate,
  bookingStartingSoonTemplate,
  checkInTemplate,
  checkoutCreatedByAdminTemplate,
  checkoutExpiredTemplate,
  checkoutFailedTemplate,
  invitationAcceptedTemplate,
  invitationCreatedTemplate,
  invitationDeclinedTemplate,
  paymentConfirmedTemplate,
  paymentFailedTemplate,
} from '../templates/booking.templates';
import { NotificationService } from './notification.service';

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
    private readonly notificationStore: NotificationService,
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

  async notifyBookingEndingSoon(
    bookingId: string,
    canExtend = false
  ): Promise<void> {
    await this.dispatchBooking(
      bookingId,
      ctx => bookingEndingSoonTemplate(ctx, canExtend),
      canExtend ? { action: 'extend' } : undefined
    );
  }

  async notifyBookingExtended(bookingId: string): Promise<void> {
    await this.dispatchBooking(bookingId, ctx => bookingExtendedTemplate(ctx));
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

  async notifyInvitationCreated(invitationId: string): Promise<void> {
    try {
      const ctx = await this.loadInvitationContext(invitationId);
      if (!ctx) return;

      const content = invitationCreatedTemplate(ctx.notificationContext);
      await this.sendInvitation(content, ctx, {
        type: 'invitation',
        action: 'invite',
        invitationId,
        bookingId: ctx.notificationContext.booking.id,
        token: ctx.notificationContext.invitation.token,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to dispatch invitation ${invitationId}: ${
          (error as Error)?.message ?? 'unknown'
        }`
      );
    }
  }

  async notifyInvitationResponded(
    invitationId: string,
    accepted: boolean
  ): Promise<void> {
    try {
      const ctx = await this.loadInvitationContext(invitationId);
      if (!ctx) return;

      const guestName = ctx.guestDisplayName;
      const content = accepted
        ? invitationAcceptedTemplate(ctx.notificationContext, guestName)
        : invitationDeclinedTemplate(ctx.notificationContext, guestName);

      await this.send(content, ctx.inviter, {
        type: 'invitation',
        action: accepted ? 'accepted' : 'declined',
        invitationId,
        bookingId: ctx.notificationContext.booking.id,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to dispatch invitation response ${invitationId}: ${
          (error as Error)?.message ?? 'unknown'
        }`
      );
    }
  }

  private async dispatchBooking(
    bookingId: string,
    build: (ctx: BookingNotificationContext) => BookingNotificationContent,
    extraData?: Record<string, string>
  ): Promise<void> {
    try {
      const ctx = await this.loadBookingContext(bookingId);
      if (!ctx) return;

      const content = build(ctx.notificationContext);

      for (const recipient of ctx.recipients) {
        await this.send(content, recipient, {
          type: 'booking',
          bookingId,
          ...extraData,
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
    try {
      await this.notificationStore.createForUser({
        userId: recipient.id,
        title: content.pushTitle,
        body: content.pushBody,
        data,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to persist in-app notification for recipient ${recipient.id}: ${
          (error as Error)?.message ?? 'unknown'
        }`
      );
    }

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

  private async loadInvitationContext(invitationId: string): Promise<{
    notificationContext: InvitationNotificationContext;
    inviter: RecipientSummary;
    invitedUser: RecipientSummary | null;
    inviteeEmail: string | null;
    guestDisplayName: string;
  } | null> {
    const invitation = await this.db.bookingInvitation.findUnique({
      where: { id: invitationId },
      include: {
        booking: {
          include: { court: { select: { name: true } } },
        },
        inviterUser: {
          select: {
            id: true,
            email: true,
            firstName: true,
            expoPushToken: true,
            notifyPush: true,
            notifyEmail: true,
          },
        },
        invitedUser: {
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

    if (!invitation) {
      this.logger.warn(`Invitation ${invitationId} not found for notification`);
      return null;
    }

    const appName = this.configService.get<string>('app.name') ?? 'Tunduro';
    const frontendUrl = this.configService.get<string>('app.frontendUrl');
    const downloadIosUrl = this.configService.get<string>('app.downloadIosUrl');
    const downloadAndroidUrl = this.configService.get<string>(
      'app.downloadAndroidUrl'
    );
    const downloadFallbackUrl = this.configService.get<string>(
      'app.downloadFallbackUrl'
    );

    const inviter: RecipientSummary = {
      ...invitation.inviterUser,
      isOrganizer: true,
    };
    const invitedUser: RecipientSummary | null = invitation.invitedUser
      ? { ...invitation.invitedUser, isOrganizer: false }
      : null;

    const guestDisplayName =
      invitedUser?.firstName?.trim() ||
      invitedUser?.email ||
      invitation.inviteeEmail ||
      'um convidado';

    return {
      notificationContext: {
        booking: {
          id: invitation.booking.id,
          startAt: invitation.booking.startAt,
          endAt: invitation.booking.endAt,
          totalPrice: invitation.booking.totalPrice,
          currency: invitation.booking.currency,
        },
        court: { name: invitation.booking.court.name },
        inviter: {
          firstName: invitation.inviterUser.firstName,
          email: invitation.inviterUser.email,
        },
        invitation: {
          id: invitation.id,
          token: invitation.token,
          expiresAt: invitation.expiresAt,
          inviteeEmail: invitation.inviteeEmail,
          invitedUserId: invitation.invitedUserId,
        },
        appName,
        frontendUrl: frontendUrl || undefined,
        downloadLinks:
          invitation.inviteeEmail && !invitation.invitedUserId
            ? {
                ios: downloadIosUrl || undefined,
                android: downloadAndroidUrl || undefined,
                fallback: downloadFallbackUrl || undefined,
              }
            : undefined,
      },
      inviter,
      invitedUser,
      inviteeEmail: invitation.inviteeEmail,
      guestDisplayName,
    };
  }

  /**
   * Envia o convite ao destinatário. Se for um user registado, respeita as
   * flags notifyPush/notifyEmail. Se for um email-only invite, envia email
   * directo (canal único — não respeita notifyEmail porque o destinatário
   * ainda não tem conta).
   */
  private async sendInvitation(
    content: BookingNotificationContent,
    ctx: {
      invitedUser: RecipientSummary | null;
      inviteeEmail: string | null;
    },
    data: Record<string, string>
  ): Promise<void> {
    if (ctx.invitedUser) {
      await this.send(content, ctx.invitedUser, data);
      return;
    }

    if (!ctx.inviteeEmail) {
      this.logger.debug('Invitation has no recipient (no user, no email)');
      return;
    }

    try {
      await this.notificationService.sendEmail({
        to: ctx.inviteeEmail,
        subject: content.emailSubject,
        html: content.emailHtml,
        text: content.emailText,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to send invitation email to ${ctx.inviteeEmail}: ${
          (error as Error)?.message ?? 'unknown'
        }`
      );
    }
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
