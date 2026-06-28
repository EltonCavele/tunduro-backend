import { Injectable } from '@nestjs/common';
import { I18nContext, I18nService } from 'nestjs-i18n';

import {
    ITranslateItem,
    ITranslateOptions,
} from '../interfaces/message.interface';

/**
 * MessageService - Servico central para todas as traducoes i18n.
 *
 * Este servico oferece uma API simples para traduzir mensagens na aplicacao.
 * Ele resolve automaticamente o idioma a partir do contexto da requisicao e
 * disponibiliza metodos de traducao com tipagem.
 *
 * @example
 * // Traducao simples
 * const message = messageService.translate('user.created');
 *
 * @example
 * // Traducao com argumentos
 * const message = messageService.translate('user.welcome', {
 *   args: { name: 'John' }
 * });
 *
 * @example
 * // Traducao com idioma especifico
 * const message = messageService.translate('user.created', {
 *   lang: 'pt'
 * });
 *
 * @example
 * // Traducoes em lote
 * const messages = messageService.translateBulk([
 *   { key: 'user.created' },
 *   { key: 'user.updated', args: { name: 'John' } }
 * ]);
 */
@Injectable()
export class MessageService {
    private readonly fallbackLanguage = 'pt';

    constructor(private readonly i18nService: I18nService) {}

    /**
     * Traduz uma unica chave de mensagem.
     *
     * @param key - Chave de traducao (ex.: 'user.created', 'http.error.404')
     * @param options - Opcoes de traducao (idioma, argumentos, valor padrao)
     * @returns Mensagem traduzida
     */
    translate(key: string, options?: ITranslateOptions): string {
        const lang = this.resolveLanguage(options?.lang);
        const args = options?.args || {};
        const defaultValue = options?.defaultValue || key;

        const translationOptions = {
            lang,
            args,
            defaultValue,
        };

        return this.i18nService.translate(key, translationOptions) as string;
    }

    /**
     * Traduz varias mensagens em uma unica chamada.
     * Mais eficiente do que chamar translate() varias vezes.
     *
     * @param items - Lista de itens de traducao
     * @param lang - Sobrescrita opcional de idioma para todos os itens
     * @returns Lista de mensagens traduzidas na mesma ordem
     *
     * @example
     * const messages = messageService.translateBulk([
     *   { key: 'user.created' },
     *   { key: 'user.updated', args: { name: 'John' } },
     *   { key: 'user.deleted', defaultValue: 'Usuario removido' }
     * ], 'pt');
     */
    translateBulk(items: ITranslateItem[], lang?: string): string[] {
        const resolvedLang = this.resolveLanguage(lang);

        return items.map(item =>
            this.translate(item.key, {
                lang: resolvedLang,
                args: item.args,
                defaultValue: item.defaultValue,
            })
        );
    }

    /**
     * Monta e traduz uma chave com partes dinamicas.
     * Util para chaves estruturadas como 'http.error.404'.
     *
     * @param parts - Partes da chave que serao unidas por pontos
     * @param options - Opcoes de traducao
     * @returns Mensagem traduzida
     *
     * @example
     * // Traduz 'http.error.404'
     * const message = messageService.translateKey(['http', 'error', '404']);
     *
     * @example
     * // Traduz 'auth.error.invalidCredentials'
     * const message = messageService.translateKey(
     *   ['auth', 'error', 'invalidCredentials'],
     *   { args: { attempts: 3 } }
     * );
     */
    translateKey(
        parts: (string | number)[],
        options?: ITranslateOptions
    ): string {
        const key = parts.join('.');
        return this.translate(key, options);
    }

    /**
     * Obtem o idioma atual a partir do contexto i18n.
     * Usa o idioma padrao se o contexto nao estiver disponivel.
     *
     * @returns Codigo do idioma atual
     */
    getCurrentLanguage(): string {
        try {
            const i18nContext = I18nContext.current();
            return i18nContext?.lang || this.fallbackLanguage;
        } catch {
            return this.fallbackLanguage;
        }
    }

    /**
     * Resolve o idioma a partir do valor informado ou do contexto.
     * Prioridade: idioma informado > idioma do contexto > idioma padrao.
     *
     * @param lang - Sobrescrita opcional de idioma
     * @returns Codigo de idioma resolvido
     */
    private resolveLanguage(lang?: string): string {
        if (lang) {
            return lang;
        }

        return this.getCurrentLanguage();
    }
}
