import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BookingStatus,
  LightingActionSource,
  LightingActionType,
  Role,
} from '@prisma/client';

import { DatabaseService } from 'src/common/database/services/database.service';
import { HelperNotificationService } from 'src/common/helper/services/helper.notification.service';
import {
  LIGHTING_ALLOWED_COMMAND_CODES,
  LightingCommandItemRequestDto,
} from 'src/modules/lighting/dtos/request/lighting.request';
import {
  LightingCommandDispatchResponseDto,
  LightingDeviceStatusResponseDto,
} from 'src/modules/lighting/dtos/response/lighting.response';

import { LightingPolicyService } from './lighting.policy.service';
import { TuyaClientService } from './tuya-client.service';

const TERMINAL_BOOKING_STATUSES: BookingStatus[] = [
  BookingStatus.CANCELLED,
  BookingStatus.NO_SHOW,
  BookingStatus.COMPLETED,
];

@Injectable()
export class LightingOrchestratorService {
  private readonly logger = new Logger(LightingOrchestratorService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly helperNotificationService: HelperNotificationService,
    private readonly configService: ConfigService,
    private readonly lightingPolicyService: LightingPolicyService,
    private readonly tuyaClientService: TuyaClientService
  ) {}

  async processAutomaticLighting(): Promise<number> {
    const now = new Date();

    const candidates = await this.databaseService.booking.findMany({
      where: {
        status: {
          in: [BookingStatus.CONFIRMED, ...TERMINAL_BOOKING_STATUSES],
        },
        startAt: {
          lte: this.addHours(now, 2),
        },
        endAt: {
          gte: this.addHours(now, -24),
        },
      },
      include: {
        court: true,
      },
      orderBy: {
        startAt: 'asc',
      },
    });

    let processed = 0;

    for (const booking of candidates) {
      const court = booking.court;
      if (!court || court.deletedAt || !court.hasLighting || !court.lightingEnabled) {
        continue;
      }

      if (!court.lightingDeviceId) {
        if (
          booking.status === BookingStatus.CONFIRMED &&
          this.lightingPolicyService.hasBookingBeenPaid(
            Number(booking.totalPrice),
            Number(booking.paidAmount)
          )
        ) {
          await this.logMissingDeviceMapping(court.id, booking.id);
        }
        continue;
      }

      if (booking.status === BookingStatus.CONFIRMED) {
        const paid = this.lightingPolicyService.hasBookingBeenPaid(
          Number(booking.totalPrice),
          Number(booking.paidAmount)
        );

        if (!paid) {
          continue;
        }

        const onAt = this.addMinutes(
          booking.startAt,
          court.lightingOnOffsetMin || 0
        );
        const offAt = this.addMinutes(
          booking.endAt,
          court.lightingOffBufferMin || 5
        );

        if (now >= onAt && now < offAt) {
          const hasOn = await this.hasSuccessfulAction(
            booking.id,
            LightingActionType.AUTO_ON
          );

          if (!hasOn) {
            const isQuietHoursBlocked =
              court.quietHoursEnabled &&
              court.quietHoursHardBlock &&
              this.lightingPolicyService.isWithinQuietHours(
                now,
                court.quietHoursStart,
                court.quietHoursEnd
              );

            if (isQuietHoursBlocked) {
              await this.logAction({
                courtId: court.id,
                bookingId: booking.id,
                source: LightingActionSource.SYSTEM,
                action: LightingActionType.AUTO_ON,
                success: false,
                attempts: 1,
                errorCode: 'quiet_hours_blocked',
                errorMessage: 'lighting.error.quietHoursBlocked',
                reason: 'quiet_hours_hard_block',
              });
            } else {
              const outcome = await this.dispatchSwitch({
                courtId: court.id,
                bookingId: booking.id,
                deviceId: court.lightingDeviceId,
                on: true,
                source: LightingActionSource.SYSTEM,
                action: LightingActionType.AUTO_ON,
                reason: 'booking_started',
              });

              if (outcome.success) {
                processed += 1;
              }
            }
          }
        }

        if (now >= offAt) {
          const hasOff = await this.hasSuccessfulAction(
            booking.id,
            LightingActionType.AUTO_OFF
          );

          if (!hasOff) {
            const outcome = await this.dispatchSwitch({
              courtId: court.id,
              bookingId: booking.id,
              deviceId: court.lightingDeviceId,
              on: false,
              source: LightingActionSource.SYSTEM,
              action: LightingActionType.AUTO_OFF,
              reason: 'booking_ended',
            });

            if (outcome.success) {
              processed += 1;
            }
          }
        }

        continue;
      }

      if (TERMINAL_BOOKING_STATUSES.includes(booking.status)) {
        const hasOff = await this.hasSuccessfulAction(
          booking.id,
          LightingActionType.AUTO_OFF
        );

        if (!hasOff) {
          const outcome = await this.dispatchSwitch({
            courtId: court.id,
            bookingId: booking.id,
            deviceId: court.lightingDeviceId,
            on: false,
            source: LightingActionSource.SYSTEM,
            action: LightingActionType.AUTO_OFF,
            reason: `booking_terminal_status_${booking.status.toLowerCase()}`,
          });

          if (outcome.success) {
            processed += 1;
          }
        }
      }
    }

    return processed;
  }

