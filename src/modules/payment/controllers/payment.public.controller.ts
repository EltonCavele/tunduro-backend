import { Controller, Get, HttpStatus, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { DocPaginatedResponse } from 'src/common/doc/decorators/doc.paginated.decorator';
import { DocResponse } from 'src/common/doc/decorators/doc.response.decorator';
import { AuthUser } from 'src/common/request/decorators/request.user.decorator';
import { IAuthUser } from 'src/common/request/interfaces/request.interface';
import { ApiPaginatedDataDto } from 'src/common/response/dtos/response.paginated.dto';

import { PaymentListQueryRequestDto } from '../dtos/request/payment.request';
import { PaymentResponseDto } from '../dtos/response/payment.response';
import { PaymentService } from '../services/payment.service';

@ApiTags('public.payments')
@Controller({
  path: '/payments',
  version: '1',
})
export class PaymentPublicController {
  constructor(private readonly paymentService: PaymentService) {}

  @Get()
  @ApiBearerAuth('accessToken')
  @ApiOperation({
    summary: 'List payment transactions for current user or all when admin',
  })
  @DocPaginatedResponse({
    serialization: PaymentResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'payment.success.list',
  })
  async listPayments(
    @AuthUser() user: IAuthUser,
    @Query() query: PaymentListQueryRequestDto
  ): Promise<ApiPaginatedDataDto<PaymentResponseDto>> {
    return this.paymentService.listPayments(user, query);
  }

  @Get(':id')
  @ApiBearerAuth('accessToken')
  @ApiOperation({
    summary: 'Get payment transaction details by id with role-based access',
  })
  @DocResponse({
    serialization: PaymentResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'payment.success.details',
  })
  async getPaymentById(
    @AuthUser() user: IAuthUser,
    @Param('id') paymentId: string
  ): Promise<PaymentResponseDto> {
    return this.paymentService.getPaymentById(user, paymentId);
  }
}
