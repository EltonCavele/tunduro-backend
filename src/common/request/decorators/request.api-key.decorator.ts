import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import { ApiKeyResponseDto } from 'src/modules/api-key/dtos/response/api-key.response';

export const AuthApiKey = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): ApiKeyResponseDto => {
    const request = ctx.switchToHttp().getRequest();
    return request.apiKey;
  }
);