  async handleBookingCancelled(
    bookingId: string,
    requestedByUserId?: string
  ): Promise<void> {
    const booking = await this.databaseService.booking.findUnique({
      where: { id: bookingId },
      include: {
        court: true,
      },
    });

    if (!booking || !booking.court) {
      return;
    }

    const court = booking.court;
    if (
      !court.hasLighting ||
      !court.lightingEnabled ||
      !court.lightingDeviceId ||
      booking.status !== BookingStatus.CANCELLED
    ) {
      return;
    }

    const now = new Date();
    const offCutoff = this.addMinutes(booking.endAt, court.lightingOffBufferMin || 5);
    if (now < booking.startAt || now > offCutoff) {
      return;
    }

    await this.dispatchSwitch({
      courtId: court.id,
      bookingId: booking.id,
      deviceId: court.lightingDeviceId,
      on: false,
      source: LightingActionSource.SYSTEM,
      action: LightingActionType.AUTO_OFF,
      reason: 'booking_cancelled_during_session',
      requestedByUserId,
    });
  }

  async handleBookingExtended(bookingId: string): Promise<void> {
    const booking = await this.databaseService.booking.findUnique({
      where: { id: bookingId },
      include: {
        court: true,
      },
    });

    if (!booking || !booking.court) {
      return;
    }

    const court = booking.court;
    if (
      !court.hasLighting ||
      !court.lightingEnabled ||
      !court.lightingDeviceId ||
      booking.status !== BookingStatus.CONFIRMED
    ) {
      return;
    }

    const now = new Date();
    const onAt = this.addMinutes(booking.startAt, court.lightingOnOffsetMin || 0);
    const offAt = this.addMinutes(booking.endAt, court.lightingOffBufferMin || 5);

    if (now < onAt || now >= offAt) {
      return;
    }

    const hasOn = await this.hasSuccessfulAction(booking.id, LightingActionType.AUTO_ON);

    if (!hasOn) {
      await this.dispatchSwitch({
        courtId: court.id,
        bookingId: booking.id,
        deviceId: court.lightingDeviceId,
        on: true,
        source: LightingActionSource.SYSTEM,
        action: LightingActionType.AUTO_ON,
        reason: 'overtime_extension_active',
      });
      return;
    }

    await this.logAction({
      courtId: court.id,
      bookingId: booking.id,
      source: LightingActionSource.SYSTEM,
      action: LightingActionType.EXTEND,
      success: true,
      attempts: 1,
      reason: 'booking_extended_schedule_recalculated',
    });
  }

