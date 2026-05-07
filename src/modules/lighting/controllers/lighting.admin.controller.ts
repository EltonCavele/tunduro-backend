import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { DatabaseService } from 'src/common/database/services/database.service';
import { DocResponse } from 'src/common/doc/decorators/doc.response.decorator';
import { AllowedRoles } from 'src/common/request/decorators/request.role.decorator';

import {
  LightingAdminCountdownRequestDto,
  LightingDeviceStatusQueryDto,
  LightingAdminSwitchRequestDto,
} from '../dtos/request/lighting.request';
import {
  LightingAdminDeviceActionResponseDto,
  LightingDeviceLiveStatusResponseDto,
} from '../dtos/response/lighting.response';
import { TuyaClientService } from '../services/tuya-client.service';

@ApiTags('admin.lighting')
@Controller({
  path: '/admin/lighting',
  version: '1',
})
export class LightingAdminController {
  constructor(
    private readonly db: DatabaseService,
    private readonly tuyaClient: TuyaClientService
  ) {}

  @Get('device-status')
  @AllowedRoles([Role.ADMIN])
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Get live status for one Tuya device' })
  @DocResponse({
    serialization: LightingDeviceLiveStatusResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'lighting.success.deviceStatus',
  })
  async getDeviceStatus(
    @Query() query: LightingDeviceStatusQueryDto
  ): Promise<LightingDeviceLiveStatusResponseDto> {
    const rawStatus = await this.tuyaClient.getDeviceStatus(query.deviceId);
    const items = Array.isArray(rawStatus) ? rawStatus : [];

    const pick = (code: string): unknown =>
      items.find(item => item?.code === code)?.value;

    const toNumber = (value: unknown): number | null => {
      if (typeof value === 'number') return Number.isFinite(value) ? value : null;
      if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      }
      return null;
    };

    const switchValue = pick('switch') ?? pick('switch_1');
    const isOn = typeof switchValue === 'boolean' ? switchValue : null;

    return {
      deviceId: query.deviceId,
      isOn,
      countdownSeconds: toNumber(pick('countdown_1')),
      onlineState:
        typeof pick('online_state') === 'string'
          ? (pick('online_state') as string)
          : null,
      current: toNumber(pick('cur_current')),
      power: toNumber(pick('cur_power')),
      voltage: toNumber(pick('cur_voltage')),
      raw: items.map(item => ({
        code: `${item?.code ?? ''}`,
        value: item?.value,
      })),
    };
  }

  @Post('switch')
  @AllowedRoles([Role.ADMIN])
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Switch ON/OFF lighting devices manually' })
  @DocResponse({
    serialization: LightingAdminDeviceActionResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'lighting.success.commandSent',
  })
  async switchDevices(
    @Body() payload: LightingAdminSwitchRequestDto
  ): Promise<LightingAdminDeviceActionResponseDto> {
    const deviceIds = await this.resolveDeviceIds(payload.courtId, payload.deviceIds);
    const processedDeviceIds: string[] = [];
    const failedDeviceIds: string[] = [];

    for (const deviceId of deviceIds) {
      try {
        await this.tuyaClient.sendSwitch(deviceId, payload.on);
        processedDeviceIds.push(deviceId);
      } catch {
        failedDeviceIds.push(deviceId);
      }
    }

    return {
      success: failedDeviceIds.length === 0,
      processedDeviceIds,
      failedDeviceIds,
    };
  }

  @Post('countdown')
  @AllowedRoles([Role.ADMIN])
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Set countdown for lighting devices' })
  @DocResponse({
    serialization: LightingAdminDeviceActionResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'lighting.success.commandSent',
  })
  async setCountdown(
    @Body() payload: LightingAdminCountdownRequestDto
  ): Promise<LightingAdminDeviceActionResponseDto> {
    const deviceIds = await this.resolveDeviceIds(payload.courtId, payload.deviceIds);
    const processedDeviceIds: string[] = [];
    const failedDeviceIds: string[] = [];

    for (const deviceId of deviceIds) {
      try {
        await this.tuyaClient.sendCountdown(deviceId, payload.seconds);
        processedDeviceIds.push(deviceId);
      } catch {
        failedDeviceIds.push(deviceId);
      }
    }

    return {
      success: failedDeviceIds.length === 0,
      processedDeviceIds,
      failedDeviceIds,
    };
  }

  private async resolveDeviceIds(
    courtId?: string,
    deviceIds?: string[]
  ): Promise<string[]> {
    if (Array.isArray(deviceIds) && deviceIds.length > 0) {
      return deviceIds;
    }

    if (!courtId) {
      throw new HttpException(
        'lighting.error.courtDeviceNotMapped',
        HttpStatus.BAD_REQUEST
      );
    }

    const court = await this.db.court.findUnique({
      where: { id: courtId },
      select: {
        id: true,
        hasLighting: true,
        lightingDeviceId: true,
      },
    });

    if (!court) {
      throw new HttpException('court.error.notFound', HttpStatus.NOT_FOUND);
    }

    if (!court.hasLighting) {
      throw new HttpException(
        'lighting.error.courtHasNoLightingHardware',
        HttpStatus.BAD_REQUEST
      );
    }

    if (!Array.isArray(court.lightingDeviceId) || court.lightingDeviceId.length === 0) {
      throw new HttpException(
        'lighting.error.courtDeviceNotMapped',
        HttpStatus.BAD_REQUEST
      );
    }

    return court.lightingDeviceId;
  }
}

