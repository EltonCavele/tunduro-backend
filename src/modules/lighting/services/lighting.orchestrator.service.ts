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
}
