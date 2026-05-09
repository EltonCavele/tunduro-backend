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

import { DocPaginatedResponse } from 'src/common/doc/decorators/doc.paginated.decorator';
import { DocResponse } from 'src/common/doc/decorators/doc.response.decorator';
import { AuthUser } from 'src/common/request/decorators/request.user.decorator';
import { IAuthUser } from 'src/common/request/interfaces/request.interface';
import { ApiPaginatedDataDto } from 'src/common/response/dtos/response.paginated.dto';

import {
  BookingCancelRequestDto,
  BookingCreateRequestDto,
  BookingInvitationRespondDto,
  BookingInvitationTokenRespondDto,
  BookingMeQueryRequestDto,
} from '../dtos/request/booking.request';
import { BookingCheckoutSessionResponseDto } from '../dtos/response/booking.checkout.response';
import {
  BookingInvitationPreviewResponseDto,
  BookingInvitationRespondResponseDto,
} from '../dtos/response/booking.invitation.response';
import { BookingResponseDto } from '../dtos/response/booking.response';
import { BookingService } from '../services/booking.service';

@ApiTags('public.bookings')
@Controller({
  version: '1',
})
export class BookingPublicController {
  constructor(private readonly bookingService: BookingService) {}

  @Post('/bookings')
  @ApiBearerAuth('accessToken')
  @ApiOperation({
    summary:
      'Iniciar checkout: cria BookingCheckoutSession OPEN e dispara o débito M-Pesa em background',
    description:
      'Não cria Booking. Use GET /bookings/checkout/:sessionId para fazer polling ao estado. Quando status === COMPLETED, bookingId é populado.',
  })
  @DocResponse({
    serialization: BookingCheckoutSessionResponseDto,
    httpStatus: HttpStatus.CREATED,
    messageKey: 'booking.success.checkoutStarted',
  })
  async createBooking(
    @AuthUser() user: IAuthUser,
    @Body() payload: BookingCreateRequestDto
  ): Promise<BookingCheckoutSessionResponseDto> {
    return this.bookingService.createBooking(user, payload);
  }

  @Get('/bookings/checkout/:sessionId')
  @ApiBearerAuth('accessToken')
  @ApiOperation({
    summary: 'Consultar uma BookingCheckoutSession (polling do estado)',
  })
  @DocResponse({
    serialization: BookingCheckoutSessionResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'booking.success.checkoutDetails',
  })
  async getCheckoutSession(
    @AuthUser() user: IAuthUser,
    @Param('sessionId') sessionId: string
  ): Promise<BookingCheckoutSessionResponseDto> {
    return this.bookingService.getCheckoutSession(user, sessionId);
  }

  @Get('/bookings/me')
  @ApiBearerAuth('accessToken')
  @DocPaginatedResponse({
    serialization: BookingResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'booking.success.list',
  })
  async getMyBookings(
    @AuthUser() user: IAuthUser,
    @Query() query: BookingMeQueryRequestDto
  ): Promise<ApiPaginatedDataDto<BookingResponseDto>> {
    return this.bookingService.getMyBookings(user.userId, query);
  }

  @Get('/bookings/:id')
  @ApiBearerAuth('accessToken')
  @DocResponse({
    serialization: BookingResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'booking.success.details',
  })
  async getBooking(
    @AuthUser() user: IAuthUser,
    @Param('id') bookingId: string
  ): Promise<BookingResponseDto> {
    return this.bookingService.getBookingForUser(user, bookingId);
  }

  @Post('/bookings/:id/cancel')
  @ApiBearerAuth('accessToken')
  @DocResponse({
    serialization: BookingResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'booking.success.cancelled',
  })
  async cancelBooking(
    @AuthUser() user: IAuthUser,
    @Param('id') bookingId: string,
    @Body() payload: BookingCancelRequestDto
  ): Promise<BookingResponseDto> {
    return this.bookingService.cancelBooking(user, bookingId, payload);
  }

  @Post('/bookings/:id/checkin')
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Iniciar (Check-in) booking' })
  @DocResponse({
    serialization: BookingResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'booking.success.checkedIn',
  })
  async checkIn(
    @AuthUser() user: IAuthUser,
    @Param('id') bookingId: string
  ): Promise<BookingResponseDto> {
    return this.bookingService.checkIn(user, bookingId);
  }
}
