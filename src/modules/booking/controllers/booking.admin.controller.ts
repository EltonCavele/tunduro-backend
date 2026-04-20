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
  BookingAdminCancelRequestDto,
  BookingAdminCreateRequestDto,
  BookingAdminQueryRequestDto,
} from '../dtos/request/booking.request';
import { BookingResponseDto } from '../dtos/response/booking.response';
import { BookingService } from '../services/booking.service';

@ApiTags('admin.booking')
@Controller({
  path: '/admin/booking',
  version: '1',
})
export class BookingAdminController {
  constructor(private readonly bookingService: BookingService) {}

  @Get()
  @AllowedRoles([Role.ADMIN])
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'List all bookings (admin)' })
  @DocPaginatedResponse({
    serialization: BookingResponseDto,
    messageKey: 'booking.success.list',
  })
  async listBookings(
    @Query() query: BookingAdminQueryRequestDto
  ): Promise<ApiPaginatedDataDto<BookingResponseDto>> {
    return this.bookingService.adminListBookings(query);
  }

  @Get(':id')
  @AllowedRoles([Role.ADMIN])
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Get booking details (admin)' })
  @DocResponse({
    serialization: BookingResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'booking.success.found',
  })
  async getBooking(
    @Param('id') id: string
  ): Promise<BookingResponseDto> {
    return this.bookingService.adminGetBooking(id);
  }

  @Post()
  @AllowedRoles([Role.ADMIN])
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Create booking for user (admin)' })
  @DocResponse({
    serialization: BookingResponseDto,
    httpStatus: HttpStatus.CREATED,
    messageKey: 'booking.success.created',
  })
  async createBooking(
    @AuthUser() admin: IAuthUser,
    @Body() dto: BookingAdminCreateRequestDto
  ): Promise<BookingResponseDto> {
    return this.bookingService.adminCreateBooking(admin, dto);
  }

  @Post(':id/cancel')
  @AllowedRoles([Role.ADMIN])
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Cancel booking (admin)' })
  @DocResponse({
    serialization: BookingResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'booking.success.cancelled',
  })
  async cancelBooking(
    @AuthUser() admin: IAuthUser,
    @Param('id') id: string,
    @Body() dto: BookingAdminCancelRequestDto
  ): Promise<BookingResponseDto> {
    return this.bookingService.adminCancelBooking(admin, id, dto);
  }

  @Post(':id/check-in')
  @AllowedRoles([Role.ADMIN])
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Check-in booking (admin)' })
  @DocResponse({
    serialization: BookingResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'booking.success.checkedIn',
  })
  async checkIn(
    @AuthUser() admin: IAuthUser,
    @Param('id') id: string
  ): Promise<BookingResponseDto> {
    return this.bookingService.adminCheckIn(admin, id);
  }
}