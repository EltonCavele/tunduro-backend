import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
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
  BookingMeQueryRequestDto,
} from '../dtos/request/booking.request';
import {
  BookingCheckoutSessionResponseDto,
  BookingResponseDto,
} from '../dtos/response/booking.response';
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
    summary: 'Iniciar criação de booking (Gera link de pagamento)',
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

  @Post('/integrations/paysuite/webhook')
  @HttpCode(HttpStatus.OK)
  async handlePaysuiteWebhook(@Req() request: any): Promise<{ received: true }> {
    await this.bookingService.handlePaysuiteWebhook(request.body, request.body);
    return { received: true };
  }

  @Post('/bookings/:id/payments/mock/confirm')
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Manual confirm booking payment' })
  @DocResponse({
    serialization: BookingResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'booking.success.paymentConfirmed',
  })
  async confirmPayment(
    @AuthUser() user: IAuthUser,
    @Param('id') bookingId: string
  ): Promise<BookingResponseDto> {
    return this.bookingService.confirmBookingPayment(user, bookingId);
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
