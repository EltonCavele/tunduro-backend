import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const AuthApiKey = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): Record<string, any> => {
    const request = ctx.switchToHttp().getRequest();
    return request.apiKey;
  }
);
