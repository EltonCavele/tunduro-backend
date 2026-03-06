import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { DatabaseService } from 'src/common/database/services/database.service';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh'
) {
  constructor(
    private readonly configService: ConfigService,
    private readonly databaseService: DatabaseService
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('auth.refreshToken.secret'),
    });
  }

  async validate(payload: Record<string, string | number>) {
    const userId = String(payload.userId ?? '');
    if (!userId) {
      throw new UnauthorizedException('auth.error.refreshTokenUnauthorized');
    }

    const user = await this.databaseService.user.findUnique({
      where: { id: userId },
    });
    if (!user || user.deletedAt) {
      throw new UnauthorizedException('auth.error.refreshTokenUnauthorized');
    }

    const tokenVersion = Number((user as any).tokenVersion ?? 0);
    const payloadTokenVersion = Number(payload.tokenVersion ?? 0);
    if (payloadTokenVersion !== tokenVersion) {
      throw new UnauthorizedException('auth.error.refreshTokenUnauthorized');
    }

    return {
      userId: user.id,
      role: user.role,
      tokenVersion,
    };
  }
}
