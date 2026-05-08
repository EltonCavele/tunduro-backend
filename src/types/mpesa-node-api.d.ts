declare module 'mpesa-node-api' {
  export interface MpesaApiConfig {
    baseUrl: string;
    apiKey: string;
    publicKey: string;
    origin: string;
    serviceProviderCode: string | number;
  }

  export interface MpesaResponse {
    output_ConversationID: string;
    output_ResponseCode: string;
    output_ResponseDesc: string;
    output_ThirdPartyReference: string;
    output_TransactionID?: string;
  }

  export function initializeApi(config: MpesaApiConfig): void;

  export function initiate_c2b(
    amount: number | string,
    msisdn: string | number,
    transactionRef: string,
    thirdPartyRef: string
  ): Promise<MpesaResponse>;

  export function initiate_b2c(
    amount: number | string,
    msisdn: string | number,
    transactionRef: string,
    thirdPartyRef: string
  ): Promise<MpesaResponse>;
}
