declare module 'mpesa-node-api' {
  interface MpesaConfig {
    baseUrl: string;
    apiKey: string;
    publicKey: string;
    origin: string;
    serviceProviderCode: string;
  }

  interface MpesaResponse {
    output_ResponseCode: string;
    output_ResponseDesc: string;
    output_TransactionID?: string;
    output_ConversationID?: string;
  }

  type MpesaError = MpesaResponse;

  function initializeApi(configParams: MpesaConfig): void;
  function initiate_c2b(
    amount: number,
    msisdn: string,
    transaction_ref: string,
    thirdparty_ref: string
  ): Promise<MpesaResponse>;

  function initiate_b2c(
    amount: number,
    msisdn: string,
    transaction_ref: string,
    thirdparty_ref: string
  ): Promise<MpesaResponse>;

  export {
    initializeApi,
    initiate_c2b,
    initiate_b2c,
    MpesaConfig,
    MpesaResponse,
    MpesaError,
  };
}

declare type UsageFeature = 'work';
