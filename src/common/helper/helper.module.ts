import { Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { MessageModule } from '../message/message.module';

import { HelperEncryptionService } from './services/helper.encryption.service';
import { HelperPaginationService } from './services/helper.pagination.service';
import { HelperPaymentService } from './services/helper.payment.service';
import { HelperPhoneService } from './services/helper.phone.service';
import { HelperNotificationService } from './services/helper.notification.service';
import { HelperPrismaQueryBuilderService } from './services/helper.query.builder.service';
import { HelperQueryService } from './services/helper.query.service';

@Module({
  imports: [MessageModule],
  providers: [
    JwtService,
    HelperEncryptionService,
    HelperPaginationService,
    HelperPaymentService,
    HelperPhoneService,
    HelperNotificationService,
    HelperPrismaQueryBuilderService,
    HelperQueryService,
  ],
  exports: [
    HelperEncryptionService,
    HelperPaginationService,
    HelperPaymentService,
    HelperPhoneService,
    HelperNotificationService,
    HelperPrismaQueryBuilderService,
    HelperQueryService,
  ],
})
export class HelperModule {}
