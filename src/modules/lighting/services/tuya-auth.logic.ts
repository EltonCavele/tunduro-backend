import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

import { getRefreshSignHeaders, getTokenSignHeaders } from './tuya.sign';

interface ITuyaTokenStore {
  accessToken: string | null;
  refreshToken: string | null;
  uid: string | null;
  expireTime: number;
}

@Injectable()
export class TuyaAuthService {
  private tokenStore: ITuyaTokenStore = {
    accessToken: null,
    refreshToken: null,
    uid: null,
    expireTime: 0,
  };

  private readonly tokenPath = '/v1.0/token?grant_type=1';

  constructor(private readonly configService: ConfigService) {}

  async getToken(): Promise<ITuyaTokenStore> {
    if (
      this.tokenStore.accessToken &&
      Date.now() < this.tokenStore.expireTime - 60_000
    ) {
      return this.tokenStore;
    }

    const clientId = this.configService.get<string>('tuya.clientId') || '';
    const clientSecret =
      this.configService.get<string>('tuya.clientSecret') || '';
    const baseUrl = this.configService.get<string>('tuya.baseUrl') || '';

    if (!clientId || !clientSecret || !baseUrl) {
      throw new Error('lighting.error.tuyaConfigMissing');
    }

    const headers = getTokenSignHeaders(clientId, clientSecret);

    const { data } = await axios.get(`${baseUrl}${this.tokenPath}`, {
      headers,
      timeout: this.getTimeoutMs(),
    });

    if (!data?.success) {
      throw new Error(data?.msg || data?.message || 'lighting.error.tuyaToken');
    }

    const result = data.result;
    this.tokenStore = {
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
      uid: result.uid,
      expireTime: Date.now() + (result.expire || 7200) * 1000,
    };

    return this.tokenStore;
  }

  async refreshAccessToken(): Promise<ITuyaTokenStore> {
    if (!this.tokenStore.refreshToken) {
      return this.getToken();
    }

    const clientId = this.configService.get<string>('tuya.clientId') || '';
    const clientSecret =
      this.configService.get<string>('tuya.clientSecret') || '';
    const baseUrl = this.configService.get<string>('tuya.baseUrl') || '';

    if (!clientId || !clientSecret || !baseUrl) {
      throw new Error('lighting.error.tuyaConfigMissing');
    }

    const refreshPath = `/v1.0/token/${this.tokenStore.refreshToken}`;
    const headers = getRefreshSignHeaders(clientId, clientSecret, refreshPath);

    try {
      const { data } = await axios.get(`${baseUrl}${refreshPath}`, {
        headers,
        timeout: this.getTimeoutMs(),
      });

      if (!data?.success) {
        this.reset();
        return this.getToken();
      }

      const result = data.result;
      this.tokenStore = {
        accessToken: result.access_token,
        refreshToken: result.refresh_token || this.tokenStore.refreshToken,
        uid: this.tokenStore.uid,
        expireTime: Date.now() + (result.expire || 7200) * 1000,
      };

      return this.tokenStore;
    } catch {
      this.reset();
      return this.getToken();
    }
  }

  getStoredToken(): ITuyaTokenStore {
    return this.tokenStore;
  }

  private reset(): void {
    this.tokenStore = {
      accessToken: null,
      refreshToken: null,
      uid: null,
      expireTime: 0,
    };
  }

  private getTimeoutMs(): number {
    const timeout = this.configService.get<number>('tuya.requestTimeoutMs');
    if (!timeout || Number.isNaN(timeout)) {
      return 10000;
    }
    return timeout;
  }
}
