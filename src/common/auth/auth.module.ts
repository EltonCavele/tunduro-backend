import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

import { DatabaseModule } from '../database/database.module';
import { HelperModule } from '../helper/helper.module';

import { AuthPublicController } from './controllers/auth.public.controller';
import { JwtAccessStrategy } from './providers/access-jwt.strategy';
import { JwtRefreshStrategy } from './providers/refresh-jwt.strategy';
import { AuthService } from './services/auth.service';

@Module({
  controllers: [AuthPublicController],
  imports: [HelperModule, PassportModule, DatabaseModule],
  providers: [AuthService, JwtAccessStrategy, JwtRefreshStrategy],
  exports: [AuthService, JwtAccessStrategy, JwtRefreshStrategy],
})
export class AuthModule {}
