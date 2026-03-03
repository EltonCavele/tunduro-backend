import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { ApiKeyService } from 'src/modules/api-key/services/api-key.service';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private apiKeyService: ApiKeyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = this.extractApiKeyFromHeader(request);

    if (!apiKey) {
      throw new UnauthorizedException('auth.error.apiKeyRequired');
    }

    const validatedApiKey = await this.apiKeyService.validateApiKey(apiKey);

    if (!validatedApiKey) {
      throw new UnauthorizedException('auth.error.invalidApiKey');
    }

    await this.apiKeyService.updateLastUsed(validatedApiKey.id);

    request.apiKey = validatedApiKey;

    return true;
  }

  private extractApiKeyFromHeader(request: any): string | null {
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      return null;
    }

    if (authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    return authHeader;
  }
}