  async manualOverride(
    courtId: string,
    adminUserId: string,
    action: 'ON' | 'OFF',
    reason: string
  ): Promise<LightingCommandDispatchResponseDto> {
    const court = await this.databaseService.court.findFirst({
      where: {
        id: courtId,
        deletedAt: null,
      },
    });

    if (!court) {
      throw new HttpException('court.error.notFound', HttpStatus.NOT_FOUND);
    }

    if (!court.hasLighting || !court.lightingEnabled) {
      throw new HttpException(
        'lighting.error.lightingDisabledForCourt',
        HttpStatus.BAD_REQUEST
      );
    }

    if (!court.lightingDeviceId) {
      throw new HttpException(
        'lighting.error.courtDeviceNotMapped',
        HttpStatus.BAD_REQUEST
      );
    }

    return this.dispatchSwitch({
      courtId,
      bookingId: null,
      deviceId: court.lightingDeviceId,
      on: action === 'ON',
      source: LightingActionSource.ADMIN,
      action:
        action === 'ON' ? LightingActionType.MANUAL_ON : LightingActionType.MANUAL_OFF,
      reason: reason.trim(),
      requestedByUserId: adminUserId,
    });
  }

  async sendManualCommands(
    courtId: string,
    adminUserId: string,
    commands: LightingCommandItemRequestDto[],
    reason?: string
  ): Promise<LightingCommandDispatchResponseDto> {
    const court = await this.databaseService.court.findFirst({
      where: {
        id: courtId,
        deletedAt: null,
      },
    });

    if (!court) {
      throw new HttpException('court.error.notFound', HttpStatus.NOT_FOUND);
    }

    if (!court.lightingDeviceId) {
      throw new HttpException(
        'lighting.error.courtDeviceNotMapped',
        HttpStatus.BAD_REQUEST
      );
    }

    const invalid = commands.find(
      command =>
        !LIGHTING_ALLOWED_COMMAND_CODES.includes(
          command.code as (typeof LIGHTING_ALLOWED_COMMAND_CODES)[number]
        )
    );

    if (invalid) {
      throw new HttpException(
        'lighting.error.unsupportedCommand',
        HttpStatus.BAD_REQUEST
      );
    }

    const normalizedCommands = commands.map(command => {
      if (command.code === 'switch_1') {
        return {
          code: command.code,
          value: Boolean(command.value),
        };
      }

      if (command.code === 'countdown_1') {
        const seconds = Number(command.value);
        if (
          Number.isNaN(seconds) ||
          !Number.isInteger(seconds) ||
          seconds < 0 ||
          seconds > 86400
        ) {
          throw new HttpException(
            'lighting.error.invalidCountdown',
            HttpStatus.BAD_REQUEST
          );
        }

        return {
          code: command.code,
          value: seconds,
        };
      }

      if (command.code === 'relay_status') {
        const value = `${command.value}`;
        if (!['0', '1', '2'].includes(value)) {
          throw new HttpException(
            'lighting.error.invalidRelayStatus',
            HttpStatus.BAD_REQUEST
          );
        }

        return {
          code: command.code,
          value,
        };
      }

      if (command.code === 'random_time' || command.code === 'cycle_time') {
        return {
          code: command.code,
          value: `${command.value}`.slice(0, 255),
        };
      }

      return command;
    });

    try {
      const result = await this.tuyaClientService.sendDeviceCommand(
        court.lightingDeviceId,
        normalizedCommands
      );

      await this.databaseService.lightingDeviceState.upsert({
        where: {
          courtId,
        },
        create: {
          courtId,
          isOnline: true,
          lastCommandAt: new Date(),
          lastCommandAction: LightingActionType.TEST_SWITCH,
          lastCommandSuccess: true,
          lastError: null,
        },
        update: {
          isOnline: true,
          lastCommandAt: new Date(),
          lastCommandAction: LightingActionType.TEST_SWITCH,
          lastCommandSuccess: true,
          lastError: null,
        },
      });

      await this.logAction({
        courtId,
        bookingId: null,
        source: LightingActionSource.ADMIN,
        action: LightingActionType.TEST_SWITCH,
        success: true,
        attempts: 1,
        reason: reason?.trim() || 'manual_command_dispatch',
        requestedByUserId: adminUserId,
      });

      return {
        success: true,
        courtId,
        bookingId: null,
        error: null,
        details: result,
      };
    } catch (error: any) {
      const message = error?.message || 'lighting.error.tuyaApi';

      await this.databaseService.lightingDeviceState.upsert({
        where: {
          courtId,
        },
        create: {
          courtId,
          isOnline: false,
          lastCommandAt: new Date(),
          lastCommandAction: LightingActionType.TEST_SWITCH,
          lastCommandSuccess: false,
          lastError: message,
        },
        update: {
          isOnline: false,
          lastCommandAt: new Date(),
          lastCommandAction: LightingActionType.TEST_SWITCH,
          lastCommandSuccess: false,
          lastError: message,
        },
      });

      await this.logAction({
        courtId,
        bookingId: null,
        source: LightingActionSource.ADMIN,
        action: LightingActionType.TEST_SWITCH,
        success: false,
        attempts: 1,
        errorCode: 'manual_command_error',
        errorMessage: message,
        reason: reason?.trim() || 'manual_command_dispatch',
        requestedByUserId: adminUserId,
      });

      await this.notifyAdminsIncident(
        courtId,
        'Lighting manual command failed',
        `Manual command failed for court ${courtId}: ${message}`
      );

      return {
        success: false,
        courtId,
        bookingId: null,
        error: message,
        details: null,
      };
    }
  }

