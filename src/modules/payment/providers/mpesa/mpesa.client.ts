import { constants, publicEncrypt } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';

export interface MpesaC2BRequest {
  input_TransactionReference: string;
  input_CustomerMSISDN: string;
  input_Amount: string;
  input_ThirdPartyReference: string;
  input_ServiceProviderCode: string;
}

export interface MpesaC2BResponse {
  output_ResponseCode: string;
  output_ResponseDesc: string;
  output_TransactionID?: string;
  output_ConversationID?: string;
  output_ThirdPartyReference?: string;
}

@Injectable()
export class MpesaClient {
  private readonly logger = new Logger(MpesaClient.name);

  constructor(private readonly configService: ConfigService) {}

  async c2bPayment(request: MpesaC2BRequest): Promise<MpesaC2BResponse> {
    const host = this.configService.get<string>('payment.mpesa.host') ?? '';
    const port =
      this.configService.get<number>('payment.mpesa.c2bPort') ?? 18352;
    const origin =
      this.configService.get<string>('payment.mpesa.origin') ?? '';
    const timeoutMs =
      this.configService.get<number>('payment.mpesa.requestTimeoutMs') ??
      110000;

    if (!host) {
      throw new Error('payment.error.gatewayUnavailable');
    }

    const bearer = this.buildBearerToken();
    const url = `https://${host}:${port}/ipg/v1x/c2bPayment/singleStage/`;

    try {
      const { data } = await axios.post<MpesaC2BResponse>(url, request, {
        timeout: timeoutMs,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearer}`,
          Origin: origin,
        },
        validateStatus: () => true,
      });

      if (!data || typeof data !== 'object' || !data.output_ResponseCode) {
        throw new Error('payment.error.gatewayUnavailable');
      }

      return data;
    } catch (error) {
      if (error instanceof AxiosError) {
        const data = error.response?.data as MpesaC2BResponse | undefined;
        if (data?.output_ResponseCode) {
          return data;
        }

        this.logger.error(
          `M-Pesa C2B request failed: ${error.code ?? error.message}`
        );

        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
          throw new Error('payment.error.timeout');
        }
      } else {
        this.logger.error(
          `M-Pesa C2B unexpected error: ${(error as Error)?.message}`
        );
      }

      throw new Error('payment.error.gatewayUnavailable');
    }
  }

  /**
   * Builds the Bearer token for the M-Pesa Vodacom Mozambique gateway:
   * RSA-encrypt the API key with the merchant public key (PKCS#1 v1.5)
   * and base64-encode the result. Token must be regenerated per request.
   */
  private buildBearerToken(): string {
    const apiKey = this.configService.get<string>('payment.mpesa.apiKey') ?? '';
    const publicKeyB64 =
      this.configService.get<string>('payment.mpesa.publicKey') ?? '';

    if (!apiKey || !publicKeyB64) {
      throw new Error('payment.error.gatewayUnavailable');
    }

    const pem = this.toPem(publicKeyB64);
    const encrypted = publicEncrypt(
      {
        key: pem,
        padding: constants.RSA_PKCS1_PADDING,
      },
      Buffer.from(apiKey, 'utf-8')
    );

    return encrypted.toString('base64');
  }

  private toPem(base64Key: string): string {
    const cleaned = base64Key
      .replace(/-----BEGIN PUBLIC KEY-----/g, '')
      .replace(/-----END PUBLIC KEY-----/g, '')
      .replace(/\s+/g, '');
    const lines = cleaned.match(/.{1,64}/g) ?? [];
    return `-----BEGIN PUBLIC KEY-----\n${lines.join(
      '\n'
    )}\n-----END PUBLIC KEY-----\n`;
  }
}
