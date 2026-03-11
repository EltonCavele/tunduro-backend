import { Body, Controller, Get, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { DocPaginatedResponse } from 'src/common/doc/decorators/doc.paginated.decorator';
import { DocResponse } from 'src/common/doc/decorators/doc.response.decorator';
import { AllowedRoles } from 'src/common/request/decorators/request.role.decorator';
import { AuthUser } from 'src/common/request/decorators/request.user.decorator';
import { IAuthUser } from 'src/common/request/interfaces/request.interface';
import { ApiPaginatedDataDto } from 'src/common/response/dtos/response.paginated.dto';

import {
  OvertimeAdminDeclineRequestDto,
  OvertimeAdminListQueryRequestDto,
} from '../dtos/request/booking.request';
import { OvertimeRequestResponseDto } from '../dtos/response/booking.response';
import { BookingOvertimeService } from '../services/booking.overtime.service';

@ApiTags('admin.bookings.overtime')
@Controller({
  path: '/admin/overtime-requests',
  version: '1',
})
@AllowedRoles([Role.ADMIN])
@ApiBearerAuth('accessToken')
export class BookingAdminController {
  constructor(private readonly bookingOvertimeService: BookingOvertimeService) {}

  @Get()
  @ApiOperation({ summary: 'List overtime requests for admins' })
  @DocPaginatedResponse({
    serialization: OvertimeRequestResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'booking.success.overtimeList',
  })
  async listOvertimeRequests(
    @Query() query: OvertimeAdminListQueryRequestDto
  ): Promise<ApiPaginatedDataDto<OvertimeRequestResponseDto>> {
    return this.bookingOvertimeService.listAdminRequests(query);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Approve overtime request and create payment adjustment' })
  @DocResponse({
    serialization: OvertimeRequestResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'booking.success.overtimeApproved',
  })
  async approveOvertimeRequest(
    @AuthUser() user: IAuthUser,
    @Param('id') overtimeRequestId: string
  ): Promise<OvertimeRequestResponseDto> {
    return this.bookingOvertimeService.approveRequest(user, overtimeRequestId);
  }

  @Post(':id/decline')
  @ApiOperation({ summary: 'Decline overtime request' })
  @DocResponse({
    serialization: OvertimeRequestResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'booking.success.overtimeDeclined',
  })
  async declineOvertimeRequest(
    @AuthUser() user: IAuthUser,
    @Param('id') overtimeRequestId: string,
    @Body() payload: OvertimeAdminDeclineRequestDto
  ): Promise<OvertimeRequestResponseDto> {
    return this.bookingOvertimeService.declineRequest(
      user,
      overtimeRequestId,
      payload
    );
  }
}
