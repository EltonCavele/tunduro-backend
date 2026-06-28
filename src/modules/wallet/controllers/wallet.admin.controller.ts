import { Body, Controller, Get, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { DocResponse } from 'src/common/doc/decorators/doc.response.decorator';
import { AllowedRoles } from 'src/common/request/decorators/request.role.decorator';
import { AuthUser } from 'src/common/request/decorators/request.user.decorator';
import { IAuthUser } from 'src/common/request/interfaces/request.interface';

import { WalletTopUpRequestDto } from '../dtos/request/wallet.request';
import { WalletResponseDto } from '../dtos/response/wallet.response';
import { WalletService } from '../services/wallet.service';

@ApiTags('admin.wallet')
@Controller({
  path: '/admin/wallets',
  version: '1',
})
export class WalletAdminController {
  constructor(private readonly walletService: WalletService) {}

  @Get(':userId')
  @AllowedRoles([Role.ADMIN, Role.EMPLOYEE])
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Get user club balance' })
  @DocResponse({
    serialization: WalletResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'wallet.success.details',
  })
  async getWallet(@Param('userId') userId: string): Promise<WalletResponseDto> {
    return this.walletService.getAdminWallet(userId);
  }

  @Post(':userId/top-ups')
  @AllowedRoles([Role.ADMIN, Role.EMPLOYEE])
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Top up user club balance' })
  @DocResponse({
    serialization: WalletResponseDto,
    httpStatus: HttpStatus.CREATED,
    messageKey: 'wallet.success.topUp',
  })
  async topUp(
    @AuthUser() admin: IAuthUser,
    @Param('userId') userId: string,
    @Body() dto: WalletTopUpRequestDto
  ): Promise<WalletResponseDto> {
    return this.walletService.topUp(admin.userId, userId, dto);
  }
}
