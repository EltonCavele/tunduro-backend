import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { DocPaginatedResponse } from 'src/common/doc/decorators/doc.paginated.decorator';
import { DocResponse } from 'src/common/doc/decorators/doc.response.decorator';
import { AllowedRoles } from 'src/common/request/decorators/request.role.decorator';
import { AuthUser } from 'src/common/request/decorators/request.user.decorator';
import { IAuthUser } from 'src/common/request/interfaces/request.interface';
import { ApiPaginatedDataDto } from 'src/common/response/dtos/response.paginated.dto';

import {
  LightingAuditQueryRequestDto,
  LightingCommandsRequestDto,
  LightingConfigUpdateRequestDto,
  LightingOverrideRequestDto,
  LightingTestSwitchRequestDto,
} from '../dtos/request/lighting.request';
import {
  LightingActionLogResponseDto,
  LightingCommandDispatchResponseDto,
  LightingConfigResponseDto,
  LightingDeviceStatusResponseDto,
} from '../dtos/response/lighting.response';
import { LightingAdminService } from '../services/lighting.admin.service';

@ApiTags('admin.lighting')
@Controller({
  path: '/admin',
  version: '1',
})
@AllowedRoles([Role.ADMIN])
@ApiBearerAuth('accessToken')
export class LightingAdminController {
  constructor(private readonly lightingAdminService: LightingAdminService) {}

  @Get('/courts/:courtId/lighting-config')
  @ApiOperation({ summary: 'Get court lighting configuration' })
  @DocResponse({
    serialization: LightingConfigResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'lighting.success.configFetched',
  })
  async getCourtLightingConfig(
    @Param('courtId') courtId: string
  ): Promise<LightingConfigResponseDto> {
    return this.lightingAdminService.getCourtLightingConfig(courtId);
  }

  @Put('/courts/:courtId/lighting-config')
  @ApiOperation({ summary: 'Update court lighting configuration' })
  @DocResponse({
    serialization: LightingConfigResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'lighting.success.configUpdated',
  })
  async updateCourtLightingConfig(
    @Param('courtId') courtId: string,
    @Body() payload: LightingConfigUpdateRequestDto
  ): Promise<LightingConfigResponseDto> {
    return this.lightingAdminService.updateCourtLightingConfig(courtId, payload);
  }

  @Post('/courts/:courtId/lights/override')
  @ApiOperation({ summary: 'Manually override court lights' })
  @DocResponse({
    serialization: LightingCommandDispatchResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'lighting.success.overrideApplied',
  })
  async manualOverride(
    @AuthUser() user: IAuthUser,
    @Param('courtId') courtId: string,
    @Body() payload: LightingOverrideRequestDto
  ): Promise<LightingCommandDispatchResponseDto> {
    return this.lightingAdminService.manualOverride(
      courtId,
      user.userId,
      payload.action,
      payload.reason
    );
  }

  @Post('/courts/:courtId/lights/commands')
  @ApiOperation({ summary: 'Dispatch raw allowed Tuya commands for court' })
  @DocResponse({
    serialization: LightingCommandDispatchResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'lighting.success.commandSent',
  })
  async sendCommands(
    @AuthUser() user: IAuthUser,
    @Param('courtId') courtId: string,
    @Body() payload: LightingCommandsRequestDto
  ): Promise<LightingCommandDispatchResponseDto> {
    return this.lightingAdminService.sendCommands(
      courtId,
      user.userId,
      payload.commands,
      payload.reason
    );
  }

  @Get('/courts/:courtId/lights/device-status')
  @ApiOperation({ summary: 'Get live/last known device status by court' })
  @DocResponse({
    serialization: LightingDeviceStatusResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'lighting.success.deviceStatus',
  })
  async getDeviceStatus(
    @Param('courtId') courtId: string
  ): Promise<LightingDeviceStatusResponseDto> {
    return this.lightingAdminService.getDeviceStatus(courtId, true);
  }

  @Post('/courts/:courtId/lights/test-switch')
  @ApiOperation({ summary: 'Test switch command for court light device' })
  @DocResponse({
    serialization: LightingCommandDispatchResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'lighting.success.testSwitch',
  })
  async testSwitch(
    @AuthUser() user: IAuthUser,
    @Param('courtId') courtId: string,
    @Body() payload: LightingTestSwitchRequestDto
  ): Promise<LightingCommandDispatchResponseDto> {
    return this.lightingAdminService.testSwitch(
      courtId,
      user.userId,
      payload.on ?? true
    );
  }

  @Get('/lights/audit')
  @ApiOperation({ summary: 'List lighting audit action logs' })
  @DocPaginatedResponse({
    serialization: LightingActionLogResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'lighting.success.auditList',
  })
  async listAuditLogs(
    @Query() query: LightingAuditQueryRequestDto
  ): Promise<ApiPaginatedDataDto<LightingActionLogResponseDto>> {
    return this.lightingAdminService.listAuditLogs(query);
  }
}
