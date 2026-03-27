import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { $Enums, Role } from '@prisma/client';

import { DatabaseService } from 'src/common/database/services/database.service';
import { ApiGenericResponseDto } from 'src/common/response/dtos/response.generic.dto';

import { HelperEncryptionService } from '../../helper/services/helper.encryption.service';
import { HelperNotificationService } from '../../helper/services/helper.notification.service';
import { IAuthUser } from '../../request/interfaces/request.interface';
import {
  ForgotPasswordDto,
  OtpChannel,
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
import { IAuthService } from '../interfaces/auth.service.interface';

@Injectable()
export class AuthService implements IAuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly OTP_EXPIRATION_MINUTES = 10;
  private readonly VERIFY_OTP_PREFIX = 'VERIFY';
  private readonly RESET_OTP_PREFIX = 'RESET';

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly helperEncryptionService: HelperEncryptionService,
    private readonly helperNotificationService: HelperNotificationService
  ) {}

  public async login(data: UserLoginDto): Promise<AuthResponseDto> {
    const user = await this.findUserByIdentifier({
      identifier: data.identifier,
      email: data.email,
      phone: data.phone,
    });

    if (!user) {
      throw new HttpException('user.error.userNotFound', HttpStatus.NOT_FOUND);
    }

    const passwordMatched = await this.helperEncryptionService.match(
      user.password,
      data.password
    );

    if (!passwordMatched) {
      throw new HttpException(
        'auth.error.invalidPassword',
        HttpStatus.BAD_REQUEST
      );
    }

    const tokens = await this.createTokensForUser(user);

    return {
      ...tokens,
      user,
    };
  }

  public async signup(data: UserCreateDto): Promise<AuthResponseDto> {
    const email = data.email?.toLowerCase().trim();
    const phone = data.phone?.trim();

    const existingByEmail = await this.databaseService.user.findFirst({
      where: {
        email,
        deletedAt: null,
      },
    });

    if (existingByEmail) {
      throw new HttpException('user.error.userExists', HttpStatus.CONFLICT);
    }

    if (phone) {
      const existingByPhone = await this.databaseService.user.findFirst({
        where: {
          phone,
          deletedAt: null,
        },
      });

      if (existingByPhone) {
        throw new HttpException('user.error.userExists', HttpStatus.CONFLICT);
      }
    }

    const hashed = await this.helperEncryptionService.createHash(data.password);

    const createdUser = await this.databaseService.user.create({
      data: {
        email,
        password: hashed,
        firstName: data.firstName?.trim(),
        lastName: data.lastName?.trim(),
        phone,
        gender: data.gender ?? $Enums.Gender.OTHER,
        role: Role.USER,
        tokenVersion: 0,
      } as any,
    });

    const verificationOtp = await this.createOtp(
      createdUser.id,
      this.VERIFY_OTP_PREFIX
    );
    await this.dispatchOtpNotification({
      user: createdUser,
      otpCode: verificationOtp,
      channel: 'EMAIL',
      intent: 'verification',
    });

    const tokens = await this.createTokensForUser(createdUser);

    return {
      ...tokens,
      user: createdUser,
    };
  }

  public async refreshTokens(
    payload: IAuthUser
  ): Promise<AuthRefreshResponseDto> {
    const user = await this.databaseService.user.findUnique({
      where: { id: payload.userId },
    });

    if (!user || user.deletedAt) {
      throw new UnauthorizedException('auth.error.refreshTokenUnauthorized');
    }

    const currentTokenVersion = this.getTokenVersion(user);
    if (
      payload.tokenVersion !== undefined &&
      Number(payload.tokenVersion) !== currentTokenVersion
    ) {
      throw new UnauthorizedException('auth.error.refreshTokenUnauthorized');
    }

    return this.helperEncryptionService.createJwtTokens({
      userId: user.id,
      role: user.role,
      tokenVersion: currentTokenVersion,
    });
  }

  public async logoutAllDevices(
    payload: IAuthUser
  ): Promise<ApiGenericResponseDto> {
    const user = await this.databaseService.user.findUnique({
      where: { id: payload.userId },
    });

    if (!user || user.deletedAt) {
      throw new HttpException('user.error.userNotFound', HttpStatus.NOT_FOUND);
    }

    await this.databaseService.user.update({
      where: { id: user.id },
      data: {
        tokenVersion: {
          increment: 1,
        },
      } as any,
    });

    return {
      success: true,
      message: 'auth.success.logout-all',
    };
  }

  public async requestAccountVerificationOtp(
    payload: RequestVerificationOtpDto
  ): Promise<ApiGenericResponseDto> {
    const user = await this.findUserByIdentifier({
      identifier: payload.identifier,
    });

    if (!user) {
      throw new HttpException('user.error.userNotFound', HttpStatus.NOT_FOUND);
    }

    if (!user.isVerified) {
      const verificationOtp = await this.createOtp(
        user.id,
        this.VERIFY_OTP_PREFIX
      );
      await this.dispatchOtpNotification({
        user,
        otpCode: verificationOtp,
        channel: payload.channel ?? 'EMAIL',
        intent: 'verification',
      });
    }

    return {
      success: true,
      message: 'auth.success.verification-otp-sent',
    };
  }

  public async verifyAccountOtp(
    payload: VerifyAccountOtpDto
  ): Promise<ApiGenericResponseDto> {
    const user = await this.findUserByIdentifier({
      identifier: payload.identifier,
    });

    if (!user) {
      throw new HttpException('user.error.userNotFound', HttpStatus.NOT_FOUND);
    }

    const otp = await this.findValidOtp(
      user.id,
      this.VERIFY_OTP_PREFIX,
      payload.otp
    );
    if (!otp) {
      throw new HttpException(
        'auth.error.invalidOrExpiredOtp',
        HttpStatus.BAD_REQUEST
      );
    }

    await this.databaseService.user.update({
      where: { id: user.id },
      data: { isVerified: true },
    });

    await this.databaseService.userOtp.delete({
      where: { id: otp.id },
    });

    return {
      success: true,
      message: 'auth.success.account-verified',
    };
  }

  public async forgotPassword(
    payload: ForgotPasswordDto
  ): Promise<ApiGenericResponseDto> {
    const user = await this.findUserByIdentifier({
      identifier: payload.identifier,
    });

    if (user) {
      const resetOtp = await this.createOtp(user.id, this.RESET_OTP_PREFIX);
      await this.dispatchOtpNotification({
        user,
        otpCode: resetOtp,
        channel: 'EMAIL',
        intent: 'reset',
      });
    }

    return {
      success: true,
      message: 'auth.success.password-reset-otp-sent',
    };
  }

  public async resetPassword(
    payload: ResetPasswordDto
  ): Promise<ApiGenericResponseDto> {
    const user = await this.findUserByIdentifier({
      identifier: payload.identifier,
    });

    if (!user) {
      throw new HttpException('user.error.userNotFound', HttpStatus.NOT_FOUND);
    }

    const otp = await this.findValidOtp(
      user.id,
      this.RESET_OTP_PREFIX,
      payload.otp
    );
    if (!otp) {
      throw new HttpException(
        'auth.error.invalidOrExpiredOtp',
        HttpStatus.BAD_REQUEST
      );
    }

    const hashed = await this.helperEncryptionService.createHash(
      payload.newPassword
    );

    await this.databaseService.user.update({
      where: { id: user.id },
      data: {
        password: hashed,
        tokenVersion: {
          increment: 1,
        },
      } as any,
    });

    await this.databaseService.userOtp.delete({
      where: { id: otp.id },
    });

    return {
      success: true,
      message: 'auth.success.password-reset',
    };
  }

  private async findUserByIdentifier({
    identifier,
    email,
    phone,
  }: {
    identifier?: string;
    email?: string;
    phone?: string;
  }) {
    const normalizedEmail = email?.toLowerCase().trim();
    const normalizedPhone = phone?.trim();
    const normalizedIdentifier = identifier?.trim();

    const emailFromIdentifier =
      !normalizedEmail && normalizedIdentifier?.includes('@')
        ? normalizedIdentifier.toLowerCase()
        : undefined;
    const phoneFromIdentifier =
      !normalizedPhone &&
      normalizedIdentifier &&
      !normalizedIdentifier.includes('@')
        ? normalizedIdentifier
        : undefined;

    const emailValue = normalizedEmail || emailFromIdentifier;
    const phoneValue = normalizedPhone || phoneFromIdentifier;

    if (!emailValue && !phoneValue) {
      throw new HttpException(
        'auth.error.identifierRequired',
        HttpStatus.BAD_REQUEST
      );
    }

    return this.databaseService.user.findFirst({
      where: {
        deletedAt: null,
        OR: [
          ...(emailValue ? [{ email: emailValue }] : []),
          ...(phoneValue ? [{ phone: phoneValue }] : []),
        ],
      },
    });
  }

  private async createTokensForUser(user: {
    id: string;
    role: Role;
    tokenVersion?: number;
  }): Promise<AuthRefreshResponseDto> {
    return this.helperEncryptionService.createJwtTokens({
      userId: user.id,
      role: user.role,
      tokenVersion: this.getTokenVersion(user),
    });
  }

  private getTokenVersion(user: { tokenVersion?: number }): number {
    return Number(user?.tokenVersion ?? 0);
  }

  private async createOtp(userId: string, otpPrefix: string): Promise<string> {
    const otpCode = this.generateOtpCode();
    const otpValue = this.buildOtpValue(otpPrefix, otpCode);

    await this.databaseService.userOtp.deleteMany({
      where: {
        userId,
        otp: {
          startsWith: `${otpPrefix}_`,
        },
      },
    });

    await this.databaseService.userOtp.create({
      data: {
        userId,
        otp: otpValue,
        expiresAt: new Date(
          Date.now() + this.OTP_EXPIRATION_MINUTES * 60 * 1000
        ),
      },
    });

    return otpCode;
  }

  private async findValidOtp(
    userId: string,
    otpPrefix: string,
    otpCode: string
  ) {
    return this.databaseService.userOtp.findFirst({
      where: {
        userId,
        otp: this.buildOtpValue(otpPrefix, otpCode),
        expiresAt: {
          gt: new Date(),
        },
      },
    });
  }

  private buildOtpValue(otpPrefix: string, otpCode: string): string {
    return `${otpPrefix}_${otpCode}`;
  }

  private generateOtpCode(): string {
    return `${Math.floor(100000 + Math.random() * 900000)}`;
  }

  private async dispatchOtpNotification({
    user,
    otpCode,
    channel,
    intent,
  }: {
    user: Record<string, any>;
    otpCode: string;
    channel: OtpChannel;
    intent: 'verification' | 'reset';
  }): Promise<void> {
    const title =
      intent === 'verification'
        ? 'Account Verification OTP'
        : 'Password Reset OTP';
    const body =
      intent === 'verification'
        ? `Your verification code is: ${otpCode}`
        : `Your password reset code is: ${otpCode}`;

    const shouldUsePush = channel === 'SMS' && Boolean(user.expoPushToken);
    if (shouldUsePush && !this.helperNotificationService.isPushEnabled()) {
      throw new HttpException(
        'auth.error.notificationDeliveryFailed',
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }
    if (!shouldUsePush && !user.email) {
      throw new HttpException(
        'auth.error.notificationDeliveryFailed',
        HttpStatus.BAD_REQUEST
      );
    }

    const result = shouldUsePush
      ? await this.helperNotificationService.sendPush({
          to: user.expoPushToken,
          title,
          body,
          data: { type: 'otp', intent },
        })
      : await this.helperNotificationService.sendEmail({
          to: user.email,
          subject: title,
          text: body,
          html: `<p>${body}</p>`,
        });

    if (!result.success) {
      if (!shouldUsePush) {
        this.logger.warn(
          `OTP ${intent} email delivery failed for user ${user.id}: ${
            result.error ?? 'unknown error'
          }`
        );
        return;
      }

      throw new HttpException(
        'auth.error.notificationDeliveryFailed',
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }
  }
}
