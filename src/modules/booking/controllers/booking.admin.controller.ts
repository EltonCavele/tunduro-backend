import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
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
  BookingAdminCancelRequestDto,
  BookingAdminCreateRequestDto,
  BookingAdminQueryRequestDto,
} from '../dtos/request/booking.request';
import { BookingCheckoutSessionResponseDto } from '../dtos/response/booking.checkout.response';
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
  @AllowedRoles([Role.ADMIN, Role.EMPLOYEE])
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'List all bookings (admin)' })
  @DocPaginatedResponse({
    serialization: BookingResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'booking.success.list',
  })
  async listBookings(
    @Query() query: BookingAdminQueryRequestDto
  ): Promise<ApiPaginatedDataDto<BookingResponseDto>> {
    return this.bookingService.adminListBookings(query);
  }

  @Get(':id')
  @AllowedRoles([Role.ADMIN, Role.EMPLOYEE])
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Get booking details (admin)' })
  @DocResponse({
    serialization: BookingResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'booking.success.found',
  })
  async getBooking(@Param('id') id: string): Promise<BookingResponseDto> {
    return this.bookingService.adminGetBooking(id);
  }

  @Post()
  @AllowedRoles([Role.ADMIN, Role.EMPLOYEE])
  @ApiBearerAuth('accessToken')
  @ApiOperation({
    summary:
      'Iniciar checkout para utilizador (admin): cria BookingCheckoutSession OPEN e prepara pagamento em background',
    description:
      'Não cria Booking. Use GET /admin/booking/checkout/:sessionId para fazer polling. Quando status === COMPLETED, bookingId é populado.',
  })
  @DocResponse({
    serialization: BookingCheckoutSessionResponseDto,
    httpStatus: HttpStatus.CREATED,
    messageKey: 'booking.success.checkoutStarted',
  })
  async createBooking(
    @AuthUser() admin: IAuthUser,
    @Body() dto: BookingAdminCreateRequestDto
  ): Promise<BookingCheckoutSessionResponseDto> {
    return this.bookingService.adminCreateBooking(admin, dto);
  }

  @Get('/checkout/:sessionId')
  @AllowedRoles([Role.ADMIN, Role.EMPLOYEE])
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Consultar BookingCheckoutSession (admin)' })
  @DocResponse({
    serialization: BookingCheckoutSessionResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'booking.success.checkoutDetails',
  })
  async getCheckoutSession(
    @Param('sessionId') sessionId: string
  ): Promise<BookingCheckoutSessionResponseDto> {
    return this.bookingService.adminGetCheckoutSession(sessionId);
  }

  @Post(':id/cancel')
  @AllowedRoles([Role.ADMIN, Role.EMPLOYEE])
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
  @AllowedRoles([Role.ADMIN, Role.EMPLOYEE])
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
