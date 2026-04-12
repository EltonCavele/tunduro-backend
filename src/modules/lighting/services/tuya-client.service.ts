import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

import { TuyaAuthService } from './tuya-auth.service';
import { getRequestSign } from './tuya.sign';

export interface ITuyaCommandPayload {
  code: string;
  value: unknown;
}

@Injectable()
export class TuyaClientService {
  private readonly logger = new Logger(TuyaClientService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly tuyaAuthService: TuyaAuthService
  ) {}

  async getDeviceStatus(deviceId: string): Promise<any> {
    return this.request('GET', `/v1.0/devices/${deviceId}/status`);
  }

  async getDeviceSpecifications(deviceId: string): Promise<any> {
    return this.request('GET', `/v1.0/devices/${deviceId}/specifications`);
  }

  async getDevice(deviceId: string): Promise<any> {
    return this.request('GET', `/v1.0/devices/${deviceId}`);
  }

  async sendDeviceCommand(
    deviceId: string,
    commands: ITuyaCommandPayload[]
  ): Promise<unknown> {
    return this.request('POST', `/v1.0/devices/${deviceId}/commands`, {
      commands,
    });
  }

  async sendSwitch(deviceId: string, on: boolean): Promise<unknown> {
    const status = await this.getDeviceStatus(deviceId);
    const switchDp = Array.isArray(status)
      ? status.find(
          (dp: any) =>
            dp.code.startsWith('switch') && typeof dp.value === 'boolean'
        )
      : null;
    const code = switchDp ? switchDp.code : 'switch_1';
    return this.sendDeviceCommand(deviceId, [{ code, value: !!on }]);
  }

  async sendCommands(
    deviceId: string,
    commands: ITuyaCommandPayload[]
  ): Promise<unknown> {
    return this.sendDeviceCommand(deviceId, commands);
  }

  async sendCountdown(deviceId: string, seconds: number): Promise<unknown> {
    const s = Math.min(86400, Math.max(0, Math.trunc(Number(seconds))));
    const status = await this.getDeviceStatus(deviceId);
    const countdownDp = Array.isArray(status)
      ? status.find((dp: any) => dp.code.startsWith('countdown'))
      : null;
    const code = countdownDp ? countdownDp.code : 'countdown_1';
    return this.sendDeviceCommand(deviceId, [{ code, value: s }]);
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    body: Record<string, unknown> | null = null
  ): Promise<any> {
    const clientId = this.configService.get<string>('tuya.clientId') || '';
    const clientSecret =
      this.configService.get<string>('tuya.clientSecret') || '';
    const baseUrl = this.configService.get<string>('tuya.baseUrl') || '';

    if (!clientId || !clientSecret || !baseUrl) {
      throw new Error('lighting.error.tuyaConfigMissing');
    }

    const { accessToken } = await this.tuyaAuthService.getToken();
    if (!accessToken) {
      throw new Error('lighting.error.tuyaTokenUnavailable');
    }

    const requestBody = body ?? {};
    const signed = getRequestSign(
      clientId,
      clientSecret,
      accessToken,
      path,
      method,
      requestBody
    );

    const { path: requestPath, ...headers } = signed;

    try {
      const { data } = await axios({
        method,
        baseURL: baseUrl,
        url: requestPath,
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        data: Object.keys(requestBody).length ? requestBody : undefined,
      });

      if (!data?.success) {
        throw new Error(data?.msg || data?.message || 'lighting.error.tuyaApi');
      }

      return data.result;
    } catch (error: any) {
      const message =
        error?.response?.data?.msg ||
        error?.response?.data?.message ||
        error?.message ||
        'lighting.error.tuyaApi';

      this.logger.error(`Tuya request failed: ${message}`);
      throw new Error(message);
    }
  }
}
