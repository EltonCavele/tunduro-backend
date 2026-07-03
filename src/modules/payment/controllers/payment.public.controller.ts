import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Logger,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';

import { DocPaginatedResponse } from 'src/common/doc/decorators/doc.paginated.decorator';
import { DocResponse } from 'src/common/doc/decorators/doc.response.decorator';
import { PublicRoute } from 'src/common/request/decorators/request.public.decorator';
import { AuthUser } from 'src/common/request/decorators/request.user.decorator';
import { IAuthUser } from 'src/common/request/interfaces/request.interface';
import { ApiPaginatedDataDto } from 'src/common/response/dtos/response.paginated.dto';

import { PaymentListQueryRequestDto } from '../dtos/request/payment.request';
import { PaymentResponseDto } from '../dtos/response/payment.response';
import { PaymentService } from '../services/payment.service';
import { PaysuiteWebhookService } from '../services/paysuite-webhook.service';

@ApiTags('public.payments')
@Controller({
  path: '/payments',
  version: '1',
})
export class PaymentPublicController {
  private readonly logger = new Logger(PaymentPublicController.name);

  constructor(
    private readonly paymentService: PaymentService,
    private readonly paysuiteWebhookService: PaysuiteWebhookService
  ) {}

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

  @Get('paysuite/return')
  @PublicRoute()
  @ApiOperation({ summary: 'Return from PaySuite checkout to mobile app' })
  handlePaysuiteReturn(
    @Query('kind') kind: string | undefined,
    @Query('sessionId') sessionId: string | undefined,
    @Res() response: Response
  ): void {
    const route =
      kind === 'wallet'
        ? 'myexpoapp://payments/wallet-return'
        : 'myexpoapp://payments/booking-return';
    const deepLink = `${route}?sessionId=${encodeURIComponent(sessionId ?? '')}`;
    const escapedDeepLink = deepLink.replace(/"/g, '&quot;');

    response
      .status(HttpStatus.OK)
      .type('html')
      .send(`<!doctype html>
<html lang="pt">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Voltar ao Tunduro</title>
  </head>
  <body style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:24px;">
    <p>A voltar ao aplicativo...</p>
    <p><a href="${escapedDeepLink}">Abrir aplicativo</a></p>
    <script>window.location.href = "${escapedDeepLink}";</script>
  </body>
</html>`);
  }

  @Post('paysuite/webhook')
  @PublicRoute()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive PaySuite payment webhooks' })
  async handlePaysuiteWebhook(
    @Req() request: Request & { rawBody?: Buffer },
    @Headers('x-webhook-signature') signature: string | string[] | undefined,
    @Body() payload: unknown
  ): Promise<{ received: true }> {
    const rawBody = request.rawBody ?? Buffer.from(JSON.stringify(payload));
    if (!this.paysuiteWebhookService.verifySignature(rawBody, signature)) {
      this.logger.warn('PaySuite webhook rejected: invalid signature');
      throw new HttpException('auth.error.forbidden', HttpStatus.FORBIDDEN);
    }

    await this.paysuiteWebhookService.handleWebhook(payload);
    return { received: true };
  }
}
