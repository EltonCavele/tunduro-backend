import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { DocResponse } from 'src/common/doc/decorators/doc.response.decorator';
import { AllowedRoles } from 'src/common/request/decorators/request.role.decorator';

import { ReportsService } from '../services/reports.service';
import { AnalyticsQueryDto } from '../dtos/request/analytics.request';
import { DateRangeQueryDto } from '../dtos/request/report.request';
import { AnalyticsResponseDto } from '../dtos/response/analytics.response';
import {
  GeneralReportResponseDto,
  PaymentReportResponseDto,
  ScheduleReportResponseDto,
} from '../dtos/response/report.response';

@ApiTags('admin.reports')
@Controller({
  path: '/admin',
  version: '1',
})
export class ReportsAdminController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('analytics')
  @AllowedRoles([Role.ADMIN])
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Get analytics dashboard data' })
  @DocResponse({
    serialization: AnalyticsResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'reports.success.analytics',
  })
  async getAnalytics(
    @Query() query: AnalyticsQueryDto
  ): Promise<AnalyticsResponseDto> {
    return this.reportsService.getAnalytics(query);
  }

  @Get('reports/general')
  @AllowedRoles([Role.ADMIN])
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Get general report' })
  @DocResponse({
    serialization: GeneralReportResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'reports.success.general',
  })
  async getGeneralReport(
    @Query() query: DateRangeQueryDto
  ): Promise<GeneralReportResponseDto> {
    return this.reportsService.getGeneralReport(query);
  }

  @Get('reports/schedule')
  @AllowedRoles([Role.ADMIN])
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Get schedule report' })
  @DocResponse({
    serialization: ScheduleReportResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'reports.success.schedule',
  })
  async getScheduleReport(
    @Query() query: DateRangeQueryDto
  ): Promise<ScheduleReportResponseDto> {
    return this.reportsService.getScheduleReport(query);
  }

  @Get('reports/payment')
  @AllowedRoles([Role.ADMIN])
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Get payment report' })
  @DocResponse({
    serialization: PaymentReportResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'reports.success.payment',
  })
  async getPaymentReport(
    @Query() query: DateRangeQueryDto
  ): Promise<PaymentReportResponseDto> {
    return this.reportsService.getPaymentReport(query);
  }
}
