import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BookingStatus, ParticipantStatus, Role } from '@prisma/client';

import { DatabaseService } from 'src/common/database/services/database.service';
import { HelperNotificationService } from 'src/common/helper/services/helper.notification.service';
import { BookingOvertimeService } from 'src/modules/booking/services/booking.overtime.service';
import { LightingOrchestratorService } from 'src/modules/lighting/services/lighting.orchestrator.service';

describe('BookingOvertimeService', () => {
  let service: BookingOvertimeService;

  const mockDatabaseService = {
    booking: {
      findUnique: jest.fn(),
    },
    overtimeRequest: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
  } as any;

  const mockNotificationService = {
    sendEmail: jest.fn(),
    sendPush: jest.fn(),
  };

  const mockLightingOrchestratorService = {
    handleBookingExtended: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingOvertimeService,
        {
          provide: DatabaseService,
          useValue: mockDatabaseService,
        },
        {
          provide: HelperNotificationService,
          useValue: mockNotificationService,
        },
        {
          provide: LightingOrchestratorService,
          useValue: mockLightingOrchestratorService,
        },
      ],
    }).compile();

    service = module.get<BookingOvertimeService>(BookingOvertimeService);
    jest.clearAllMocks();
    mockDatabaseService.user.findMany.mockResolvedValue([]);
    mockDatabaseService.user.findFirst.mockResolvedValue(null);
  });

  it('should reject overtime creation when booking is not confirmed', async () => {
    mockDatabaseService.booking.findUnique.mockResolvedValue({
      id: 'booking-id',
      organizerId: 'user-1',
      status: BookingStatus.PENDING,
      endAt: new Date(Date.now() + 60 * 60 * 1000),
      paidAmount: 1000,
      totalPrice: 1000,
      participants: [],
      court: {
        pricePerHour: 1200,
      },
    });

    try {
      await service.createRequest(
        {
          userId: 'user-1',
          role: Role.USER,
        } as any,
        'booking-id',
        { blocks: 1 }
      );
      fail('Expected createRequest to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect((error as HttpException).message).toBe(
        'booking.error.overtimeOnlyConfirmed'
      );
    }
  });

  it('should create overtime request when booking is eligible', async () => {
    mockDatabaseService.booking.findUnique.mockResolvedValue({
      id: 'booking-id',
      organizerId: 'user-1',
      status: BookingStatus.CONFIRMED,
      endAt: new Date(Date.now() + 60 * 60 * 1000),
      paidAmount: 1000,
      totalPrice: 1000,
      participants: [
        {
          userId: 'user-1',
          status: ParticipantStatus.ACCEPTED,
        },
      ],
      court: {
        pricePerHour: 1200,
      },
    });

    mockDatabaseService.overtimeRequest.findFirst.mockResolvedValue(null);
    mockDatabaseService.overtimeRequest.create.mockResolvedValue({
      id: 'ot-1',
      bookingId: 'booking-id',
      requestedByUserId: 'user-1',
      approvedByUserId: null,
      blocks: 2,
      status: 'PENDING',
      declineReason: null,
      paymentTransactionId: null,
      expiresAt: null,
      processedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await service.createRequest(
      {
        userId: 'user-1',
        role: Role.USER,
      } as any,
      'booking-id',
      { blocks: 2 }
    );

    expect(result.id).toBe('ot-1');
    expect(result.bookingId).toBe('booking-id');
    expect(result.blocks).toBe(2);
    expect(mockDatabaseService.overtimeRequest.create).toHaveBeenCalledWith({
      data: {
        bookingId: 'booking-id',
        requestedByUserId: 'user-1',
        blocks: 2,
        status: 'PENDING',
      },
    });
  });
});
