/**
 * Opcoes de traducao para o servico de mensagens.
 */
export interface ITranslateOptions {
    /**
     * Codigo do idioma (ex.: 'pt', 'en', 'fr').
     * Se nao for informado, usa o idioma do contexto atual da requisicao.
     */
    lang?: string;

    /**
     * Argumentos para interpolar na traducao.
     * Eles substituem os placeholders no texto traduzido.
     */
    args?: Record<string, any>;

    /**
     * Valor padrao retornado se a chave de traducao nao for encontrada.
     * Se nao for informado, usa a propria chave como padrao.
     */
    defaultValue?: string;
}

/**
 * Item de traducao em lote.
 */
export interface ITranslateItem {
    /**
     * Chave de traducao.
     */
    key: string;

    /**
     * Argumentos para interpolar.
     */
    args?: Record<string, any>;

    /**
     * Valor padrao para esta traducao especifica.
     */
    defaultValue?: string;
}

/**
 * Padroes comuns de chaves de traducao usados na aplicacao.
 */
export enum TranslationKey {
    // Mensagens de status HTTP
    HTTP_SUCCESS = 'http.success',
    HTTP_ERROR = 'http.error',

    // Mensagens de autenticacao
    AUTH_ERROR = 'auth.error',

    // Mensagens de validacao
    VALIDATION_ERROR = 'validation',

    // Mensagens genericas
    OPERATION_SUCCESS = 'common.operationSuccess',
    OPERATION_FAILED = 'common.operationFailed',
}
