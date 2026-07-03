import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { DocResponse } from 'src/common/doc/decorators/doc.response.decorator';
import { AuthUser } from 'src/common/request/decorators/request.user.decorator';
import { IAuthUser } from 'src/common/request/interfaces/request.interface';

import { WalletSelfTopUpRequestDto } from '../dtos/request/wallet.request';
import {
  WalletResponseDto,
  WalletTopUpSessionResponseDto,
} from '../dtos/response/wallet.response';
import { WalletService } from '../services/wallet.service';

@ApiTags('public.wallet')
@Controller({
  path: '/wallet',
  version: '1',
})
export class WalletPublicController {
  constructor(private readonly walletService: WalletService) {}

  @Get('me')
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Get current user club balance' })
  @DocResponse({
    serialization: WalletResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'wallet.success.details',
  })
  async getMyWallet(@AuthUser() user: IAuthUser): Promise<WalletResponseDto> {
    return this.walletService.getWallet(user.userId);
  }

  @Post('me/top-ups')
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Top up current user club balance' })
  @DocResponse({
    serialization: WalletTopUpSessionResponseDto,
    httpStatus: HttpStatus.CREATED,
    messageKey: 'wallet.success.topUp',
  })
  async topUpMyWallet(
    @AuthUser() user: IAuthUser,
    @Body() dto: WalletSelfTopUpRequestDto
  ): Promise<WalletTopUpSessionResponseDto> {
    return this.walletService.selfTopUp(user.userId, dto);
  }

  @Get('me/top-ups/:sessionId')
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Get current user wallet top-up session' })
  @DocResponse({
    serialization: WalletTopUpSessionResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'wallet.success.topUp',
  })
  async getMyTopUpSession(
    @AuthUser() user: IAuthUser,
    @Param('sessionId') sessionId: string
  ): Promise<WalletTopUpSessionResponseDto> {
    return this.walletService.getTopUpSession(user.userId, sessionId);
  }

  @Post('me/top-ups/:sessionId/refresh')
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Refresh current user wallet top-up session' })
  @DocResponse({
    serialization: WalletTopUpSessionResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'wallet.success.topUp',
  })
  async refreshMyTopUpSession(
    @AuthUser() user: IAuthUser,
    @Param('sessionId') sessionId: string
  ): Promise<WalletTopUpSessionResponseDto> {
    return this.walletService.refreshTopUpSession(user.userId, sessionId);
  }
}