  async getCourtDeviceStatus(
    courtId: string,
    refresh = true
  ): Promise<LightingDeviceStatusResponseDto> {
    const court = await this.databaseService.court.findFirst({
      where: {
        id: courtId,
        deletedAt: null,
      },
    });

    if (!court) {
      throw new HttpException('court.error.notFound', HttpStatus.NOT_FOUND);
    }

    if (refresh && court.lightingDeviceId) {
      await this.syncSingleDeviceState(courtId, court.lightingDeviceId);
    }

    const state = await this.databaseService.lightingDeviceState.findUnique({
      where: {
        courtId,
      },
    });

    return {
      courtId,
      lightingDeviceId: court.lightingDeviceId ?? null,
      isOnline: state?.isOnline ?? false,
      lastPingAt: state?.lastPingAt ?? null,
      lastCommandAction: state?.lastCommandAction ?? null,
      lastCommandAt: state?.lastCommandAt ?? null,
      lastCommandSuccess: state?.lastCommandSuccess ?? null,
      lastError: state?.lastError ?? null,
    };
  }

  async syncDeviceStatuses(): Promise<number> {
    const courts = await this.databaseService.court.findMany({
      where: {
        deletedAt: null,
        hasLighting: true,
        lightingEnabled: true,
        lightingDeviceId: {
          not: null,
        },
      },
      select: {
        id: true,
        lightingDeviceId: true,
      },
    });

    let synced = 0;

    for (const court of courts) {
      if (!court.lightingDeviceId) {
        continue;
      }

      await this.syncSingleDeviceState(court.id, court.lightingDeviceId, true);
      synced += 1;
    }

    return synced;
  }

  async purgeOldAuditLogs(retentionDays = 180): Promise<number> {
    const threshold = this.addDays(new Date(), -Math.abs(retentionDays));

    const result = await this.databaseService.lightingActionLog.deleteMany({
      where: {
        createdAt: {
          lt: threshold,
        },
      },
    });

    return result.count;
  }

