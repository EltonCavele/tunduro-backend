import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosRequestConfig } from 'axios';

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

  async sendDeviceCommand(
    deviceId: string,
    commands: ITuyaCommandPayload[]
  ): Promise<unknown> {
    return this.request('POST', `/v1.0/devices/${deviceId}/commands`, {
      commands,
    });
  }

  async sendSwitch(deviceId: string, on: boolean): Promise<unknown> {
    return this.sendDeviceCommand(deviceId, [{ code: 'switch_1', value: !!on }]);
  }

  async getDevice(deviceId: string): Promise<any> {
    return this.request('GET', `/v1.0/devices/${deviceId}`);
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    retried = false
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

    const signed = getRequestSign(
      clientId,
      clientSecret,
      accessToken,
      method,
      path,
      body
    );

    const { path: requestPath, ...headers } = signed;

    const requestConfig: AxiosRequestConfig = {
      method,
      baseURL: baseUrl,
      url: requestPath,
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      timeout: this.getTimeoutMs(),
      data: method === 'GET' ? undefined : body,
    };

    try {
      const { data } = await axios(requestConfig);

      if (!data?.success) {
        throw new Error(data?.msg || data?.message || 'lighting.error.tuyaApi');
      }

      return data.result;
    } catch (error: any) {
      const statusCode = error?.response?.status;
      if ((statusCode === 401 || statusCode === 403) && !retried) {
        await this.tuyaAuthService.refreshAccessToken();
        return this.request(method, path, body, true);
      }

      const message =
        error?.response?.data?.msg ||
        error?.response?.data?.message ||
        error?.message ||
        'lighting.error.tuyaApi';

      this.logger.error(`Tuya request failed: ${message}`);
      throw new Error(message);
    }
  }

  private getTimeoutMs(): number {
    const timeout = this.configService.get<number>('tuya.requestTimeoutMs');
    if (!timeout || Number.isNaN(timeout)) {
      return 10000;
    }
    return timeout;
  }
}
