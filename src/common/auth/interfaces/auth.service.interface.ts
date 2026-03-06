import { ApiGenericResponseDto } from 'src/common/response/dtos/response.generic.dto';
import { IAuthUser } from 'src/common/request/interfaces/request.interface';

import {
  ForgotPasswordDto,
  RequestVerificationOtpDto,
  ResetPasswordDto,
  VerifyAccountOtpDto,
} from '../dtos/request/auth.account.dto';
import { UserLoginDto } from '../dtos/request/auth.login.dto';
import {
  AuthRefreshResponseDto,
  AuthResponseDto,
} from '../dtos/response/auth.response.dto';
import { UserCreateDto } from '../dtos/request/auth.signup.dto';

export interface IAuthService {
  login(data: UserLoginDto): Promise<AuthResponseDto>;
  signup(data: UserCreateDto): Promise<AuthResponseDto>;
  refreshTokens(payload: IAuthUser): Promise<AuthRefreshResponseDto>;
  requestAccountVerificationOtp(
    payload: RequestVerificationOtpDto
  ): Promise<ApiGenericResponseDto>;
  verifyAccountOtp(
    payload: VerifyAccountOtpDto
  ): Promise<ApiGenericResponseDto>;
  forgotPassword(payload: ForgotPasswordDto): Promise<ApiGenericResponseDto>;
  resetPassword(payload: ResetPasswordDto): Promise<ApiGenericResponseDto>;
  logoutAllDevices(payload: IAuthUser): Promise<ApiGenericResponseDto>;
}
