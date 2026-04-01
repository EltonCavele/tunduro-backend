import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { DocPaginatedResponse } from 'src/common/doc/decorators/doc.paginated.decorator';
import { DocResponse } from 'src/common/doc/decorators/doc.response.decorator';
import { AuthUser } from 'src/common/request/decorators/request.user.decorator';
import { IAuthUser } from 'src/common/request/interfaces/request.interface';
import { ApiPaginatedDataDto } from 'src/common/response/dtos/response.paginated.dto';

import {
  BookingCancelRequestDto,
  BookingCheckoutCreateRequestDto,
  BookingCheckInRequestDto,
  BookingCreateRequestDto,
  BookingInvitationRespondRequestDto,
  BookingInviteRequestDto,
  BookingMeQueryRequestDto,
  BookingRescheduleRequestDto,
  CourtRatingCreateRequestDto,
  CourtRatingUpdateRequestDto,
  WaitlistCreateRequestDto,
} from '../dtos/request/booking.request';
import {
  BookingCheckoutSessionResponseDto,
  BookingCheckInQrResponseDto,
  BookingResponseDto,
  CourtRatingResponseDto,
  WaitlistResponseDto,
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
  @ApiOperation({ summary: 'Create booking' })
  @DocResponse({
    serialization: BookingResponseDto,
    httpStatus: HttpStatus.CREATED,
    messageKey: 'booking.success.created',
  })
  async createBooking(
    @AuthUser() user: IAuthUser,
    @Body() payload: BookingCreateRequestDto
  ): Promise<BookingResponseDto> {
    return this.bookingService.createBooking(user, payload);
  }

  @Post('/bookings/checkout')
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Start hosted payment checkout for booking' })
  @DocResponse({
    serialization: BookingCheckoutSessionResponseDto,
    httpStatus: HttpStatus.CREATED,
    messageKey: 'booking.success.checkoutStarted',
  })
  async startBookingCheckout(
    @AuthUser() user: IAuthUser,
    @Body() payload: BookingCheckoutCreateRequestDto
  ): Promise<BookingCheckoutSessionResponseDto> {
    return this.bookingService.startBookingCheckout(user, payload);
  }

  @Get('/bookings/checkout/:id')
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Get booking checkout session details' })
  @DocResponse({
    serialization: BookingCheckoutSessionResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'booking.success.checkoutDetails',
  })
  async getBookingCheckoutSession(
    @AuthUser() user: IAuthUser,
    @Param('id') checkoutSessionId: string
  ): Promise<BookingCheckoutSessionResponseDto> {
    return this.bookingService.getBookingCheckoutSession(
      user,
      checkoutSessionId
    );
  }

  @Post('/bookings/checkout/:id/refresh')
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Refresh booking checkout session from PaySuite' })
  @DocResponse({
    serialization: BookingCheckoutSessionResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'booking.success.checkoutRefreshed',
  })
  async refreshBookingCheckoutSession(
    @AuthUser() user: IAuthUser,
    @Param('id') checkoutSessionId: string
  ): Promise<BookingCheckoutSessionResponseDto> {
    return this.bookingService.refreshBookingCheckoutSession(
      user,
      checkoutSessionId
    );
  }

  @Post('/integrations/paysuite/webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle PaySuite webhook events' })
  async handlePaysuiteWebhook(
    @Req() request: any,
    @Headers('x-webhook-signature') signature?: string
  ): Promise<{ received: true }> {
    await this.bookingService.handlePaysuiteWebhook(
      request.rawBody?.toString?.('utf8') ?? JSON.stringify(request.body ?? {}),
      request.body,
      signature
    );

    return {
      received: true,
    };
  }

  @Get('/integrations/paysuite/return')
  @ApiOperation({
    summary: 'Handle PaySuite browser return and redirect to app',
  })
  async handlePaysuiteReturn(
    @Query('sessionId') sessionId: string,
    @Query('status') status: string | undefined,
    @Res() response: any
  ): Promise<void> {
    const redirectUrl = this.bookingService.buildMobileCheckoutReturnUrl(
      sessionId,
      status
    );

    response.redirect(redirectUrl);
  }

  @Post('/bookings/:id/payments/mock/confirm')
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Confirm mock payment for booking' })
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
  @ApiOperation({ summary: 'List current user bookings' })
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
  @ApiOperation({ summary: 'Get booking details with status timeline' })
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
  @ApiOperation({ summary: 'Cancel booking with policy enforcement' })
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

  @Post('/bookings/:id/reschedule')
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Reschedule booking with policy enforcement' })
  @DocResponse({
    serialization: BookingResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'booking.success.rescheduled',
  })
  async rescheduleBooking(
    @AuthUser() user: IAuthUser,
    @Param('id') bookingId: string,
    @Body() payload: BookingRescheduleRequestDto
  ): Promise<BookingResponseDto> {
    return this.bookingService.rescheduleBooking(user, bookingId, payload);
  }

  @Post('/bookings/:id/invitations')
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Invite users/emails to booking' })
  @DocResponse({
    serialization: BookingResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'booking.success.invitationSent',
  })
  async inviteParticipants(
    @AuthUser() user: IAuthUser,
    @Param('id') bookingId: string,
    @Body() payload: BookingInviteRequestDto
  ): Promise<BookingResponseDto> {
    return this.bookingService.inviteParticipants(user, bookingId, payload);
  }

  @Post('/bookings/:id/invitations/:invitationId/resend')
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Resend invitation' })
  @DocResponse({
    serialization: BookingResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'booking.success.invitationResent',
  })
  async resendInvitation(
    @AuthUser() user: IAuthUser,
    @Param('id') bookingId: string,
    @Param('invitationId') invitationId: string
  ): Promise<BookingResponseDto> {
    return this.bookingService.resendInvitation(user, bookingId, invitationId);
  }

  @Delete('/bookings/:id/invitations/:invitationId')
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Revoke invitation' })
  @DocResponse({
    serialization: BookingResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'booking.success.invitationRemoved',
  })
  async removeInvitation(
    @AuthUser() user: IAuthUser,
    @Param('id') bookingId: string,
    @Param('invitationId') invitationId: string
  ): Promise<BookingResponseDto> {
    return this.bookingService.removeInvitation(user, bookingId, invitationId);
  }

  @Post('/invitations/:token/respond')
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Respond to invitation token' })
  @DocResponse({
    serialization: BookingResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'booking.success.invitationResponded',
  })
  async respondInvitation(
    @AuthUser() user: IAuthUser,
    @Param('token') token: string,
    @Body() payload: BookingInvitationRespondRequestDto
  ): Promise<BookingResponseDto> {
    return this.bookingService.respondInvitation(user, token, payload);
  }

  @Post('/bookings/:id/participants/:participantUserId/remove')
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Remove participant from booking' })
  @DocResponse({
    serialization: BookingResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'booking.success.participantRemoved',
  })
  async removeParticipant(
    @AuthUser() user: IAuthUser,
    @Param('id') bookingId: string,
    @Param('participantUserId') participantUserId: string
  ): Promise<BookingResponseDto> {
    return this.bookingService.removeParticipant(
      user,
      bookingId,
      participantUserId
    );
  }

  @Post('/waitlist')
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Join waitlist for specific court slot' })
  @DocResponse({
    serialization: WaitlistResponseDto,
    httpStatus: HttpStatus.CREATED,
    messageKey: 'waitlist.success.created',
  })
  async createWaitlistEntry(
    @AuthUser() user: IAuthUser,
    @Body() payload: WaitlistCreateRequestDto
  ): Promise<WaitlistResponseDto> {
    return this.bookingService.createWaitlistEntry(user, payload);
  }

  @Get('/waitlist/me')
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'List my waitlist entries' })
  @DocResponse({
    serialization: WaitlistResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'waitlist.success.list',
  })
  async getMyWaitlist(
    @AuthUser() user: IAuthUser
  ): Promise<WaitlistResponseDto[]> {
    return this.bookingService.getMyWaitlist(user.userId);
  }

  @Post('/waitlist/:id/accept-offer')
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Accept waitlist offer and claim pending booking' })
  @DocResponse({
    serialization: BookingResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'waitlist.success.offerAccepted',
  })
  async acceptWaitlistOffer(
    @AuthUser() user: IAuthUser,
    @Param('id') waitlistId: string
  ): Promise<BookingResponseDto> {
    return this.bookingService.acceptWaitlistOffer(user, waitlistId);
  }

  @Get('/bookings/:id/checkin-qr')
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Get check-in QR payload/token' })
  @DocResponse({
    serialization: BookingCheckInQrResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'booking.success.checkInQr',
  })
  async getCheckInQr(
    @AuthUser() user: IAuthUser,
    @Param('id') bookingId: string
  ): Promise<BookingCheckInQrResponseDto> {
    return this.bookingService.getCheckInQr(user, bookingId);
  }

  @Post('/bookings/:id/checkin')
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Check-in booking session' })
  @DocResponse({
    serialization: BookingResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'booking.success.checkedIn',
  })
  async checkIn(
    @AuthUser() user: IAuthUser,
    @Param('id') bookingId: string,
    @Body() payload: BookingCheckInRequestDto
  ): Promise<BookingResponseDto> {
    return this.bookingService.checkIn(user, bookingId, payload);
  }

  @Post('/bookings/:id/ratings')
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Create court rating for completed booking' })
  @DocResponse({
    serialization: CourtRatingResponseDto,
    httpStatus: HttpStatus.CREATED,
    messageKey: 'rating.success.created',
  })
  async createRating(
    @AuthUser() user: IAuthUser,
    @Param('id') bookingId: string,
    @Body() payload: CourtRatingCreateRequestDto
  ): Promise<CourtRatingResponseDto> {
    return this.bookingService.createRating(user, bookingId, payload);
  }

  @Put('/bookings/:id/ratings/me')
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Update own rating within 24h window' })
  @DocResponse({
    serialization: CourtRatingResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'rating.success.updated',
  })
  async updateRating(
    @AuthUser() user: IAuthUser,
    @Param('id') bookingId: string,
    @Body() payload: CourtRatingUpdateRequestDto
  ): Promise<CourtRatingResponseDto> {
    return this.bookingService.updateRating(user, bookingId, payload);
  }
}
