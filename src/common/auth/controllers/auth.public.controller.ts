import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { DocResponse } from 'src/common/doc/decorators/doc.response.decorator';
import { PublicRoute } from 'src/common/request/decorators/request.public.decorator';
import { AuthUser } from 'src/common/request/decorators/request.user.decorator';
import { JwtRefreshGuard } from 'src/common/request/guards/jwt.refresh.guard';
import { IAuthUser } from 'src/common/request/interfaces/request.interface';
import { ApiGenericResponseDto } from 'src/common/response/dtos/response.generic.dto';

import {
  ForgotPasswordDto,
  RequestVerificationOtpDto,
  ResetPasswordDto,
  VerifyAccountOtpDto,
} from '../dtos/request/auth.account.dto';
import { UserLoginDto } from '../dtos/request/auth.login.dto';
import { UserCreateDto } from '../dtos/request/auth.signup.dto';
import {
  AuthRefreshResponseDto,
  AuthResponseDto,
} from '../dtos/response/auth.response.dto';
import { AuthService } from '../services/auth.service';

@ApiTags('public.auth')
@Controller({
  version: '1',
  path: '/auth',
})
export class AuthPublicController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @PublicRoute()
  @ApiOperation({ summary: 'User login (email or phone)' })
  @DocResponse({
    serialization: AuthResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'auth.success.login',
  })
  public login(@Body() payload: UserLoginDto): Promise<AuthResponseDto> {
    return this.authService.login(payload);
  }

  @Post('signup')
  @PublicRoute()
  @ApiOperation({ summary: 'User signup' })
  @DocResponse({
    serialization: AuthResponseDto,
    httpStatus: HttpStatus.CREATED,
    messageKey: 'auth.success.signup',
  })
  public signup(@Body() payload: UserCreateDto): Promise<AuthResponseDto> {
    return this.authService.signup(payload);
  }

  @Post('verify/request-otp')
  @PublicRoute()
  @ApiOperation({ summary: 'Request account verification OTP' })
  @DocResponse({
    serialization: ApiGenericResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'auth.success.verification-otp-sent',
  })
  public requestVerificationOtp(
    @Body() payload: RequestVerificationOtpDto
  ): Promise<ApiGenericResponseDto> {
    return this.authService.requestAccountVerificationOtp(payload);
  }

  @Post('verify')
  @PublicRoute()
  @ApiOperation({ summary: 'Verify account with OTP' })
  @DocResponse({
    serialization: ApiGenericResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'auth.success.account-verified',
  })
  public verifyAccount(
    @Body() payload: VerifyAccountOtpDto
  ): Promise<ApiGenericResponseDto> {
    return this.authService.verifyAccountOtp(payload);
  }

  @Post('forgot-password')
  @PublicRoute()
  @ApiOperation({ summary: 'Request password reset OTP' })
  @DocResponse({
    serialization: ApiGenericResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'auth.success.password-reset-otp-sent',
  })
  public forgotPassword(
    @Body() payload: ForgotPasswordDto
  ): Promise<ApiGenericResponseDto> {
    return this.authService.forgotPassword(payload);
  }

  @Post('reset-password')
  @PublicRoute()
  @ApiOperation({ summary: 'Reset password with OTP' })
  @DocResponse({
    serialization: ApiGenericResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'auth.success.password-reset',
  })
  public resetPassword(
    @Body() payload: ResetPasswordDto
  ): Promise<ApiGenericResponseDto> {
    return this.authService.resetPassword(payload);
  }

  @Post('logout-all')
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Logout in all devices' })
  @DocResponse({
    serialization: ApiGenericResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'auth.success.logout-all',
  })
  public logoutAllDevices(
    @AuthUser() user: IAuthUser
  ): Promise<ApiGenericResponseDto> {
    return this.authService.logoutAllDevices(user);
  }

  @Get('refresh-token')
  @PublicRoute()
  @UseGuards(JwtRefreshGuard)
  @ApiBearerAuth('refreshToken')
  @ApiOperation({ summary: 'Refresh token' })
  @DocResponse({
    serialization: AuthRefreshResponseDto,
    httpStatus: HttpStatus.CREATED,
    messageKey: 'auth.success.refresh-token',
  })
  public refreshTokens(
    @AuthUser() user: IAuthUser
  ): Promise<AuthRefreshResponseDto> {
    return this.authService.refreshTokens(user);
  }
}
