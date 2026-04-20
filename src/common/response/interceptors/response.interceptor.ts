import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClassConstructor, plainToInstance } from 'class-transformer';
import { Observable, map } from 'rxjs';

import {
  DOC_RESPONSE_MESSAGE_META_KEY,
  DOC_RESPONSE_SERIALIZATION_META_KEY,
} from 'src/common/doc/constants/doc.constant';
import { MessageService } from 'src/common/message/services/message.service';

import { ApiGenericResponseDto } from '../dtos/response.generic.dto';

const stripUndefinedDeep = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(item => stripUndefinedDeep(item));
  }

  if (value instanceof Date) {
    return value;
  }

  if (
    value &&
    typeof value === 'object' &&
    'toNumber' in value &&
    typeof value.toNumber === 'function'
  ) {
    return value.toNumber();
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).reduce<Record<string, unknown>>((acc, [key, nested]) => {
      if (nested !== undefined) {
        acc[key] = stripUndefinedDeep(nested);
      }

      return acc;
    }, {});
  }

  return value;
};

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly messageService: MessageService
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map(responseBody => {
        const ctx = context.switchToHttp();
        const response = ctx.getResponse();
        const statusCode: number = response.statusCode;

        const classSerialization: ClassConstructor<any> = this.reflector.get(
          DOC_RESPONSE_SERIALIZATION_META_KEY,
          context.getHandler()
        );

        const messageKey = this.reflector.get(
          DOC_RESPONSE_MESSAGE_META_KEY,
          context.getHandler()
        );

        let data = responseBody;

        if (classSerialization) {
          const sanitizedResponseBody = stripUndefinedDeep(responseBody);

          if (
            sanitizedResponseBody &&
            typeof sanitizedResponseBody === 'object' &&
            'items' in sanitizedResponseBody &&
            'metadata' in sanitizedResponseBody &&
            Array.isArray(sanitizedResponseBody.items)
          ) {
            data = {
              ...sanitizedResponseBody,
              items: sanitizedResponseBody.items.map((item: any) =>
                plainToInstance(classSerialization, item, {
                  excludeExtraneousValues: true,
                })
              ),
            };
          } else {
            data = plainToInstance(classSerialization, sanitizedResponseBody, {
              excludeExtraneousValues: true,
            });
          }
        }

        // Translate response message
        let message: string;
        if (messageKey) {
          message = this.messageService.translate(messageKey);
        } else {
          // Use HTTP success message based on status code
          message = this.messageService.translateKey(
            ['http', 'success', statusCode],
            {
              defaultValue: 'Success',
            }
          );
        }

        // Handle ApiGenericResponseDto message translation
        if (
          data &&
          typeof data === 'object' &&
          'message' in data &&
          classSerialization?.name === ApiGenericResponseDto.name
        ) {
          data.message = this.messageService.translate(data.message, {
            defaultValue: data.message,
          });
        }

        return {
          statusCode,
          message,
          timestamp: new Date().toISOString(),
          data,
        };
      })
    );
  }
}
