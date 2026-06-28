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
  BookingExtendRequestDto,
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

  @Get('/bookings/invitations/:token')
  @ApiBearerAuth('accessToken')
  @ApiOperation({
    summary: 'Pré-visualizar um convite a partir do token',
    description:
      'Devolve detalhes do convite e da reserva. Útil para o app mobile mostrar o ecrã de aceitar/recusar antes de o user confirmar.',
  })
  @DocResponse({
    serialization: BookingInvitationPreviewResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'booking.success.details',
  })
  async getInvitationByToken(
    @AuthUser() user: IAuthUser,
    @Param('token') token: string
  ): Promise<BookingInvitationPreviewResponseDto> {
    return this.bookingService.getInvitationByToken(
      user,
      token
    ) as unknown as BookingInvitationPreviewResponseDto;
  }

  @Post('/bookings/invitations/respond')
  @ApiBearerAuth('accessToken')
  @ApiOperation({
    summary: 'Responder a um convite via token (email/deep-link)',
    description:
      'Para users que receberam o convite por email ou deep-link. Valida que o user autenticado corresponde ao destinatário (id ou email do convite).',
  })
  @DocResponse({
    serialization: BookingInvitationRespondResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'booking.success.invitationResponded',
  })
  async respondToInvitationByToken(
    @AuthUser() user: IAuthUser,
    @Body() payload: BookingInvitationTokenRespondDto
  ): Promise<BookingInvitationRespondResponseDto> {
    return this.bookingService.respondToInvitationByToken(
      user,
      payload.token,
      payload.accept
    );
  }

  @Post('/bookings/:id/invitation/respond')
  @ApiBearerAuth('accessToken')
  @ApiOperation({
    summary: 'Responder ao convite de uma reserva (user já é participant)',
    description:
      'Aceita ou recusa um convite quando o user já tem um BookingParticipant INVITED para o booking.',
  })
  @DocResponse({
    serialization: BookingInvitationRespondResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'booking.success.invitationResponded',
  })
  async respondToInvitation(
    @AuthUser() user: IAuthUser,
    @Param('id') bookingId: string,
    @Body() payload: BookingInvitationRespondDto
  ): Promise<BookingInvitationRespondResponseDto> {
    return this.bookingService.respondToInvitationAsUser(
      user.userId,
      bookingId,
      payload.accept
    );
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

  @Post(':id/extend')
  @ApiBearerAuth('accessToken')
  @ApiOperation({
    summary: 'Prolongar reserva em curso (+1 hora)',
    description:
      'Disponível 10 minutos antes do fim até 10 minutos depois, se a hora seguinte estiver livre. Cria checkout M-Pesa e devolve sessionId para polling.',
  })
  @DocResponse({
    serialization: BookingCheckoutSessionResponseDto,
    httpStatus: HttpStatus.CREATED,
    messageKey: 'booking.success.extended',
  })
  async extendBooking(
    @AuthUser() user: IAuthUser,
    @Param('id') bookingId: string,
    @Body() payload: BookingExtendRequestDto
  ): Promise<BookingCheckoutSessionResponseDto> {
    return this.bookingService.startExtensionCheckout(user, bookingId, payload);
  }
}
