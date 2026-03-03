import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

import { CommonModule } from 'src/common/common.module';
import { ApiKeyModule } from 'src/modules/api-key/api-key.module';
import { ApplicationModule } from 'src/modules/application/application.module';
import { AppEnvironmentModule } from 'src/modules/app-environment/app-environment.module';
import { BillingModule } from 'src/modules/billing/billing.module';
import { CredentialModule } from 'src/modules/credential/credential.module';
import { PaymentProviderModule } from 'src/modules/payment-provider/payment-provider.module';
import { UserModule } from 'src/modules/user/user.module';
import { WorkerModule } from 'src/workers/worker.module';

import { HealthController } from './controllers/health.controller';

@Module({
  imports: [
    // Shared Common Services
    CommonModule,

    // Background Processing
    WorkerModule,

    // Health Check
    TerminusModule,

    // Feature Modules
    UserModule,

  ],
  controllers: [HealthController],
})
export class AppModule {}