  private async dispatchSwitch(params: {
    courtId: string;
    bookingId: string | null;
    deviceId: string;
    on: boolean;
    source: LightingActionSource;
    action: LightingActionType;
    reason: string;
    requestedByUserId?: string;
  }): Promise<LightingCommandDispatchResponseDto> {
    const retryCount = this.getRetryCount();
    const baseDelayMs = this.getRetryDelayMs();

    let lastError = 'lighting.error.tuyaApi';

    for (let attempt = 1; attempt <= retryCount; attempt += 1) {
      try {
        const details = await this.tuyaClientService.sendSwitch(
          params.deviceId,
          params.on
        );

        await this.databaseService.lightingDeviceState.upsert({
          where: {
            courtId: params.courtId,
          },
          create: {
            courtId: params.courtId,
            isOnline: true,
            lastPingAt: new Date(),
            lastCommandAt: new Date(),
            lastCommandAction: params.action,
            lastCommandSuccess: true,
            lastError: null,
          },
          update: {
            isOnline: true,
            lastPingAt: new Date(),
            lastCommandAt: new Date(),
            lastCommandAction: params.action,
            lastCommandSuccess: true,
            lastError: null,
          },
        });

        await this.logAction({
          courtId: params.courtId,
          bookingId: params.bookingId,
          source: params.source,
          action: params.action,
          success: true,
          attempts: attempt,
          reason: params.reason,
          requestedByUserId: params.requestedByUserId,
        });

        return {
          success: true,
          courtId: params.courtId,
          bookingId: params.bookingId,
          error: null,
          details,
        };
      } catch (error: any) {
        lastError = error?.message || 'lighting.error.tuyaApi';
        this.logger.warn(
          `Switch dispatch failed for court=${params.courtId} attempt=${attempt}/${retryCount}: ${lastError}`
        );

        if (attempt < retryCount) {
          await this.sleep(baseDelayMs * 2 ** (attempt - 1));
        }
      }
    }

    await this.databaseService.lightingDeviceState.upsert({
      where: {
        courtId: params.courtId,
      },
      create: {
        courtId: params.courtId,
        isOnline: false,
        lastPingAt: new Date(),
        lastCommandAt: new Date(),
        lastCommandAction: params.action,
        lastCommandSuccess: false,
        lastError,
      },
      update: {
        isOnline: false,
        lastPingAt: new Date(),
        lastCommandAt: new Date(),
        lastCommandAction: params.action,
        lastCommandSuccess: false,
        lastError,
      },
    });

    await this.logAction({
      courtId: params.courtId,
      bookingId: params.bookingId,
      source: params.source,
      action: params.action,
      success: false,
      attempts: retryCount,
      errorCode: 'dispatch_failed_after_retries',
      errorMessage: lastError,
      reason: params.reason,
      requestedByUserId: params.requestedByUserId,
    });

    await this.notifyAdminsIncident(
      params.courtId,
      'Lighting command failed',
      `Lighting action ${params.action} failed for court ${params.courtId}: ${lastError}`,
      params.bookingId || undefined
    );

    return {
      success: false,
      courtId: params.courtId,
      bookingId: params.bookingId,
      error: lastError,
      details: null,
    };
  }

  private async syncSingleDeviceState(
    courtId: string,
    deviceId: string,
    notifyOnOffline = false
  ): Promise<void> {
    const previous = await this.databaseService.lightingDeviceState.findUnique({
      where: {
        courtId,
      },
    });

    try {
      const device = await this.tuyaClientService.getDevice(deviceId);
      const isOnline = Boolean(
        device?.online ?? device?.is_online ?? device?.active_status ?? false
      );

      await this.databaseService.lightingDeviceState.upsert({
        where: {
          courtId,
        },
        create: {
          courtId,
          isOnline,
          lastPingAt: new Date(),
          lastError: null,
          lastCommandAction: LightingActionType.STATUS_SYNC,
          lastCommandSuccess: true,
        },
        update: {
          isOnline,
          lastPingAt: new Date(),
          lastError: null,
          lastCommandAction: LightingActionType.STATUS_SYNC,
          lastCommandSuccess: true,
        },
      });

      await this.logAction({
        courtId,
        bookingId: null,
        source: LightingActionSource.SYSTEM,
        action: LightingActionType.STATUS_SYNC,
        success: true,
        attempts: 1,
        reason: 'device_ping',
      });

      if (notifyOnOffline && previous?.isOnline !== false && !isOnline) {
        await this.notifyAdminsIncident(
          courtId,
          'Lighting device offline',
          `Lighting device appears offline for court ${courtId}.`
        );
      }
    } catch (error: any) {
      const message = error?.message || 'lighting.error.deviceStatusUnavailable';

      await this.databaseService.lightingDeviceState.upsert({
        where: {
          courtId,
        },
        create: {
          courtId,
          isOnline: false,
          lastPingAt: new Date(),
          lastError: message,
          lastCommandAction: LightingActionType.STATUS_SYNC,
          lastCommandSuccess: false,
        },
        update: {
          isOnline: false,
          lastPingAt: new Date(),
          lastError: message,
          lastCommandAction: LightingActionType.STATUS_SYNC,
          lastCommandSuccess: false,
        },
      });

      await this.logAction({
        courtId,
        bookingId: null,
        source: LightingActionSource.SYSTEM,
        action: LightingActionType.STATUS_SYNC,
        success: false,
        attempts: 1,
        errorCode: 'device_ping_failed',
        errorMessage: message,
        reason: 'device_ping',
      });

      if (notifyOnOffline && previous?.isOnline !== false) {
        await this.notifyAdminsIncident(
          courtId,
          'Lighting device offline',
          `Unable to ping lighting device for court ${courtId}: ${message}`
        );
      }
    }
  }

