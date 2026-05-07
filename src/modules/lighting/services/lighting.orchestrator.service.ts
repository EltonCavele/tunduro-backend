import { Injectable, Logger } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { DatabaseService } from 'src/common/database/services/database.service';
import { TuyaClientService } from './tuya-client.service';

@Injectable()
export class LightingOrchestratorService {
  private readonly logger = new Logger(LightingOrchestratorService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly tuyaClient: TuyaClientService
  ) {}

  async activateByCheckIn(bookingId: string, actorUserId?: string): Promise<void> {
    const booking = await this.db.booking.findUnique({
      where: { id: bookingId },
      include: {
        court: true,
      },
    });

    if (!booking || !booking.court) {
      this.logger.warn(
        `activateByCheckIn skipped: booking/court not found (bookingId=${bookingId})`
      );
      return;
    }

    if (booking.status !== BookingStatus.CONFIRMED) {
      this.logger.warn(
        `activateByCheckIn skipped: booking is not confirmed (bookingId=${bookingId}, status=${booking.status})`
      );
      return;
    }

    if (
      !booking.court.hasLighting ||
      !Array.isArray(booking.court.lightingDeviceId) ||
      booking.court.lightingDeviceId.length === 0
    ) {
      return;
    }

    const seconds = this.calculateCountdownSeconds(
      booking.endAt,
      booking.court.lightingOffBufferMin
    );

    for (const deviceId of booking.court.lightingDeviceId) {
      try {
        await this.tuyaClient.sendSwitch(deviceId, true);
        await this.tuyaClient.sendCountdown(deviceId, seconds);
        this.logger.log(
          `Lighting activated by check-in (bookingId=${bookingId}, courtId=${booking.court.id}, deviceId=${deviceId}, seconds=${seconds}, actorUserId=${actorUserId ?? 'unknown'})`
        );
      } catch (error: any) {
        this.logger.error(
          `Failed to activate lighting by check-in (bookingId=${bookingId}, courtId=${booking.court.id}, deviceId=${deviceId}): ${
            error?.message ?? 'unknown error'
          }`
        );
      }
    }
  }

  async deactivateNow(bookingId: string, reason: string): Promise<void> {
    const booking = await this.db.booking.findUnique({
      where: { id: bookingId },
      include: {
        court: true,
      },
    });

    if (!booking || !booking.court) {
      this.logger.warn(
        `deactivateNow skipped: booking/court not found (bookingId=${bookingId})`
      );
      return;
    }

    if (
      !booking.court.hasLighting ||
      !Array.isArray(booking.court.lightingDeviceId) ||
      booking.court.lightingDeviceId.length === 0
    ) {
      return;
    }

    for (const deviceId of booking.court.lightingDeviceId) {
      try {
        await this.tuyaClient.sendCountdown(deviceId, 0);
        await this.tuyaClient.sendSwitch(deviceId, false);
        this.logger.log(
          `Lighting deactivated immediately (bookingId=${bookingId}, courtId=${booking.court.id}, deviceId=${deviceId}, reason=${reason})`
        );
      } catch (error: any) {
        this.logger.error(
          `Failed to deactivate lighting immediately (bookingId=${bookingId}, courtId=${booking.court.id}, deviceId=${deviceId}, reason=${reason}): ${
            error?.message ?? 'unknown error'
          }`
        );
      }
    }
  }

  async processAutomaticLighting(): Promise<number> {
    const now = new Date();
    const twoMinutesAgo = new Date(now.getTime() - 2 * 60000);

    // 1. Encontrar todos os campos que possuem iluminação configurada
    const courtsWithLighting = await this.db.court.findMany({
      where: {
        hasLighting: true,
        lightingDeviceId: { isEmpty: false },
      },
    });

    let processedCount = 0;

    for (const court of courtsWithLighting) {
      // 2. Verificar se existe um booking CONFIRMADO ativo no momento para este campo
      const activeBooking = await this.db.booking.findFirst({
        where: {
          courtId: court.id,
          status: BookingStatus.CONFIRMED,
          startAt: { lte: now },
          endAt: { gt: now },
        },
      });

      if (activeBooking) {
        // LIGA AS LUZES
        for (const deviceId of court.lightingDeviceId) {
          try {
            await this.tuyaClient.sendSwitch(deviceId, true);
            processedCount++;
          } catch (error) {
            this.logger.error(
              `Failed to turn ON light ${deviceId} for court ${court.id}: ${error.message}`
            );
          }
        }
      } else {
        // 3. Se não há booking ativo, verificar se um booking terminou recentemente (nos últimos 2 minutos)
        const recentlyEndedBooking = await this.db.booking.findFirst({
          where: {
            courtId: court.id,
            status: BookingStatus.CONFIRMED,
            endAt: {
              lte: now,
              gt: twoMinutesAgo,
            },
          },
        });

        if (recentlyEndedBooking) {
          // DESLIGA AS LUZES
          for (const deviceId of court.lightingDeviceId) {
            try {
              await this.tuyaClient.sendSwitch(deviceId, false);
              processedCount++;
            } catch (error) {
              this.logger.error(
                `Failed to turn OFF light ${deviceId} for court ${court.id}: ${error.message}`
              );
            }
          }
        }
      }
    }

    return processedCount;
  }

  private calculateCountdownSeconds(
    bookingEndAt: Date,
    offBufferMin?: number | null
  ): number {
    const nowMs = Date.now();
    const endMs = new Date(bookingEndAt).getTime();
    const remainingSec = Math.max(0, Math.floor((endMs - nowMs) / 1000));
    const bufferSec = Math.max(0, Math.trunc(Number(offBufferMin ?? 0) * 60));
    const withBuffer = remainingSec + bufferSec;
    return Math.max(0, Math.min(86400, withBuffer));
  }
}
