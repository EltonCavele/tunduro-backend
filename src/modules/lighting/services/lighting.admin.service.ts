import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { LightingActionSource, Prisma } from '@prisma/client';

import { DatabaseService } from 'src/common/database/services/database.service';
import { ApiPaginatedDataDto } from 'src/common/response/dtos/response.paginated.dto';
import {
  LIGHTING_HH_MM_REGEX,
  LightingAuditQueryRequestDto,
  LightingCommandItemRequestDto,
  LightingConfigUpdateRequestDto,
} from 'src/modules/lighting/dtos/request/lighting.request';
import {
  LightingActionLogResponseDto,
  LightingCommandDispatchResponseDto,
  LightingConfigResponseDto,
  LightingDeviceStatusResponseDto,
} from 'src/modules/lighting/dtos/response/lighting.response';

import { LightingOrchestratorService } from './lighting.orchestrator.service';

@Injectable()
export class LightingAdminService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly lightingOrchestratorService: LightingOrchestratorService
  ) {}

  async getCourtLightingConfig(
    courtId: string
  ): Promise<LightingConfigResponseDto> {
    const court = await this.databaseService.court.findFirst({
      where: {
        id: courtId,
        deletedAt: null,
      },
    });

    if (!court) {
      throw new HttpException('court.error.notFound', HttpStatus.NOT_FOUND);
    }

    return this.serializeLightingConfig(court);
  }

  async updateCourtLightingConfig(
    courtId: string,
    payload: LightingConfigUpdateRequestDto
  ): Promise<LightingConfigResponseDto> {
    const court = await this.databaseService.court.findFirst({
      where: {
        id: courtId,
        deletedAt: null,
      },
    });

    if (!court) {
      throw new HttpException('court.error.notFound', HttpStatus.NOT_FOUND);
    }

    if (
      payload.quietHoursStart &&
      !LIGHTING_HH_MM_REGEX.test(payload.quietHoursStart)
    ) {
      throw new HttpException(
        'lighting.error.invalidQuietHoursStart',
        HttpStatus.BAD_REQUEST
      );
    }

    if (
      payload.quietHoursEnd &&
      !LIGHTING_HH_MM_REGEX.test(payload.quietHoursEnd)
    ) {
      throw new HttpException(
        'lighting.error.invalidQuietHoursEnd',
        HttpStatus.BAD_REQUEST
      );
    }

    if (payload.lightingEnabled === true && !court.hasLighting) {
      throw new HttpException(
        'lighting.error.courtHasNoLightingHardware',
        HttpStatus.BAD_REQUEST
      );
    }

    const updated = await this.databaseService.court.update({
      where: {
        id: courtId,
      },
      data: {
        ...(payload.lightingDeviceId !== undefined
          ? {
              lightingDeviceId:
                payload.lightingDeviceId === null
                  ? null
                  : payload.lightingDeviceId.trim() || null,
            }
          : {}),
        ...(payload.lightingEnabled !== undefined
          ? {
              lightingEnabled: payload.lightingEnabled,
            }
          : {}),
        ...(payload.lightingOnOffsetMin !== undefined
          ? {
              lightingOnOffsetMin: payload.lightingOnOffsetMin,
            }
          : {}),
        ...(payload.lightingOffBufferMin !== undefined
          ? {
              lightingOffBufferMin: payload.lightingOffBufferMin,
            }
          : {}),
        ...(payload.quietHoursEnabled !== undefined
          ? {
              quietHoursEnabled: payload.quietHoursEnabled,
            }
          : {}),
        ...(payload.quietHoursStart !== undefined
          ? {
              quietHoursStart: payload.quietHoursStart,
            }
          : {}),
        ...(payload.quietHoursEnd !== undefined
          ? {
              quietHoursEnd: payload.quietHoursEnd,
            }
          : {}),
        ...(payload.quietHoursHardBlock !== undefined
          ? {
              quietHoursHardBlock: payload.quietHoursHardBlock,
            }
          : {}),
      },
    });

    return this.serializeLightingConfig(updated);
  }

  async listAuditLogs(
    query: LightingAuditQueryRequestDto
  ): Promise<ApiPaginatedDataDto<LightingActionLogResponseDto>> {
    const page = this.safePage(query.page);
    const pageSize = this.safePageSize(query.pageSize, 20);

    const where: Prisma.LightingActionLogWhereInput = {
      ...(query.courtId ? { courtId: query.courtId } : {}),
      ...(query.bookingId ? { bookingId: query.bookingId } : {}),
      ...(query.source ? { source: query.source as LightingActionSource } : {}),
      ...(typeof query.success === 'boolean' ? { success: query.success } : {}),
    };

    const [totalItems, items] = await Promise.all([
      this.databaseService.lightingActionLog.count({ where }),
      this.databaseService.lightingActionLog.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: {
          createdAt: 'desc',
        },
      }),
    ]);

    return {
      items: items.map(item => ({
        id: item.id,
        courtId: item.courtId,
        bookingId: item.bookingId,
        requestedByUserId: item.requestedByUserId,
        source: item.source,
        action: item.action,
        reason: item.reason,
        success: item.success,
        attempts: item.attempts,
        errorCode: item.errorCode,
        errorMessage: item.errorMessage,
        createdAt: item.createdAt,
      })),
      metadata: {
        currentPage: page,
        itemsPerPage: pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / pageSize),
      },
    };
  }

  async manualOverride(
    courtId: string,
    adminUserId: string,
    action: 'ON' | 'OFF',
    reason: string
  ): Promise<LightingCommandDispatchResponseDto> {
    return this.lightingOrchestratorService.manualOverride(
      courtId,
      adminUserId,
      action,
      reason
    );
  }

  async sendCommands(
    courtId: string,
    adminUserId: string,
    commands: LightingCommandItemRequestDto[],
    reason?: string
  ): Promise<LightingCommandDispatchResponseDto> {
    return this.lightingOrchestratorService.sendManualCommands(
      courtId,
      adminUserId,
      commands,
      reason
    );
  }

  async testSwitch(
    courtId: string,
    adminUserId: string,
    on: boolean
  ): Promise<LightingCommandDispatchResponseDto> {
    return this.lightingOrchestratorService.manualOverride(
      courtId,
      adminUserId,
      on ? 'ON' : 'OFF',
      'test_switch'
    );
  }

  async getDeviceStatus(
    courtId: string,
    refresh = true
  ): Promise<LightingDeviceStatusResponseDto> {
    return this.lightingOrchestratorService.getCourtDeviceStatus(
      courtId,
      refresh
    );
  }

  private serializeLightingConfig(court: any): LightingConfigResponseDto {
    return {
      courtId: court.id,
      lightingDeviceId: court.lightingDeviceId ?? null,
      hasLighting: court.hasLighting,
      lightingEnabled: court.lightingEnabled,
      lightingOnOffsetMin: court.lightingOnOffsetMin,
      lightingOffBufferMin: court.lightingOffBufferMin,
      quietHoursEnabled: court.quietHoursEnabled,
      quietHoursStart: court.quietHoursStart,
      quietHoursEnd: court.quietHoursEnd,
      quietHoursHardBlock: court.quietHoursHardBlock,
    };
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
}