  private async logMissingDeviceMapping(
    courtId: string,
    bookingId: string
  ): Promise<void> {
    const existing = await this.databaseService.lightingActionLog.findFirst({
      where: {
        courtId,
        bookingId,
        action: LightingActionType.AUTO_ON,
        success: false,
        errorCode: 'missing_device_mapping',
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (existing && Date.now() - existing.createdAt.getTime() < 30 * 60 * 1000) {
      return;
    }

    await this.logAction({
      courtId,
      bookingId,
      source: LightingActionSource.SYSTEM,
      action: LightingActionType.AUTO_ON,
      success: false,
      attempts: 1,
      errorCode: 'missing_device_mapping',
      errorMessage: 'lighting.error.courtDeviceNotMapped',
      reason: 'auto_on_missing_mapping',
    });

    await this.notifyAdminsIncident(
      courtId,
      'Court has no lighting device mapping',
      `Court ${courtId} has lighting enabled but no Tuya device mapping.`
    );
  }

  private async hasSuccessfulAction(
    bookingId: string,
    action: LightingActionType
  ): Promise<boolean> {
    const count = await this.databaseService.lightingActionLog.count({
      where: {
        bookingId,
        action,
        success: true,
      },
    });

    return count > 0;
  }

  private async logAction(payload: {
    courtId: string;
    bookingId: string | null;
    requestedByUserId?: string;
    source: LightingActionSource;
    action: LightingActionType;
    reason?: string;
    success: boolean;
    attempts: number;
    errorCode?: string;
    errorMessage?: string;
  }): Promise<void> {
    await this.databaseService.lightingActionLog.create({
      data: {
        courtId: payload.courtId,
        bookingId: payload.bookingId,
        requestedByUserId: payload.requestedByUserId,
        source: payload.source,
        action: payload.action,
        reason: payload.reason,
        success: payload.success,
        attempts: payload.attempts,
        errorCode: payload.errorCode,
        errorMessage: payload.errorMessage,
      },
    });
  }

  private async notifyAdminsIncident(
    courtId: string,
    title: string,
    message: string,
    bookingId?: string
  ): Promise<void> {
    const admins = await this.databaseService.user.findMany({
      where: {
        role: Role.ADMIN,
        deletedAt: null,
      },
      select: {
        email: true,
        expoPushToken: true,
        notifyEmail: true,
        notifyPush: true,
      },
    });

    for (const admin of admins) {
      if (admin.notifyEmail !== false && admin.email) {
        await this.helperNotificationService.sendEmail({
          to: admin.email,
          subject: title,
          text: `${message}${bookingId ? ` Booking: ${bookingId}.` : ''}`,
          html: `<p>${message}</p><p>Court: ${courtId}</p>${
            bookingId ? `<p>Booking: ${bookingId}</p>` : ''
          }`,
        });
      }

      if (admin.notifyPush !== false && admin.expoPushToken) {
        await this.helperNotificationService.sendPush({
          to: admin.expoPushToken,
          title,
          body: `${message}${bookingId ? ` Booking ${bookingId}.` : ''}`,
          data: {
            courtId,
            bookingId: bookingId ?? null,
            type: 'lighting_incident',
          },
        });
      }
    }
  }

  private getRetryCount(): number {
    const value = this.configService.get<number>('tuya.retryCount');
    if (!value || Number.isNaN(value)) {
      return 3;
    }

    return Math.max(1, Math.min(5, value));
  }

  private getRetryDelayMs(): number {
    const value = this.configService.get<number>('tuya.retryBaseDelayMs');
    if (!value || Number.isNaN(value)) {
      return 1000;
    }

    return Math.max(200, value);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
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
}
