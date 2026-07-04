import { HttpException } from '@nestjs/common';
import { Role } from '@prisma/client';

import { UserContactService } from 'src/modules/user/services/user-contact.service';

describe('UserContactService', () => {
  const db = {
    user: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    userContact: {
      count: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const notificationService = {
    sendEmail: jest.fn(),
  };
  const configService = {
    get: jest.fn(),
  };
  let service: UserContactService;

  beforeEach(() => {
    service = new UserContactService(
      db as any,
      notificationService as any,
      configService as any
    );
    jest.clearAllMocks();
  });

  it('lists only contacts owned by the current user and links active users by email', async () => {
    const now = new Date();
    db.userContact.findMany.mockResolvedValue([
      {
        id: 'contact-1',
        ownerUserId: 'owner-1',
        displayName: 'Mateus',
        email: 'mateus@example.com',
        phone: null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    db.userContact.count.mockResolvedValue(1);
    db.user.findMany.mockResolvedValue([
      {
        id: 'user-2',
        email: 'mateus@example.com',
        firstName: 'Mateus',
        lastName: 'Cossa',
        role: Role.USER,
      },
    ]);

    const result = await service.listContacts('owner-1', {
      q: 'mat',
      page: 1,
      pageSize: 20,
    });

    expect(db.userContact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ownerUserId: 'owner-1',
          deletedAt: null,
        }),
      })
    );
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        id: 'contact-1',
        email: 'mateus@example.com',
        linkedUserId: 'user-2',
      })
    );
  });

  it('rejects adding the current user as their own contact', async () => {
    db.user.findFirst.mockResolvedValue({ email: 'owner@example.com' });

    await expect(
      service.createContact('owner-1', { email: 'OWNER@example.com' })
    ).rejects.toThrow(HttpException);
  });

  it('deletes only contacts owned by the current user', async () => {
    db.userContact.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.deleteContact('owner-1', 'contact-1');

    expect(db.userContact.updateMany).toHaveBeenCalledWith({
      where: { id: 'contact-1', ownerUserId: 'owner-1', deletedAt: null },
      data: { deletedAt: expect.any(Date) },
    });
    expect(result).toEqual({
      success: true,
      message: 'user.success.contactDeleted',
    });
  });

  it('creates a contact and sends email invite when no active user is linked', async () => {
    db.user.findFirst
      .mockResolvedValueOnce({ email: 'owner@example.com' })
      .mockResolvedValueOnce(null);
    db.userContact.upsert.mockResolvedValue({
      id: 'contact-2',
      ownerUserId: 'owner-1',
      displayName: null,
      email: 'new@example.com',
      phone: null,
      deletedAt: null,
    });
    configService.get.mockImplementation((key: string) => {
      if (key === 'app.name') return 'Tunduro';
      if (key === 'app.downloadFallbackUrl') return 'https://app.test/download';
      return undefined;
    });
    notificationService.sendEmail.mockResolvedValue({ success: true });

    const result = await service.inviteContact('owner-1', {
      email: 'new@example.com',
    });

    expect(notificationService.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'new@example.com',
        subject: 'Foste convidado para o Tunduro',
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        email: 'new@example.com',
        linkedUserId: null,
      })
    );
  });

  it('does not send email invite when the contact is linked to an active user', async () => {
    db.user.findFirst
      .mockResolvedValueOnce({ email: 'owner@example.com' })
      .mockResolvedValueOnce({
        id: 'user-2',
        email: 'friend@example.com',
        firstName: 'Friend',
        lastName: null,
        role: Role.USER,
      });
    db.userContact.upsert.mockResolvedValue({
      id: 'contact-3',
      ownerUserId: 'owner-1',
      displayName: 'Friend',
      email: 'friend@example.com',
      phone: null,
      deletedAt: null,
    });

    const result = await service.inviteContact('owner-1', {
      email: 'friend@example.com',
      displayName: 'Friend',
    });

    expect(notificationService.sendEmail).not.toHaveBeenCalled();
    expect(result.linkedUserId).toBe('user-2');
  });
});
