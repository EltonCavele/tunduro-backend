import { HttpException } from '@nestjs/common';
import { Role } from '@prisma/client';

import { BookingInviteContactService } from 'src/modules/booking/services/booking-invite-contact.service';

describe('BookingInviteContactService', () => {
  const db = {
    user: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    userContact: {
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
  };
  let service: BookingInviteContactService;

  beforeEach(() => {
    service = new BookingInviteContactService(db as any);
    jest.clearAllMocks();
  });

  it('rejects participant users outside the organizer private contacts', async () => {
    db.user.findFirst.mockResolvedValue({ email: 'owner@example.com' });
    db.user.findMany.mockResolvedValue([
      { id: 'user-2', email: 'friend@example.com', role: Role.USER },
    ]);
    db.userContact.findMany.mockResolvedValue([]);

    await expect(
      service.prepareCheckoutInvites({
        organizerId: 'owner-1',
        participantUserIds: ['user-2'],
      })
    ).rejects.toThrow(HttpException);
  });

  it('accepts participant users whose email exists in private contacts', async () => {
    db.user.findFirst.mockResolvedValue({ email: 'owner@example.com' });
    db.user.findMany.mockResolvedValue([
      { id: 'user-2', email: 'friend@example.com', role: Role.USER },
    ]);
    db.userContact.findMany.mockResolvedValue([
      { email: 'friend@example.com' },
    ]);

    const result = await service.prepareCheckoutInvites({
      organizerId: 'owner-1',
      participantUserIds: ['user-2'],
    });

    expect(result).toEqual({
      inviteEmails: [],
      participantUserIds: ['user-2'],
    });
  });

  it('creates organizer contacts automatically for new invite emails', async () => {
    db.user.findFirst.mockResolvedValue({ email: 'owner@example.com' });
    db.user.findMany.mockResolvedValue([]);
    db.userContact.upsert.mockResolvedValue({});

    const result = await service.prepareCheckoutInvites({
      organizerId: 'owner-1',
      inviteEmails: [' NEW@example.com ', 'owner@example.com'],
    });

    expect(db.userContact.upsert).toHaveBeenCalledWith({
      where: {
        ownerUserId_email: {
          ownerUserId: 'owner-1',
          email: 'new@example.com',
        },
      },
      create: {
        ownerUserId: 'owner-1',
        email: 'new@example.com',
      },
      update: { deletedAt: null },
    });
    expect(result).toEqual({
      inviteEmails: ['new@example.com'],
      participantUserIds: [],
    });
  });
});
