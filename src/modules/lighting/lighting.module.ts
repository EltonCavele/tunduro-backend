import { Module } from '@nestjs/common';

import { DatabaseModule } from 'src/common/database/database.module';
import { HelperModule } from 'src/common/helper/helper.module';

import { TuyaAuthService } from './services/tuya-auth.service';
import { TuyaClientService } from './services/tuya-client.service';
import { LightingOrchestratorService } from './services/lighting.orchestrator.service';

@Module({
  imports: [DatabaseModule, HelperModule],
  controllers: [],
  providers: [TuyaAuthService, TuyaClientService, LightingOrchestratorService],
  exports: [LightingOrchestratorService, TuyaClientService],
})
export class LightingModule {}
