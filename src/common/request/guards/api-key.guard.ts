import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  constructor(private readonly configService: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = this.extractApiKeyFromHeader(request);
    const allowedApiKeys = (this.configService.get<string>('API_KEYS') || '')
      .split(',')
      .map(key => key.trim())
      .filter(Boolean);

    if (!apiKey || allowedApiKeys.length === 0) {
      throw new UnauthorizedException('auth.error.apiKeyRequired');
    }

    if (!allowedApiKeys.includes(apiKey)) {
      this.logger.warn('Rejected invalid API key');
      throw new UnauthorizedException('auth.error.invalidApiKey');
    }

    request.apiKey = {
      key: apiKey,
      valid: true,
    };

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
