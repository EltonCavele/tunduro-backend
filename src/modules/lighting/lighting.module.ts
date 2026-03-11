import { Module } from '@nestjs/common';

import { DatabaseModule } from 'src/common/database/database.module';
import { HelperModule } from 'src/common/helper/helper.module';

import { LightingAdminController } from './controllers/lighting.admin.controller';
import { LightingAdminService } from './services/lighting.admin.service';
import { LightingOrchestratorService } from './services/lighting.orchestrator.service';
import { LightingPolicyService } from './services/lighting.policy.service';
import { TuyaAuthService } from './services/tuya-auth.service';
import { TuyaClientService } from './services/tuya-client.service';

@Module({
  imports: [DatabaseModule, HelperModule],
  controllers: [LightingAdminController],
  providers: [
    TuyaAuthService,
    TuyaClientService,
    LightingPolicyService,
    LightingOrchestratorService,
    LightingAdminService,
  ],
  exports: [LightingOrchestratorService],
})
export class LightingModule {}
